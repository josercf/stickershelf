import { shortUserId, isTradeable, countTradeables } from './market';

describe('shortUserId', () => {
  it('retorna os 8 primeiros caracteres do UUID', () => {
    expect(shortUserId('a3f2b1c4-1234-5678-9abc-def012345678')).toBe('a3f2b1c4');
  });

  it('nao inclui hifen (primeiro bloco do UUID tem 8 chars)', () => {
    expect(shortUserId('a3f2b1c4-1234-5678-9abc-def012345678')).not.toContain('-');
  });

  it('lida com string curta sem estourar', () => {
    expect(shortUserId('abc')).toBe('abc');
  });

  it('usa fallback "anon" quando vazio', () => {
    expect(shortUserId('')).toBe('anon');
    expect(shortUserId('   ')).toBe('anon');
  });
});

describe('isTradeable', () => {
  it('falsa quando ha 0 ou 1 copia', () => {
    expect(isTradeable(0)).toBe(false);
    expect(isTradeable(1)).toBe(false);
  });

  it('verdadeira quando ha repetidas (quantidade > 1)', () => {
    expect(isTradeable(2)).toBe(true);
    expect(isTradeable(5)).toBe(true);
  });
});

describe('countTradeables', () => {
  it('soma as copias extras (quantidade - 1) de cada figurinha', () => {
    const stickers = [{ quantity: 0 }, { quantity: 1 }, { quantity: 2 }, { quantity: 4 }];
    // 0 + 0 + 1 + 3 = 4
    expect(countTradeables(stickers)).toBe(4);
  });

  it('retorna 0 para conjunto vazio', () => {
    expect(countTradeables([])).toBe(0);
  });

  it('nunca conta negativo', () => {
    expect(countTradeables([{ quantity: 0 }])).toBe(0);
  });
});
