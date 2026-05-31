import { Album, AlbumInput, AlbumMember, AuthSession, CatalogStickerInput, InviteType, Sticker, StickerInput, StickerPatch } from '../types/collection';

const configuredSupabaseUrl = process.env.REACT_APP_SUPABASE_URL?.trim().replace(/\/+$/, '') || '';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';
const localAlbumsKey = 'stickershelf.albums';
const localStickersKey = 'stickershelf.stickers';
const sessionKey = 'stickershelf.supabaseSession';

function getSupabaseRestUrl() {
  if (!configuredSupabaseUrl) return '';
  if (configuredSupabaseUrl.endsWith('/rest/v1')) return configuredSupabaseUrl;
  return `${configuredSupabaseUrl}/rest/v1`;
}

const supabaseRestUrl = getSupabaseRestUrl();
const supabaseAuthUrl = configuredSupabaseUrl
  ? `${configuredSupabaseUrl.replace(/\/rest\/v1$/, '')}/auth/v1`
  : '';

export const isSupabaseConfigured = Boolean(supabaseRestUrl && supabaseAnonKey);

const now = () => new Date().toISOString();

const seedAlbums: Album[] = [
  {
    id: 'demo-world-cup',
    name: 'Copa do Mundo 2026',
    owner_id: null,
    publisher: 'Panini',
    season: '2026',
    cover_url: '',
    total_stickers: 640,
    created_at: now(),
    updated_at: now(),
  },
];

const seedStickers: Sticker[] = [
  {
    id: 'demo-001',
    album_id: 'demo-world-cup',
    code: 'BRA 01',
    title: 'Escudo Brasil',
    section: 'Brasil',
    image_url: '',
    owned: true,
    quantity: 2,
    is_stuck: true,
    wishlisted: false,
    notes: 'Uma repetida para troca.',
    created_at: now(),
    updated_at: now(),
  },
  {
    id: 'demo-002',
    album_id: 'demo-world-cup',
    code: 'ARG 09',
    title: 'Meio-campo',
    section: 'Argentina',
    image_url: '',
    owned: false,
    quantity: 0,
    is_stuck: false,
    wishlisted: true,
    notes: '',
    created_at: now(),
    updated_at: now(),
  },
  {
    id: 'demo-003',
    album_id: 'demo-world-cup',
    code: 'ESP 14',
    title: 'Atacante',
    section: 'Espanha',
    image_url: '',
    owned: true,
    quantity: 1,
    is_stuck: false,
    wishlisted: false,
    notes: '',
    created_at: now(),
    updated_at: now(),
  },
];

export function normalizeStickerCode(value: string) {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

function readLocal<T>(key: string, fallback: T): T {
  const stored = window.localStorage.getItem(key);
  if (!stored) {
    window.localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }
  return JSON.parse(stored) as T;
}

function writeLocal<T>(key: string, value: T): T {
  window.localStorage.setItem(key, JSON.stringify(value));
  return value;
}

function readSession(): AuthSession | null {
  const stored = window.localStorage.getItem(sessionKey);
  if (!stored) return null;
  return JSON.parse(stored) as AuthSession;
}

function writeSession(session: AuthSession | null) {
  if (!session) {
    window.localStorage.removeItem(sessionKey);
    return null;
  }
  window.localStorage.setItem(sessionKey, JSON.stringify(session));
  return session;
}

// --- Renovação de token (refresh) -----------------------------------------
// O auth é artesanal (sem supabase-js): o access_token é persistido no
// localStorage e enviado manualmente. JWTs do Supabase expiram (~1h), então
// precisamos renovar via refresh_token, senão o PostgREST devolve
// PGRST303 "JWT expired" ao reusar o token velho.

const EXPIRY_SKEW_SECONDS = 60;

export class SessionExpiredError extends Error {
  constructor(message = 'Sua sessão expirou. Faça login novamente.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

type SessionExpiredListener = () => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

function notifySessionExpired() {
  sessionExpiredListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* listeners não devem interromper o fluxo */
    }
  });
}

