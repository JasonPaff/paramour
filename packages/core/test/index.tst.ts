import { expect, test } from "tstyche";

test("placeholder: tstyche harness runs", () => {
  expect<string>().type.toBeAssignableTo<number | string>();
});
