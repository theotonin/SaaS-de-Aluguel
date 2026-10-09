import { test } from "node:test";
import assert from "node:assert/strict";
import { accessibleAccent, contrast } from "../apps/web/src/branding.ts";
test("custom branding preserves dark-surface and button-text contrast", () => {
  assert.equal(accessibleAccent("#acd5bd"), "#acd5bd");
  for (const color of ["#000000", "#302010", "#ff0000", "#0000ff", "#ffffff"]) {
    const accent = accessibleAccent(color);
    assert.ok(contrast(accent, "#1e2421") >= 4.5);
    assert.ok(contrast(accent, "#151918") >= 4.5);
  }
  assert.equal(accessibleAccent("invalid"), "#acd5bd");
});
