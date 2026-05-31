import { Sticker } from '../types/collection';

// Lógica pura de filtragem/agrupamento do catálogo, isolada da UI para ser testável.

export const SECTION_FALLBACK = 'Sem seção';

export type StickerStatusFilter = 'all' | 'owned' | 'missing' | 'duplicates' | 'stuck' | 'wishlist';

export type SectionSummary = { name: string; total: number; owned: number };

export function sectionOf(sticker: Sticker): string {
  return sticker.section?.trim() || SECTION_FALLBACK;
}

export function matchesStatus(sticker: Sticker, status: StickerStatusFilter): boolean {
  switch (status) {
    case 'owned':
      return sticker.quantity > 0;
    case 'missing':
      return sticker.quantity === 0;
    case 'duplicates':
      return sticker.quantity > 1;
    case 'stuck':
      return sticker.is_stuck;
    case 'wishlist':
      return sticker.wishlisted;
    case 'all':
    default:
      return true;
  }
}

export function matchesQuery(sticker: Sticker, query: string): boolean {
  const nq = query.trim().toLowerCase();
  if (!nq) return true;
  return [sticker.code, sticker.title, sticker.section || '', sticker.notes || '']
    .join(' ')
    .toLowerCase()
    .includes(nq);
}

export function filterStickers(
  stickers: Sticker[],
  opts: { query?: string; status?: StickerStatusFilter; section?: string }
): Sticker[] {
  const { query = '', status = 'all', section = 'all' } = opts;
  return stickers.filter(
    (s) => matchesQuery(s, query) && matchesStatus(s, status) && (section === 'all' || sectionOf(s) === section)
  );
}

// Resumo por seção (total e quantas já possuídas), ordenado por nome.
export function sectionSummaries(stickers: Sticker[]): SectionSummary[] {
  const byName = new Map<string, { total: number; owned: number }>();
  stickers.forEach((s) => {
    const name = sectionOf(s);
    const cur = byName.get(name) || { total: 0, owned: 0 };
    cur.total += 1;
    if (s.quantity > 0) cur.owned += 1;
    byName.set(name, cur);
  });
  return Array.from(byName.entries())
    .map(([name, counts]) => ({ name, ...counts }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Agrupa por seção (ordem alfabética), preservando a ordem de entrada dentro do grupo.
export function groupBySection(stickers: Sticker[]): Array<[string, Sticker[]]> {
  const map = new Map<string, Sticker[]>();
  stickers.forEach((s) => {
    const name = sectionOf(s);
    map.set(name, [...(map.get(name) || []), s]);
  });
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}
