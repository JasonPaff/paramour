import type { RouteProps } from "paramour";

import { filesRoute } from "./route.def";

export default async function FilesPage(props: RouteProps) {
  // safeParseParams: the params half alone, in data-xor-error form. A shape
  // mismatch (e.g. hand-built props) surfaces as `error.issues`, one per key,
  // rather than throwing.
  const result = await filesRoute.safeParseParams(props);
  if (result.error) {
    return (
      <main>
        <h1>Bad file path</h1>
        <ul>
          {result.error.issues.map((issue) => (
            <li key={issue.key}>
              <code>{issue.key}</code>: {issue.message}
            </li>
          ))}
        </ul>
      </main>
    );
  }

  const { path } = result.data;

  return (
    <main>
      <h1>File: {path.join("/")}</h1>
      <p>
        <code>params.path</code> is a required catch-all — always at least one
        segment (Array of {path.length}).
      </p>
      <ol>
        {path.map((segment, index) => (
          <li key={`${String(index)}-${segment}`}>{segment}</li>
        ))}
      </ol>
    </main>
  );
}
