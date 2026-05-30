import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Album, CatalogStickerInput, CollectionStats, Sticker, StickerPatch } from '../types/collection';
import { collectionStore, isSupabaseConfigured, normalizeStickerCode } from '../services/collectionStore';

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
    };
  }
}

type StickerFilter = 'all' | 'owned' | 'missing' | 'duplicates' | 'wishlist';
type ViewMode = 'scan' | 'catalog' | 'trades';

const emptyAlbumForm = {
  name: '',
  publisher: '',
  season: '',
  cover_url: '',
  total_stickers: 100,
};

const emptyCatalogForm = {
  code: '',
  title: '',
  section: '',
};

const emptyGeneratorForm = {
  prefix: '',
  start: 1,
  count: 20,
  padding: 3,
  section: '',
};

function getStats(album: Album | undefined, stickers: Sticker[]): CollectionStats {
  const owned = stickers.filter((sticker) => sticker.quantity > 0).length;
  const duplicates = stickers.reduce((sum, sticker) => sum + Math.max(sticker.quantity - 1, 0), 0);
  const wishlisted = stickers.filter((sticker) => sticker.wishlisted).length;
  const total = Math.max(album?.total_stickers || 0, stickers.length);
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
  const [catalogForm, setCatalogForm] = useState(emptyCatalogForm);
  const [generatorForm, setGeneratorForm] = useState(emptyGeneratorForm);
  const [manualCode, setManualCode] = useState('');
  const [lastScan, setLastScan] = useState<Sticker | null>(null);
  const [filter, setFilter] = useState<StickerFilter>('all');
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('scan');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanRunning, setScanRunning] = useState(false);
  const [cameraMessage, setCameraMessage] = useState('');
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLockRef = useRef(false);

  const selectedAlbum = albums.find((album) => album.id === selectedAlbumId);
  const stats = useMemo(() => getStats(selectedAlbum, stickers), [selectedAlbum, stickers]);
  const duplicates = useMemo(() => stickers.filter((sticker) => sticker.quantity > 1), [stickers]);

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
        (filter === 'owned' && sticker.quantity > 0) ||
        (filter === 'missing' && sticker.quantity === 0) ||
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
        const result = await collectionStore.listStickers(selectedAlbumId);
        setStickers(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Nao foi possivel carregar o catalogo.');
      } finally {
        setLoading(false);
      }
    }

    setLastScan(null);
    stopCamera();
    loadStickers();
  }, [selectedAlbumId]);

  useEffect(() => stopCamera, []);

  async function reloadStickers(albumId = selectedAlbumId) {
    if (!albumId) return;
    setStickers(await collectionStore.listStickers(albumId));
  }

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

  async function handleCreateCatalogSticker(event: FormEvent) {
    event.preventDefault();
    if (!selectedAlbumId) {
      setError('Selecione um album antes de montar o catalogo.');
      return;
    }
    if (!catalogForm.code.trim() || !catalogForm.title.trim()) {
      setError('Informe codigo e titulo da figurinha do catalogo.');
      return;
    }

    await addCatalogItems([
      {
        code: catalogForm.code,
        title: catalogForm.title,
        section: catalogForm.section,
      },
    ]);
    setCatalogForm(emptyCatalogForm);
  }

  async function handleGenerateCatalog(event: FormEvent) {
    event.preventDefault();
    if (!selectedAlbumId) {
      setError('Selecione um album antes de gerar o catalogo.');
      return;
    }

    const count = Math.max(Number(generatorForm.count) || 0, 0);
    const start = Number(generatorForm.start) || 1;
    const padding = Math.max(Number(generatorForm.padding) || 1, 1);
    if (!count) {
      setError('Informe quantas figurinhas deseja gerar.');
      return;
    }

    const items: CatalogStickerInput[] = Array.from({ length: count }, (_, index) => {
      const number = start + index;
      const suffix = String(number).padStart(padding, '0');
      const prefix = generatorForm.prefix.trim();
      const code = prefix ? `${prefix} ${suffix}` : suffix;
      return {
        code,
        title: `Figurinha ${code}`,
        section: generatorForm.section,
      };
    });

    await addCatalogItems(items);
  }

  async function addCatalogItems(items: CatalogStickerInput[]) {
    try {
      setSaving(true);
      setError('');
      await collectionStore.createCatalog(selectedAlbumId, items);
      await reloadStickers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel atualizar o catalogo.');
    } finally {
      setSaving(false);
    }
  }

  async function registerCode(rawCode: string) {
    if (!selectedAlbumId) {
      setError('Selecione um album antes de ler figurinhas.');
      return;
    }

    const code = normalizeStickerCode(rawCode);
    if (!code) return;

    try {
      setSaving(true);
      setError('');
      const updated = await collectionStore.incrementSticker(selectedAlbumId, code);
      setLastScan(updated);
      setManualCode('');
      setStickers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setLastScan(null);
      setError(err instanceof Error ? err.message : 'Nao foi possivel registrar a figurinha.');
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
      if (lastScan?.id === updated.id) {
        setLastScan(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel atualizar a figurinha.');
    }
  }

  async function startCamera() {
    if (!selectedAlbumId) {
      setError('Selecione um album antes de ler figurinhas.');
      return;
    }
    if (!window.BarcodeDetector) {
      setCameraMessage('Leitura automatica indisponivel neste navegador. Use o campo de codigo.');
      return;
    }

    try {
      setError('');
      setCameraMessage('');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanRunning(true);
      scanCamera();
    } catch {
      setCameraMessage('Nao foi possivel acessar a camera. Confira a permissao do navegador.');
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanRunning(false);
    scanLockRef.current = false;
  }

  async function scanCamera() {
    const detector = window.BarcodeDetector ? new window.BarcodeDetector() : null;
    if (!detector) return;

    const loop = async () => {
      if (!streamRef.current || !videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        const rawValue = codes[0]?.rawValue;
        if (rawValue && !scanLockRef.current) {
          scanLockRef.current = true;
          await registerCode(rawValue);
          window.setTimeout(() => {
            scanLockRef.current = false;
          }, 1400);
        }
      } catch {
        setCameraMessage('Nao foi possivel ler a imagem da camera.');
      }
      window.requestAnimationFrame(loop);
    };

    window.requestAnimationFrame(loop);
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <p className="text-sm font-medium text-emerald-700">Catalogo e trocas</p>
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
              <Metric label="Tenho" value={`${stats.owned}/${Math.max(selectedAlbum.total_stickers, stats.totalRegistered)}`} />
              <Metric label="Faltam" value={String(stats.missing)} />
              <Metric label="Para troca" value={String(stats.duplicates)} />
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
                        {[album.publisher, album.season].filter(Boolean).join(' - ') || 'Sem editora'}
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
              <TextField label="Editora" value={albumForm.publisher} onChange={(publisher) => setAlbumForm({ ...albumForm, publisher })} />
              <TextField label="Ano/temporada" value={albumForm.season} onChange={(season) => setAlbumForm({ ...albumForm, season })} />
              <TextField label="URL da capa" value={albumForm.cover_url} onChange={(cover_url) => setAlbumForm({ ...albumForm, cover_url })} />
              <NumberField
                label="Total de figurinhas"
                min={1}
                onChange={(total_stickers) => setAlbumForm({ ...albumForm, total_stickers })}
                value={albumForm.total_stickers}
              />
              <button className="w-full rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800" disabled={saving} type="submit">
                Criar album
              </button>
            </form>
          </section>
        </aside>

        <section className="space-y-4">
          {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h2 className="text-xl font-semibold">{selectedAlbum?.name || 'Nenhum album selecionado'}</h2>
                <p className="text-sm text-zinc-500">
                  {selectedAlbum ? `${stats.totalRegistered} figurinhas no catalogo` : 'Crie ou selecione um album.'}
                </p>
              </div>
              <div className="grid grid-cols-3 rounded-md border border-zinc-200 bg-zinc-50 p-1 text-sm">
                <ViewButton active={viewMode === 'scan'} label="Leitor" onClick={() => setViewMode('scan')} />
                <ViewButton active={viewMode === 'catalog'} label="Catalogo" onClick={() => setViewMode('catalog')} />
                <ViewButton active={viewMode === 'trades'} label="Trocas" onClick={() => setViewMode('trades')} />
              </div>
            </div>

            {selectedAlbum && (
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(stats.completion, 100)}%` }} />
              </div>
            )}
          </section>

          {viewMode === 'scan' && selectedAlbum && (
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold">Ler figurinha</h2>
                  <button
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50"
                    onClick={scanRunning ? stopCamera : startCamera}
                    type="button"
                  >
                    {scanRunning ? 'Parar camera' : 'Abrir camera'}
                  </button>
                </div>

                <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950">
                  <video className="aspect-video w-full object-cover" muted playsInline ref={videoRef} />
                </div>

                {cameraMessage && <p className="mt-3 text-sm text-amber-700">{cameraMessage}</p>}

                <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); registerCode(manualCode); }}>
                  <input
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm uppercase outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    onChange={(event) => setManualCode(event.target.value)}
                    placeholder="Codigo da figurinha"
                    value={manualCode}
                  />
                  <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700" disabled={saving} type="submit">
                    Registrar +1
                  </button>
                </form>
              </div>

              <ScanResultCard lastScan={lastScan} />
            </section>
          )}

          {viewMode === 'catalog' && selectedAlbum && (
            <>
              <section className="grid gap-4 xl:grid-cols-2">
                <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                  <h2 className="mb-3 text-base font-semibold">Adicionar ao catalogo</h2>
                  <form className="grid gap-3 sm:grid-cols-[120px_1fr_160px_auto]" onSubmit={handleCreateCatalogSticker}>
                    <TextField label="Codigo" value={catalogForm.code} onChange={(code) => setCatalogForm({ ...catalogForm, code })} />
                    <TextField label="Titulo" value={catalogForm.title} onChange={(title) => setCatalogForm({ ...catalogForm, title })} />
                    <TextField label="Secao" value={catalogForm.section} onChange={(section) => setCatalogForm({ ...catalogForm, section })} />
                    <button className="self-end rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700" disabled={saving} type="submit">
                      Salvar
                    </button>
                  </form>
                </section>

                <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                  <h2 className="mb-3 text-base font-semibold">Gerar sequencia</h2>
                  <form className="grid gap-3 sm:grid-cols-[1fr_90px_90px_90px] xl:grid-cols-[1fr_80px_80px_80px_auto]" onSubmit={handleGenerateCatalog}>
                    <TextField label="Prefixo" value={generatorForm.prefix} onChange={(prefix) => setGeneratorForm({ ...generatorForm, prefix })} />
                    <NumberField label="Inicio" min={1} onChange={(start) => setGeneratorForm({ ...generatorForm, start })} value={generatorForm.start} />
                    <NumberField label="Qtd." min={1} onChange={(count) => setGeneratorForm({ ...generatorForm, count })} value={generatorForm.count} />
                    <NumberField label="Digitos" min={1} onChange={(padding) => setGeneratorForm({ ...generatorForm, padding })} value={generatorForm.padding} />
                    <button className="self-end rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800" disabled={saving} type="submit">
                      Gerar
                    </button>
                  </form>
                </section>
              </section>

              <CatalogToolbar filter={filter} query={query} setFilter={setFilter} setQuery={setQuery} />
              <StickerTable loading={loading} onPatch={patchSticker} stickers={filteredStickers} />
            </>
          )}

          {viewMode === 'trades' && (
            <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-200 px-4 py-3">
                <h2 className="text-base font-semibold">Disponiveis para troca</h2>
                <p className="text-sm text-zinc-500">{duplicates.length} modelos com repetidas, {stats.duplicates} figurinhas extras.</p>
              </div>
              {duplicates.length === 0 ? (
                <EmptyState title="Nenhuma repetida" description="Quando uma quantidade passar de 1, ela aparece aqui para troca." />
              ) : (
                <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                  {duplicates.map((sticker) => (
                    <article className="rounded-lg border border-zinc-200 p-4" key={sticker.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-sm font-semibold">{sticker.code}</p>
                          <h3 className="font-medium">{sticker.title}</h3>
                          <p className="text-sm text-zinc-500">{sticker.section || 'Sem secao'}</p>
                        </div>
                        <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-800">
                          {sticker.quantity - 1} troca
                        </span>
                      </div>
                      <button
                        className="mt-4 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50"
                        onClick={() => patchSticker(sticker, { quantity: Math.max(sticker.quantity - 1, 0), owned: sticker.quantity - 1 > 0 })}
                        type="button"
                      >
                        Marcar troca feita
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
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

function ViewButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={`rounded px-3 py-2 font-medium ${active ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-600 hover:text-zinc-950'}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function CatalogToolbar({
  filter,
  query,
  setFilter,
  setQuery,
}: {
  filter: StickerFilter;
  query: string;
  setFilter: (filter: StickerFilter) => void;
  setQuery: (query: string) => void;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por codigo, titulo ou secao"
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
    </section>
  );
}

function ScanResultCard({ lastScan }: { lastScan: Sticker | null }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-base font-semibold">Ultima leitura</h2>
      {!lastScan ? (
        <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-10 text-center">
          <p className="font-medium text-zinc-800">Nenhuma figurinha lida</p>
          <p className="mt-1 text-sm text-zinc-500">A leitura valida aparece aqui.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-mono text-sm font-semibold text-emerald-900">{lastScan.code}</p>
          <h3 className="mt-1 text-lg font-semibold text-emerald-950">{lastScan.title}</h3>
          <p className="text-sm text-emerald-800">{lastScan.section || 'Sem secao'}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric label="Quantidade" value={String(lastScan.quantity)} />
            <Metric label="Troca" value={String(Math.max(lastScan.quantity - 1, 0))} />
          </div>
        </div>
      )}
    </section>
  );
}

function StickerTable({
  loading,
  onPatch,
  stickers,
}: {
  loading: boolean;
  onPatch: (sticker: Sticker, patch: StickerPatch) => void;
  stickers: Sticker[];
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="grid grid-cols-[110px_1fr_120px_150px_110px] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 max-lg:hidden">
        <span>Codigo</span>
        <span>Figurinha</span>
        <span>Status</span>
        <span>Quantidade</span>
        <span>Desejo</span>
      </div>
      {loading ? (
        <EmptyState title="Carregando catalogo" description="Buscando as figurinhas do album selecionado." />
      ) : stickers.length === 0 ? (
        <EmptyState title="Catalogo vazio" description="Gere uma sequencia ou adicione figurinhas ao catalogo." />
      ) : (
        <div className="divide-y divide-zinc-100">
          {stickers.map((sticker) => (
            <StickerRow key={sticker.id} onPatch={(patch) => onPatch(sticker, patch)} sticker={sticker} />
          ))}
        </div>
      )}
    </section>
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

function NumberField({
  label,
  min,
  onChange,
  value,
}: {
  label: string;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="block text-sm font-medium text-zinc-700">
      {label}
      <input
        className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
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

function StickerRow({ onPatch, sticker }: { onPatch: (patch: StickerPatch) => void; sticker: Sticker }) {
  const isOwned = sticker.quantity > 0;

  return (
    <article className="grid gap-3 px-4 py-4 lg:grid-cols-[110px_1fr_120px_150px_110px] lg:items-center">
      <div>
        <p className="text-xs font-semibold uppercase text-zinc-500 lg:hidden">Codigo</p>
        <p className="font-mono text-sm font-semibold text-zinc-900">{sticker.code}</p>
      </div>
      <div className="min-w-0">
        <p className="font-medium text-zinc-950">{sticker.title}</p>
        <p className="text-sm text-zinc-500">{sticker.section || 'Sem secao'}</p>
      </div>
      <div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isOwned ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-700'}`}>
          {isOwned ? 'Tenho' : 'Falta'}
        </span>
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
          onClick={() => onPatch({ quantity: sticker.quantity + 1, owned: true, wishlisted: false })}
          type="button"
        >
          +
        </button>
        {sticker.quantity > 1 && <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-800">troca</span>}
      </div>
      <div>
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
      </div>
    </article>
  );
}

export default HomePage;
