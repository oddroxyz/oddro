/*
 * Oddro's mark: the owner's logo (25 Nov 2026, assets/ODDRO.png), trimmed to public/brand/mark.webp by
 * referensi/tools/apply-owner-assets.mjs. Drawn as a CSS mask filled with currentColor (white in the header like the owner's banner,
 * neon where the page asks). Bump ?v= when the file changes so cached copies are replaced.
 */
export const MARK_URL = "/brand/mark.webp?v=67e38522";

export function MarkGlyph({ size = 22, className = "" }: { size?: number; className?: string }) {
  const mask = `url(${MARK_URL}) center / contain no-repeat`;
  return <span aria-hidden="true" data-testid="brand-mark" className={`mk block shrink-0 bg-current ${className}`} style={{ width: size, height: size, WebkitMask: mask, mask }} />;
}

/** Wordmark: the owner's mark + the name in the wide display face. */
export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <MarkGlyph size={Math.round(size * 1.15)} />
      <span>Oddro</span>
    </span>
  );
}
