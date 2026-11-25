/*
 * Oddro's mark (placeholder until the owner's files arrive): a ring, the order, with a check cut into it, your approval.
 * Drawn inline with currentColor; the same geometry renders the favicon and share image (referensi/tools/make-assets.mjs).
 */
export function MarkGlyph({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" data-testid="brand-mark" className={`mk shrink-0 ${className}`}>
      <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="4" />
      <path d="M10.6 16.4l3.6 3.6 7.4-7.6" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Wordmark: the mark + the name in the wide display face, like the reference's logotype. */
export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <MarkGlyph size={Math.round(size * 1.15)} />
      <span>Oddro</span>
    </span>
  );
}
