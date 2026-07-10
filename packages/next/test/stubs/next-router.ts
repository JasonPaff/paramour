/**
 * Test stub for `next/router`, wired in via a Vitest `alias` (root
 * `vitest.config.ts`) — the `next/navigation` stub's /pages twin. The
 * `__set*` helpers drive exactly what the pages hooks read, including the
 * unmounted state (`__setMounted(false)`) that reproduces `next/router`'s
 * App-Router throw (design-06 PR5).
 */

let currentIsReady = true;
let currentMounted = true;
let currentQuery: Record<string, string | string[]> = {};
let currentThrow: unknown;

export function __setIsReady(value: boolean): void {
  currentIsReady = value;
}

export function __setMounted(value: boolean): void {
  currentMounted = value;
}

export function __setQuery(value: Record<string, string | string[]>): void {
  currentQuery = value;
}

// A foreign failure (anything OTHER than the unmounted error): pages.ts must
// let it propagate untranslated. `undefined` disarms it.
export function __setThrow(value: unknown): void {
  currentThrow = value;
}

export function useRouter(): {
  isReady: boolean;
  query: Record<string, string | string[]>;
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
  return { isReady: currentIsReady, query: currentQuery };
}
