import type { Metadata } from "next";
import type { RouteProps } from "paramour";

import Link from "next/link";
import { notFound } from "next/navigation";
import { encodeStaticParams, href } from "paramour";

import { getPhoto, photos } from "../photos";
import { galleryRoute } from "../route.def";
import { galleryPhotoRoute } from "./route.def";

export async function generateMetadata(props: RouteProps): Promise<Metadata> {
  const { photoId } = await galleryPhotoRoute.parseParams(props);
  return { title: `Photo #${String(photoId)} — gallery` };
}

// SSG: the photo set is finite, so every /gallery/[photoId] page prerenders.
// encodeStaticParams returns the codec's WIRE values ({ photoId: "1" }), NOT
// percent-encoded — Next encodes generateStaticParams values itself.
// dynamicParams stays default-true: /gallery/999 still renders on demand and
// getPhoto's miss becomes notFound().
export function generateStaticParams() {
  return photos.map((photo) =>
    encodeStaticParams(galleryPhotoRoute, { photoId: photo.id }),
  );
}

// The FULL-page surface: what a hard load / external link to
// /gallery/[photoId] renders. Soft navigations from inside /gallery never get
// here — the @modal interception catches them first.
export default async function PhotoPage(props: RouteProps) {
  const { photoId } = await galleryPhotoRoute.parseParams(props);
  const photo = getPhoto(photoId);
  if (!photo) notFound();

  return (
    <main>
      <p className="eyebrow">full page — hard load / external entry</p>
      <h1>
        {photo.emoji} {photo.title}
      </h1>
      <p className="lede">{photo.caption}</p>
      <dl className="kv">
        <dt>
          <code>params.photoId</code> — <code>p.integer()</code>
        </dt>
        <dd>
          {photoId} (typeof {typeof photoId}) — photo {photoId} of{" "}
          {photos.length}
        </dd>
      </dl>
      <p>
        <Link href={href(galleryRoute)}>← Back to the gallery</Link> — a soft
        navigation from there re-opens this photo as a modal.
      </p>
    </main>
  );
}
