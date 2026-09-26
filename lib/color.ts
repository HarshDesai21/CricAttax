// Small helper for theming UI with a franchise's stored hex colors (see
// lib/types.ts's Franchise.primary_color/secondary_color). Needed because
// Tailwind's bg-gold/15-style opacity shorthand only works for colors it
// knows about at build time -- a color read from the database at runtime
// has to be turned into an rgba() string by hand instead.
export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const int = parseInt(full, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