function clearSessionAndNotify() {
  writeSession(null);
  notifySessionExpired();
}

// Normaliza a sessão garantindo expires_at (unix seconds) a partir de
// expires_in quando o endpoint só devolver a duração relativa.
function withExpiry(session: AuthSession & { expires_in?: number }): AuthSession {
  if (session.expires_at || !session.expires_in) return session;
  const { expires_in, ...rest } = session;
  return { ...rest, expires_at: Math.floor(Date.now() / 1000) + Number(expires_in) };
}

function isExpired(session: AuthSession | null, skewSeconds = EXPIRY_SKEW_SECONDS): boolean {
  // Sem expires_at conhecido: assume válido e deixa o caminho reativo (PGRST303) tratar.
  if (!session?.expires_at) return false;
  return session.expires_at <= Math.floor(Date.now() / 1000) + skewSeconds;
}

function isAuthError(status: number, detail: string): boolean {
  if (status === 401) return true;
  const lower = detail.toLowerCase();
  return lower.includes('pgrst303') || lower.includes('jwt expired');
}

// Dedup: várias requisições paralelas compartilham um único refresh em voo.
let refreshInFlight: Promise<AuthSession | null> | null = null;

async function performRefresh(current: AuthSession): Promise<AuthSession | null> {
  let response: Response;
  try {
    response = await fetch(`${supabaseAuthUrl}/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: current.refresh_token }),
    });
  } catch (err) {
    // Erro de rede é transitório: não derruba a sessão, propaga para o caller.
    throw err;
  }

  if (!response.ok) {
    // refresh_token inválido/expirado → sessão irrecuperável, força re-login.
    clearSessionAndNotify();
    return null;
  }

  const data = (await response.json()) as AuthSession & { expires_in?: number };
  if (!data.access_token) {
    clearSessionAndNotify();
    return null;
  }

  return writeSession(
    withExpiry({
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? current.refresh_token,
      expires_at: data.expires_at,
      expires_in: data.expires_in,
      user: data.user ?? current.user,
    })
  );
}

async function refreshSession(): Promise<AuthSession | null> {
  const current = readSession();
  if (!current?.refresh_token) {
    clearSessionAndNotify();
    return null;
  }
  if (!refreshInFlight) {
    refreshInFlight = performRefresh(current).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

// Garante um access_token válido antes da requisição.
// Retorna null para anônimo; lança SessionExpiredError se havia sessão mas
// o refresh falhou de forma definitiva (refresh_token inválido).
async function ensureFreshSession(): Promise<AuthSession | null> {
  const session = readSession();
  if (!session) return null;
  if (!isExpired(session)) return session;
  const refreshed = await refreshSession();
  if (!refreshed) throw new SessionExpiredError();
  return refreshed;
}

async function getAuthUser(accessToken: string): Promise<AuthSession['user']> {
  const response = await fetch(`${supabaseAuthUrl}/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || 'Nao foi possivel carregar o usuario autenticado.');
  }

  return response.json() as Promise<AuthSession['user']>;
}

function getSessionIdentityFilters(session: AuthSession) {
  const values = [
    session.user.email,
    session.user.phone,
    session.user.user_metadata?.username,
    session.user.user_metadata?.user_name,
    session.user.user_metadata?.name,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim().toLowerCase());

  return Array.from(new Set(values));
}

function normalizeInviteValue(type: InviteType, value: string) {
  const trimmed = value.trim();
  if (type === 'phone') return trimmed.replace(/[^\d+]/g, '');
  return trimmed.toLowerCase();
}

function hydrateSticker(sticker: Sticker): Sticker {
  return {
    ...sticker,
    owned: Boolean(sticker.owned || sticker.quantity > 0),
    quantity: Number(sticker.quantity || 0),
    is_stuck: Boolean(sticker.is_stuck),
    wishlisted: Boolean(sticker.wishlisted),
  };
}

