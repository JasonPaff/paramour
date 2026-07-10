// The @modal slot's answer when nothing is intercepted: /gallery itself, and
// any HARD load of /gallery/[photoId] (interception only fires on soft
// navigation). Null keeps the overlay closed.
export default function ModalDefault() {
  return null;
}
