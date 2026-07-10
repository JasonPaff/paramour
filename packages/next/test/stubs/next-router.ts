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

export function __setIsReady(value: boolean): void {
  currentIsReady = value;
}

export function __setMounted(value: boolean): void {
  currentMounted = value;
}

export function __setQuery(value: Record<string, string | string[]>): void {
  currentQuery = value;
}

export function useRouter(): {
  isReady: boolean;
  query: Record<string, string | string[]>;
} {
  if (!currentMounted) {
    // Verbatim prefix of next/router's real unmounted error; pages.ts
    // matches on the message to translate it (PR5).
    throw new Error(
      "NextRouter was not mounted. https://nextjs.org/docs/messages/next-router-not-mounted",
    );
  }
  return { isReady: currentIsReady, query: currentQuery };
}
