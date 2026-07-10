"use client";

import { useActionState } from "react";

import { jumpToProduct } from "./actions";

// The server-action pattern: the form posts to jumpToProduct, which decodes
// the raw field with safeDecodeParams and redirect(href(...))s on success.
// Only the error arm ever comes back here — useActionState renders it
// inline; a success never returns (redirect throws past this boundary).
export function JumpForm() {
  const [state, formAction, pending] = useActionState(jumpToProduct, {
    message: null,
  });

  return (
    <section className="panel">
      <h2>Server action → redirect(href(...))</h2>
      <form action={formAction} className="field">
        <label className="field">
          <span>
            product id — validated server-side with safeDecodeParams (grammar +
            the positiveInt Zod refinement)
          </span>
          <input defaultValue="4" inputMode="numeric" name="id" />
        </label>
        <button className="btn" disabled={pending} type="submit">
          Jump to product
        </button>
      </form>
      {state.message !== null && (
        <p className="alert" role="alert">
          params: {state.message}
        </p>
      )}
      <p className="hint">
        Try <code>0</code> or <code>abc</code>: the action runs the exact decode
        the destination page runs, so an id that fails here is an id that would
        have failed there — the redirect can never produce a dead link.
      </p>
    </section>
  );
}
