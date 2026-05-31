import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Album, AlbumMember, AuthSession, CatalogStickerInput, CollectionStats, InviteType, Sticker, StickerPatch } from '../types/collection';
import { collectionStore, isSupabaseConfigured, normalizeStickerCode } from '../services/collectionStore';
import { buildPaniniWorldCup2026Catalog, paniniWorldCup2026Album } from '../data/paniniWorldCup2026';
import { getCountryBySection } from '../data/countries';
import jsQR from 'jsqr';

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
    };
  }
}

type StickerFilter = 'all' | 'owned' | 'missing' | 'duplicates' | 'stuck' | 'wishlist';
type ViewMode = 'scan' | 'teams' | 'catalog' | 'trades';
type MobileTab = 'home' | ViewMode;

const emptyAlbumForm = { name: '', publisher: '', season: '', cover_url: '', total_stickers: 100 };
const emptyCatalogForm = { code: '', title: '', section: '' };
const emptyGeneratorForm = { prefix: '', start: 1, count: 20, padding: 3, section: '' };
const emptyInviteForm: { type: InviteType; value: string } = { type: 'email', value: '' };

function getStats(album: Album | undefined, stickers: Sticker[]): CollectionStats {
  const owned = stickers.filter((s) => s.quantity > 0).length;
  const duplicates = stickers.reduce((sum, s) => sum + Math.max(s.quantity - 1, 0), 0);
  const stuck = stickers.filter((s) => s.is_stuck).length;
  const wishlisted = stickers.filter((s) => s.wishlisted).length;
  const total = Math.max(album?.total_stickers || 0, stickers.length);
  const missing = Math.max(total - owned, 0);
  const completion = total ? Math.round((owned / total) * 100) : 0;
  return { owned, missing, duplicates, stuck, wishlisted, totalRegistered: stickers.length, completion };
}

