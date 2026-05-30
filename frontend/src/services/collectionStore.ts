import { Album, AlbumInput, Sticker, StickerInput, StickerPatch } from '../types/collection';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL?.replace(/\/$/, '') || '';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';
const localAlbumsKey = 'stickershelf.albums';
const localStickersKey = 'stickershelf.stickers';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const now = () => new Date().toISOString();

const seedAlbums: Album[] = [
  {
    id: 'demo-world-cup',
    name: 'Copa do Mundo 2026',
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
    wishlisted: false,
    notes: '',
    created_at: now(),
    updated_at: now(),
  },
];

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

async function supabaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('apikey', supabaseAnonKey);
  headers.set('Authorization', `Bearer ${supabaseAnonKey}`);
  headers.set('Content-Type', 'application/json');
  headers.set('Prefer', 'return=representation');

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Supabase request failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

const cleanAlbumInput = (input: AlbumInput) => ({
  name: input.name.trim(),
  publisher: input.publisher?.trim() || null,
  season: input.season?.trim() || null,
  cover_url: input.cover_url?.trim() || null,
  total_stickers: input.total_stickers,
});

const cleanStickerInput = (input: StickerInput | StickerPatch) => ({
  ...input,
  code: input.code?.trim(),
  title: input.title?.trim(),
  section: input.section?.trim() || null,
  image_url: input.image_url?.trim() || null,
  notes: input.notes?.trim() || null,
});

export const collectionStore = {
  async listAlbums(): Promise<Album[]> {
    if (isSupabaseConfigured) {
      return supabaseRequest<Album[]>('albums?select=*&order=updated_at.desc');
    }

    return readLocal<Album[]>(localAlbumsKey, seedAlbums);
  },

  async createAlbum(input: AlbumInput): Promise<Album> {
    const payload = cleanAlbumInput(input);

    if (isSupabaseConfigured) {
      const [album] = await supabaseRequest<Album[]>('albums', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
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

  async listStickers(albumId: string): Promise<Sticker[]> {
    if (isSupabaseConfigured) {
      return supabaseRequest<Sticker[]>(
        `stickers?album_id=eq.${encodeURIComponent(albumId)}&select=*&order=code.asc`
      );
    }

    const stickers = readLocal<Sticker[]>(localStickersKey, seedStickers);
    return stickers
      .filter((sticker) => sticker.album_id === albumId)
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
      wishlisted: Boolean(payload.wishlisted),
      notes: payload.notes || null,
      created_at: now(),
      updated_at: now(),
    };
    writeLocal(localStickersKey, [...stickers, sticker]);
    return sticker;
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
