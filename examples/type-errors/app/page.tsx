import Link from "next/link";
import { href } from "paramour";

import { productRoute } from "./product/[id]/route.def";

// The deliberately CORRECT consumer usage: everything outside cases/ must
// compile green, proving the harness's unexpected-diagnostic check bites.
export default function HomePage() {
  return (
    <main>
      <h1>type-errors — negative suite</h1>
      <p>
        This app is never built or served. It exists so that the files under{" "}
        <code>cases/</code> fail <code>tsc</code> with exactly the annotated
        diagnostics.
      </p>
      <Link
        href={href(productRoute, { params: { id: 42 }, search: { q: "demo" } })}
      >
        Product #42
      </Link>
    </main>
  );
}
