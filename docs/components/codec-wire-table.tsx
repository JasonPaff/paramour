import type { SearchConfig } from "paramour";

import { p, searchToString } from "paramour";
import { z } from "zod";

interface WireRow {
  codec: string;
  config: SearchConfig;
  input: Record<string, unknown>;
  memory: string;
}

/**
 * The concepts page's codec-by-codec wire table, with the "On the wire"
 * column computed by the shipped library at docs build time (the page's
 * "every example below is real output" claim, made true by construction —
 * plan-docs-milestone-5 A2). The codec and in-memory columns are display
 * strings; only the wire column is a claim, and it is never hand-written.
 */
export function CodecWireTable() {
  return (
    <table>
      <thead>
        <tr>
          <th>Codec</th>
          <th>In memory</th>
          <th>On the wire</th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map((row) => (
          <tr key={row.codec}>
            <td>
              <code>{row.codec}</code>
            </td>
            <td>
              <code>{row.memory}</code>
            </td>
            <td>
              <code>{searchToString(row.config, row.input)}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const ROWS: WireRow[] = [
  {
    codec: "p.boolean()",
    config: { debug: p.boolean() },
    input: { debug: true },
    memory: "true",
  },
  {
    codec: "p.isoDate()",
    config: { since: p.isoDate() },
    input: { since: new Date("2026-07-18T00:00:00.000Z") },
    memory: 'Date("2026-07-18")',
  },
  {
    codec: "p.timestamp()",
    config: { at: p.timestamp() },
    input: { at: new Date("2026-07-18T12:30:00.000Z") },
    memory: 'Date("…T12:30:00Z")',
  },
  {
    codec: "p.index()",
    config: { page: p.index() },
    input: { page: 0 },
    memory: "0",
  },
  {
    codec: "p.json(schema)",
    config: { f: p.json(z.object({ a: z.number() })) },
    input: { f: { a: 1 } },
    memory: "{ a: 1 }",
  },
  {
    codec: "p.array()",
    config: { tags: p.array() },
    input: { tags: ["sale", "new"] },
    memory: '["sale", "new"]',
  },
  {
    codec: "p.csv()",
    config: { tags: p.csv() },
    input: { tags: ["sale", "new"] },
    memory: '["sale", "new"]',
  },
  {
    codec: "p.string()",
    config: { q: p.string() },
    input: { q: "wool socks" },
    memory: '"wool socks"',
  },
];
