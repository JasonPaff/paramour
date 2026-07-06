/**
 * Test stub for `next/navigation`, wired in via a Vitest `alias` (root
 * `vitest.config.ts`) so the client hooks can be render-tested without
 * materializing Next in the workspace. The alias and the test's relative
 * import resolve to this same file, so the `__set*` helpers drive exactly what
 * the hooks read.
 */

let currentParams: Record<string, string | string[]> = {};
let currentSearchParams = new URLSearchParams();

export function __setParams(value: Record<string, string | string[]>): void {
  currentParams = value;
}

export function __setSearchParams(value: URLSearchParams): void {
  currentSearchParams = value;
}

export function useParams(): Record<string, string | string[]> {
  return currentParams;
}

export function useSearchParams(): URLSearchParams {
  return currentSearchParams;
}
