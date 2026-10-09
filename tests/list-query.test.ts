import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePage } from '../apps/api/list-query.ts';

test('list paging defaults to a bounded first page and caps client limits', () => {
  assert.deepEqual(parsePage(new URLSearchParams()), { page: 1, limit: 50, offset: 0, search: '' });
  assert.deepEqual(parsePage(new URLSearchParams('page=3&limit=500&search=%20mesa%20')), { page: 3, limit: 100, offset: 200, search: 'mesa' });
});

test('list paging rejects invalid page and limit values', () => {
  assert.throws(() => parsePage(new URLSearchParams('page=0')));
  assert.throws(() => parsePage(new URLSearchParams('limit=-1')));
  assert.throws(() => parsePage(new URLSearchParams('page=2.5')));
});
