import {
  buildPaniniWorldCup2026Catalog,
  cocaColaStickers,
  paniniWorldCup2026Album,
} from './paniniWorldCup2026';

describe('catalogo FIFA World Cup 2026', () => {
  const catalog = buildPaniniWorldCup2026Catalog();

  it('tem 994 figurinhas (980 base + 14 Coca-Cola)', () => {
    expect(catalog).toHaveLength(994);
  });

  it('total_stickers do album reflete 994', () => {
    expect(paniniWorldCup2026Album.total_stickers).toBe(994);
  });

  it('nao tem codigos duplicados', () => {
    const codes = catalog.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('inclui a secao Coca-Cola com 14 figurinhas', () => {
    const coke = catalog.filter((s) => s.section === 'Coca-Cola');
    expect(coke).toHaveLength(14);
    expect(coke).toEqual(cocaColaStickers);
  });

  it('os codigos Coca-Cola vao de CC1 a CC14', () => {
    const codes = cocaColaStickers.map((s) => s.code);
    expect(codes[0]).toBe('CC1');
    expect(codes[codes.length - 1]).toBe('CC14');
    codes.forEach((code) => expect(code).toMatch(/^CC\d+$/));
  });

  it('os titulos Coca-Cola seguem o padrao "Coca-Cola N"', () => {
    expect(cocaColaStickers[0].title).toBe('Coca-Cola 1');
    expect(cocaColaStickers[13].title).toBe('Coca-Cola 14');
  });
});
