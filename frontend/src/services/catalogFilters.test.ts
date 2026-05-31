import { Sticker } from '../types/collection';
import {
  SECTION_FALLBACK,
  filterStickers,
  groupBySection,
  matchesStatus,
  sectionOf,
  sectionSummaries,
} from './catalogFilters';

function makeSticker(overrides: Partial<Sticker> = {}): Sticker {
  return {
    id: Math.random().toString(36).slice(2),
    album_id: 'alb-1',
    code: 'BRA 01',
    title: 'Escudo',
    section: 'Brazil',
    image_url: null,
    owned: false,
    quantity: 0,
    is_stuck: false,
    wishlisted: false,
    notes: null,
    created_at: '2026-05-30T00:00:00Z',
    updated_at: '2026-05-30T00:00:00Z',
    ...overrides,
  };
}

describe('catalogFilters — sectionOf', () => {
  it('usa a seção quando presente (com trim)', () => {
    expect(sectionOf(makeSticker({ section: '  Brazil  ' }))).toBe('Brazil');
  });

  it('cai no fallback quando a seção é vazia ou nula', () => {
    expect(sectionOf(makeSticker({ section: null }))).toBe(SECTION_FALLBACK);
    expect(sectionOf(makeSticker({ section: '   ' }))).toBe(SECTION_FALLBACK);
  });
});

describe('catalogFilters — matchesStatus', () => {
  const missing = makeSticker({ quantity: 0 });
  const owned = makeSticker({ quantity: 1 });
  const duplicate = makeSticker({ quantity: 3 });
  const stuck = makeSticker({ quantity: 1, is_stuck: true });
  const wished = makeSticker({ quantity: 0, wishlisted: true });

  it('all aceita qualquer figurinha', () => {
    [missing, owned, duplicate].forEach((s) => expect(matchesStatus(s, 'all')).toBe(true));
  });

  it('owned: quantidade > 0', () => {
    expect(matchesStatus(owned, 'owned')).toBe(true);
    expect(matchesStatus(missing, 'owned')).toBe(false);
  });

  it('missing: quantidade === 0', () => {
    expect(matchesStatus(missing, 'missing')).toBe(true);
    expect(matchesStatus(owned, 'missing')).toBe(false);
  });

  it('duplicates: quantidade > 1', () => {
    expect(matchesStatus(duplicate, 'duplicates')).toBe(true);
    expect(matchesStatus(owned, 'duplicates')).toBe(false);
  });

  it('stuck e wishlist', () => {
    expect(matchesStatus(stuck, 'stuck')).toBe(true);
    expect(matchesStatus(owned, 'stuck')).toBe(false);
    expect(matchesStatus(wished, 'wishlist')).toBe(true);
    expect(matchesStatus(owned, 'wishlist')).toBe(false);
  });
});

describe('catalogFilters — filterStickers', () => {
  const stickers = [
    makeSticker({ code: 'BRA 01', section: 'Brazil', quantity: 0, title: 'Escudo Brasil' }),
    makeSticker({ code: 'BRA 02', section: 'Brazil', quantity: 2, title: 'Camisa' }),
    makeSticker({ code: 'ARG 01', section: 'Argentina', quantity: 1, title: 'Escudo Argentina' }),
    makeSticker({ code: 'X 01', section: null, quantity: 0, title: 'Avulsa' }),
  ];

  it('sem filtros devolve tudo', () => {
    expect(filterStickers(stickers, {})).toHaveLength(4);
  });

  it('combina status + seção', () => {
    const result = filterStickers(stickers, { status: 'duplicates', section: 'Brazil' });
    expect(result.map((s) => s.code)).toEqual(['BRA 02']);
  });

  it('filtra por seção fallback', () => {
    const result = filterStickers(stickers, { section: SECTION_FALLBACK });
    expect(result.map((s) => s.code)).toEqual(['X 01']);
  });

  it('busca textual cobre código, título e seção', () => {
    expect(filterStickers(stickers, { query: 'argentina' }).map((s) => s.code)).toEqual(['ARG 01']);
    expect(filterStickers(stickers, { query: 'bra' }).map((s) => s.code)).toEqual(['BRA 01', 'BRA 02']);
  });

  it('aplica os três filtros ao mesmo tempo', () => {
    const result = filterStickers(stickers, { query: 'escudo', status: 'missing', section: 'Brazil' });
    expect(result.map((s) => s.code)).toEqual(['BRA 01']);
  });
});

describe('catalogFilters — sectionSummaries', () => {
  it('conta total e possuídas por seção, ordenado por nome', () => {
    const stickers = [
      makeSticker({ section: 'Brazil', quantity: 1 }),
      makeSticker({ section: 'Brazil', quantity: 0 }),
      makeSticker({ section: 'Argentina', quantity: 2 }),
      makeSticker({ section: null, quantity: 0 }),
    ];
    expect(sectionSummaries(stickers)).toEqual([
      { name: 'Argentina', total: 1, owned: 1 },
      { name: 'Brazil', total: 2, owned: 1 },
      { name: SECTION_FALLBACK, total: 1, owned: 0 },
    ]);
  });
});

describe('catalogFilters — groupBySection', () => {
  it('agrupa por seção (alfabético) preservando a ordem de entrada no grupo', () => {
    const b1 = makeSticker({ code: 'BRA 01', section: 'Brazil' });
    const b2 = makeSticker({ code: 'BRA 02', section: 'Brazil' });
    const a1 = makeSticker({ code: 'ARG 01', section: 'Argentina' });
    const groups = groupBySection([b1, a1, b2]);
    expect(groups.map(([name]) => name)).toEqual(['Argentina', 'Brazil']);
    expect(groups[1][1].map((s) => s.code)).toEqual(['BRA 01', 'BRA 02']);
  });
});