async function supabaseRequest<T>(path: string, init: RequestInit = {}, retryOnAuthError = true): Promise<T> {
  const cleanPath = path.replace(/^\/+/, '');
  const headers = new Headers(init.headers);
  // Refresh proativo: renova o token se estiver expirado/perto de expirar.
  const session = await ensureFreshSession();
  headers.set('apikey', supabaseAnonKey);
  headers.set('Authorization', `Bearer ${session?.access_token || supabaseAnonKey}`);
  headers.set('Content-Type', 'application/json');
  if (!headers.has('Prefer')) {
    headers.set('Prefer', 'return=representation');
  }

  const response = await fetch(`${supabaseRestUrl}/${cleanPath}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const detail = await response.text();
    // Refresh reativo: token recusado (PGRST303/401) → renova uma vez e repete.
    if (retryOnAuthError && session && isAuthError(response.status, detail)) {
      const refreshed = await refreshSession();
      if (!refreshed) throw new SessionExpiredError();
      return supabaseRequest<T>(path, init, false);
    }
    throw new Error(detail || `Supabase request failed for /rest/v1/${cleanPath} with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function supabaseAuthRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cleanPath = path.replace(/^\/+/, '');
  const headers = new Headers(init.headers);
  const session = readSession();
  headers.set('apikey', supabaseAnonKey);
  headers.set('Authorization', `Bearer ${session?.access_token || supabaseAnonKey}`);
  headers.set('Content-Type', 'application/json');

  const response = await fetch(`${supabaseAuthUrl}/${cleanPath}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Supabase auth request failed for /auth/v1/${cleanPath} with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

const cleanAlbumInput = (input: AlbumInput) => ({
  name: input.name.trim(),
  owner_id: input.owner_id || null,
  publisher: input.publisher?.trim() || null,
  season: input.season?.trim() || null,
  cover_url: input.cover_url?.trim() || null,
  total_stickers: input.total_stickers,
});

const cleanStickerInput = (input: StickerInput | StickerPatch) => ({
  ...input,
  code: input.code ? normalizeStickerCode(input.code) : undefined,
  title: input.title?.trim(),
  section: input.section?.trim() || null,
  image_url: input.image_url?.trim() || null,
  notes: input.notes?.trim() || null,
});

export const collectionStore = {
  getSession(): AuthSession | null {
    return readSession();
  },

  async consumeAuthRedirect(): Promise<AuthSession | null> {
    if (!isSupabaseConfigured || !window.location.hash.includes('access_token=')) {
      return null;
    }

    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hashParams.get('access_token');
    if (!accessToken) return null;

    const refreshToken = hashParams.get('refresh_token') || undefined;
    const expiresIn = Number(hashParams.get('expires_in') || 0);
    const user = await getAuthUser(accessToken);
    const session = writeSession({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : undefined,
      user,
    }) as AuthSession;

    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
    return session;
  },

  async loginWithPassword(email: string, password: string): Promise<AuthSession> {
    if (!isSupabaseConfigured) {
      throw new Error('Configure o Supabase para usar login.');
    }
    const session = await supabaseAuthRequest<AuthSession & { expires_in?: number }>('token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
      }),
    });
    return writeSession(withExpiry(session)) as AuthSession;
  },

  async signUp(email: string, password: string): Promise<AuthSession | 'confirmation-sent'> {
    if (!isSupabaseConfigured) {
      throw new Error('Configure o Supabase para usar login.');
    }
    const result = await supabaseAuthRequest<AuthSession & { id?: string; expires_in?: number }>('signup', {
      method: 'POST',
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
      }),
    });
    if (result.access_token) {
      return writeSession(withExpiry(result)) as AuthSession;
    }
    return 'confirmation-sent';
  },

  signOut(): void {
    writeSession(null);
  },

  // Notifica a UI quando a sessão expira de forma irrecuperável (refresh
  // falhou): permite limpar o estado e redirecionar para o login.
  onSessionExpired(listener: () => void): () => void {
    sessionExpiredListeners.add(listener);
    return () => {
      sessionExpiredListeners.delete(listener);
    };
  },

  async refreshSession(): Promise<AuthSession | null> {
    return refreshSession();
  },

  async listAlbums(): Promise<Album[]> {
    if (isSupabaseConfigured) {
      const session = readSession();
      if (!session) return [];
      const userId = encodeURIComponent(session.user.id);
      const ownAlbums = await supabaseRequest<Album[]>(`albums?owner_id=eq.${userId}&select=*&order=updated_at.desc`);
      const identityFilters = getSessionIdentityFilters(session);
      const memberFilters = [`user_id.eq.${encodeURIComponent(session.user.id)}`];
      if (identityFilters.length) {
        memberFilters.push(`invite_value.in.(${identityFilters.map(encodeURIComponent).join(',')})`);
      }
      const memberships = await supabaseRequest<AlbumMember[]>(
        `album_members?or=(${memberFilters.join(',')})&select=album_id`
      );
      const invitedIds = memberships.map((member) => member.album_id).filter(Boolean);
      if (!invitedIds.length) return ownAlbums;

      const invitedAlbums = await supabaseRequest<Album[]>(
        `albums?id=in.(${invitedIds.map(encodeURIComponent).join(',')})&select=*&order=updated_at.desc`
      );
      const byId = new Map([...ownAlbums, ...invitedAlbums].map((album) => [album.id, album]));
      return Array.from(byId.values()).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    }

    return readLocal<Album[]>(localAlbumsKey, seedAlbums);
  },

  async createAlbum(input: AlbumInput): Promise<Album> {
    const payload = cleanAlbumInput(input);

    if (isSupabaseConfigured) {
      const session = readSession();
      if (!session?.access_token) {
        throw new Error('Sessão inválida. Faça login novamente antes de criar um álbum.');
      }
      // Use RPC function (SECURITY DEFINER) to bypass PostgREST RLS quirk
      // on direct INSERT WITH CHECK. The function sets owner_id = auth.uid() internally.
      const album = await supabaseRequest<Album>('rpc/create_album_for_current_user', {
        method: 'POST',
        body: JSON.stringify({
          p_name: payload.name,
          p_publisher: payload.publisher ?? null,
          p_season: payload.season ?? null,
          p_cover_url: payload.cover_url ?? null,
          p_total_stickers: payload.total_stickers,
        }),
      });
      if (session?.user?.email) {
        await this.inviteMember(album.id, session.user.email, 'owner');
      }
      return album;
    }

    const albums = readLocal<Album[]>(localAlbumsKey, seedAlbums);
    const album: Album = {
      id: crypto.randomUUID(),
      ...payload,
      created_at: now(),
      updated_at: now(),
    };
    writeLocal(localAlbumsKey, [album, ...albums]);
    return album;
  },

  async listMembers(albumId: string): Promise<AlbumMember[]> {
    if (isSupabaseConfigured) {
      return supabaseRequest<AlbumMember[]>(
        `album_members?album_id=eq.${encodeURIComponent(albumId)}&select=*&order=created_at.asc`
      );
    }
    return [];
  },

  async inviteMember(albumId: string, email: string, role: AlbumMember['role'] = 'editor'): Promise<AlbumMember> {
    return this.inviteCollaborator(albumId, 'email', email, role);
  },

  async inviteCollaborator(albumId: string, inviteType: InviteType, inviteValue: string, role: AlbumMember['role'] = 'editor'): Promise<AlbumMember> {
    const token = inviteType === 'link' ? crypto.randomUUID() : null;
    const normalizedValue = inviteType === 'link' ? null : normalizeInviteValue(inviteType, inviteValue);
    const payload = {
      album_id: albumId,
      email: inviteType === 'email' ? normalizedValue : null,
      invite_type: inviteType,
      invite_value: normalizedValue,
      invite_token: token,
      role,
    };

    if (isSupabaseConfigured) {
      const onConflict = inviteType === 'link' ? 'album_id%2Cinvite_token' : 'album_id%2Cinvite_type%2Cinvite_value';
      const [member] = await supabaseRequest<AlbumMember[]>(`album_members?on_conflict=${onConflict}`, {
        method: 'POST',
        headers: {
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(payload),
      });
      return member;
    }

    return {
      id: crypto.randomUUID(),
      ...payload,
      user_id: null,
      created_at: now(),
      accepted_at: null,
    };
  },

  async acceptInvite(token: string): Promise<AlbumMember | null> {
    if (!isSupabaseConfigured || !token.trim()) return null;
    const [member] = await supabaseRequest<AlbumMember[]>('rpc/accept_album_invite', {
      method: 'POST',
      body: JSON.stringify({ invite_token_value: token.trim() }),
    });
    return member || null;
  },

  getInviteLink(member: AlbumMember): string {
    if (!member.invite_token) return '';
    const url = new URL(window.location.href);
    url.searchParams.set('invite', member.invite_token);
    return url.toString();
  },

  async listStickers(albumId: string): Promise<Sticker[]> {
    if (isSupabaseConfigured) {
      const result = await supabaseRequest<Sticker[]>(
        `stickers?album_id=eq.${encodeURIComponent(albumId)}&select=*&order=code.asc`
      );
      return result.map(hydrateSticker);
    }

    const stickers = readLocal<Sticker[]>(localStickersKey, seedStickers);
    return stickers
      .filter((sticker) => sticker.album_id === albumId)
      .map(hydrateSticker)
      .sort((a, b) => a.code.localeCompare(b.code));
  },

  async createSticker(input: StickerInput): Promise<Sticker> {
    const payload = cleanStickerInput(input);

    if (isSupabaseConfigured) {
      const [sticker] = await supabaseRequest<Sticker[]>('stickers', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return sticker;
    }

    const stickers = readLocal<Sticker[]>(localStickersKey, seedStickers);
    const sticker: Sticker = {
      id: crypto.randomUUID(),
      album_id: input.album_id,
      code: payload.code || '',
      title: payload.title || '',
      section: payload.section || null,
      image_url: payload.image_url || null,
      owned: Boolean(payload.owned),
      quantity: Number(payload.quantity || 0),
      is_stuck: Boolean(payload.is_stuck),
      wishlisted: Boolean(payload.wishlisted),
      notes: payload.notes || null,
      created_at: now(),
      updated_at: now(),
    };
    writeLocal(localStickersKey, [...stickers, sticker]);
    return sticker;
  },

  async createCatalog(albumId: string, items: CatalogStickerInput[]): Promise<Sticker[]> {
    const payload = items.map((item) => ({
      album_id: albumId,
      code: normalizeStickerCode(item.code),
      title: item.title.trim(),
      section: item.section?.trim() || null,
      image_url: item.image_url?.trim() || null,
      owned: false,
      quantity: 0,
      is_stuck: false,
      wishlisted: false,
      notes: item.notes?.trim() || null,
    }));

    if (isSupabaseConfigured) {
      return supabaseRequest<Sticker[]>('stickers?on_conflict=album_id%2Ccode', {
        method: 'POST',
        headers: {
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(payload),
      });
    }

    const stickers = readLocal<Sticker[]>(localStickersKey, seedStickers);
    const byKey = new Map(stickers.map((sticker) => [`${sticker.album_id}:${normalizeStickerCode(sticker.code)}`, sticker]));
    const next = [...stickers];
    const created: Sticker[] = [];

    payload.forEach((item) => {
      const key = `${item.album_id}:${item.code}`;
      const existing = byKey.get(key);
      if (existing) {
        const updated = {
          ...existing,
          title: item.title,
          section: item.section,
          image_url: item.image_url,
          notes: item.notes,
          updated_at: now(),
        };
        const index = next.findIndex((sticker) => sticker.id === existing.id);
        next[index] = updated;
        created.push(updated);
        return;
      }

      const sticker: Sticker = {
        id: crypto.randomUUID(),
        album_id: albumId,
        code: item.code,
        title: item.title,
        section: item.section,
        image_url: item.image_url,
        owned: false,
        quantity: 0,
        is_stuck: false,
        wishlisted: false,
        notes: item.notes,
        created_at: now(),
        updated_at: now(),
      };
      next.push(sticker);
      created.push(sticker);
    });

    writeLocal(localStickersKey, next);
    return created.sort((a, b) => a.code.localeCompare(b.code));
  },

  async findStickerByCode(albumId: string, code: string): Promise<Sticker | null> {
    const normalizedCode = normalizeStickerCode(code);

    if (isSupabaseConfigured) {
      const result = await supabaseRequest<Sticker[]>(
        `stickers?album_id=eq.${encodeURIComponent(albumId)}&code=eq.${encodeURIComponent(normalizedCode)}&select=*&limit=1`
      );
      return result[0] ? hydrateSticker(result[0]) : null;
    }

    const stickers = readLocal<Sticker[]>(localStickersKey, seedStickers);
    const sticker = stickers.find((item) => item.album_id === albumId && normalizeStickerCode(item.code) === normalizedCode);
    return sticker ? hydrateSticker(sticker) : null;
  },

  async incrementSticker(albumId: string, code: string): Promise<Sticker> {
    const sticker = await this.findStickerByCode(albumId, code);
    if (!sticker) {
      throw new Error(`A figurinha ${normalizeStickerCode(code)} nao existe no catalogo deste album.`);
    }

    return this.updateSticker(sticker.id, {
      owned: true,
      quantity: sticker.quantity + 1,
      wishlisted: false,
    });
  },

  async updateSticker(id: string, patch: StickerPatch): Promise<Sticker> {
    const payload: StickerPatch = {};
    if (patch.code !== undefined) payload.code = patch.code.trim();
    if (patch.title !== undefined) payload.title = patch.title.trim();
    if (patch.section !== undefined) payload.section = patch.section.trim();
    if (patch.image_url !== undefined) payload.image_url = patch.image_url.trim();
    if (patch.notes !== undefined) payload.notes = patch.notes.trim();
    if (patch.owned !== undefined) payload.owned = patch.owned;
    if (patch.quantity !== undefined) payload.quantity = patch.quantity;
    if (patch.is_stuck !== undefined) payload.is_stuck = patch.is_stuck;
    if (patch.wishlisted !== undefined) payload.wishlisted = patch.wishlisted;

    if (isSupabaseConfigured) {
      const [sticker] = await supabaseRequest<Sticker[]>(`stickers?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      return sticker;
    }

    const stickers = readLocal<Sticker[]>(localStickersKey, seedStickers);
    const updated = stickers.map((sticker) =>
      sticker.id === id
        ? {
            ...sticker,
            ...payload,
            owned: payload.owned ?? sticker.owned,
            quantity: payload.quantity ?? sticker.quantity,
            is_stuck: payload.is_stuck ?? Boolean(sticker.is_stuck),
            wishlisted: payload.wishlisted ?? sticker.wishlisted,
            updated_at: now(),
          }
        : sticker
    );
    writeLocal(localStickersKey, updated);
    const sticker = updated.find((item) => item.id === id);
    if (!sticker) {
      throw new Error('Figurinha nao encontrada.');
    }
    return sticker;
  },

  async deleteSticker(id: string): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseRequest<void>(`stickers?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      return;
    }

    const stickers = readLocal<Sticker[]>(localStickersKey, seedStickers);
    writeLocal(
      localStickersKey,
      stickers.filter((sticker) => sticker.id !== id)
    );
  },
};
