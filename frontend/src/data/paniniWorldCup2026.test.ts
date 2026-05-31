import {
  buildPaniniWorldCup2026Catalog,
  cocaColaStickers,
  paniniWorldCup2026Album,
} from './paniniWorldCup2026';

describe('catálogo Panini FIFA World Cup 2026', () => {
  const catalog = buildPaniniWorldCup2026Catalog();

  it('tem 990 figurinhas (980 base + 10 Coca-Cola)', () => {
    expect(catalog).toHaveLength(990);
  });

  it('total_stickers do álbum reflete 990', () => {
    expect(paniniWorldCup2026Album.total_stickers).toBe(990);
  });

  it('não tem códigos duplicados', () => {
    const codes = catalog.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('inclui a seção Coca-Cola com 10 figurinhas', () => {
    const coke = catalog.filter((s) => s.section === 'Coca-Cola');
    expect(coke).toHaveLength(10);
    expect(coke).toEqual(cocaColaStickers);
  });

  it('os códigos Coca-Cola vão de COKE-01 a COKE-10', () => {
    const codes = cocaColaStickers.map((s) => s.code);
    expect(codes[0]).toBe('COKE-01');
    expect(codes[codes.length - 1]).toBe('COKE-10');
    codes.forEach((code) => expect(code).toMatch(/^COKE-\d{2}$/));
  });
});
