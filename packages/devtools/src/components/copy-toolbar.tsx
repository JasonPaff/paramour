import type { ReactNode } from "react";

import { CopyButton } from "./primitives.js";

/**
 * DT9's non-invasive copy helpers: the session's URL (absent when a stale
 * snapshot's URL cannot be rebuilt), the parsed values as JSON (absent when
 * nothing parsed), and the `href()` reproduction snippet.
 */
export function CopyToolbar({
  parsedJson,
  snippet,
  url,
}: {
  readonly parsedJson: string | undefined;
  readonly snippet: string;
  readonly url: string | undefined;
}): ReactNode {
  return (
    <span className="pmr-toolbar">
      {url === undefined ? null : <CopyButton label="copy url" text={url} />}
      {parsedJson === undefined ? null : (
        <CopyButton label="copy json" text={parsedJson} />
      )}
      <CopyButton label="copy href()" text={snippet} />
    </span>
  );
}
