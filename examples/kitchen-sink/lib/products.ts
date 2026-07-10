// A tiny in-memory catalog so the /products filter page has something real to
// filter. Deliberately not a data layer — the demo is the URL wiring, and the
// list exists only so filter edits visibly change the result set.

export interface Product {
  id: number;
  inStock: boolean;
  name: string;
  price: number;
  tags: readonly string[];
}

export const products: readonly Product[] = [
  {
    id: 1,
    inStock: true,
    name: "Braided USB-C Cable",
    price: 12.99,
    tags: ["braided", "usb-c"],
  },
  {
    id: 2,
    inStock: true,
    name: "Wireless Earbuds",
    price: 49.99,
    tags: ["audio", "wireless"],
  },
  {
    id: 3,
    inStock: false,
    name: "USB-C Wall Charger",
    price: 24.5,
    tags: ["usb-c"],
  },
  {
    id: 4,
    inStock: true,
    name: "Studio Headphones",
    price: 89,
    tags: ["audio"],
  },
  {
    id: 5,
    inStock: false,
    name: "Braided Lightning Cable",
    price: 14.99,
    tags: ["braided"],
  },
  {
    id: 6,
    inStock: true,
    name: "Wireless Charging Pad",
    price: 32,
    tags: ["usb-c", "wireless"],
  },
  {
    id: 7,
    inStock: false,
    name: "Portable Speaker",
    price: 59.99,
    tags: ["audio", "wireless"],
  },
];

/** Every tag in the catalog, for rendering the filter checkboxes. */
export const allTags = [
  ...new Set(products.flatMap((product) => product.tags)),
].sort();

/**
 * The slice of the decoded /products search output the filter logic needs.
 * Fields are `T | undefined` (not exact-optional) on purpose: that is the
 * shape useSearch hands back, so the decoded object passes straight in.
 */
export interface ProductFilters {
  inStock: boolean | undefined;
  q: string | undefined;
  sort: "name" | "newest" | "price";
  tags: readonly string[];
}

export function filterProducts(
  list: readonly Product[],
  filters: ProductFilters,
): Product[] {
  const query = filters.q?.toLowerCase() ?? "";
  const matched = list.filter(
    (product) =>
      product.name.toLowerCase().includes(query) &&
      (filters.inStock === undefined || product.inStock === filters.inStock) &&
      filters.tags.every((tag) => product.tags.includes(tag)),
  );
  return matched.sort((a, b) => {
    if (filters.sort === "price") return a.price - b.price;
    if (filters.sort === "newest") return b.id - a.id;
    return a.name.localeCompare(b.name);
  });
}
