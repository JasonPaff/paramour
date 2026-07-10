/**
 * Compile-time guard for the hand-authored `next/navigation` ambient
 * (`src/types/next-navigation.d.ts`).
 *
 * Deliberately NOT a `*.test.ts`: vitest matches `test/**\/*.test.ts`, so this
 * module never runs. Its assertions ARE the test, enforced by
 * `pnpm --filter @paramour-js/next typecheck`, whose tsconfig includes `test/`.
 * It lives here rather than beside the ambient because `tsconfig.build.json`
 * compiles `src/` into `dist/` — an assertion module there would ship.
 *
 * The ambient is where paramour states what it believes `next/navigation`
 * returns, and `app.ts` forwards those values (after coalescing `null` → `{}`)
 * into core's decoders. So the ambient's params type must be EXACTLY
 * `ParamsSource | null`: the non-null half any narrower and the hooks read real
 * params through a type that lies about them (real Next's `Params` admits
 * `undefined`); any wider and `app.ts` stops compiling. The `null` member is
 * the outside-an-App-Router-tree return (Next #48058/#64952) `app.ts` handles.
 *
 * `examples/next-compat` owns the other half — that *real* Next still returns
 * something assignable to `ParamsSource` — on every supported major.
 */
import type { useParams, useSearchParams } from "next/navigation";
import type { ParamsSource } from "paramour";

type AmbientParams = ReturnType<typeof useParams>;
type AmbientSearch = ReturnType<typeof useSearchParams>;

// `declare const` rather than `{} as T`: an empty object literal is assignable
// to these types on its own, so the assertion would be a no-op that lint
// (correctly) flags — and, worse, would not test the direction it claims to.
declare const ambientParamsNonNull: NonNullable<AmbientParams>;
declare const ambientSearch: AmbientSearch;
declare const paramsSource: ParamsSource;

// Mutual assignability of the NON-NULL half == the ambient's params type is
// exactly `ParamsSource | null`.
export const _ambientIsWideEnough: NonNullable<AmbientParams> = paramsSource;
export const _ambientIsNarrowEnough: ParamsSource = ambientParamsNonNull;
/** The `null` member is present (the outside-an-App-Router-tree return). */
export const _ambientAdmitsNull: AmbientParams = null;

/** The search half is a plain `URLSearchParams` (real Next returns a subclass). */
export const _ambientSearchIsUrlSearchParams: URLSearchParams = ambientSearch;
