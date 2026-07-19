/**
 * Shared JSX for `next/og` ImageResponse cards (satori: inline styles only,
 * explicit flex on every multi-child element). Rendered at 1200x630 by
 * app/opengraph-image.tsx (site default) and the per-docs-page image.
 */
export function OgCard({
  description,
  title,
}: {
  description?: string | undefined;
  title: string;
}) {
  return (
    <div
      style={{
        backgroundColor: "#0a0a0a",
        color: "#fafafa",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: 80,
        width: "100%",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            fontSize: title.length > 32 ? 56 : 72,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
        {description ? (
          <div
            style={{
              color: "#a1a1aa",
              fontSize: 32,
              lineHeight: 1.4,
              maxWidth: 900,
            }}
          >
            {description}
          </div>
        ) : undefined}
      </div>
      <div
        style={{
          alignItems: "center",
          color: "#a1a1aa",
          display: "flex",
          fontSize: 28,
          gap: 16,
        }}
      >
        <div
          style={{
            backgroundColor: "#fafafa",
            borderRadius: 8,
            color: "#0a0a0a",
            display: "flex",
            fontSize: 24,
            fontWeight: 700,
            padding: "4px 12px",
          }}
        >
          p.
        </div>
        paramour.dev
      </div>
    </div>
  );
}
