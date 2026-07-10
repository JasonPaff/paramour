// A private folder: `_components/` is invisible to Next's router AND to
// paramour's scanner (TR2 `_` skip), so colocated non-route modules add no
// routes and no artifact entries — this file could hold a page.tsx and still
// contribute nothing.
export function MarketingBanner() {
  return (
    <p className="eyebrow">
      (marketing) group layout — shared chrome with no URL segment
    </p>
  );
}
