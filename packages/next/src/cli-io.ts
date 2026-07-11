/** @internal I/O seams for tests; defaults write to the console. */
export interface CliIo {
  /** Aborting stops `generate --watch` and resolves `runCli` with 0. */
  signal?: AbortSignal;
  stderr?: (line: string) => void;
  stdout?: (line: string) => void;
}

/** {@link CliIo} with the write seams defaulted. */
export interface ResolvedIo {
  stderr: (line: string) => void;
  stdout: (line: string) => void;
}

/** Error message without the stack — CLI output, not a crash report. */
export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function resolveIo(io: CliIo): ResolvedIo {
  return {
    stderr:
      io.stderr ??
      ((line: string) => {
        console.error(line);
      }),
    stdout:
      io.stdout ??
      ((line: string) => {
        console.log(line);
      }),
  };
}
