import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesSearch } from "../apps/web/src/search.ts";

test("search ignores accents, case, extra whitespace and word order", () => {
  assert.equal(
    matchesSearch(
      "Cadeira Tiffany branca Mobiliário",
      "  BRANCA   mobiliario ",
    ),
    true,
  );
  assert.equal(
    matchesSearch("Painel modular Decoração", "decoracao painel"),
    true,
  );
  assert.equal(
    matchesSearch("Mesa redonda Mobiliário", "mesa inexistente"),
    false,
  );
  assert.equal(matchesSearch("Mesa", "   "), true);
});
test("customer search accepts formatted or unformatted phone numbers and email", () => {
  assert.equal(
    matchesSearch(
      "Marina Oliveira (11) 99999-0101 marina@example.test",
      "11999990101",
    ),
    true,
  );
  assert.equal(
    matchesSearch("Marina Oliveira 11999990101", "(11) 99999-0101"),
    true,
  );
  assert.equal(
    matchesSearch("Marina Oliveira (11) 99999-0101", "marina 0101"),
    true,
  );
  assert.equal(
    matchesSearch("Marina Oliveira marina@example.test", "marina@example.test"),
    true,
  );
  assert.equal(
    matchesSearch("Marina Oliveira (11) 99999-0101", "11999990102"),
    false,
  );
});
