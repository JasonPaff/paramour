import Link from "next/link";
import { href } from "paramour";

import { galleryPhotoRoute } from "../gallery/[photoId]/route.def";
import { photos } from "../gallery/photos";

// The SLOT-LESS interception host (Next docs' feed/(..)photo shape): the
// (..)gallery/[photoId] folder below intercepts soft navigations to
// /gallery/[photoId] made from this page, rendering the inline preview in
// the children position — no @slot involved.
export default function FeedPage() {
  return (
    <main>
      <h1>Feed</h1>
      <p className="lede">
        Same links as the gallery grid, different interception: clicking here
        soft-navigates to <code>/gallery/[photoId]</code> but renders{" "}
        <code>feed/(..)gallery/[photoId]/page.tsx</code> in place of this page —
        no slot, no overlay. A hard load of the same URL renders the full
        gallery page.
      </p>
      <ul className="segments">
        {photos.map((photo) => (
          <li key={photo.id}>
            <Link
              href={href(galleryPhotoRoute, {
                params: { photoId: photo.id },
              })}
            >
              {photo.emoji} {photo.title} — {photo.caption}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
