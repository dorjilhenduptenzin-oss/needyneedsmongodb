import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateOrderPayload,
  validateBatchCostPayload,
  buildOrderUpdate,
  buildBatchCostUpdate
} from './index.js';
import { distributeAdvanceAcrossItems } from '../utils/advanceDistribution.js';

test('order validation rejects missing orderId', () => {
  assert.throws(() => validateOrderPayload({
    customerName: 'Alice',
    batchName: 'BATCH-2025-01',
    productName: 'Rice',
    sellingPrice: 50,
    quantity: 2,
    advancePaid: 0,
    phoneNumber: '123',
    address: 'Test',
    transportMode: 'Keep at Shop'
  }));
});

test('order validation accepts valid order', () => {
  const result = validateOrderPayload({
    orderId: 'ORD-9001',
    groupId: 'G-1',
    createdAt: Date.now(),
    batchName: 'BATCH-2025-01',
    customerName: 'Alice',
    address: 'Test Street',
    phoneNumber: '1234567',
    productName: 'Rice',
    sellingPrice: 50,
    quantity: 2,
    advancePaid: 10,
    transportMode: 'Keep at Shop',
    isFullPaymentReceived: false,
    note: 'ok'
  });

  assert.equal(result.orderId, 'ORD-9001');
  assert.equal(result.quantity, 2);
});

test('order validation allows blank optional fields', () => {
  const result = validateOrderPayload({
    orderId: 'ORD-9002',
    batchName: 'BATCH-2025-01',
    customerName: '',
    address: '',
    phoneNumber: '',
    productName: '',
    sellingPrice: 0,
    quantity: 1,
    advancePaid: 0,
    transportMode: 'Keep at Shop',
    isFullPaymentReceived: false
  });

  assert.equal(result.customerName, '');
  assert.equal(result.address, '');
  assert.equal(result.phoneNumber, '');
  assert.equal(result.productName, '');
});

test('batch cost validation accepts valid record', () => {
  const result = validateBatchCostPayload({
    batchName: 'BATCH-2025-01',
    totalCostPrice: 125,
    oatInputValue: 5,
    deliveryFeeQuantity: 10,
    isPacked: true,
    packedAt: '2026-08-25T00:00:00.000Z'
  });

  assert.equal(result.batchName, 'BATCH-2025-01');
  assert.equal(result.totalCostPrice, 125);
  assert.equal(result.isPacked, true);
  assert.equal(result.packedAt, '2026-08-25T00:00:00.000Z');
});

test('batch cost update builder preserves packed status when unchanged', () => {
  const existing = {
    batchName: 'BATCH-2025-01',
    totalCostPrice: 125,
    oatInputValue: 5,
    deliveryFeeQuantity: 10,
    isPacked: false,
    packedAt: null,
    version: 1,
    isDeleted: false
  };

  const patched = buildBatchCostUpdate(existing, {
    isPacked: true,
    packedAt: '2026-08-25T00:00:00.000Z'
  });

  assert.equal(patched.isPacked, true);
  assert.equal(patched.packedAt, '2026-08-25T00:00:00.000Z');
  assert.equal(patched.totalCostPrice, 125);
});

test('update builder preserves untouched fields', () => {
  const existing = {
    orderId: 'ORD-100',
    batchName: 'BATCH-2025-01',
    customerName: 'Alice',
    address: 'Test Street',
    phoneNumber: '123',
    productName: 'Rice',
    sellingPrice: 100,
    quantity: 5,
    advancePaid: 0,
    transportMode: 'Keep at Shop',
    isFullPaymentReceived: false,
    version: 1,
    createdAt: Date.now(),
    id: 'ORD-100'
  };

  const patched = buildOrderUpdate(existing, {
    quantity: 6
  });

  assert.equal(patched.quantity, 6);
  assert.equal(patched.customerName, 'Alice');
  assert.equal(patched.phoneNumber, '123');
});

test('advance is split equally across all items in a multi-item order', () => {
  const values = distributeAdvanceAcrossItems(900, 6);
  assert.deepEqual(values, [150, 150, 150, 150, 150, 150]);

  const updatedValues = distributeAdvanceAcrossItems(900, 5);
  assert.deepEqual(updatedValues, [180, 180, 180, 180, 180]);
});
