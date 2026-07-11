import { parseArgs, type ParseArgsOptionsConfig } from "node:util";

import { message, type ResolvedIo } from "./cli-io.js";

/** Every command declares `--help` identically; the prologue relies on it. */
interface HelpOption {
  help: { default: false; short: "h"; type: "boolean" };
}

/** What `parseArgs` infers for `values` from an options table `T`. */
type ParsedValues<T extends ParseArgsOptionsConfig> = ReturnType<
  typeof parseArgs<{ allowPositionals: true; args: string[]; options: T }>
>["values"];

/**
 * The shared command prologue (TR7): parse flags, print usage on a parse
 * error (exit 2) or `--help` (exit 0), and reject positionals — no command
 * takes one. Callers branch on `"exit" in result`; anything past the
 * prologue (mode merging, flag exclusivity) stays per-command.
 */
export function parseCommandFlags<
  const T extends HelpOption & ParseArgsOptionsConfig,
>(
  argv: readonly string[],
  options: T,
  usage: string,
  { stderr, stdout }: ResolvedIo,
): { exit: 0 | 2 } | { values: ParsedValues<T> } {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      args: [...argv],
      options,
    });
  } catch (error) {
    stderr(`paramour: ${message(error)}`);
    stderr(usage);
    return { exit: 2 };
  }
  // parseArgs's values type stays opaque while T is unresolved; the
  // HelpOption constraint guarantees the property exists.
  if ((parsed.values as { help?: boolean }).help === true) {
    stdout(usage);
    return { exit: 0 };
  }
  if (parsed.positionals.length > 0) {
    stderr(`paramour: unexpected argument "${parsed.positionals[0] ?? ""}"`);
    stderr(usage);
    return { exit: 2 };
  }
  return { values: parsed.values };
}
