import { Sticker, StickerPatch } from '../types/collection';

// Transições puras de quantidade das figurinhas, isoladas da UI para teste.

// Incrementa a quantidade (marca repetida). Garante owned=true e remove o desejo.
export function incrementPatch(sticker: Sticker): StickerPatch {
  return { quantity: sticker.quantity + 1, owned: true, wishlisted: false };
}

// Decrementa a quantidade sem ir abaixo de zero. Ao chegar a zero, deixa de
// estar "tenho" e perde o status de colada (não há cópia para estar colada).
export function decrementPatch(sticker: Sticker): StickerPatch {
  const nextQty = Math.max(sticker.quantity - 1, 0);
  return {
    quantity: nextQty,
    owned: nextQty > 0,
    is_stuck: nextQty > 0 ? sticker.is_stuck : false,
  };
}

// Indica se a remoção precisa de confirmação: a figurinha está colada no álbum.
export function needsStuckRemovalConfirm(sticker: Sticker): boolean {
  return Boolean(sticker.is_stuck);
}

export const STUCK_REMOVAL_CONFIRM_MESSAGE =
  'Esta figurinha está marcada como colada. Deseja remover mesmo assim?';
