import {
  buildPaniniWorldCup2026Catalog,
  cocaColaStickers,
  paniniWorldCup2026Album,
} from './paniniWorldCup2026';

describe('catalogo FIFA World Cup 2026', () => {
  const catalog = buildPaniniWorldCup2026Catalog();

  it('tem 990 figurinhas (980 base + 10 Coca-Cola)', () => {
    expect(catalog).toHaveLength(990);
  });

  it('total_stickers do album reflete 990', () => {
    expect(paniniWorldCup2026Album.total_stickers).toBe(990);
  });

  it('nao tem codigos duplicados', () => {
    const codes = catalog.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('inclui a secao Coca-Cola com 10 figurinhas', () => {
    const coke = catalog.filter((s) => s.section === 'Coca-Cola');
    expect(coke).toHaveLength(10);
    expect(coke).toEqual(cocaColaStickers);
  });

  it('os codigos Coca-Cola vao de COKE 1 a COKE 10 no estilo do template', () => {
    const codes = cocaColaStickers.map((s) => s.code);
    expect(codes[0]).toBe('COKE 1');
    expect(codes[codes.length - 1]).toBe('COKE 10');
    codes.forEach((code) => expect(code).toMatch(/^COKE \d+$/));
  });
});
