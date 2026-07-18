import type { ParamDescription } from "paramour";
import type { ReactNode } from "react";

import type { ParamourObservation } from "../seam.js";

import { formatShape, formatWire, jsLiteral } from "../format.js";
import { ValueCell } from "./primitives.js";

/**
 * The params half of the inspector (DT7). Read-only in v1 (DT8): editing a
 * path param navigates to a different RESOURCE — a bigger action than
 * tweaking a filter, deferred behind `href()`.
 */
export function ParamsTable({
  changeStamps,
  descriptions,
  observation,
}: {
  readonly changeStamps: Readonly<Record<string, number>>;
  readonly descriptions: Readonly<Record<string, ParamDescription>>;
  readonly observation: ParamourObservation | undefined;
}): ReactNode {
  const names = Object.keys(descriptions);
  if (names.length === 0) return null;

  const wire = observation?.kind === "params" ? observation.wire : undefined;
  const parsed =
    observation?.result.status === "success"
      ? (observation.result.data as Readonly<Record<string, unknown>>)
      : undefined;

  return (
    <>
      <div className="pmr-section-title">Params</div>
      <table className="pmr-table">
        <thead>
          <tr>
            <th>key</th>
            <th>wire</th>
            <th>parsed</th>
            <th>shape</th>
          </tr>
        </thead>
        <tbody>
          {names.map((name) => {
            const description = descriptions[name];
            if (description === undefined) return null;
            return (
              <tr key={name}>
                <td className="pmr-mono">{name}</td>
                <td>
                  <ValueCell stamp={0}>{formatWire(wire?.[name])}</ValueCell>
                </td>
                <td>
                  <ValueCell stamp={changeStamps[name] ?? 0}>
                    {parsed === undefined ? "—" : jsLiteral(parsed[name])}
                  </ValueCell>
                </td>
                <td className="pmr-mono pmr-muted">
                  {formatShape(description)}
                  {segmentHint(description)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function segmentHint(description: ParamDescription): string {
  switch (description.segmentKind) {
    case "catchall":
      return " [...]";
    case "optional-catchall":
      return " [[...]]";
    case "single":
      return "";
  }
}
