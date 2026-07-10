"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

// The client shell around the intercepted content: dismissing is
// router.back(), which restores /gallery — the modal was only ever a history
// entry. The backdrop and the ✕ both dismiss; clicks inside the dialog stay.
export function PhotoModal({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        router.back();
      }}
    >
      <div
        aria-modal="true"
        className="modal"
        onClick={(event) => {
          event.stopPropagation();
        }}
        role="dialog"
      >
        <button
          aria-label="Close"
          className="btn modal__close"
          onClick={() => {
            router.back();
          }}
          type="button"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