function initials(value: string) {
  return value.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

/* ============================================================================
   DESIGN SYSTEM PRIMITIVES
   ========================================================================== */

function MatIcon({ name, size = 24, fill = false, color, style = {} }: {
  name: string; size?: number; fill?: boolean; color?: string; style?: React.CSSProperties;
}) {
  return (
    <span
      className="ms"
      style={{ fontSize: size, color, fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24`, ...style }}
    >
      {name}
    </span>
  );
}

function ProgressRing({ pct, label, sub, size = 80 }: { pct: number; label: string; sub?: string; size?: number }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="50" cy="50" r={r} fill="transparent" stroke="var(--surface-container)" strokeWidth="12" />
        <circle cx="50" cy="50" r={r} fill="transparent" stroke="var(--primary-container)" strokeWidth="12"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: size * 0.19, lineHeight: 1, color: 'var(--primary)' }}>{label}</span>
        {sub && <span className="label-caps" style={{ color: 'var(--on-surface-variant)', marginTop: 2, fontSize: 10 }}>{sub}</span>}
      </div>
    </div>
  );
}

function ProgressSegments({ pct, total = 10 }: { pct: number; total?: number }) {
  const f = Math.round((pct / 100) * total);
  return (
    <div style={{ display: 'flex', gap: 2, height: 8, background: 'var(--surface-variant)', padding: 2, border: '1px solid var(--outline-variant)', borderRadius: 5 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ flex: 1, borderRadius: 1, background: i < f ? 'var(--primary-container)' : 'transparent', transition: 'background 0.3s' }} />
      ))}
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: 'var(--surface-container-low)', borderRadius: 'var(--radius)', padding: '8px 10px', textAlign: 'center', border: '1px solid var(--outline-variant)' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, lineHeight: 1, color }}>{value}</div>
      <div className="label-caps" style={{ color: 'var(--on-surface-variant)', marginTop: 3, display: 'block' }}>{label}</div>
    </div>
  );
}

function Card({ children, style = {}, className = '' }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div style={{ background: 'var(--surface-container-lowest)', border: '2px solid var(--outline-variant)', borderRadius: 'var(--radius-lg)', padding: 16, boxShadow: 'var(--shadow-card)', ...style }} className={className}>
      {children}
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, marginBottom: 12, color: 'var(--on-surface)' }}>
      {children}
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, icon, full, style = {} }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean;
  icon?: string; full?: boolean; style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ width: full ? '100%' : 'auto', borderRadius: 'var(--radius-xl)', background: disabled ? 'var(--surface-variant)' : 'var(--primary)', border: 'none', padding: '14px 22px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: disabled ? 'var(--outline)' : 'var(--on-primary)', cursor: disabled ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: disabled ? 'none' : `0 4px 0 0 var(--on-primary-fixed-variant)`, transition: 'all 0.1s ease', ...style }}
      className={disabled ? '' : 'btn-tactile'}
    >
      {icon && <MatIcon name={icon} size={16} />}
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick, disabled, icon, full, style = {} }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean;
  icon?: string; full?: boolean; style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ width: full ? '100%' : 'auto', borderRadius: 'var(--radius)', background: 'transparent', border: '2px solid var(--outline)', padding: '11px 18px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--on-surface)', cursor: disabled ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: 'var(--shadow-brutalist)', transition: 'all 0.1s ease', ...style }}
      className="btn-brut"
    >
      {icon && <MatIcon name={icon} size={16} />}
      {children}
    </button>
  );
}

/* ============================================================================
   FORM COMPONENTS
   ========================================================================== */

function TextField({ label, onChange, value, type = 'text', placeholder }: {
  label: string; onChange: (value: string) => void; value: string; type?: string; placeholder?: string;
}) {
  return (
    <label style={{ display: 'block' }}>
      <span className="label-caps" style={{ color: 'var(--on-surface-variant)', display: 'block', marginBottom: 6 }}>{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        style={{ width: '100%', borderRadius: 'var(--radius)', border: '2px solid var(--outline-variant)', padding: '10px 14px', fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--on-surface)', background: 'var(--surface-container-lowest)', outline: 'none', transition: 'border-color 0.15s' }}
        onChange={(e) => onChange(e.target.value)}
        value={value}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--outline-variant)'; }}
      />
    </label>
  );
}

function NumberField({ label, min, onChange, value }: {
  label: string; min: number; onChange: (value: number) => void; value: number;
}) {
  return (
    <label style={{ display: 'block' }}>
      <span className="label-caps" style={{ color: 'var(--on-surface-variant)', display: 'block', marginBottom: 6 }}>{label}</span>
      <input
        type="number"
        min={min}
        style={{ width: '100%', borderRadius: 'var(--radius)', border: '2px solid var(--outline-variant)', padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--on-surface)', background: 'var(--surface-container-lowest)', outline: 'none', transition: 'border-color 0.15s' }}
        onChange={(e) => onChange(Number(e.target.value))}
        value={value}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--outline-variant)'; }}
      />
    </label>
  );
}

/* ============================================================================
   ALBUM COVER
   ========================================================================== */

function AlbumCover({ album, size = 48 }: { album: Album; size?: number }) {
  if (album.cover_url) {
    return <img alt="" style={{ width: size, height: size, borderRadius: 'var(--radius)', objectFit: 'cover', border: '2px solid var(--outline-variant)', flexShrink: 0 }} src={album.cover_url} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: 'var(--radius)', background: 'var(--primary-container)', border: '2px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: size * 0.3, color: 'var(--on-primary-container)', flexShrink: 0 }}>
      {initials(album.name) || 'AL'}
    </div>
  );
}

/* ============================================================================
   EMPTY STATE
   ========================================================================== */

function EmptyState({ title, description, icon = 'inbox' }: { title: string; description: string; icon?: string }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--surface-container)', border: '2px solid var(--outline-variant)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <MatIcon name={icon} size={32} color="var(--outline-variant)" />
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18, color: 'var(--on-surface)' }}>{title}</div>
      <div style={{ fontSize: 14, color: 'var(--on-surface-variant)', maxWidth: 280, lineHeight: 1.5 }}>{description}</div>
    </div>
  );
}

/* ============================================================================
   STICKER VISUAL
   ========================================================================== */

function StickerVisual({ sticker, compact = false }: { sticker: Sticker; compact?: boolean }) {
  const initialsText = initials(sticker.section || sticker.title || sticker.code);
  const extraCount = Math.max(sticker.quantity - 1, 0);
  const size = compact ? 110 : 180;

  return (
    <div style={{ position: 'relative', margin: '0 auto', width: '100%', maxWidth: size, borderRadius: 6, border: '2px solid var(--outline-variant)', background: 'var(--surface-container-lowest)', padding: 4, boxShadow: 'var(--shadow-sticker)' }}>
      <div style={{ aspectRatio: '3/4', overflow: 'hidden', borderRadius: 4, border: '1px solid var(--surface-container)', background: 'linear-gradient(160deg, var(--surface-container-low), var(--surface-container-high))' }}>
        {sticker.image_url ? (
          <img alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} src={sticker.image_url} />
        ) : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8, textAlign: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid var(--outline-variant)', background: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>
              {initialsText || 'SS'}
            </div>
            <div>
              <div className="label-caps" style={{ color: 'var(--on-surface-variant)', fontSize: 9 }}>{sticker.code}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 11, lineHeight: 1.2, color: 'var(--on-surface)', marginTop: 2 }}>{sticker.title}</div>
            </div>
          </div>
        )}
      </div>
      <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--on-surface-variant)' }}>{sticker.section || 'Sem time'}</span>
        <span className="label-caps" style={{ fontSize: 9, color: 'var(--on-surface-variant)', flexShrink: 0 }}>{sticker.code}</span>
      </div>
      <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {sticker.quantity > 0 && <span style={{ borderRadius: 4, background: 'var(--primary-container)', padding: '2px 6px', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--on-primary-container)' }}>tenho</span>}
        {sticker.is_stuck && <span style={{ borderRadius: 4, background: 'var(--tertiary-fixed-dim)', padding: '2px 6px', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--tertiary)' }}>colada</span>}
        {extraCount > 0 && <span style={{ borderRadius: 4, background: 'var(--secondary-container)', padding: '2px 6px', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--on-secondary-container)' }}>+{extraCount}</span>}
      </div>
    </div>
  );
}

/* ============================================================================
   TEAM STICKER CARD
   ========================================================================== */

function TeamStickerCard({ onPatch, sticker }: { onPatch: (patch: StickerPatch) => void; sticker: Sticker }) {
  const isOwned = sticker.quantity > 0;
  const canStick = isOwned || sticker.is_stuck;
  const state: 'empty' | 'owned' | 'duplicate' = sticker.quantity === 0 ? 'empty' : sticker.quantity > 1 ? 'duplicate' : 'owned';
  const [peeling, setPeeling] = React.useState(false);

  function handleEmptyClick() {
    setPeeling(true);
    setTimeout(() => setPeeling(false), 350);
    onPatch({ quantity: 1, owned: true, wishlisted: false });
  }

  const cardBg: Record<typeof state, string> = {
    empty: 'var(--surface-variant)',
    owned: 'linear-gradient(160deg, var(--primary-container), var(--primary))',
    duplicate: 'linear-gradient(160deg, var(--primary-container), var(--primary))',
  };
  const cardBorder: Record<typeof state, string> = {
    empty: '1px dashed var(--outline-variant)',
    owned: '2px solid var(--primary)',
    duplicate: '2px solid var(--outline)',
  };

  if (state === 'empty') {
    return (
      <article style={{ borderRadius: 'var(--radius)', border: cardBorder.empty, background: cardBg.empty, boxShadow: 'var(--shadow-slot)' }}>
        <div
          className={peeling ? 'peel' : ''}
          onClick={handleEmptyClick}
          style={{ aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', padding: 8, position: 'relative' }}
        >
          <span className="label-caps" style={{ position: 'absolute', top: 6, left: 8, color: 'var(--on-surface-variant)', opacity: 0.5, fontSize: 9 }}>{sticker.code}</span>
          <MatIcon name="add" size={28} color="var(--outline-variant)" />
          <span className="label-caps" style={{ color: 'var(--outline)', fontSize: 9, textAlign: 'center', maxWidth: '80%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sticker.title}</span>
        </div>
      </article>
    );
  }

  return (
    <article className="hover-lift" style={{ borderRadius: 'var(--radius)', border: cardBorder[state], background: cardBg[state], boxShadow: 'var(--shadow-sticker)', position: 'relative', overflow: 'hidden' }}>
      {/* ID chip */}
      <span style={{ position: 'absolute', top: 4, left: 5, zIndex: 10, fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, background: 'rgba(255,255,255,.92)', border: '1px solid rgba(0,0,0,.1)', borderRadius: 3, padding: '1px 4px', color: 'var(--on-surface)' }}>{sticker.code}</span>
      {/* Collected badge */}
      <span style={{ position: 'absolute', top: 4, right: 4, zIndex: 10, background: 'var(--primary)', color: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,.3)' }}>
        <MatIcon name="check" size={12} fill style={{ fontVariationSettings: `'FILL' 1, 'wght' 700, 'GRAD' 0, 'opsz' 24` }} />
      </span>
      {/* Duplicate badge */}
      {state === 'duplicate' && (
        <span style={{ position: 'absolute', top: -5, right: -5, zIndex: 20, background: 'var(--secondary)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>+{sticker.quantity - 1}</span>
      )}
      <div style={{ aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
        <MatIcon name="person" size={32} fill color="rgba(255,255,255,0.85)" />
        <span className="label-caps" style={{ color: 'rgba(255,255,255,0.8)', fontSize: 9, marginTop: 4, textAlign: 'center', maxWidth: '80%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sticker.title}</span>
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,.15)', padding: '8px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        <button
          style={{ borderRadius: 'var(--radius-sm)', border: 'none', padding: '6px 4px', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', cursor: 'pointer', background: sticker.is_stuck ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.15)', color: '#fff', transition: 'all .15s' }}
          onClick={() => onPatch({ is_stuck: !sticker.is_stuck, quantity: sticker.quantity || 1, owned: true })}
          disabled={!canStick}
        >
          {sticker.is_stuck ? 'Colada' : 'Colar'}
        </button>
        <button
          style={{ borderRadius: 'var(--radius-sm)', border: 'none', padding: '6px 4px', fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', cursor: 'pointer', background: 'rgba(255,255,255,.15)', color: '#fff', transition: 'all .15s' }}
          onClick={() => onPatch({ quantity: Math.max(0, sticker.quantity - 1), owned: sticker.quantity - 1 > 0 })}
        >
          -1
        </button>
      </div>
    </article>
  );
}

/* ============================================================================
   STICKER TABLE ROW
   ========================================================================== */

function StickerRow({ onPatch, sticker }: { onPatch: (patch: StickerPatch) => void; sticker: Sticker }) {
  const isOwned = sticker.quantity > 0;

  return (
    <article style={{ display: 'grid', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--surface-container)' }} className="grid-cols-1 sm:grid-cols-[100px_1fr_120px_150px_120px_80px]">
      {/* Code */}
      <div>
        <span className="label-caps" style={{ fontSize: 8, color: 'var(--on-surface-variant)', display: 'block' }} data-mobile-only>Código</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--on-surface)' }}>{sticker.code}</span>
      </div>
      {/* Title + thumbnail */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{ width: 44, flexShrink: 0 }}>
          <StickerVisual compact sticker={sticker} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--on-surface)' }}>{sticker.title}</div>
          <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sticker.section || 'Sem seção'}</div>
        </div>
      </div>
      {/* Status chip */}
      <div>
        <span style={{ display: 'inline-block', borderRadius: 'var(--radius-full)', padding: '4px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', background: isOwned ? 'var(--primary-container)' : 'var(--surface-container)', color: isOwned ? 'var(--on-primary-container)' : 'var(--on-surface-variant)' }}>
          {isOwned ? 'Tenho' : 'Falta'}
        </span>
      </div>
      {/* Quantity controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button aria-label="Diminuir" style={{ width: 32, height: 32, borderRadius: 'var(--radius)', border: '2px solid var(--outline-variant)', background: 'var(--surface-container-lowest)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--on-surface)' }}
          onClick={() => onPatch({ quantity: Math.max(sticker.quantity - 1, 0), owned: sticker.quantity - 1 > 0, is_stuck: sticker.quantity - 1 > 0 ? sticker.is_stuck : false })}>
          −
        </button>
        <span style={{ width: 28, textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 14 }}>{sticker.quantity}</span>
        <button aria-label="Aumentar" style={{ width: 32, height: 32, borderRadius: 'var(--radius)', border: '2px solid var(--outline-variant)', background: 'var(--surface-container-lowest)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--on-surface)' }}
          onClick={() => onPatch({ quantity: sticker.quantity + 1, owned: true, wishlisted: false })}>
          +
        </button>
        {sticker.quantity > 1 && (
          <span style={{ borderRadius: 'var(--radius-full)', background: 'var(--secondary-container)', padding: '2px 8px', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--on-secondary-container)' }}>troca</span>
        )}
      </div>
      {/* Stick button */}
      <div>
        <button
          style={{ borderRadius: 'var(--radius)', border: sticker.is_stuck ? '2px solid var(--primary)' : '2px solid var(--outline-variant)', background: sticker.is_stuck ? 'var(--primary)' : 'var(--surface-container-lowest)', padding: '7px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', color: sticker.is_stuck ? 'var(--on-primary)' : 'var(--on-surface)', transition: 'all 0.15s' }}
          disabled={!isOwned && !sticker.is_stuck}
          onClick={() => onPatch({ is_stuck: !sticker.is_stuck, quantity: sticker.quantity || 1, owned: true })}>
          {sticker.is_stuck ? 'Colada' : 'Colar'}
        </button>
      </div>
      {/* Wishlist */}
      <div>
        <button
          aria-label="Desejada"
          style={{ width: 36, height: 36, borderRadius: 'var(--radius)', border: sticker.wishlisted ? '2px solid var(--tertiary-container)' : '2px solid var(--outline-variant)', background: sticker.wishlisted ? 'var(--tertiary-fixed-dim)' : 'var(--surface-container-lowest)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
          onClick={() => onPatch({ wishlisted: !sticker.wishlisted })}>
          <MatIcon name="star" size={18} fill={sticker.wishlisted} color={sticker.wishlisted ? 'var(--tertiary)' : 'var(--outline-variant)'} />
        </button>
      </div>
    </article>
  );
}

/* ============================================================================
   CATALOG TABLE
   ========================================================================== */

function StickerTable({ loading, onPatch, stickers }: {
  loading: boolean; onPatch: (sticker: Sticker, patch: StickerPatch) => void; stickers: Sticker[];
}) {
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 120px 150px 120px 80px', gap: 12, padding: '10px 16px', background: 'var(--surface-container)', borderBottom: '2px solid var(--outline-variant)' }} className="hidden sm:grid">
        {['Código', 'Figurinha', 'Status', 'Quantidade', 'Colada', 'Desejo'].map((h) => (
          <span key={h} className="label-caps" style={{ color: 'var(--on-surface-variant)' }}>{h}</span>
        ))}
      </div>
      {loading ? (
        <EmptyState icon="hourglass_empty" title="Carregando catálogo" description="Buscando as figurinhas do álbum selecionado." />
      ) : stickers.length === 0 ? (
        <EmptyState icon="style" title="Catálogo vazio" description="Gere uma sequência ou adicione figurinhas ao catálogo." />
      ) : (
        <div>
          {stickers.map((s) => (
            <StickerRow key={s.id} onPatch={(p) => onPatch(s, p)} sticker={s} />
          ))}
        </div>
      )}
    </Card>
  );
}

/* ============================================================================
   SCAN RESULT CARD
   ========================================================================== */

function ScanResultCard({ lastScan }: { lastScan: Sticker | null }) {
  return (
    <Card>
      <CardTitle>Última leitura</CardTitle>
      {!lastScan ? (
        <div style={{ border: '2px dashed var(--outline-variant)', borderRadius: 'var(--radius)', padding: '36px 24px', textAlign: 'center' }}>
          <MatIcon name="qr_code_scanner" size={40} color="var(--outline-variant)" />
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, marginTop: 10, color: 'var(--on-surface)' }}>Nenhuma figurinha lida</div>
          <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 4 }}>A leitura válida aparece aqui.</div>
        </div>
      ) : (
        <div>
          <StickerVisual sticker={lastScan} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <StatChip label="Quantidade" value={lastScan.quantity} color="var(--primary)" />
            <StatChip label="Colada" value={lastScan.is_stuck ? 1 : 0} color="var(--tertiary)" />
          </div>
          {lastScan.is_stuck && (
            <div style={{ marginTop: 8, borderRadius: 'var(--radius)', background: 'var(--primary-container)', padding: '8px 12px', textAlign: 'center' }}>
              <span className="label-caps" style={{ color: 'var(--on-primary-container)' }}>Colada no álbum</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ============================================================================
   CATALOG TOOLBAR
   ========================================================================== */

function CatalogToolbar({ filter, query, setFilter, setQuery }: {
  filter: StickerFilter; query: string;
  setFilter: (f: StickerFilter) => void; setQuery: (q: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ position: 'relative' }}>
        <MatIcon name="search" size={18} color="var(--on-surface-variant)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          style={{ width: '100%', borderRadius: 'var(--radius)', border: '2px solid var(--outline-variant)', padding: '11px 14px 11px 38px', fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--on-surface)', background: 'var(--surface-container-lowest)', outline: 'none' }}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por código, título ou seção"
          type="search"
          value={query}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--outline-variant)'; }}
        />
      </div>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
        {([
          { v: 'all', label: 'Todas' },
          { v: 'owned', label: 'Tenho' },
          { v: 'missing', label: 'Faltando' },
          { v: 'duplicates', label: 'Repetidas' },
          { v: 'stuck', label: 'Coladas' },
          { v: 'wishlist', label: 'Desejadas' },
        ] as { v: StickerFilter; label: string }[]).map(({ v, label }) => {
          const active = filter === v;
          return (
            <button key={v} onClick={() => setFilter(v)} style={{ flexShrink: 0, borderRadius: 'var(--radius-full)', border: active ? '2px solid var(--secondary-container)' : '2px solid var(--outline-variant)', background: active ? 'var(--secondary-container)' : 'var(--surface-container-lowest)', padding: '6px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: active ? 'var(--on-secondary-container)' : 'var(--on-surface-variant)', cursor: 'pointer', transition: 'all 0.15s' }}>
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================================
   COUNTRY STRIP
   ========================================================================== */

function FlagCSS({ colors, style: flagStyle = 'horizontal', size = 32 }: {
  colors: [string, string, string];
  style?: 'horizontal' | 'vertical';
  size?: number;
}) {
  const gradient = flagStyle === 'horizontal'
    ? `linear-gradient(to bottom, ${colors[0]} 33.3%, ${colors[1]} 33.3%, ${colors[1]} 66.6%, ${colors[2]} 66.6%)`
    : `linear-gradient(to right, ${colors[0]} 33.3%, ${colors[1]} 33.3%, ${colors[1]} 66.6%, ${colors[2]} 66.6%)`;
  return (
    <div style={{
      width: size * 1.5,
      height: size,
      borderRadius: 3,
      background: gradient,
      border: '1px solid rgba(0,0,0,0.15)',
      flexShrink: 0,
    }} />
  );
}

function CountryStrip({ section }: { section: string }) {
  const country = getCountryBySection(section);
  if (!country) return null;

  const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(country.mapsQuery)}`;

  return (
    <div style={{
      borderBottom: '2px solid var(--outline-variant)',
      padding: '12px 16px',
      background: 'var(--surface-container-low)',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {/* Header: flag + country name + map button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <FlagCSS colors={country.flag.colors} style={country.flag.style} size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 15,
            color: 'var(--on-surface)',
            lineHeight: 1.2,
          }}>
            {country.name}
          </div>
        </div>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            borderRadius: 'var(--radius)',
            border: '2px solid var(--outline-variant)',
            background: 'var(--surface-container-lowest)',
            padding: '5px 10px',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--on-surface)',
            textDecoration: 'none',
            flexShrink: 0,
            transition: 'all 0.15s',
          }}
        >
          <MatIcon name="map" size={14} color="var(--primary)" />
          Ver no mapa
        </a>
      </div>

      {/* Data chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          { label: 'Capital', value: country.capital },
          { label: 'Idioma', value: country.language },
          { label: 'Pop.', value: country.population },
          { label: 'Voo do BR', value: country.flightFromBrazil },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              borderRadius: 'var(--radius)',
              border: '1px solid var(--outline-variant)',
              background: 'var(--surface-container-lowest)',
              padding: '4px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <span
              className="label-caps"
              style={{ color: 'var(--on-surface-variant)', fontSize: 9, display: 'block' }}
            >
              {label}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 600,
                fontSize: 12,
                color: 'var(--on-surface)',
                lineHeight: 1.2,
              }}
            >
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Fun fact */}
      <div style={{
        borderRadius: 'var(--radius)',
        background: 'var(--primary-container)',
        border: '1px solid var(--outline-variant)',
        padding: '7px 10px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
      }}>
        <MatIcon name="lightbulb" size={14} color="var(--on-primary-container)" style={{ marginTop: 1, flexShrink: 0 }} />
        <span style={{
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          color: 'var(--on-primary-container)',
          lineHeight: 1.5,
        }}>
          {country.funFact}
        </span>
      </div>
    </div>
  );
}

/* ============================================================================
   LOGIN PAGE
   ========================================================================== */

function LoginPage({ onLogin }: { onLogin: (s: AuthSession) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ email: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmSent, setConfirmSent] = useState(false);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    if (!form.password) { setError('Informe a senha.'); return; }
    try {
      setSaving(true); setError('');
      onLogin(await collectionStore.loginWithPassword(form.email, form.password));
    } catch (err) {
      const m = err instanceof Error ? err.message : '';
      setError(m.includes('Invalid login credentials') || m.includes('invalid_grant')
        ? 'E-mail ou senha incorretos.'
        : m.includes('Email not confirmed')
        ? 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.'
        : m || 'Não foi possível fazer login.');
    } finally { setSaving(false); }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    if (form.password.length < 6) { setError('A senha precisa ter pelo menos 6 caracteres.'); return; }
    try {
      setSaving(true); setError('');
      const result = await collectionStore.signUp(form.email, form.password);
      if (result === 'confirmation-sent') { setConfirmSent(true); } else { onLogin(result); }
    } catch (err) {
      const m = err instanceof Error ? err.message : '';
      setError(m.includes('already registered') ? 'Este e-mail já tem conta. Tente fazer login.' : m || 'Não foi possível criar a conta.');
    } finally { setSaving(false); }
  }

  const linkBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--secondary)', textDecoration: 'underline', fontFamily: 'var(--font-body)', padding: '4px 0' };

  return (
    <div className="paper-texture screen-in" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400, background: 'var(--surface-container-lowest)', border: '4px solid var(--on-surface)', borderRadius: 'var(--radius-lg)', boxShadow: '8px 8px 0 0 var(--on-surface)', position: 'relative', padding: 32 }}>
        {/* tape */}
        <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%) rotate(2deg)', width: 80, height: 22, background: 'rgba(255,185,95,.45)', backdropFilter: 'blur(2px)' }} />

        {/* logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 28 }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--primary-container)', border: '2px solid var(--on-surface)', boxShadow: '4px 4px 0 0 var(--on-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'rotate(-3deg)' }}>
            <MatIcon name="style" size={30} fill color="var(--on-primary-container)" />
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 34, color: 'var(--primary)', letterSpacing: '-0.02em' }}>StickerShelf</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--on-surface-variant)' }}>
            {mode === 'login' ? 'Entre na sua coleção' : 'Crie sua conta'}
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: 16, borderRadius: 'var(--radius)', background: 'var(--error-container)', border: '2px solid var(--error)', padding: '10px 14px', fontSize: 14, color: 'var(--on-error-container)' }}>
            {error}
          </div>
        )}

        {confirmSent ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ borderRadius: 'var(--radius)', background: 'var(--primary-container)', padding: 16, fontSize: 14, color: 'var(--on-primary-container)', lineHeight: 1.6, textAlign: 'center' }}>
              <strong>Confirme seu e-mail!</strong><br />
              Enviamos um link para <strong>{form.email}</strong>.<br />
              Clique nele para ativar sua conta.
            </div>
            <SecondaryButton full onClick={() => { setConfirmSent(false); setMode('login'); }}>
              Já confirmei — fazer login
            </SecondaryButton>
          </div>
        ) : mode === 'login' ? (
          <form style={{ display: 'flex', flexDirection: 'column', gap: 14 }} onSubmit={handleLogin}>
            <TextField label="E-mail" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <TextField label="Senha" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
            <PrimaryButton full disabled={saving} icon="login" style={{ marginTop: 4 }}>Entrar</PrimaryButton>
            <div style={{ textAlign: 'center' }}>
              <button type="button" style={linkBtn} onClick={() => { setMode('register'); setError(''); }}>Criar conta</button>
            </div>
          </form>
        ) : (
          <form style={{ display: 'flex', flexDirection: 'column', gap: 14 }} onSubmit={handleRegister}>
            <TextField label="E-mail" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <TextField label="Senha (mín. 6 caracteres)" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
            <PrimaryButton full disabled={saving} icon="person_add" style={{ marginTop: 4 }}>Criar conta</PrimaryButton>
            <div style={{ textAlign: 'center' }}>
              <button type="button" style={linkBtn} onClick={() => { setMode('login'); setError(''); }}>Já tenho conta — fazer login</button>
            </div>
          </form>
        )}
      </div>
      <p className="label-caps" style={{ color: 'var(--outline)', marginTop: 24, fontSize: 10 }}>StickerShelf · Copa do Mundo 2026</p>
    </div>
  );
}

/* ============================================================================
   HOME PAGE
   ========================================================================== */

function HomePage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState('');
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [albumForm, setAlbumForm] = useState(emptyAlbumForm);
  const [catalogForm, setCatalogForm] = useState(emptyCatalogForm);
  const [generatorForm, setGeneratorForm] = useState(emptyGeneratorForm);
  const [manualCode, setManualCode] = useState('');
  const [inviteForm, setInviteForm] = useState(emptyInviteForm);
  const [inviteLink, setInviteLink] = useState('');
  const [session, setSession] = useState<AuthSession | null>(() => collectionStore.getSession());
  const [members, setMembers] = useState<AlbumMember[]>([]);
  const [authReady, setAuthReady] = useState(() => !window.location.hash.includes('access_token='));
  const [lastScan, setLastScan] = useState<Sticker | null>(null);
  const [filter, setFilter] = useState<StickerFilter>('all');
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('teams');
  const [mobileTab, setMobileTab] = useState<MobileTab>('home');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanRunning, setScanRunning] = useState(false);
  const [cameraMessage, setCameraMessage] = useState('');
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLockRef = useRef(false);

  const selectedAlbum = albums.find((a) => a.id === selectedAlbumId);
  const isAlbumOwner = Boolean(selectedAlbum && session?.user.id && selectedAlbum.owner_id === session.user.id);
  const stats = useMemo(() => getStats(selectedAlbum, stickers), [selectedAlbum, stickers]);
  const duplicates = useMemo(() => stickers.filter((s) => s.quantity > 1), [stickers]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const teams = useMemo(() => {
    const byTeam = new Map<string, Sticker[]>();
    stickers.forEach((s) => { const t = s.section || 'Sem time'; byTeam.set(t, [...(byTeam.get(t) || []), s]); });
    return Array.from(byTeam.entries()).map(([name, items]) => ({
      name, total: items.length,
      owned: items.filter((s) => s.quantity > 0).length,
      stuck: items.filter((s) => s.is_stuck).length,
      duplicates: items.reduce((sum, s) => sum + Math.max(s.quantity - 1, 0), 0),
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [stickers]);
  const activeTeam = selectedTeam || teams[0]?.name || '';
  const teamStickers = useMemo(() => stickers.filter((s) => (s.section || 'Sem time') === activeTeam), [activeTeam, stickers]);
  const filteredStickers = useMemo(() => {
    const nq = query.trim().toLowerCase();
    return stickers.filter((s) => {
      const mq = !nq || [s.code, s.title, s.section || '', s.notes || ''].join(' ').toLowerCase().includes(nq);
      const mf = filter === 'all' || (filter === 'owned' && s.quantity > 0) || (filter === 'missing' && s.quantity === 0) || (filter === 'duplicates' && s.quantity > 1) || (filter === 'stuck' && s.is_stuck) || (filter === 'wishlist' && s.wishlisted);
      return mq && mf;
    });
  }, [filter, query, stickers]);

  function handleMobileTab(tab: MobileTab) {
    setMobileTab(tab);
    if (tab !== 'home') {
      setViewMode(tab as ViewMode);
      if (tab !== 'scan') stopCamera();
    }
  }

  async function loadAlbums() {
    try {
      setLoading(true);
      const result = await collectionStore.listAlbums();
      setAlbums(result);
      setSelectedAlbumId((cur) => cur || result[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os álbuns.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function consumeAuthRedirect() {
      try {
        const next = await collectionStore.consumeAuthRedirect();
        if (next?.access_token) { setSession(next); }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível concluir o login pelo link.');
      } finally {
        setAuthReady(true);
      }
    }
    consumeAuthRedirect();
  }, []);

  useEffect(() => { loadAlbums(); }, [session?.access_token]);

  useEffect(() => {
    async function loadStickers() {
      if (!selectedAlbumId) { setStickers([]); return; }
      try {
        setLoading(true);
        setStickers(await collectionStore.listStickers(selectedAlbumId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível carregar o catálogo.');
      } finally {
        setLoading(false);
      }
    }
    setLastScan(null);
    setSelectedTeam('');
    stopCamera();
    loadStickers();
  }, [selectedAlbumId]);

  useEffect(() => {
    async function loadMembers() {
      if (!selectedAlbumId || !isSupabaseConfigured || !session) { setMembers([]); return; }
      try { setMembers(await collectionStore.listMembers(selectedAlbumId)); } catch { setMembers([]); }
    }
    loadMembers();
  }, [selectedAlbumId, session]);

  useEffect(() => {
    async function acceptPendingInvite() {
      const token = new URLSearchParams(window.location.search).get('invite');
      if (!token || !session) return;
      try {
        setSaving(true); setError('');
        const member = await collectionStore.acceptInvite(token);
        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
        if (member) { await loadAlbums(); setSelectedAlbumId(member.album_id); setMembers(await collectionStore.listMembers(member.album_id)); }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível aceitar o convite.');
      } finally { setSaving(false); }
    }
    acceptPendingInvite();
  }, [session]);

  useEffect(() => stopCamera, []);

  async function reloadStickers(albumId = selectedAlbumId) {
    if (!albumId) return;
    setStickers(await collectionStore.listStickers(albumId));
  }

  async function handleCreateAlbum(e: FormEvent) {
    e.preventDefault();
    if (!albumForm.name.trim()) { setError('Informe um nome para o álbum.'); return; }
    try {
      setSaving(true); setError('');
      const album = await collectionStore.createAlbum(albumForm);
      setAlbums((cur) => [album, ...cur]);
      setSelectedAlbumId(album.id);
      setAlbumForm(emptyAlbumForm);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível criar o álbum.');
    } finally { setSaving(false); }
  }


  function handleSignOut() {
    collectionStore.signOut();
    setSession(null); setAlbums([]); setSelectedAlbumId(''); setStickers([]); setMembers([]);
  }

  async function handleInviteMember(e: FormEvent) {
    e.preventDefault();
    if (!selectedAlbumId || (!inviteForm.value.trim() && inviteForm.type !== 'link')) return;
    try {
      setSaving(true); setError('');
      const member = await collectionStore.inviteCollaborator(selectedAlbumId, inviteForm.type, inviteForm.value, 'editor');
      setInviteLink(member.invite_token ? collectionStore.getInviteLink(member) : '');
      setInviteForm(emptyInviteForm);
      setMembers(await collectionStore.listMembers(selectedAlbumId));
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível convidar colaborador.');
    } finally { setSaving(false); }
  }

  async function handleImportPaniniWorldCup2026() {
    try {
      setSaving(true); setError('');
      const album = await collectionStore.createAlbum(paniniWorldCup2026Album);
      await collectionStore.createCatalog(album.id, buildPaniniWorldCup2026Catalog());
      setAlbums((cur) => [album, ...cur]);
      setSelectedAlbumId(album.id);
      handleMobileTab('teams');
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível importar o catálogo Panini.');
    } finally { setSaving(false); }
  }

  async function handleCreateCatalogSticker(e: FormEvent) {
    e.preventDefault();
    if (!selectedAlbumId) { setError('Selecione um álbum antes de montar o catálogo.'); return; }
    if (!catalogForm.code.trim() || !catalogForm.title.trim()) { setError('Informe código e título da figurinha.'); return; }
    await addCatalogItems([{ code: catalogForm.code, title: catalogForm.title, section: catalogForm.section }]);
    setCatalogForm(emptyCatalogForm);
  }

  async function handleGenerateCatalog(e: FormEvent) {
    e.preventDefault();
    if (!selectedAlbumId) { setError('Selecione um álbum antes de gerar o catálogo.'); return; }
    const count = Math.max(Number(generatorForm.count) || 0, 0);
    if (!count) { setError('Informe quantas figurinhas deseja gerar.'); return; }
    const start = Number(generatorForm.start) || 1;
    const padding = Math.max(Number(generatorForm.padding) || 1, 1);
    const items: CatalogStickerInput[] = Array.from({ length: count }, (_, i) => {
      const n = start + i;
      const suffix = String(n).padStart(padding, '0');
      const prefix = generatorForm.prefix.trim();
      const code = prefix ? `${prefix} ${suffix}` : suffix;
      return { code, title: `Figurinha ${code}`, section: generatorForm.section };
    });
    await addCatalogItems(items);
  }

  async function addCatalogItems(items: CatalogStickerInput[]) {
    try {
      setSaving(true); setError('');
      await collectionStore.createCatalog(selectedAlbumId, items);
      await reloadStickers();
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível atualizar o catálogo.');
    } finally { setSaving(false); }
  }

  async function registerCode(rawCode: string) {
    if (!selectedAlbumId) { setError('Selecione um álbum antes de ler figurinhas.'); return; }
    const code = normalizeStickerCode(rawCode);
    if (!code) return;
    try {
      setSaving(true); setError('');
      const updated = await collectionStore.incrementSticker(selectedAlbumId, code);
      setLastScan(updated); setManualCode('');
      setStickers((cur) => cur.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err) { setLastScan(null); setError(err instanceof Error ? err.message : 'Não foi possível registrar a figurinha.');
    } finally { setSaving(false); }
  }

  async function patchSticker(sticker: Sticker, patch: StickerPatch) {
    try {
      setError('');
      const nq = patch.quantity ?? sticker.quantity;
      const updated = await collectionStore.updateSticker(sticker.id, { ...patch, owned: patch.owned ?? nq > 0 });
      setStickers((cur) => cur.map((s) => (s.id === updated.id ? updated : s)));
      if (lastScan?.id === updated.id) setLastScan(updated);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível atualizar a figurinha.'); }
  }

  async function startCamera() {
    if (!selectedAlbumId) { setError('Selecione um álbum antes de ler figurinhas.'); return; }
    try {
      setError(''); setCameraMessage('');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      const usingNative = !!window.BarcodeDetector;
      if (!usingNative) {
        setCameraMessage('Modo QR Code (Safari/iOS): aponte a câmera para um QR code. Barcodes EAN requerem Chrome.');
      }
      setScanRunning(true); scanCamera();
    } catch { setCameraMessage('Não foi possível acessar a câmera. Confira a permissão do navegador.'); }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null; setScanRunning(false); scanLockRef.current = false;
  }

  async function scanCamera() {
    const useNative = !!window.BarcodeDetector;
    const detector = useNative ? new window.BarcodeDetector!() : null;

    // Canvas usado apenas no fallback jsQR
    const canvas = useNative ? null : document.createElement('canvas');
    const ctx = canvas ? canvas.getContext('2d', { willReadFrequently: true }) : null;

    const loop = async () => {
      if (!streamRef.current || !videoRef.current) return;
      try {
        if (detector) {
          // Caminho nativo (Chrome/Android) — suporta QR code, EAN, Code 128 etc.
          const codes = await detector.detect(videoRef.current);
          const raw = codes[0]?.rawValue;
          if (raw && !scanLockRef.current) {
            scanLockRef.current = true;
            await registerCode(raw);
            window.setTimeout(() => { scanLockRef.current = false; }, 1400);
          }
        } else if (canvas && ctx) {
          // Fallback jsQR (Safari/iOS) — suporta apenas QR codes
          const video = videoRef.current;
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (w > 0 && h > 0) {
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(video, 0, 0, w, h);
            const imageData = ctx.getImageData(0, 0, w, h);
            const result = jsQR(imageData.data, w, h, { inversionAttempts: 'dontInvert' });
            const raw = result?.data;
            if (raw && !scanLockRef.current) {
              scanLockRef.current = true;
              await registerCode(raw);
              window.setTimeout(() => { scanLockRef.current = false; }, 1400);
            }
          }
        }
      } catch { setCameraMessage('Não foi possível ler a imagem da câmera.'); }
      window.requestAnimationFrame(loop);
    };
    window.requestAnimationFrame(loop);
  }

  /* ── NAV TABS ─────────────────────────────────────────────────── */
  const NAV_TABS = [
    { id: 'home' as MobileTab,    icon: 'home',            label: 'Início' },
    { id: 'scan' as MobileTab,    icon: 'qr_code_scanner', label: 'Leitor' },
    { id: 'teams' as MobileTab,   icon: 'groups',          label: 'Times' },
    { id: 'catalog' as MobileTab, icon: 'list_alt',        label: 'Catálogo' },
    { id: 'trades' as MobileTab,  icon: 'sync_alt',        label: 'Trocas' },
  ];

  const DESKTOP_VIEW_TABS: { id: ViewMode; icon: string; label: string }[] = [
    { id: 'scan',    icon: 'qr_code_scanner', label: 'Leitor' },
    { id: 'teams',   icon: 'groups',          label: 'Times' },
    { id: 'catalog', icon: 'list_alt',        label: 'Catálogo' },
    { id: 'trades',  icon: 'sync_alt',        label: 'Trocas' },
  ];

  /* ── RENDER ───────────────────────────────────────────────────── */
  if (!authReady) {
    return (
      <div className="paper-texture" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <MatIcon name="hourglass_empty" size={40} color="var(--outline-variant)" />
      </div>
    );
  }

  if (isSupabaseConfigured && !session) {
    return <LoginPage onLogin={setSession} />;
  }

  return (
    <div
      className="paper-texture"
      style={{ minHeight: '100vh', fontFamily: 'var(--font-body)', color: 'var(--on-surface)', paddingBottom: 72 }}
    >
      {/* ── TOP APP BAR ──────────────────────────────────────────── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(248,249,255,0.92)', backdropFilter: 'blur(12px)', borderBottom: '2px solid var(--outline-variant)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 16px', height: 56, display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Logo */}
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--primary)', letterSpacing: '-0.01em', flexShrink: 0 }}>
            StickerShelf
          </div>

          {/* Album name pill (mobile only) */}
          {selectedAlbum && (
            <div className="flex lg:hidden" style={{ flex: 1, minWidth: 0 }}>
              <span className="label-caps" style={{ fontSize: 10, color: 'var(--on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedAlbum.name}
              </span>
            </div>
          )}
          {!selectedAlbum && <div style={{ flex: 1 }} className="lg:hidden" />}

          {/* Desktop spacer */}
          <div className="hidden lg:block" style={{ flex: 1 }} />

          {/* Connection badge */}
          <div className="hidden sm:flex" style={{ alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: isSupabaseConfigured ? 'var(--primary-container)' : 'var(--outline-variant)', display: 'inline-block' }} />
            <span className="label-caps" style={{ color: 'var(--on-surface-variant)', fontSize: 10 }}>{isSupabaseConfigured ? 'Online' : 'Local'}</span>
          </div>

          {/* Auth avatar (mobile) */}
          {isSupabaseConfigured && (
            <button
              className="flex lg:hidden"
              onClick={() => handleMobileTab('home')}
              style={{ width: 34, height: 34, borderRadius: '50%', background: session ? 'var(--primary-container)' : 'var(--surface-container)', border: `2px solid ${session ? 'var(--primary)' : 'var(--outline-variant)'}`, alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
            >
              <MatIcon name={session ? 'person' : 'login'} size={18} fill={!!session} color={session ? 'var(--on-primary-container)' : 'var(--on-surface-variant)'} />
            </button>
          )}
        </div>
      </header>

      {/* ── CONTENT AREA ─────────────────────────────────────────── */}
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>

        {/* Error banner */}
        {error && (
          <div style={{ margin: '12px 16px 0', padding: '12px 16px', background: 'var(--error-container)', border: '2px solid var(--error)', borderRadius: 'var(--radius)', color: 'var(--on-error-container)', fontSize: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-error-container)', fontWeight: 700, padding: '0 4px', fontSize: 16, lineHeight: 1 }}>✕</button>
          </div>
        )}

        <div className="p-4 lg:p-6" style={{ display: 'grid', gap: 16, alignItems: 'start' }}>
          <div className="lg:grid lg:grid-cols-[300px_1fr]" style={{ gap: 16, display: 'grid' }}>

            {/* ══ SIDEBAR / HOME TAB ══════════════════════════════ */}
            <aside className={`space-y-4 ${mobileTab !== 'home' ? 'hidden lg:block' : 'block'}`}>

              {/* Auth section */}
              <Card>
                <CardTitle>Identidade</CardTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ borderRadius: 'var(--radius)', background: 'var(--primary-container)', padding: '10px 14px', fontSize: 14, fontFamily: 'var(--font-body)', color: 'var(--on-primary-container)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MatIcon name="person" size={18} fill color="var(--on-primary-container)" />
                    {session?.user.email || 'Conectado'}
                  </div>
                  <SecondaryButton full onClick={handleSignOut}>Sair</SecondaryButton>
                </div>
              </Card>

              {/* Albums list */}
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <CardTitle>Álbuns</CardTitle>
                  <span className="label-caps" style={{ color: 'var(--on-surface-variant)', fontSize: 10 }}>{albums.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {albums.map((album) => {
                    const active = album.id === selectedAlbumId;
                    return (
                      <button
                        key={album.id}
                        className={active ? '' : 'hover-lift'}
                        onClick={() => {
                          setSelectedAlbumId(album.id);
                          if (mobileTab === 'home') handleMobileTab('teams');
                        }}
                        style={{ width: '100%', textAlign: 'left', borderRadius: 'var(--radius-md)', border: active ? '2px solid var(--primary)' : '2px solid var(--outline-variant)', background: active ? 'var(--primary-container)' : 'var(--surface-container-lowest)', padding: '10px 12px', cursor: 'pointer', boxShadow: active ? '4px 4px 0 0 var(--primary)' : 'var(--shadow-card)', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <AlbumCover album={album} size={40} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: active ? 'var(--on-primary-container)' : 'var(--on-surface)' }}>
                              {album.name}
                            </div>
                            <div className="label-caps" style={{ fontSize: 9, color: active ? 'var(--on-primary-container)' : 'var(--on-surface-variant)', marginTop: 2 }}>
                              {[album.publisher, album.season].filter(Boolean).join(' · ') || 'Sem editora'}
                            </div>
                          </div>
                        </div>
                        {active && stickers.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <ProgressSegments pct={stats.completion} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                  {albums.length === 0 && !loading && (
                    <div style={{ textAlign: 'center', padding: '24px 0' }}>
                      <MatIcon name="library_books" size={36} color="var(--outline-variant)" />
                      <div className="label-caps" style={{ color: 'var(--on-surface-variant)', marginTop: 8 }}>Nenhum álbum ainda</div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Catalog imports */}
              <Card>
                <CardTitle>Catálogos prontos</CardTitle>
                <button
                  className="btn-brut"
                  disabled={saving}
                  onClick={handleImportPaniniWorldCup2026}
                  style={{ width: '100%', borderRadius: 'var(--radius)', background: 'var(--surface-container-lowest)', border: '2px solid var(--on-surface)', padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--on-surface)', boxShadow: 'var(--shadow-brutalist)' }}
                >
                  <MatIcon name="sports_soccer" size={18} />
                  Panini Copa 2026
                </button>
                <p style={{ marginTop: 8, fontSize: 12, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
                  Cria 980 posições: introdução/FWC e 48 seleções com 20 figurinhas por time.
                </p>
              </Card>

              {/* New album form */}
              <Card>
                <CardTitle>Novo álbum</CardTitle>
                <form style={{ display: 'flex', flexDirection: 'column', gap: 10 }} onSubmit={handleCreateAlbum}>
                  <TextField label="Nome" value={albumForm.name} onChange={(name) => setAlbumForm({ ...albumForm, name })} />
                  <TextField label="Editora" value={albumForm.publisher} onChange={(publisher) => setAlbumForm({ ...albumForm, publisher })} />
                  <TextField label="Ano/temporada" value={albumForm.season} onChange={(season) => setAlbumForm({ ...albumForm, season })} />
                  <TextField label="URL da capa" value={albumForm.cover_url} onChange={(cover_url) => setAlbumForm({ ...albumForm, cover_url })} />
                  <NumberField label="Total de figurinhas" min={1} onChange={(total_stickers) => setAlbumForm({ ...albumForm, total_stickers })} value={albumForm.total_stickers} />
                  <button
                    type="submit"
                    disabled={saving}
                    className="btn-brut"
                    style={{ width: '100%', borderRadius: 'var(--radius)', background: 'var(--on-surface)', border: '2px solid var(--on-surface)', padding: '12px 18px', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--inverse-on-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: 'var(--shadow-brutalist)' }}
                  >
                    <MatIcon name="add_circle" size={16} color="var(--inverse-on-surface)" />
                    Criar álbum
                  </button>
                </form>
              </Card>

              {/* Collaborators */}
              {selectedAlbum && session && isAlbumOwner && (
                <Card>
                  <CardTitle>Colaboradores</CardTitle>
                  <form style={{ display: 'flex', flexDirection: 'column', gap: 10 }} onSubmit={handleInviteMember}>
                    <label style={{ display: 'block' }}>
                      <span className="label-caps" style={{ color: 'var(--on-surface-variant)', display: 'block', marginBottom: 6 }}>Tipo de convite</span>
                      <select
                        style={{ width: '100%', borderRadius: 'var(--radius)', border: '2px solid var(--outline-variant)', padding: '10px 14px', fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--on-surface)', background: 'var(--surface-container-lowest)', outline: 'none' }}
                        onChange={(e) => setInviteForm({ type: e.target.value as InviteType, value: '' })}
                        value={inviteForm.type}
                      >
                        <option value="email">E-mail</option>
                        <option value="username">Username</option>
                        <option value="phone">Telefone</option>
                        <option value="link">Magic link</option>
                      </select>
                    </label>
                    {inviteForm.type !== 'link' && (
                      <TextField
                        label={inviteForm.type === 'phone' ? 'Telefone' : inviteForm.type === 'username' ? 'Username' : 'E-mail'}
                        value={inviteForm.value}
                        onChange={(value) => setInviteForm({ ...inviteForm, value })}
                      />
                    )}
                    <SecondaryButton full disabled={saving} icon="person_add">Convidar editor</SecondaryButton>
                  </form>
                  {inviteLink && (
                    <div style={{ marginTop: 12, borderRadius: 'var(--radius)', border: '2px solid var(--primary)', background: 'var(--primary-container)', padding: 12 }}>
                      <div className="label-caps" style={{ color: 'var(--on-primary-container)', display: 'block', marginBottom: 4 }}>Magic link criado</div>
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all', color: 'var(--on-primary-container)', margin: 0, lineHeight: 1.4 }}>{inviteLink}</p>
                    </div>
                  )}
                  {members.length > 0 && (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {members.map((m) => (
                        <div key={m.id} style={{ borderRadius: 'var(--radius)', background: 'var(--surface-container)', padding: '8px 12px' }}>
                          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, color: 'var(--on-surface)' }}>
                            {m.invite_type === 'link' && !m.invite_value ? 'Magic link pendente' : m.invite_value || m.email || m.user_id || 'Colaborador'}
                          </div>
                          <div className="label-caps" style={{ fontSize: 9, color: 'var(--on-surface-variant)', marginTop: 2 }}>
                            {m.role} · {m.invite_type}{m.accepted_at ? ' · aceito' : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}
            </aside>

            {/* ══ MAIN CONTENT ════════════════════════════════════ */}
            <section className={`space-y-4 screen-in ${mobileTab === 'home' ? 'hidden lg:block' : 'block'}`}>

              {/* Album header */}
              {selectedAlbum ? (
                <Card>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, lineHeight: 1.2, color: 'var(--on-surface)' }}>{selectedAlbum.name}</div>
                      <div className="label-caps" style={{ fontSize: 10, color: 'var(--on-surface-variant)', marginTop: 4 }}>
                        {stats.totalRegistered} figurinhas no catálogo
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginTop: 12 }}>
                        <StatChip label="Tenho" value={stats.owned} color="var(--primary)" />
                        <StatChip label="Faltam" value={stats.missing} color="var(--error)" />
                        <StatChip label="Coladas" value={stats.stuck} color="var(--on-surface-variant)" />
                        <StatChip label="Trocas" value={stats.duplicates} color="var(--secondary)" />
                      </div>
                    </div>
                    <ProgressRing pct={stats.completion} label={`${stats.completion}%`} sub={`${stats.owned}/${Math.max(selectedAlbum.total_stickers, stats.totalRegistered)}`} size={88} />
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <ProgressSegments pct={stats.completion} />
                  </div>
                </Card>
              ) : (
                <Card>
                  <EmptyState icon="library_books" title="Nenhum álbum selecionado" description="Vá para Início e selecione ou crie um álbum." />
                </Card>
              )}

              {/* Desktop view tabs */}
              <div className="hidden lg:flex" style={{ gap: 4, background: 'var(--surface-container-lowest)', border: '2px solid var(--outline-variant)', borderRadius: 'var(--radius-lg)', padding: 6, boxShadow: 'var(--shadow-card)' }}>
                {DESKTOP_VIEW_TABS.map(({ id, icon, label }) => {
                  const active = viewMode === id;
                  return (
                    <button key={id} onClick={() => { setViewMode(id); if (id !== 'scan') stopCamera(); }}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 14px', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer', background: active ? 'var(--on-surface)' : 'transparent', color: active ? 'var(--inverse-on-surface)' : 'var(--on-surface-variant)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', transition: 'all 0.15s' }}>
                      <MatIcon name={icon} size={16} fill={active} color={active ? 'var(--inverse-on-surface)' : 'var(--on-surface-variant)'} />
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* ── SCAN VIEW ──────────────────────────────────── */}
              {viewMode === 'scan' && selectedAlbum && (
                <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
                  <Card>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <CardTitle>Ler figurinha</CardTitle>
                      <button
                        onClick={scanRunning ? stopCamera : startCamera}
                        style={{ borderRadius: 'var(--radius)', border: '2px solid var(--outline)', padding: '8px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', background: scanRunning ? 'var(--error-container)' : 'var(--primary-container)', color: scanRunning ? 'var(--on-error-container)' : 'var(--on-primary-container)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        <MatIcon name={scanRunning ? 'stop_circle' : 'qr_code_scanner'} size={16} />
                        {scanRunning ? 'Parar' : 'Câmera'}
                      </button>
                    </div>
                    <div style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '2px solid var(--outline-variant)', background: 'var(--on-surface)', aspectRatio: '16/9' }}>
                      <video style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline ref={videoRef} />
                    </div>
                    {cameraMessage && <p style={{ marginTop: 10, fontSize: 13, color: 'var(--tertiary)', fontFamily: 'var(--font-body)' }}>{cameraMessage}</p>}
                    <form style={{ marginTop: 14, display: 'flex', gap: 8 }} onSubmit={(e) => { e.preventDefault(); registerCode(manualCode); }}>
                      <input
                        style={{ flex: 1, borderRadius: 'var(--radius)', border: '2px solid var(--outline-variant)', padding: '11px 14px', fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, textTransform: 'uppercase', color: 'var(--on-surface)', background: 'var(--surface-container-lowest)', outline: 'none' }}
                        onChange={(e) => setManualCode(e.target.value)}
                        placeholder="Código da figurinha"
                        value={manualCode}
                        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--outline-variant)'; }}
                      />
                      <PrimaryButton disabled={saving} icon="add">+1</PrimaryButton>
                    </form>
                  </Card>
                  <ScanResultCard lastScan={lastScan} />
                </div>
              )}

              {/* ── TEAMS VIEW ─────────────────────────────────── */}
              {viewMode === 'teams' && selectedAlbum && (
                <div className="grid gap-4 xl:grid-cols-[260px_1fr]">
                  {/* Team selector */}
                  <Card style={{ padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '0 4px' }}>
                      <CardTitle>Times</CardTitle>
                      <span className="label-caps" style={{ fontSize: 10, color: 'var(--on-surface-variant)' }}>{teams.length}</span>
                    </div>
                    {teams.length === 0 ? (
                      <EmptyState icon="groups" title="Sem times" description="Adicione figurinhas com o campo Seção preenchido." />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {teams.map((team) => {
                          const active = activeTeam === team.name;
                          return (
                            <button
                              key={team.name}
                              onClick={() => setSelectedTeam(team.name)}
                              style={{ width: '100%', textAlign: 'left', borderRadius: 'var(--radius)', border: active ? '2px solid var(--primary)' : '2px solid var(--outline-variant)', background: active ? 'var(--primary-container)' : 'var(--surface-container-lowest)', padding: '10px 12px', cursor: 'pointer', transition: 'all 0.15s', boxShadow: active ? '4px 4px 0 0 var(--primary)' : 'none' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                  <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, color: active ? 'var(--on-primary-container)' : 'var(--on-surface)' }}>{team.name}</div>
                                  <div className="label-caps" style={{ fontSize: 9, color: active ? 'var(--on-primary-container)' : 'var(--on-surface-variant)', marginTop: 2 }}>
                                    {team.owned}/{team.total} · {team.stuck} coladas
                                  </div>
                                </div>
                                {team.duplicates > 0 && (
                                  <span style={{ borderRadius: 'var(--radius-full)', background: 'var(--secondary-container)', padding: '3px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--on-secondary-container)', flexShrink: 0 }}>+{team.duplicates}</span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </Card>

                  {/* Sticker grid */}
                  <Card style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ borderBottom: '2px solid var(--outline-variant)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18 }}>{activeTeam || 'Time'}</div>
                        <div className="label-caps" style={{ fontSize: 10, color: 'var(--on-surface-variant)', marginTop: 2 }}>Toque em uma vaga para marcar como coletada</div>
                      </div>
                      {teamStickers.length > 0 && (
                        <span className="label-caps" style={{ fontSize: 10, color: 'var(--on-surface-variant)' }}>
                          {teamStickers.filter(s => s.quantity > 0).length}/{teamStickers.length}
                        </span>
                      )}
                    </div>
                    {/* Country info strip — only shown for team sections with country data */}
                    <CountryStrip section={activeTeam} />
                    {teamStickers.length === 0 ? (
                      <EmptyState icon="style" title="Sem figurinhas neste time" description="Use o catálogo para cadastrar as figurinhas por time." />
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 'var(--space-sticker-gap)', padding: 12 }}>
                        {teamStickers.map((s) => (
                          <TeamStickerCard key={s.id} onPatch={(p) => patchSticker(s, p)} sticker={s} />
                        ))}
                      </div>
                    )}
                  </Card>
                </div>
              )}

              {/* ── CATALOG VIEW ───────────────────────────────── */}
              {viewMode === 'catalog' && selectedAlbum && (
                <>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <Card>
                      <CardTitle>Adicionar ao catálogo</CardTitle>
                      <form style={{ display: 'flex', flexDirection: 'column', gap: 10 }} onSubmit={handleCreateCatalogSticker}>
                        <div className="grid grid-cols-2 gap-3">
                          <TextField label="Código" value={catalogForm.code} onChange={(code) => setCatalogForm({ ...catalogForm, code })} />
                          <TextField label="Seção" value={catalogForm.section} onChange={(section) => setCatalogForm({ ...catalogForm, section })} />
                        </div>
                        <TextField label="Título" value={catalogForm.title} onChange={(title) => setCatalogForm({ ...catalogForm, title })} />
                        <PrimaryButton disabled={saving} icon="add">Salvar figurinha</PrimaryButton>
                      </form>
                    </Card>

                    <Card>
                      <CardTitle>Gerar sequência</CardTitle>
                      <form style={{ display: 'flex', flexDirection: 'column', gap: 10 }} onSubmit={handleGenerateCatalog}>
                        <div className="grid grid-cols-2 gap-3">
                          <TextField label="Prefixo" value={generatorForm.prefix} onChange={(prefix) => setGeneratorForm({ ...generatorForm, prefix })} />
                          <NumberField label="Início" min={1} onChange={(start) => setGeneratorForm({ ...generatorForm, start })} value={generatorForm.start} />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <NumberField label="Qtd." min={1} onChange={(count) => setGeneratorForm({ ...generatorForm, count })} value={generatorForm.count} />
                          <NumberField label="Dígitos" min={1} onChange={(padding) => setGeneratorForm({ ...generatorForm, padding })} value={generatorForm.padding} />
                          <TextField label="Seção" value={generatorForm.section} onChange={(section) => setGeneratorForm({ ...generatorForm, section })} />
                        </div>
                        <SecondaryButton full disabled={saving} icon="auto_awesome">Gerar</SecondaryButton>
                      </form>
                    </Card>
                  </div>

                  <CatalogToolbar filter={filter} query={query} setFilter={setFilter} setQuery={setQuery} />
                  <StickerTable loading={loading} onPatch={patchSticker} stickers={filteredStickers} />
                </>
              )}

              {/* ── TRADES VIEW ────────────────────────────────── */}
              {viewMode === 'trades' && (
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ borderBottom: '2px solid var(--outline-variant)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18 }}>Disponíveis para troca</div>
                      <div className="label-caps" style={{ fontSize: 10, color: 'var(--on-surface-variant)', marginTop: 2 }}>
                        {duplicates.length} modelos · {stats.duplicates} figurinhas extras
                      </div>
                    </div>
                    {duplicates.length > 0 && (
                      <span style={{ borderRadius: 'var(--radius-full)', background: 'var(--secondary-container)', padding: '6px 14px', fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--on-secondary-container)' }}>
                        {stats.duplicates}
                      </span>
                    )}
                  </div>
                  {duplicates.length === 0 ? (
                    <EmptyState icon="sync_alt" title="Nenhuma repetida" description="Quando uma quantidade passar de 1, ela aparece aqui para troca." />
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, padding: 16 }}>
                      {duplicates.map((s) => (
                        <article key={s.id} className="hover-lift" style={{ borderRadius: 'var(--radius-md)', border: '2px solid var(--outline-variant)', background: 'var(--surface-container-lowest)', padding: 12, boxShadow: 'var(--shadow-card)', position: 'relative' }}>
                          <span style={{ position: 'absolute', top: -8, right: 10, background: 'var(--secondary)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--radius-full)', border: '2px solid #fff', zIndex: 10 }}>
                            {s.quantity - 1}× troca
                          </span>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <div style={{ width: 52, flexShrink: 0 }}>
                              <StickerVisual compact sticker={s} />
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div className="label-caps" style={{ fontSize: 10, color: 'var(--on-surface-variant)' }}>{s.code}</div>
                              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--on-surface)', lineHeight: 1.2, marginTop: 2 }}>{s.title}</div>
                              <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 2 }}>{s.section || 'Sem seção'}</div>
                            </div>
                          </div>
                          <button
                            style={{ width: '100%', marginTop: 10, borderRadius: 'var(--radius)', border: '2px solid var(--outline-variant)', background: 'transparent', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', color: 'var(--on-surface)', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                            onClick={() => patchSticker(s, { quantity: Math.max(s.quantity - 1, 0), owned: s.quantity - 1 > 0 })}
                          >
                            <MatIcon name="check_circle" size={14} color="var(--primary)" />
                            Troca feita
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                </Card>
              )}
            </section>
          </div>
        </div>
      </div>

      {/* ── MOBILE BOTTOM NAV ─────────────────────────────────────── */}
      <nav
        className="lg:hidden"
        style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(248,249,255,0.96)', backdropFilter: 'blur(16px)', borderTop: '2px solid var(--outline-variant)', display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '6px 4px calc(6px + env(safe-area-inset-bottom))', zIndex: 50, boxShadow: '0 -4px 0 0 rgba(0,0,0,.04)' }}
      >
        {NAV_TABS.map(({ id, icon, label }) => {
          const active = mobileTab === id;
          return (
            <button
              key={id}
              onClick={() => handleMobileTab(id)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '6px 8px', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer', background: active ? 'var(--primary-container)' : 'transparent', color: active ? 'var(--on-primary-container)' : 'var(--on-surface-variant)', transition: 'all 0.2s', transform: active ? 'scale(1.05)' : 'none', minWidth: 52, outline: 'none' }}
            >
              <MatIcon name={icon} size={24} fill={active} color={active ? 'var(--on-primary-container)' : 'var(--on-surface-variant)'} />
              <span className="label-caps" style={{ fontSize: 9, color: active ? 'var(--on-primary-container)' : 'var(--on-surface-variant)' }}>{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default HomePage;
