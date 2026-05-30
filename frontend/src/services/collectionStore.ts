import { Album, AlbumInput, CatalogStickerInput, Sticker, StickerInput, StickerPatch } from '../types/collection';

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

function hydrateSticker(sticker: Sticker): Sticker {
  return {
    ...sticker,
    owned: Boolean(sticker.owned || sticker.quantity > 0),
    quantity: Number(sticker.quantity || 0),
    is_stuck: Boolean(sticker.is_stuck),
    wishlisted: Boolean(sticker.wishlisted),
  };
}

async function supabaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('apikey', supabaseAnonKey);
  headers.set('Authorization', `Bearer ${supabaseAnonKey}`);
  headers.set('Content-Type', 'application/json');
  if (!headers.has('Prefer')) {
    headers.set('Prefer', 'return=representation');
  }

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
  code: input.code ? normalizeStickerCode(input.code) : undefined,
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
      return supabaseRequest<Sticker[]>('stickers?on_conflict=album_id,code', {
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
