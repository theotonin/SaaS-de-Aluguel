import { test } from "node:test";
import assert from "node:assert/strict";
import { assertDeliveryWindow } from "../packages/domain/rental.ts";
import { clientAddress } from "../apps/api/client-address.ts";
test("physical delivery is blocked before withdrawal and at or after expected return", () => {
  const start = "2026-10-10T12:00:00Z",
    end = "2026-10-11T12:00:00Z";
  assert.throws(() => assertDeliveryWindow(start, end, "2026-10-10T11:59:00Z"));
  assert.throws(() => assertDeliveryWindow(start, end, end));
  assert.throws(() => assertDeliveryWindow(start, end, "2026-10-12T12:00:00Z"));
  assert.doesNotThrow(() => assertDeliveryWindow(start, end, start));
});
test("client address trusts only the configured proxy with a single valid forwarded address", () => {
  assert.equal(
    clientAddress("127.0.0.1", "203.0.113.10", "127.0.0.1"),
    "203.0.113.10",
  );
  assert.equal(
    clientAddress("203.0.113.20", "203.0.113.10", "127.0.0.1"),
    "203.0.113.20",
  );
  assert.equal(clientAddress("127.0.0.1", "203.0.113.10"), "127.0.0.1");
  assert.equal(clientAddress("127.0.0.1", "fake", "127.0.0.1"), "127.0.0.1");
  assert.equal(
    clientAddress("127.0.0.1", "203.0.113.10,203.0.113.20", "127.0.0.1"),
    "127.0.0.1",
  );
});
