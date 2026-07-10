import { notFound } from "next/navigation";
import type { RouteProps } from "paramour";

import { galleryPhotoRoute } from "../../[photoId]/route.def";
import { getPhoto } from "../../photos";
import { PhotoModal } from "./photo-modal";

// The INTERCEPTED surface: a soft navigation to /gallery/[photoId] from
// inside the gallery renders this into the @modal slot instead of swapping
// the page. The URL is identical to the full page's, so the SAME route def
// decodes it — interception changes where the UI renders, never what the
// params are. The scanner sees neither folder (@ skip, then (.) skip, TR2);
// /gallery/[photoId] is in the artifact once, via the real page.
export default async function InterceptedPhotoPage(props: RouteProps) {
  const { photoId } = await galleryPhotoRoute.parseParams(props);
  const photo = getPhoto(photoId);
  if (!photo) notFound();

  return (
    <PhotoModal>
      <p className="eyebrow">intercepted — @modal/(.)[photoId]</p>
      <h2>
        {photo.emoji} {photo.title}
      </h2>
      <p>{photo.caption}</p>
      <p className="hint">
        The URL bar says /gallery/{photoId} — reload it and this overlay becomes
        the full page.
      </p>
    </PhotoModal>
  );
}
