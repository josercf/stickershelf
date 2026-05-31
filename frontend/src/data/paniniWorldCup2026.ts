import { AlbumInput, CatalogStickerInput } from '../types/collection';

type PaniniTeam = {
  code: string;
  name: string;
};

export const paniniWorldCup2026Album: AlbumInput = {
  name: 'FIFA World Cup 2026',
  publisher: 'Panini',
  season: '2026',
  cover_url: '',
  // 980 base (20 intro/FWC + 48 x 20 selecoes) + 14 Coca-Cola = 994.
  total_stickers: 994,
};

const teams: PaniniTeam[] = [
  { code: 'ALG', name: 'Algeria' },
  { code: 'ARG', name: 'Argentina' },
  { code: 'AUS', name: 'Australia' },
  { code: 'AUT', name: 'Austria' },
  { code: 'BEL', name: 'Belgium' },
  { code: 'BIH', name: 'Bosnia and Herzegovina' },
  { code: 'BRA', name: 'Brazil' },
  { code: 'CAN', name: 'Canada' },
  { code: 'CIV', name: "Cote d'Ivoire" },
  { code: 'COD', name: 'DR Congo' },
  { code: 'COL', name: 'Colombia' },
  { code: 'CPV', name: 'Cape Verde' },
  { code: 'CRO', name: 'Croatia' },
  { code: 'CUW', name: 'Curacao' },
  { code: 'CZE', name: 'Czechia' },
  { code: 'ECU', name: 'Ecuador' },
  { code: 'EGY', name: 'Egypt' },
  { code: 'ENG', name: 'England' },
  { code: 'ESP', name: 'Spain' },
  { code: 'FRA', name: 'France' },
  { code: 'GER', name: 'Germany' },
  { code: 'GHA', name: 'Ghana' },
  { code: 'HAI', name: 'Haiti' },
  { code: 'IRN', name: 'Iran' },
  { code: 'IRQ', name: 'Iraq' },
  { code: 'JOR', name: 'Jordan' },
  { code: 'JPN', name: 'Japan' },
  { code: 'KOR', name: 'South Korea' },
  { code: 'KSA', name: 'Saudi Arabia' },
  { code: 'MAR', name: 'Morocco' },
  { code: 'MEX', name: 'Mexico' },
  { code: 'NED', name: 'Netherlands' },
  { code: 'NOR', name: 'Norway' },
  { code: 'NZL', name: 'New Zealand' },
  { code: 'PAN', name: 'Panama' },
  { code: 'PAR', name: 'Paraguay' },
  { code: 'POR', name: 'Portugal' },
  { code: 'QAT', name: 'Qatar' },
  { code: 'RSA', name: 'South Africa' },
  { code: 'SCO', name: 'Scotland' },
  { code: 'SEN', name: 'Senegal' },
  { code: 'SUI', name: 'Switzerland' },
  { code: 'SWE', name: 'Sweden' },
  { code: 'TUN', name: 'Tunisia' },
  { code: 'TUR', name: 'Turkey' },
  { code: 'URU', name: 'Uruguay' },
  { code: 'USA', name: 'United States' },
  { code: 'UZB', name: 'Uzbekistan' },
];

function teamStickerTitle(team: PaniniTeam, number: number) {
  if (number === 1) return `${team.name} badge`;
  if (number === 2) return `${team.name} team photo`;
  return `${team.name} player ${number - 2}`;
}

// Figurinhas do patrocinador oficial Coca-Cola (secao "Coca-Cola").
// Codigos CC1..CC14, titulos "Coca-Cola 1".."Coca-Cola 14".
export const cocaColaStickers: CatalogStickerInput[] = Array.from({ length: 14 }, (_, index) => ({
  code: `CC${index + 1}`,
  title: `Coca-Cola ${index + 1}`,
  section: 'Coca-Cola',
}));

// Monta o catalogo completo: introducao + 48 times (20 cada) + Coca-Cola.
export function buildPaniniWorldCup2026Catalog(): CatalogStickerInput[] {
  const intro: CatalogStickerInput[] = [
    {
      code: 'PANINI 1',
      title: 'Panini logo',
      section: 'Intro',
    },
    ...Array.from({ length: 19 }, (_, index) => ({
      code: `FWC ${index + 1}`,
      title: `FIFA World Cup feature ${index + 1}`,
      section: 'FWC',
    })),
  ];

  const teamItems = teams.flatMap((team) =>
    Array.from({ length: 20 }, (_, index) => {
      const number = index + 1;
      return {
        code: `${team.code} ${number}`,
        title: teamStickerTitle(team, number),
        section: team.name,
      };
    })
  );

  return [...intro, ...teamItems, ...cocaColaStickers];
}
