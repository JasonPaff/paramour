import type { ReactNode } from "react";

// The modal half of the interception pattern: @modal renders beside children.
// On a soft navigation to /gallery/[photoId] the slot's (.)[photoId] matches
// (the overlay); on a hard load it doesn't, default.tsx returns null, and the
// children slot shows the full page instead.
export default function GalleryLayout({
  children,
  modal,
}: {
  children: ReactNode;
  modal: ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
