/**
 * Test stub for `next/navigation`, wired in via a Vitest `alias` (root
 * `vitest.config.ts`) so the client hooks can be render-tested without
 * materializing Next in the workspace. The alias and the test's relative
 * import resolve to this same file, so the `__set*` helpers drive exactly what
 * the hooks read.
 */

let currentParams: null | Record<string, string | string[]> = {};
let currentPathname = "/";
let currentSearchParams = new URLSearchParams();
let replaceCalls: string[] = [];

export function __getReplaceCalls(): readonly string[] {
  return replaceCalls;
}

export function __resetReplaceCalls(): void {
  replaceCalls = [];
}

// `null` mirrors next/navigation's real return outside an App-Router tree
// (e.g. a hybrid app's pages-router initial render — Next issue #48058 family).
export function __setParams(
  value: null | Record<string, string | string[]>,
): void {
  currentParams = value;
}

export function __setPathname(value: string): void {
  currentPathname = value;
}

export function __setSearchParams(value: URLSearchParams): void {
  currentSearchParams = value;
}

export function useParams(): null | Record<string, string | string[]> {
  return currentParams;
}

// basePath-relative current pathname, mirroring the ambient view (the
// devtools `navigate` capability resolves search-only edits against it).
export function usePathname(): string {
  return currentPathname;
}

// Records the navigations driven through the devtools `navigate` capability
// (design-12 DT8); shape mirrors the ambient next-navigation.d.ts view.
export function useRouter(): { replace(href: string): void } {
  return {
    replace(href: string): void {
      replaceCalls.push(href);
    },
  };
}

export function useSearchParams(): URLSearchParams {
  return currentSearchParams;
}
