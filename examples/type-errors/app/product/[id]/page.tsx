import type { RouteProps } from "paramour";

import { productRoute } from "./route.def";

export default async function ProductPage(props: RouteProps) {
  const { params, search } = await productRoute.parse(props);

  return (
    <main>
      <h1>Product #{params.id}</h1>
      <p>
        page {search.page}, q “{search.q}”
      </p>
    </main>
  );
}
