/**
 * Pins the phase strings hardcoded in `with-typed-routes.ts` (TR4 hermeticity
 * ruling: importing `next/constants` would make `next` a runtime dependency).
 *
 * Silent-failure guard. If a value ever diverged, `withTypedRoutes` would stop
 * matching either phase and fall through to pass-through: no codegen, no
 * watcher, no `strict` drift error — a total no-op with zero diagnostics.
 *
 * Next declares these as string-LITERAL types (`declare const
 * PHASE_PRODUCTION_BUILD = "phase-production-build"`), so a changed value is a
 * changed type and this file stops compiling. No runtime assertion needed.
 * A widened `string` type also fails here, which is the correct alarm.
 */
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from "next/constants";

export const _dev: "phase-development-server" = PHASE_DEVELOPMENT_SERVER;
export const _build: "phase-production-build" = PHASE_PRODUCTION_BUILD;
