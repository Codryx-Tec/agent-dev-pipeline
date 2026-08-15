import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSubtotal, applyTax } from '../src/invoice.js';

test('calculateSubtotal sums price times quantity across items', () => {
  const total = calculateSubtotal([
    { price: 10, qty: 2 },
    { price: 5, qty: 3 },
  ]);
  assert.equal(total, 35);
});

test('applyTax rounds to two decimal places', () => {
  assert.equal(applyTax(100, 0.075), 107.5);
});

// formatInvoice has no test. Nobody has come back for it since it shipped.
