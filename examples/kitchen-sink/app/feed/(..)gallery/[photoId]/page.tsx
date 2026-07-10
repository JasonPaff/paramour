import Link from "next/link";
import { notFound } from "next/navigation";
import { href, type RouteProps } from "paramour";

import { galleryPhotoRoute } from "../../../gallery/[photoId]/route.def";
import { getPhoto } from "../../../gallery/photos";
import { feedRoute } from "../../route.def";

// The inline preview: (..) reaches one URL level above /feed — the root — so
// this intercepts /gallery/[photoId]. It renders in the children position
// (replacing the feed page) rather than in a slot. Params decode through the
// same galleryPhotoRoute def as the full page and the @modal overlay: three
// surfaces, one URL shape, one artifact entry.
export default async function FeedPreviewPage(props: RouteProps) {
  const { photoId } = await galleryPhotoRoute.parseParams(props);
  const photo = getPhoto(photoId);
  if (!photo) notFound();

  return (
    <main>
      <p className="eyebrow">intercepted — feed/(..)gallery/[photoId]</p>
      <h1>
        {photo.emoji} {photo.title}
      </h1>
      <p className="lede">{photo.caption}</p>
      <p className="hint">
        The URL bar says /gallery/{photoId}; reload for the full page, or{" "}
        <Link href={href(feedRoute)}>go back to the feed</Link>.
      </p>
    </main>
  );
}
