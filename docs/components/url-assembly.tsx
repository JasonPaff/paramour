import type { CSSProperties } from "react";

/**
 * The landing page's one animated moment: the hero sample's output URL
 * assembles itself segment by segment, each codec-produced piece lighting up
 * as it maps back to the typed call. Pure CSS (see `landing-segment` in
 * global.css) so it runs without JS and collapses to the finished URL under
 * `prefers-reduced-motion`.
 */

interface Segment {
  /** Legend entry shown under the bar for codec-produced segments. */
  legend?: string;
  text: string;
}

const SEGMENTS: Segment[] = [
  { text: "/product/" },
  { legend: 'params.id · p.integer() → "42"', text: "42" },
  { text: "?q=" },
  { legend: 'search.q · p.string() → "paramour"', text: "paramour" },
];

const STEP_SECONDS = 0.45;

export function UrlAssembly() {
  const legendStart = SEGMENTS.length;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="max-w-full overflow-x-auto rounded-lg border border-fd-border bg-fd-card px-4 py-2.5 font-mono text-sm">
        <span aria-hidden className="mr-2 text-fd-muted-foreground select-none">
          &rarr;
        </span>
        {SEGMENTS.map((segment, index) => (
          <span
            className={
              segment.legend
                ? "landing-segment landing-segment-codec whitespace-pre text-fd-primary underline decoration-fd-primary/40 underline-offset-4"
                : "landing-segment whitespace-pre text-fd-foreground"
            }
            key={segment.text}
            style={delayStyle(index)}
          >
            {segment.text}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 font-mono text-xs text-fd-muted-foreground">
        {SEGMENTS.filter((segment) => segment.legend).map((segment, index) => (
          <span
            className="landing-segment"
            key={segment.text}
            style={delayStyle(legendStart + index)}
          >
            {segment.legend}
          </span>
        ))}
      </div>
    </div>
  );
}

function delayStyle(step: number): CSSProperties {
  return {
    "--segment-delay": `${String(0.3 + step * STEP_SECONDS)}s`,
  } as CSSProperties;
}
