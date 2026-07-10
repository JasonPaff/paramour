import Link from "next/link";
import { href } from "paramour";

import { galleryPhotoRoute } from "./[photoId]/route.def";
import { photos } from "./photos";

export default function GalleryPage() {
  return (
    <main>
      <h1>Gallery</h1>
      <p className="lede">
        Every card links to <code>/gallery/[photoId]</code>. Clicking here (a
        soft navigation) opens the <code>@modal/(.)[photoId]</code> interception
        as an overlay; reloading that URL — or arriving from outside — renders
        the full page. Same URL, same route def, two surfaces.
      </p>
      <ul className="cards">
        {photos.map((photo) => (
          <li className="card" key={photo.id}>
            <Link
              className="card__path"
              href={href(galleryPhotoRoute, {
                params: { photoId: photo.id },
              })}
            >
              {photo.emoji} {photo.title}
            </Link>
            <p>{photo.caption}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
