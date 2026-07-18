/**
 * Test stub for `next/router`, wired in via a Vitest `alias` (root
 * `vitest.config.ts`) — the `next/navigation` stub's /pages twin. The
 * `__set*` helpers drive exactly what the pages hooks read, including the
 * unmounted state (`__setMounted(false)`) that reproduces `next/router`'s
 * App-Router throw (design-06 PR5).
 */

let currentAsPath = "/";
let currentIsReady = true;
let currentMounted = true;
let currentQuery: Record<string, string | string[]> = {};
let currentReplaceRejection: unknown;
let currentReplaceRejects = false;
let currentThrow: unknown;
let replaceCalls: string[] = [];

export function __getReplaceCalls(): readonly string[] {
  return replaceCalls;
}

export function __resetReplaceCalls(): void {
  replaceCalls = [];
}

export function __setAsPath(value: string): void {
  currentAsPath = value;
}

export function __setIsReady(value: boolean): void {
  currentIsReady = value;
}

export function __setMounted(value: boolean): void {
  currentMounted = value;
}

export function __setQuery(value: Record<string, string | string[]>): void {
  currentQuery = value;
}

// next/router's replace rejects on routine navigation aborts, marking the
// error `cancelled` (its internal abort discriminant); arming this
// reproduces that so tests can assert no unhandled rejection escapes.
export function __setReplaceRejects(value: boolean): void {
  currentReplaceRejects = value;
  currentReplaceRejection = undefined;
}

// A NON-cancelled rejection (render error, route-info failure): pages.ts
// must surface it instead of silently discarding the panel's edit.
export function __setReplaceRejectsWith(error: unknown): void {
  currentReplaceRejects = true;
  currentReplaceRejection = error;
}

// A foreign failure (anything OTHER than the unmounted error): pages.ts must
// let it propagate untranslated. `undefined` disarms it.
export function __setThrow(value: unknown): void {
  currentThrow = value;
}

export function useRouter(): {
  asPath: string;
  isReady: boolean;
  query: Record<string, string | string[]>;
  replace(url: string): Promise<boolean>;
} {
  if (currentThrow !== undefined) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- simulating arbitrary foreign throws (including non-Errors) is the point
    throw currentThrow;
  }
  if (!currentMounted) {
    // Verbatim prefix of next/router's real unmounted error; pages.ts
    // matches on the message to translate it (PR5).
    throw new Error(
      "NextRouter was not mounted. https://nextjs.org/docs/messages/next-router-not-mounted",
    );
  }
  return {
    asPath: currentAsPath,
    isReady: currentIsReady,
    query: currentQuery,
    replace(url: string): Promise<boolean> {
      replaceCalls.push(url);
      if (!currentReplaceRejects) return Promise.resolve(true);
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- next/router can reject with arbitrary values; reproducing that is the point
      return Promise.reject(
        currentReplaceRejection ??
          Object.assign(new Error("Route Cancelled"), { cancelled: true }),
      );
    },
  };
}
