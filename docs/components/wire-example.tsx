import { highlight } from "fumadocs-core/highlight";
import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
import {
  buildPath,
  buildSearchString,
  decodeParams,
  decodeSearch,
  defineAppRoute,
  encodeParams,
  encodeSearch,
  encodeStaticParams,
  href,
  isRawSearch,
  p,
  ParamourError,
  ParamsDecodeError,
  ParseError,
  rawSearch,
  SearchDecodeError,
  SearchSourceError,
  searchToString,
  SerializeError,
} from "paramour";
import { z } from "zod";

type ErrorName = keyof typeof ERROR_CLASSES;

/**
 * A live-computed wire-format example (plan-docs-milestone-5 decision 6).
 *
 * `code` is BOTH the displayed snippet and the executed program: it is
 * evaluated against the shipped `paramour` barrel at docs build time, and the
 * rendered result is whatever the real library returned — the example
 * physically cannot drift from behavior. With `throws`, the evaluation must
 * throw that paramour error brand; a non-throw (or the wrong brand) throws
 * here instead, failing `next build`.
 *
 * `code` is an expression by default; if it does not parse as one, it is
 * compiled as a statement body (write an explicit `return`).
 */
export async function WireExample({
  code,
  throws,
}: {
  code: string;
  throws?: ErrorName;
}) {
  const outcome = runExample(code, throws);
  const rendered = await highlight(code, {
    components: {
      pre: (props) => <Pre {...props} />,
    },
    lang: "ts",
    themes: { dark: "github-dark", light: "github-light" },
  });

  return (
    <figure className="my-4 overflow-hidden rounded-xl border border-fd-border bg-fd-card shadow-sm">
      <CodeBlock className="my-0 rounded-none border-none">
        {rendered}
      </CodeBlock>
      <figcaption className="flex items-start gap-2 border-t border-fd-border bg-fd-secondary/50 px-4 py-2 font-mono text-[0.8125rem]">
        {outcome.kind === "value" ? (
          <>
            <span aria-hidden className="select-none text-fd-muted-foreground">
              →
            </span>
            <span className="break-all whitespace-pre-wrap text-fd-foreground">
              {outcome.text}
            </span>
          </>
        ) : (
          <>
            <span
              aria-hidden
              className="select-none text-red-600 dark:text-red-400"
            >
              ✗
            </span>
            <span className="break-all whitespace-pre-wrap">
              <span className="font-semibold text-red-600 dark:text-red-400">
                {outcome.name}
              </span>
              <span className="text-fd-muted-foreground">
                : {outcome.message}
              </span>
            </span>
          </>
        )}
      </figcaption>
    </figure>
  );
}

/** The paramour error brands an example may assert via `throws`. */
const ERROR_CLASSES = {
  ParamourError,
  ParamsDecodeError,
  ParseError,
  SearchDecodeError,
  SearchSourceError,
  SerializeError,
};

/** Everything in scope inside an example's `code` string. */
const SCOPE: Record<string, unknown> = {
  buildPath,
  buildSearchString,
  decodeParams,
  decodeSearch,
  defineAppRoute,
  encodeParams,
  encodeSearch,
  encodeStaticParams,
  href,
  isRawSearch,
  p,
  rawSearch,
  searchToString,
  z,
};

/**
 * Compiles an example against {@link SCOPE}. `new Function` is the point,
 * not an accident: the displayed source string IS the executed program, so
 * the snippet and its output cannot disagree (decision 6). Build-time only —
 * examples are authored in this repo's MDX, never user input.
 */
function compileExample(code: string): (...args: unknown[]) => unknown {
  const names = Object.keys(SCOPE);
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    return new Function(...names, `"use strict"; return (\n${code}\n);`) as (
      ...args: unknown[]
    ) => unknown;
  } catch {
    // Not an expression — compile as a statement body instead.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    return new Function(...names, `"use strict";\n${code}`) as (
      ...args: unknown[]
    ) => unknown;
  }
}

function runExample(
  code: string,
  throws: ErrorName | undefined,
):
  | { kind: "threw"; message: string; name: ErrorName }
  | { kind: "value"; text: string } {
  let caught: unknown;
  let didThrow = false;
  let value: unknown;
  try {
    value = compileExample(code)(...Object.values(SCOPE));
  } catch (error) {
    caught = error;
    didThrow = true;
  }

  if (throws === undefined) {
    if (didThrow) {
      throw new Error(
        `<WireExample> threw unexpectedly for:\n${code}\n\n${showValue(caught)}`,
        { cause: caught },
      );
    }
    return { kind: "value", text: show(value) };
  }

  if (!didThrow) {
    throw new Error(
      `<WireExample throws="${throws}"> did not throw — it returned ${show(value)} for:\n${code}`,
    );
  }
  if (!(caught instanceof ERROR_CLASSES[throws])) {
    throw new Error(
      `<WireExample throws="${throws}"> threw a different error for:\n${code}\n\n${showValue(caught)}`,
      { cause: caught },
    );
  }
  return { kind: "threw", message: caught.message, name: throws };
}

/** Renders an example's result the way a reader would write it in source. */
function show(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null || value === undefined || typeof value !== "object") {
    return showValue(value);
  }
  if (value instanceof Date) return `Date("${value.toISOString()}")`;
  if (Array.isArray(value)) {
    return `[${value.map((element) => show(element)).join(", ")}]`;
  }
  const entries = Object.entries(value).map(
    ([key, entry]) => `${showKey(key)}: ${show(entry)}`,
  );
  return entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`;
}

function showKey(key: string): string {
  return /^[$A-Z_a-z][$\w]*$/.test(key) ? key : JSON.stringify(key);
}

/** String() hardened against values without a usable primitive conversion. */
function showValue(value: unknown): string {
  try {
    return String(value);
  } catch {
    return `[unstringifiable ${typeof value}]`;
  }
}
