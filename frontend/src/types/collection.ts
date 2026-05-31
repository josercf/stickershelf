export type Album = {
  id: string;
  name: string;
  label: string | null;
  owner_id: string | null;
  publisher: string | null;
  season: string | null;
  cover_url: string | null;
  total_stickers: number;
  created_at: string;
  updated_at: string;
};

export type AlbumMember = {
  id: string;
  album_id: string;
  user_id: string | null;
  email: string | null;
  invite_type: 'email' | 'username' | 'phone' | 'link';
  invite_value: string | null;
  invite_token: string | null;
  accepted_at: string | null;
  expires_at: string | null;
  used_at: string | null;
  role: 'owner' | 'editor' | 'viewer';
  created_at: string;
};

export type InviteType = AlbumMember['invite_type'];

export type AuthSession = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user: {
    id: string;
    email?: string;
    phone?: string;
    user_metadata?: {
      username?: string;
      user_name?: string;
      name?: string;
    };
  };
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
  is_stuck: boolean;
  wishlisted: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AlbumInput = {
  name: string;
  label?: string;
  owner_id?: string | null;
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
  is_stuck?: boolean;
  wishlisted: boolean;
  notes?: string;
};

export type StickerPatch = Partial<Omit<StickerInput, 'album_id'>>;

export type CatalogStickerInput = {
  code: string;
  title: string;
  section?: string;
  image_url?: string;
  notes?: string;
};

export type CollectionStats = {
  owned: number;
  missing: number;
  duplicates: number;
  stuck: number;
  wishlisted: number;
  totalRegistered: number;
  completion: number;
};
