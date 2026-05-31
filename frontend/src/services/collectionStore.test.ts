/**
 * Cobertura da renovação de token (JWT refresh) do auth artesanal.
 *
 * Regressão do bug PGRST303 "JWT expired": o access_token persistido no
 * localStorage expirava (~1h) e era reusado sem refresh, derrubando a home.
 */

export {};

type Store = typeof import('./collectionStore');

const REST_URL = 'https://proj.supabase.co/rest/v1';
const REFRESH_URL = 'https://proj.supabase.co/auth/v1/token?grant_type=refresh_token';
const NOW_SECONDS = () => Math.floor(Date.now() / 1000);

function loadStore(): Store {
  process.env.REACT_APP_SUPABASE_URL = 'https://proj.supabase.co';
  process.env.REACT_APP_SUPABASE_ANON_KEY = 'anon-key';
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('./collectionStore') as Store;
}

function seedSession(expiresAt?: number) {
  window.localStorage.setItem(
    'stickershelf.supabaseSession',
    JSON.stringify({
      access_token: 'old-token',
      refresh_token: 'refresh-token',
      expires_at: expiresAt,
      user: { id: 'user-1', email: 'a@b.com' },
    })
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as Response;
}

function authHeaderOf(call: [RequestInfo | URL, RequestInit?]): string | null {
  const headers = new Headers(call[1]?.headers);
  return headers.get('Authorization');
}

describe('collectionStore — renovação de token', () => {
  const ORIGINAL_ENV = process.env;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    window.localStorage.clear();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  it('renova proativamente o token expirado antes de chamar a API', async () => {
    const { collectionStore } = loadStore();
    // expira 10s atrás → dentro da janela de skew, força refresh proativo
    seedSession(NOW_SECONDS() - 10);

    fetchMock.mockImplementation(async (url: string) => {
      if (url === REFRESH_URL) {
        return jsonResponse({
          access_token: 'fresh-token',
          refresh_token: 'new-refresh',
          expires_in: 3600,
          user: { id: 'user-1', email: 'a@b.com' },
        });
      }
      return jsonResponse([]); // albums + memberships
    });

    await collectionStore.listAlbums();

    const calls = fetchMock.mock.calls;
    expect(calls.some(([url]) => url === REFRESH_URL)).toBe(true);
    // a chamada REST deve usar o token NOVO, nunca o velho
    const restCalls = calls.filter(([url]) => String(url).startsWith(REST_URL));
    expect(restCalls.length).toBeGreaterThan(0);
    restCalls.forEach((call) => expect(authHeaderOf(call)).toBe('Bearer fresh-token'));

    const persisted = JSON.parse(window.localStorage.getItem('stickershelf.supabaseSession') || '{}');
    expect(persisted.access_token).toBe('fresh-token');
    expect(persisted.refresh_token).toBe('new-refresh');
  });

  it('renova reativamente ao receber PGRST303 e repete a requisição', async () => {
    const { collectionStore } = loadStore();
    // sem expires_at → pula refresh proativo, exercita o caminho reativo
    seedSession(undefined);

    let albumsCall = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === REFRESH_URL) {
        return jsonResponse({ access_token: 'fresh-token', refresh_token: 'refresh-token', expires_in: 3600 });
      }
      if (String(url).includes('/albums')) {
        albumsCall += 1;
        if (albumsCall === 1) {
          return jsonResponse({ code: 'PGRST303', message: 'JWT expired' }, 401);
        }
      }
      return jsonResponse([]);
    });

    await expect(collectionStore.listAlbums()).resolves.toEqual([]);
    expect(fetchMock.mock.calls.some(([url]) => url === REFRESH_URL)).toBe(true);
    expect(albumsCall).toBe(2); // falhou, renovou, repetiu
  });

  it('força logout e notifica quando o refresh token é inválido', async () => {
    const { collectionStore, SessionExpiredError } = loadStore();
    seedSession(NOW_SECONDS() - 10);

    fetchMock.mockImplementation(async (url: string) => {
      if (url === REFRESH_URL) {
        return jsonResponse({ error: 'invalid_grant' }, 400);
      }
      return jsonResponse([]);
    });

    const onExpired = jest.fn();
    const unsubscribe = collectionStore.onSessionExpired(onExpired);

    await expect(collectionStore.listAlbums()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('stickershelf.supabaseSession')).toBeNull();

    unsubscribe();
  });

  it('não derruba a sessão quando o refresh falha por erro de rede', async () => {
    const { collectionStore } = loadStore();
    seedSession(NOW_SECONDS() - 10);

    fetchMock.mockImplementation(async (url: string) => {
      if (url === REFRESH_URL) {
        throw new TypeError('Failed to fetch');
      }
      return jsonResponse([]);
    });

    const onExpired = jest.fn();
    collectionStore.onSessionExpired(onExpired);

    await expect(collectionStore.listAlbums()).rejects.toThrow('Failed to fetch');
    // erro transitório de rede não deve limpar a sessão nem forçar logout
    expect(onExpired).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('stickershelf.supabaseSession')).not.toBeNull();
  });
});

