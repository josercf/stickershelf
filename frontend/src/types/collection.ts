export type Album = {
  id: string;
  name: string;
  publisher: string | null;
  season: string | null;
  cover_url: string | null;
  total_stickers: number;
  created_at: string;
  updated_at: string;
};

export type Sticker = {
  id: string;
  album_id: string;
  code: string;
  title: string;
  section: string | null;
  image_url: string | null;
  owned: boolean;
  quantity: number;
  wishlisted: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AlbumInput = {
  name: string;
  publisher?: string;
  season?: string;
  cover_url?: string;
  total_stickers: number;
};

export type StickerInput = {
  album_id: string;
  code: string;
  title: string;
  section?: string;
  image_url?: string;
  owned: boolean;
  quantity: number;
  wishlisted: boolean;
  notes?: string;
};

export type StickerPatch = Partial<Omit<StickerInput, 'album_id'>>;

export type CollectionStats = {
  owned: number;
  missing: number;
  duplicates: number;
  wishlisted: number;
  totalRegistered: number;
  completion: number;
};
