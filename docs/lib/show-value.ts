/** A thrown value's message, whatever was actually thrown. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : showValue(error);
}

/**
 * Renders a runtime value the way a reader would write it in source — shared
 * by the wire-format spec's `<WireExample>` (Part A) and the explorer's
 * result panes (Part B), so decoded values print identically everywhere.
 */
export function show(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null || value === undefined || typeof value !== "object") {
    return showValue(value);
  }
  if (value instanceof Date) return `Date("${value.toISOString()}")`;
  if (Array.isArray(value)) {
    return `[${value.map((element) => show(element)).join(", ")}]`;
  }
  const entries = Object.entries(value).map(
    ([key, entry]) => `${showKey(key)}: ${show(entry)}`,
  );
  return entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`;
}

/** String() hardened against values without a usable primitive conversion. */
export function showValue(value: unknown): string {
  try {
    return String(value);
  } catch {
    return `[unstringifiable ${typeof value}]`;
  }
}

function showKey(key: string): string {
  return /^[$A-Z_a-z][$\w]*$/.test(key) ? key : JSON.stringify(key);
}
