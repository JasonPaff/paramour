import { defineAppRoute, p, type SearchConfig } from "paramour";

// The list route beside [id]/: the URL-as-state filter page. The config is
// exported on its own so the client panel can name its form-state type with
// InferSearchInput<typeof productsListSearch>. Keys alphabetized (ESLint
// perfectionist).
export const productsListSearch = {
  // Tri-state stock filter: absent = "any" — the select's empty choice
  // removes the key rather than inventing a third wire value.
  inStock: p.boolean().optional(),
  // Value .default(): page=1 never appears in a built URL (D8).
  page: p.integer().default(1),
  // Plain p.string, NOT the min-2 searchQuery schema the detail route uses:
  // this key is written on a debounce while the user types, and a 1-char
  // draft would flip useSearch into its error arm mid-keystroke.
  q: p.string().optional(),
  // .default("name") elides too — the canonical URL for the default view is
  // bare /products.
  sort: p.enum(["name", "newest", "price"]).default("name"),
  // Arity-"many": ?tags=a&tags=b ⇄ ["a","b"]; [] ≡ absent (S6), so clearing
  // every checkbox cleans the URL.
  tags: p.stringArray(),
} satisfies SearchConfig;

export const productsListRoute = defineAppRoute("/products", {
  search: productsListSearch,
});
