import type { Issue } from "paramour";
import type { ReactNode } from "react";

/**
 * DT7: `issues[]` rendered prominently on decode failure — always in the
 * single-scroll flow, never behind a tab (DT15's anti-tab rationale). The
 * raw-search root sentinel key `"<search>"` reads as the whole search
 * string failing.
 */
export function IssuesSection({
  issues,
}: {
  readonly issues: readonly Issue[];
}): ReactNode {
  if (issues.length === 0) return null;
  return (
    <div className="pmr-issues">
      <div className="pmr-section-title">Issues</div>
      <table className="pmr-table">
        <thead>
          <tr>
            <th>key</th>
            <th>message</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue, index) => (
            <tr key={`${issue.key}:${String(index)}`}>
              <td className="pmr-mono">
                {issue.key === "<search>" ? "(whole search)" : issue.key}
              </td>
              <td>{issue.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
