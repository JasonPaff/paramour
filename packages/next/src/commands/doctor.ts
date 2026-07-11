import { parseCommandFlags } from "../cli-args.js";
import { type CliIo, message, resolveIo } from "../cli-io.js";
import { runDoctorChecks } from "../doctor/checks.js";

const MARKS = { fail: "✖", pass: "✔", warn: "⚠" } as const;

const USAGE = [
  "Usage: paramour doctor [options]",
  "",
  "Diagnose the project's paramour setup: config validity, artifact",
  "freshness, next.config wrapping, version alignment, tsconfig coverage,",
  "and route-definition discovery (which evaluates matched modules, like",
  "`paramour list`).",
  "",
  "Exit codes: 0 all checks pass (warnings allowed), 1 any check fails.",
  "",
  "Options:",
  "  --help, -h  show this help",
  "  --json      machine-readable output",
].join("\n");

/**
 * @internal `paramour doctor` — a verification, so its exit codes follow
 * `check`'s class: 0 pass/warn, 1 any fail, 2 only when doctor itself
 * cannot run.
 */
export async function runDoctor(
  argv: readonly string[],
  io: CliIo,
): Promise<number> {
  const { stderr, stdout } = resolveIo(io);
  const parsed = parseCommandFlags(
    argv,
    {
      help: { default: false, short: "h", type: "boolean" },
      json: { default: false, type: "boolean" },
    },
    USAGE,
    { stderr, stdout },
  );
  if ("exit" in parsed) return parsed.exit;
  const flags = parsed.values;

  let checks;
  try {
    checks = await runDoctorChecks(process.cwd());
  } catch (error) {
    stderr(`paramour: ${message(error)}`);
    return 2;
  }
  const failed = checks.filter((check) => check.status === "fail").length;
  const warned = checks.filter((check) => check.status === "warn").length;
  const status = failed > 0 ? "fail" : warned > 0 ? "warn" : "pass";

  if (flags.json) {
    stdout(JSON.stringify({ checks, status }, null, 2));
    return failed > 0 ? 1 : 0;
  }
  for (const check of checks) {
    stdout(`  ${MARKS[check.status]} ${check.label}`);
    for (const line of check.detail ?? []) stdout(`      ${line}`);
  }
  stdout("");
  stdout(
    `doctor: ${String(checks.length)} checks — ${String(failed)} failed, ${String(warned)} warning${warned === 1 ? "" : "s"}`,
  );
  return failed > 0 ? 1 : 0;
}
