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
