import type { RouteProps } from "paramour";

import { productRoute } from "../../../routes";

/**
 * The App Router build gate: `props: RouteProps` must survive Next 15.5's
 * generated `.next/types` page check (`checkFields<Diff<PageProps, ...>>`
 * requires `params` to be `Promise<any> | undefined` — a sync arm in the
 * props type fails `next build` there while compiling fine on 16, where the
 * check is gone). This page is the claim that paramour's own props type is
 * the documented default on every supported major, with no escape hatch to
 * Next's generated `PageProps` global.
 */
export default async function ProductPage(props: RouteProps) {
  const { params, search } = await productRoute.parse(props);
  return (
    <main>
      <h1>Product #{params.id}</h1>
      <p>{search.q ?? "no query"}</p>
    </main>
  );
}
