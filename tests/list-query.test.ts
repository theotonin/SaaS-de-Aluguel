import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePage, encodeCursor } from '../apps/api/list-query.ts';

test('list paging defaults to a bounded first page and caps client limits', () => {
  assert.deepEqual(parsePage(new URLSearchParams()), { page: 1, limit: 50, offset: 0, search: '', cursor: null });
  assert.deepEqual(parsePage(new URLSearchParams('page=3&limit=500&search=%20mesa%20')), { page: 3, limit: 100, offset: 200, search: 'mesa', cursor: null });
});

test('list paging rejects invalid page and limit values', () => {
  assert.throws(() => parsePage(new URLSearchParams('page=0')));
  assert.throws(() => parsePage(new URLSearchParams('limit=-1')));
  assert.throws(() => parsePage(new URLSearchParams('page=2.5')));
});

test('keyset cursors are bound to a sort and survive inserts before the cursor', () => {
  const cursor = encodeCursor('name', 'cadeira', '00000000-0000-4000-8000-000000000001');
  const page = parsePage(new URLSearchParams(`page=2&cursor=${encodeURIComponent(cursor)}`));
  assert.deepEqual(page.cursor, { sort: 'name', key: 'cadeira', id: '00000000-0000-4000-8000-000000000001' });
  assert.throws(() => parsePage(new URLSearchParams('cursor=not-base64-json')));
});
