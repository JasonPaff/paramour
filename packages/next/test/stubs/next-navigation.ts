/**
 * Test stub for `next/navigation`, wired in via a Vitest `alias` (root
 * `vitest.config.ts`) so the client hooks can be render-tested without
 * materializing Next in the workspace. The alias and the test's relative
 * import resolve to this same file, so the `__set*` helpers drive exactly what
 * the hooks read.
 */

let currentParams: null | Record<string, string | string[]> = {};
let currentSearchParams = new URLSearchParams();

// `null` mirrors next/navigation's real return outside an App-Router tree
// (e.g. a hybrid app's pages-router initial render — Next issue #48058 family).
export function __setParams(
  value: null | Record<string, string | string[]>,
): void {
  currentParams = value;
}

export function __setSearchParams(value: URLSearchParams): void {
  currentSearchParams = value;
}

export function useParams(): null | Record<string, string | string[]> {
  return currentParams;
}

export function useSearchParams(): URLSearchParams {
  return currentSearchParams;
}
