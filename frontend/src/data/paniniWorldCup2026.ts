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
  total_stickers: 990,
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

// Figurinhas do patrocinador oficial Coca-Cola (secao extra "Coca-Cola").
// Codigos no mesmo estilo do template (prefixo + numero): COKE 1..COKE 10.
export const cocaColaStickers: CatalogStickerInput[] = [
  { code: 'COKE 1', title: 'Coca-Cola official logo', section: 'Coca-Cola' },
  { code: 'COKE 2', title: 'Coca-Cola World Cup bottle', section: 'Coca-Cola' },
  { code: 'COKE 3', title: 'Coca-Cola Trophy Tour', section: 'Coca-Cola' },
  { code: 'COKE 4', title: 'Coca-Cola 2026 edition can', section: 'Coca-Cola' },
  { code: 'COKE 5', title: 'Coca-Cola world fans', section: 'Coca-Cola' },
  { code: 'COKE 6', title: 'Coca-Cola goal moment', section: 'Coca-Cola' },
  { code: 'COKE 7', title: 'Coca-Cola sponsored stadium', section: 'Coca-Cola' },
  { code: 'COKE 8', title: 'Coca-Cola mascot', section: 'Coca-Cola' },
  { code: 'COKE 9', title: 'Coca-Cola celebration flag', section: 'Coca-Cola' },
  { code: 'COKE 10', title: 'Coca-Cola collectible poster', section: 'Coca-Cola' },
];

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
