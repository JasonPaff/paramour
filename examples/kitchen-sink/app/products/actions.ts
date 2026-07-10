"use server";

import { redirect } from "next/navigation";
import { href, safeDecodeParams } from "paramour";

import { productsRoute } from "./[id]/route.def";

export interface JumpFormState {
  message: null | string;
}

// A server action is one more place a Href flows. The raw form field is
// validated with the SAME decode the destination page runs — grammar
// (p.integer) plus the positiveInt Zod refinement — so a success here
// guarantees /products/[id] will decode on arrival: the action cannot build
// a redirect its own target rejects.
export async function jumpToProduct(
  _previous: JumpFormState,
  formData: FormData,
): Promise<JumpFormState> {
  const raw = formData.get("id");
  // safeDecodeParams is sync — an action holds raw strings, not the props
  // promises the route methods await. The source record is the same shape
  // Next hands a page's `params`.
  const result = safeDecodeParams(productsRoute, {
    id: typeof raw === "string" ? raw : "",
  });
  if (result.status === "error") {
    // The error arm feeds useActionState and re-renders inline — a bad id
    // never navigates anywhere.
    return { message: result.error.message };
  }
  // redirect() throws internally, so it must stay OUTSIDE any try/catch;
  // Href is a string subtype, so the branded value flows in with no cast.
  redirect(href(productsRoute, { params: { id: result.data.id } }));
}
