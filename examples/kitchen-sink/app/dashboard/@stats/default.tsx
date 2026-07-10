// The slot's fallback for navigations its own tree doesn't match. /dashboard
// has no child routes, so this rarely renders — it exists because Next
// requires an answer for every slot on every URL under the layout.
export default function StatsDefault() {
  return null;
}
