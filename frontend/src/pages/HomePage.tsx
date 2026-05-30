import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { Album, CollectionStats, Sticker, StickerPatch } from '../types/collection';
import { collectionStore, isSupabaseConfigured } from '../services/collectionStore';

type StickerFilter = 'all' | 'owned' | 'missing' | 'duplicates' | 'wishlist';

const emptyAlbumForm = {
  name: '',
  publisher: '',
  season: '',
  cover_url: '',
  total_stickers: 100,
};

const emptyStickerForm = {
  code: '',
  title: '',
  section: '',
  image_url: '',
  quantity: 1,
  wishlisted: false,
  notes: '',
};

function getStats(album: Album | undefined, stickers: Sticker[]): CollectionStats {
  const owned = stickers.filter((sticker) => sticker.owned || sticker.quantity > 0).length;
  const duplicates = stickers.reduce((sum, sticker) => sum + Math.max(sticker.quantity - 1, 0), 0);
  const wishlisted = stickers.filter((sticker) => sticker.wishlisted).length;
  const total = album?.total_stickers || stickers.length || 0;
  const missing = Math.max(total - owned, 0);
  const completion = total ? Math.round((owned / total) * 100) : 0;

  return {
    owned,
    missing,
    duplicates,
    wishlisted,
    totalRegistered: stickers.length,
    completion,
  };
}

