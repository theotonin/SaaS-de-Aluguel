import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rentalDays, availableQuantity, calculateTotal, assertTransition } from '../packages/domain/rental.ts';

const start = '2026-10-10T12:00:00Z';
const end = '2026-10-11T12:00:00Z';
test('daily price rounds partial days upward and rejects reversed dates', () => {
  assert.equal(rentalDays(start, end), 1);
  assert.equal(rentalDays(start, '2026-10-11T12:01:00Z'), 2);
  assert.throws(() => rentalDays(end, start));
  assert.throws(() => rentalDays(start, start));
  assert.throws(() => rentalDays('bad', end));
});
test('adjacent bookings do not overlap; canceled and draft bookings do not occupy stock', () => {
  assert.equal(availableQuantity(100, start, end, [
    { start: '2026-10-09T12:00:00Z', end: start, quantity: 70, status: 'confirmed' },
    { start, end, quantity: 90, status: 'draft' },
    { start, end, quantity: 80, status: 'canceled' },
    { start, end, quantity: 30, status: 'confirmed' },
  ], '2026-10-08T12:00:00Z'), 70);
});
test('availability uses peak concurrent occupation, not sum of disjoint reservations', () => {
  assert.equal(availableQuantity(100, start, end, [
    { start, end: '2026-10-10T18:00:00Z', quantity: 70, status: 'confirmed' },
    { start: '2026-10-10T18:00:00Z', end, quantity: 60, status: 'confirmed' },
  ], '2026-10-08T12:00:00Z'), 30);
});
test('overdue delivered items remain occupied until returned', () => {
  assert.equal(availableQuantity(10, start, end, [
    { start: '2026-10-08T12:00:00Z', end: '2026-10-09T12:00:00Z', quantity: 8, status: 'delivered' },
  ], '2026-10-10T13:00:00Z'), 2);
});
test('money is integer cents; quantity, discount and overflow are checked', () => {
  assert.equal(calculateTotal([{ quantity: 5, unitPrice: 1200 }], 2, 5000, 1000), 16000);
  assert.throws(() => calculateTotal([{ quantity: 0, unitPrice: 1200 }], 2, 0, 0));
  assert.throws(() => calculateTotal([{ quantity: 1, unitPrice: 1200 }], 1, 0, 1201));
  assert.throws(() => calculateTotal([{ quantity: 1, unitPrice: 1.5 }], 1, 0, 0));
  assert.throws(() => calculateTotal([{ quantity: Number.MAX_SAFE_INTEGER, unitPrice: 1200 }], 1, 0, 0));
});
test('rental lifecycle rejects skips, terminal changes and delivered cancellation', () => {
  assert.doesNotThrow(() => assertTransition('draft', 'confirmed'));
  assert.doesNotThrow(() => assertTransition('confirmed', 'separated'));
  assert.doesNotThrow(() => assertTransition('draft', 'canceled'));
  assert.throws(() => assertTransition('draft', 'delivered'));
  assert.throws(() => assertTransition('delivered', 'canceled'));
  assert.throws(() => assertTransition('canceled', 'confirmed'));
});
