import countries, { flagEmoji, getCountryBySection } from './countries';

describe('flagEmoji', () => {
  it('converte código ISO alpha-2 no emoji de bandeira correto', () => {
    expect(flagEmoji('BR')).toBe(String.fromCodePoint(0x1f1e7, 0x1f1f7)); // Brasil
    expect(flagEmoji('AR')).toBe(String.fromCodePoint(0x1f1e6, 0x1f1f7)); // Argentina
    expect(flagEmoji('US')).toBe(String.fromCodePoint(0x1f1fa, 0x1f1f8)); // EUA
    expect(flagEmoji('JP')).toBe(String.fromCodePoint(0x1f1ef, 0x1f1f5)); // Japão
  });

  it('aceita código em minúsculas', () => {
    expect(flagEmoji('br')).toBe(String.fromCodePoint(0x1f1e7, 0x1f1f7));
  });

  it('suporta Inglaterra e Escócia (subdivisões do Reino Unido)', () => {
    expect(flagEmoji('GB-ENG')).toBe('\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}');
    expect(flagEmoji('GB-SCT')).toBe('\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}');
  });

  it('devolve string vazia para código inválido', () => {
    expect(flagEmoji('XYZ')).toBe('');
    expect(flagEmoji('B')).toBe('');
    expect(flagEmoji('')).toBe('');
  });
});

describe('catálogo de países', () => {
  it('todo país tem código válido e gera um emoji não vazio', () => {
    countries.forEach((c) => {
      expect(c.code).toMatch(/^[A-Z]{2}$|^GB-(ENG|SCT)$/);
      expect(flagEmoji(c.code).length).toBeGreaterThan(0);
    });
  });

  it('mapeia seções específicas para o código correto', () => {
    expect(getCountryBySection('Brazil')?.code).toBe('BR');
    expect(getCountryBySection('England')?.code).toBe('GB-ENG');
    expect(getCountryBySection('Scotland')?.code).toBe('GB-SCT');
    expect(getCountryBySection("Cote d'Ivoire")?.code).toBe('CI');
  });

  it('não tem códigos ISO duplicados (ignorando subdivisões)', () => {
    const iso = countries.map((c) => c.code).filter((code) => /^[A-Z]{2}$/.test(code));
    expect(new Set(iso).size).toBe(iso.length);
  });
});