function initials(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function HomePage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState('');
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [albumForm, setAlbumForm] = useState(emptyAlbumForm);
  const [stickerForm, setStickerForm] = useState(emptyStickerForm);
  const [filter, setFilter] = useState<StickerFilter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedAlbum = albums.find((album) => album.id === selectedAlbumId);
  const stats = useMemo(() => getStats(selectedAlbum, stickers), [selectedAlbum, stickers]);

  const filteredStickers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return stickers.filter((sticker) => {
      const matchesQuery =
        !normalizedQuery ||
        [sticker.code, sticker.title, sticker.section || '', sticker.notes || '']
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);

      const matchesFilter =
        filter === 'all' ||
        (filter === 'owned' && (sticker.owned || sticker.quantity > 0)) ||
        (filter === 'missing' && !sticker.owned && sticker.quantity === 0) ||
        (filter === 'duplicates' && sticker.quantity > 1) ||
        (filter === 'wishlist' && sticker.wishlisted);

      return matchesQuery && matchesFilter;
    });
  }, [filter, query, stickers]);

  useEffect(() => {
    async function loadAlbums() {
      try {
        setLoading(true);
        const result = await collectionStore.listAlbums();
        setAlbums(result);
        setSelectedAlbumId((current) => current || result[0]?.id || '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Nao foi possivel carregar os albuns.');
      } finally {
        setLoading(false);
      }
    }

    loadAlbums();
  }, []);

  useEffect(() => {
    async function loadStickers() {
      if (!selectedAlbumId) {
        setStickers([]);
        return;
      }

      try {
        setLoading(true);
        setStickers(await collectionStore.listStickers(selectedAlbumId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Nao foi possivel carregar as figurinhas.');
      } finally {
        setLoading(false);
      }
    }

    loadStickers();
  }, [selectedAlbumId]);

  async function handleCreateAlbum(event: FormEvent) {
    event.preventDefault();
    if (!albumForm.name.trim()) {
      setError('Informe um nome para o album.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      const album = await collectionStore.createAlbum(albumForm);
      setAlbums((current) => [album, ...current]);
      setSelectedAlbumId(album.id);
      setAlbumForm(emptyAlbumForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel criar o album.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateSticker(event: FormEvent) {
    event.preventDefault();
    if (!selectedAlbumId) {
      setError('Crie ou selecione um album antes de cadastrar figurinhas.');
      return;
    }
    if (!stickerForm.code.trim() || !stickerForm.title.trim()) {
      setError('Informe codigo e titulo da figurinha.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      const quantity = Math.max(Number(stickerForm.quantity) || 0, 0);
      const sticker = await collectionStore.createSticker({
        ...stickerForm,
        album_id: selectedAlbumId,
        quantity,
        owned: quantity > 0,
      });
      setStickers((current) => [...current, sticker].sort((a, b) => a.code.localeCompare(b.code)));
      setStickerForm(emptyStickerForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel cadastrar a figurinha.');
    } finally {
      setSaving(false);
    }
  }

  async function patchSticker(sticker: Sticker, patch: StickerPatch) {
    try {
      setError('');
      const nextQuantity = patch.quantity ?? sticker.quantity;
      const updated = await collectionStore.updateSticker(sticker.id, {
        ...patch,
        owned: patch.owned ?? nextQuantity > 0,
      });
      setStickers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel atualizar a figurinha.');
    }
  }

  async function deleteSticker(sticker: Sticker) {
    try {
      setError('');
      await collectionStore.deleteSticker(sticker.id);
      setStickers((current) => current.filter((item) => item.id !== sticker.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel remover a figurinha.');
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <p className="text-sm font-medium text-emerald-700">Colecao de figurinhas</p>
              <h1 className="text-3xl font-semibold tracking-normal text-zinc-950">StickerShelf</h1>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
              <span className={`h-2.5 w-2.5 rounded-full ${isSupabaseConfigured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {isSupabaseConfigured ? 'Supabase conectado' : 'Modo local sem Supabase'}
            </div>
          </div>

          {selectedAlbum && (
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric label="Completude" value={`${stats.completion}%`} />
              <Metric label="Tenho" value={`${stats.owned}/${selectedAlbum.total_stickers}`} />
              <Metric label="Faltam" value={String(stats.missing)} />
              <Metric label="Repetidas" value={String(stats.duplicates)} />
              <Metric label="Desejadas" value={String(stats.wishlisted)} />
            </section>
          )}
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[320px_1fr] lg:px-8">
        <aside className="space-y-4">
          <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Albuns</h2>
              <span className="text-sm text-zinc-500">{albums.length}</span>
            </div>
            <div className="space-y-2">
              {albums.map((album) => (
                <button
                  className={`w-full rounded-md border p-3 text-left transition ${
                    album.id === selectedAlbumId
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-zinc-200 bg-white hover:border-zinc-300'
                  }`}
                  key={album.id}
                  onClick={() => setSelectedAlbumId(album.id)}
                  type="button"
                >
                  <div className="flex items-center gap-3">
                    <AlbumCover album={album} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{album.name}</p>
                      <p className="truncate text-sm text-zinc-500">
                        {[album.publisher, album.season].filter(Boolean).join(' · ') || 'Sem editora'}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-base font-semibold">Novo album</h2>
            <form className="space-y-3" onSubmit={handleCreateAlbum}>
              <TextField label="Nome" value={albumForm.name} onChange={(name) => setAlbumForm({ ...albumForm, name })} />
              <TextField
                label="Editora"
                value={albumForm.publisher}
                onChange={(publisher) => setAlbumForm({ ...albumForm, publisher })}
              />
              <TextField label="Ano/temporada" value={albumForm.season} onChange={(season) => setAlbumForm({ ...albumForm, season })} />
              <TextField
                label="URL da capa"
                value={albumForm.cover_url}
                onChange={(cover_url) => setAlbumForm({ ...albumForm, cover_url })}
              />
              <label className="block text-sm font-medium text-zinc-700">
                Total de figurinhas
                <input
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  min="1"
                  onChange={(event) => setAlbumForm({ ...albumForm, total_stickers: Number(event.target.value) })}
                  type="number"
                  value={albumForm.total_stickers}
                />
              </label>
              <button className="w-full rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800" disabled={saving} type="submit">
                Criar album
              </button>
            </form>
          </section>
        </aside>

        <section className="space-y-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h2 className="text-xl font-semibold">{selectedAlbum?.name || 'Nenhum album selecionado'}</h2>
                <p className="text-sm text-zinc-500">
                  {selectedAlbum
                    ? `${stats.totalRegistered} figurinhas cadastradas neste album`
                    : 'Crie um album para iniciar a colecao.'}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 sm:w-72"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar por codigo, nome ou secao"
                  type="search"
                  value={query}
                />
                <select
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  onChange={(event) => setFilter(event.target.value as StickerFilter)}
                  value={filter}
                >
                  <option value="all">Todas</option>
                  <option value="owned">Tenho</option>
                  <option value="missing">Faltando</option>
                  <option value="duplicates">Repetidas</option>
                  <option value="wishlist">Desejadas</option>
                </select>
              </div>
            </div>

            {selectedAlbum && (
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(stats.completion, 100)}%` }} />
              </div>
            )}
          </section>

          {selectedAlbum && (
            <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-base font-semibold">Cadastrar figurinha</h2>
              <form className="grid gap-3 lg:grid-cols-[110px_1fr_150px_120px] xl:grid-cols-[110px_1fr_150px_100px_1fr_auto]" onSubmit={handleCreateSticker}>
                <TextField label="Codigo" value={stickerForm.code} onChange={(code) => setStickerForm({ ...stickerForm, code })} />
                <TextField label="Titulo" value={stickerForm.title} onChange={(title) => setStickerForm({ ...stickerForm, title })} />
                <TextField label="Secao" value={stickerForm.section} onChange={(section) => setStickerForm({ ...stickerForm, section })} />
                <label className="block text-sm font-medium text-zinc-700">
                  Qtd.
                  <input
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    min="0"
                    onChange={(event) => setStickerForm({ ...stickerForm, quantity: Number(event.target.value) })}
                    type="number"
                    value={stickerForm.quantity}
                  />
                </label>
                <TextField label="Observacao" value={stickerForm.notes} onChange={(notes) => setStickerForm({ ...stickerForm, notes })} />
                <button className="self-end rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700" disabled={saving} type="submit">
                  Adicionar
                </button>
              </form>
            </section>
          )}

          <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
            <div className="grid grid-cols-[110px_1fr_120px_150px_110px] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 max-lg:hidden">
              <span>Codigo</span>
              <span>Figurinha</span>
              <span>Status</span>
              <span>Quantidade</span>
              <span>Acoes</span>
            </div>

            {loading ? (
              <EmptyState title="Carregando colecao" description="Buscando os dados do album selecionado." />
            ) : filteredStickers.length === 0 ? (
              <EmptyState title="Nenhuma figurinha encontrada" description="Cadastre novas figurinhas ou ajuste os filtros aplicados." />
            ) : (
              <div className="divide-y divide-zinc-100">
                {filteredStickers.map((sticker) => (
                  <StickerRow
                    key={sticker.id}
                    onDelete={() => deleteSticker(sticker)}
                    onPatch={(patch) => patchSticker(sticker, patch)}
                    sticker={sticker}
                  />
                ))}
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

function AlbumCover({ album }: { album: Album }) {
  if (album.cover_url) {
    return <img alt="" className="h-12 w-12 rounded-md object-cover" src={album.cover_url} />;
  }

  return (
    <div className="grid h-12 w-12 place-items-center rounded-md bg-emerald-100 text-sm font-semibold text-emerald-800">
      {initials(album.name) || 'AL'}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="text-2xl font-semibold text-zinc-950">{value}</p>
    </div>
  );
}

function TextField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="block text-sm font-medium text-zinc-700">
      {label}
      <input
        className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        onChange={(event) => onChange(event.target.value)}
        type="text"
        value={value}
      />
    </label>
  );
}

function EmptyState({ description, title }: { description: string; title: string }) {
  return (
    <div className="px-4 py-14 text-center">
      <p className="font-medium text-zinc-800">{title}</p>
      <p className="mt-1 text-sm text-zinc-500">{description}</p>
    </div>
  );
}

function StickerRow({ onDelete, onPatch, sticker }: { onDelete: () => void; onPatch: (patch: StickerPatch) => void; sticker: Sticker }) {
  const isOwned = sticker.owned || sticker.quantity > 0;

  return (
    <article className="grid gap-3 px-4 py-4 lg:grid-cols-[110px_1fr_120px_150px_110px] lg:items-center">
      <div>
        <p className="text-xs font-semibold uppercase text-zinc-500 lg:hidden">Codigo</p>
        <p className="font-mono text-sm font-semibold text-zinc-900">{sticker.code}</p>
      </div>
      <div className="min-w-0">
        <p className="font-medium text-zinc-950">{sticker.title}</p>
        <p className="text-sm text-zinc-500">{sticker.section || 'Sem secao'}</p>
        {sticker.notes && <p className="mt-1 text-sm text-zinc-500">{sticker.notes}</p>}
      </div>
      <div>
        <button
          className={`rounded-full px-3 py-1 text-xs font-semibold ${isOwned ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-700'}`}
          onClick={() => onPatch({ owned: !isOwned, quantity: isOwned ? 0 : Math.max(sticker.quantity, 1) })}
          type="button"
        >
          {isOwned ? 'Tenho' : 'Falta'}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          aria-label="Diminuir quantidade"
          className="grid h-8 w-8 place-items-center rounded-md border border-zinc-300 text-lg leading-none hover:bg-zinc-50"
          onClick={() => onPatch({ quantity: Math.max(sticker.quantity - 1, 0), owned: sticker.quantity - 1 > 0 })}
          type="button"
        >
          -
        </button>
        <span className="w-8 text-center font-medium">{sticker.quantity}</span>
        <button
          aria-label="Aumentar quantidade"
          className="grid h-8 w-8 place-items-center rounded-md border border-zinc-300 text-lg leading-none hover:bg-zinc-50"
          onClick={() => onPatch({ quantity: sticker.quantity + 1, owned: true })}
          type="button"
        >
          +
        </button>
        {sticker.quantity > 1 && <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-800">rep.</span>}
      </div>
      <div className="flex gap-2">
        <button
          aria-label="Marcar como desejada"
          className={`grid h-8 w-8 place-items-center rounded-md border text-sm ${
            sticker.wishlisted ? 'border-amber-300 bg-amber-100 text-amber-800' : 'border-zinc-300 hover:bg-zinc-50'
          }`}
          onClick={() => onPatch({ wishlisted: !sticker.wishlisted })}
          type="button"
        >
          ☆
        </button>
        <button
          aria-label="Remover figurinha"
          className="grid h-8 w-8 place-items-center rounded-md border border-red-200 text-sm text-red-700 hover:bg-red-50"
          onClick={onDelete}
          type="button"
        >
          ×
        </button>
      </div>
    </article>
  );
}

export default HomePage;
