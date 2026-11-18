import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distribute } from '../src/layout.js';

const cols = (items) => distribute(items).cols;

test('larguras da tabela do agentes.md §4', () => {
  assert.deepEqual(cols([{ weight: 62 }]), [12]);
  assert.deepEqual(cols([{ weight: 24 }, { weight: 8 }, { weight: 8 }]), [7, 3, 2]);
  assert.deepEqual(cols([{ weight: 13 }, { weight: 9 }, { weight: 8 }, { weight: 9 }]), [4, 3, 2, 3]);
  assert.deepEqual(cols([{ weight: 13 }, { weight: 9 }, { fixed: 2 }, { weight: 9 }]), [4, 3, 2, 3]);
  assert.deepEqual(cols([{ weight: 14 }, { weight: 10 }, { weight: 10 }]), [5, 4, 3]);
});

test('casos-limite', () => {
  assert.deepEqual(cols([{ fixed: 3 }, { fixed: 4 }]), [3, 4]);
  assert.ok(distribute([{ fixed: 8 }, { fixed: 6 }]).error);
  assert.ok(distribute(Array.from({ length: 13 }, () => ({ weight: 1 }))).error);
  assert.deepEqual(cols([{ weight: 100 }, { weight: 1 }]), [11, 1]);
});
