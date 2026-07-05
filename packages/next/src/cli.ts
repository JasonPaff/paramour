#!/usr/bin/env node
import { runCli } from "./run-cli.js";

// The bin entry (TR7): all logic lives in run-cli.ts so tests never execute
// this statement. exitCode, not exit() — pending stdio writes must flush.
process.exitCode = await runCli(process.argv.slice(2));
