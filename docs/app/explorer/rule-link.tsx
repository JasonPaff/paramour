import { href } from "paramour";

import { docsRoute } from "../docs/[[...slug]]/route.def";

/**
 * An inline link from an explorer annotation to the numbered rule it cites —
 * the spec's stable `#s3`-style anchors are the whole point of publishing
 * rule IDs.
 */
export function RuleLink({ id }: { id: string }) {
  const spec = href(docsRoute, {
    params: { slug: ["reference", "wire-format"] },
  });
  return (
    <a
      className="font-mono font-semibold text-fd-primary no-underline hover:underline"
      href={`${spec}#${id.toLowerCase()}`}
    >
      {id}
    </a>
  );
}
