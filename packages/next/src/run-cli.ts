import { type CliIo, resolveIo } from "./cli-io.js";
import { runDoctor } from "./commands/doctor.js";
import { runGenerate } from "./commands/generate.js";
import { runInit } from "./commands/init.js";
import { runList } from "./commands/list.js";

export { type CliIo } from "./cli-io.js";

type Command = (argv: readonly string[], io: CliIo) => Promise<number>;

// Alphabetical; the unknown-command message derives from these keys.
const COMMANDS: Record<string, Command> = {
  check: (argv, io) => runGenerate(argv, io, "check"),
  doctor: runDoctor,
  generate: (argv, io) => runGenerate(argv, io, "generate"),
  init: runInit,
  list: runList,
};

const USAGE = [
  "Usage: paramour <command> [options]",
  "",
  "Commands:",
  "  check     verify the artifact is current; exit 1 on drift, never writes",
  "  doctor    diagnose the project's paramour setup",
  "  generate  generate paramour-env.d.ts from the app and pages directories",
  "  init      set up paramour in this project",
  "  list      print every route with its params/search shape",
  "",
  "Run `paramour <command> --help` for that command's options.",
].join("\n");

/**
 * @internal The CLI dispatcher (TR7), in-process testable: returns the exit
 * code instead of exiting. The exit-code contract holds across every
 * command: 0 success, 1 "the thing you asked me to verify is not true"
 * (`check`/`generate --check` drift, `doctor` failures) ONLY, 2
 * usage/config/operational errors. Each command owns its flags parse and
 * usage text; this layer only routes the first positional.
 */
export async function runCli(
  argv: readonly string[],
  io: CliIo = {},
): Promise<number> {
  const { stderr, stdout } = resolveIo(io);
  const [command, ...rest] = argv;
  if (command === undefined) {
    stderr(USAGE);
    return 2;
  }
  if (command === "--help" || command === "-h" || command === "help") {
    stdout(USAGE);
    return 0;
  }
  const run = COMMANDS[command];
  if (run === undefined) {
    stderr(
      `paramour: unknown command "${command}" (expected one of: ${Object.keys(COMMANDS).join(", ")})`,
    );
    stderr(USAGE);
    return 2;
  }
  return run(rest, io);
}
