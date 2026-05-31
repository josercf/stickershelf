// Helpers puros da aba Mercado. Mantidos separados da UI para serem testaveis.

// Identificador publico de um usuario: os 8 primeiros caracteres do UUID.
// Nunca expomos e-mail. Ex.: "a3f2b1c4-...." -> "a3f2b1c4".
export function shortUserId(userId: string): string {
  const clean = (userId || '').trim();
  return clean ? clean.slice(0, 8) : 'anon';
}

// Uma figurinha esta disponivel para troca quando o dono tem mais de uma
// copia (a primeira fica colada no album; as extras sao trocaveis).
export function isTradeable(quantity: number): boolean {
  return quantity > 1;
}

// Total de figurinhas extras (trocaveis) num conjunto: soma de (quantidade - 1).
export function countTradeables(stickers: Array<{ quantity: number }>): number {
  return stickers.reduce((sum, s) => sum + Math.max((s.quantity || 0) - 1, 0), 0);
}