describe('collectionStore — rename, label e compartilhamento', () => {
  const ORIGINAL_ENV = process.env;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    window.localStorage.clear();
    // jsdom não expõe Web Crypto; o invite por link usa crypto.randomUUID()
    if (!global.crypto?.randomUUID) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      (global as unknown as { crypto: Crypto }).crypto = require('crypto').webcrypto;
    }
    // sessão válida por 1h → nenhum refresh é disparado nestes testes
    seedSession(NOW_SECONDS() + 3600);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  function bodyOf(call: [RequestInfo | URL, RequestInit?]) {
    return JSON.parse(String(call[1]?.body || '{}'));
  }

  it('renameAlbum envia PATCH com o novo nome (trim) para a linha do álbum', async () => {
    const { collectionStore } = loadStore();
    fetchMock.mockResolvedValue(jsonResponse([{ id: 'alb-1', name: 'Novo Nome' }]));

    const result = await collectionStore.renameAlbum('alb-1', '  Novo Nome  ');

    expect(result).toEqual({ id: 'alb-1', name: 'Novo Nome' });
    const call = fetchMock.mock.calls[0];
    expect(String(call[0])).toContain('/albums?id=eq.alb-1');
    expect(call[1]?.method).toBe('PATCH');
    expect(bodyOf(call)).toEqual({ name: 'Novo Nome' });
  });

  it('renameAlbum rejeita nome vazio sem chamar a API', async () => {
    const { collectionStore } = loadStore();
    await expect(collectionStore.renameAlbum('alb-1', '   ')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('updateAlbumLabel envia PATCH com a descrição', async () => {
    const { collectionStore } = loadStore();
    fetchMock.mockResolvedValue(jsonResponse([{ id: 'alb-1', label: 'Coleção da família' }]));

    await collectionStore.updateAlbumLabel('alb-1', '  Coleção da família  ');

    const call = fetchMock.mock.calls[0];
    expect(call[1]?.method).toBe('PATCH');
    expect(bodyOf(call)).toEqual({ label: 'Coleção da família' });
  });

  it('updateAlbumLabel envia null quando a descrição é apagada', async () => {
    const { collectionStore } = loadStore();
    fetchMock.mockResolvedValue(jsonResponse([{ id: 'alb-1', label: null }]));

    await collectionStore.updateAlbumLabel('alb-1', '   ');

    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({ label: null });
  });

  it('generateShareLink cria um link com token, expiração ~48h e devolve a URL', async () => {
    const { collectionStore } = loadStore();
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body || '{}'));
      // ecoa o que foi enviado para validarmos token/expiração
      return jsonResponse([{ ...sent, id: 'mem-1' }]);
    });

    const before = Date.now();
    const { url, member } = await collectionStore.generateShareLink('alb-1');
    const after = Date.now();

    const call = fetchMock.mock.calls[0];
    expect(String(call[0])).toContain('/album_members');
    expect(call[1]?.method).toBe('POST');

    const sent = bodyOf(call);
    expect(sent.invite_type).toBe('link');
    expect(typeof sent.invite_token).toBe('string');
    expect(sent.invite_token).toBeTruthy();
    expect(sent.expires_at).toBeTruthy();

    // expira ~48h no futuro (com folga para o tempo de execução do teste)
    const expiresMs = new Date(sent.expires_at).getTime();
    const FORTY_EIGHT_H = 48 * 60 * 60 * 1000;
    expect(expiresMs).toBeGreaterThanOrEqual(before + FORTY_EIGHT_H - 1000);
    expect(expiresMs).toBeLessThanOrEqual(after + FORTY_EIGHT_H + 1000);

    expect(url).toContain(`invite=${member.invite_token}`);
  });

  it('acceptInvite chama a RPC accept_album_invite com o token', async () => {
    const { collectionStore } = loadStore();
    fetchMock.mockResolvedValue(jsonResponse([{ id: 'mem-1', album_id: 'alb-1', used_at: '2026-05-30T00:00:00Z' }]));

    const member = await collectionStore.acceptInvite('  tok-123  ');

    expect(member?.album_id).toBe('alb-1');
    const call = fetchMock.mock.calls[0];
    expect(String(call[0])).toContain('/rpc/accept_album_invite');
    expect(bodyOf(call)).toEqual({ invite_token_value: 'tok-123' });
  });

  it('acceptInvite devolve null para token vazio sem chamar a API', async () => {
    const { collectionStore } = loadStore();
    await expect(collectionStore.acceptInvite('   ')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
