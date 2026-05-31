import { Sticker } from '../types/collection';
import { carouselLayout, decrementPatch, deckGhostCount, incrementPatch, needsStuckRemovalConfirm } from './stickerActions';

function makeSticker(overrides: Partial<Sticker> = {}): Sticker {
  return {
    id: 'st-1',
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
    created_at: '2026-05-31T00:00:00Z',
    updated_at: '2026-05-31T00:00:00Z',
    ...overrides,
  };
}

describe('stickerActions — incrementPatch', () => {
  it('soma 1 na quantidade, marca como tenho e remove o desejo', () => {
    expect(incrementPatch(makeSticker({ quantity: 0, wishlisted: true }))).toEqual({
      quantity: 1,
      owned: true,
      wishlisted: false,
    });
  });

  it('incrementa repetidas a partir de quantidade existente', () => {
    expect(incrementPatch(makeSticker({ quantity: 3 }))).toEqual({
      quantity: 4,
      owned: true,
      wishlisted: false,
    });
  });
});

describe('stickerActions — decrementPatch', () => {
  it('remove uma cópia mantendo o status de colada quando ainda sobra alguma', () => {
    expect(decrementPatch(makeSticker({ quantity: 3, is_stuck: true }))).toEqual({
      quantity: 2,
      owned: true,
      is_stuck: true,
    });
  });

  it('ao chegar a zero deixa de ter e perde o status de colada', () => {
    expect(decrementPatch(makeSticker({ quantity: 1, is_stuck: true }))).toEqual({
      quantity: 0,
      owned: false,
      is_stuck: false,
    });
  });

  it('não vai abaixo de zero', () => {
    expect(decrementPatch(makeSticker({ quantity: 0 }))).toEqual({
      quantity: 0,
      owned: false,
      is_stuck: false,
    });
  });
});

describe('stickerActions — needsStuckRemovalConfirm', () => {
  it('pede confirmação quando a figurinha está colada', () => {
    expect(needsStuckRemovalConfirm(makeSticker({ is_stuck: true, quantity: 1 }))).toBe(true);
  });

  it('não pede confirmação quando não está colada', () => {
    expect(needsStuckRemovalConfirm(makeSticker({ is_stuck: false, quantity: 2 }))).toBe(false);
  });
});

describe('stickerActions — deckGhostCount (efeito de deck)', () => {
  it('não desenha cartas atrás para 0 ou 1 figurinha', () => {
    expect(deckGhostCount(0)).toBe(0);
    expect(deckGhostCount(1)).toBe(0);
  });

  it('desenha 1 carta atrás para 2 repetidas', () => {
    expect(deckGhostCount(2)).toBe(1);
  });

  it('desenha no máximo 2 cartas atrás para 3 ou mais repetidas', () => {
    expect(deckGhostCount(3)).toBe(2);
    expect(deckGhostCount(10)).toBe(2);
  });
});

describe('stickerActions — carouselLayout (mobile = carrossel, desktop = grade)', () => {
  it('no mobile usa carrossel horizontal com 1 card grande por vez (swipe)', () => {
    const { container, card } = carouselLayout(false);
    // Container: flex em linha, sem quebra, rolagem horizontal com scroll-snap.
    expect(container.display).toBe('flex');
    expect(container.flexDirection).toBe('row');
    expect(container.flexWrap).toBe('nowrap');
    expect(container.overflowX).toBe('auto');
    expect(container.scrollSnapType).toBe('x mandatory');
    expect(container.WebkitOverflowScrolling).toBe('touch');
    // Nunca pode ser grade no mobile (causa raiz do bug: grade minúscula).
    expect(container.display).not.toBe('grid');
    expect(container.gridTemplateColumns).toBeUndefined();
    // Card: não encolhe e ocupa quase toda a largura da tela, centralizado no snap.
    expect(card.flex).toBe('0 0 auto');
    expect(card.width).toBe('calc(100vw - 48px)');
    expect(card.maxWidth).toBe(360);
    expect(card.scrollSnapAlign).toBe('center');
  });

  it('no desktop usa grade de cards (sem carrossel)', () => {
    const { container, card } = carouselLayout(true);
    expect(container.display).toBe('grid');
    expect(container.gridTemplateColumns).toContain('minmax(240px, 1fr)');
    expect(container.overflowX).toBeUndefined();
    expect(container.scrollSnapType).toBeUndefined();
    // No desktop o card não força largura fixa (deixa a grade dimensionar).
    expect(card.width).toBeUndefined();
    expect(card.flex).toBeUndefined();
  });
});
