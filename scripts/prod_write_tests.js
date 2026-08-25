import crypto from 'crypto';
// use global fetch available in Node 18+

const BASE = 'https://needyneedsmongodb.vercel.app/api';
const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');

async function run() {
  console.log('TEST_ID:', id);

  // Create order
  const order = {
    orderId: id,
    id,
    batchName: 'TEST-BATCH-1',
    customerName: 'CI Test',
    address: 'Test Address',
    phoneNumber: '000000',
    productName: 'Widget',
    sellingPrice: 123,
    quantity: 1,
    advancePaid: 0,
    transportMode: 'Keep at Shop'
  };

  try {
    const createRes = await fetch(`${BASE}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order) });
    const createJson = await createRes.text();
    console.log('CREATE_STATUS', createRes.status, createRes.statusText);
    console.log('CREATE_BODY', createJson);
    if (!createRes.ok) return;

    // Update order (change customerName)
    const updatePayload = { customerName: 'CI Test Updated', version: 1 };
    const updateRes = await fetch(`${BASE}/orders/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatePayload) });
    const updateJson = await updateRes.text();
    console.log('UPDATE_STATUS', updateRes.status);
    console.log('UPDATE_BODY', updateJson);
    if (!updateRes.ok) return;

    // Move order to another batch
    const movePayload = { batchName: 'TEST-BATCH-2', version: 2 };
    const moveRes = await fetch(`${BASE}/orders/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(movePayload) });
    const moveJson = await moveRes.text();
    console.log('MOVE_STATUS', moveRes.status);
    console.log('MOVE_BODY', moveJson);
    if (!moveRes.ok) return;

    // Delete order
    const delRes = await fetch(`${BASE}/orders/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const delJson = await delRes.text();
    console.log('DELETE_STATUS', delRes.status);
    console.log('DELETE_BODY', delJson);

  } catch (err) {
    console.error('ERROR', err);
  }

  // Batch cost create and update
  const batchName = `TEST-BATCH-COST-${Date.now()}`;
  const cost = { batchName, totalCostPrice: 1000, oatInputValue: 50, deliveryFeeQuantity: 0, isPacked: false };

  try {
    const createCostRes = await fetch(`${BASE}/batchCosts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cost) });
    console.log('BATCH_CREATE_STATUS', createCostRes.status);
    console.log('BATCH_CREATE_BODY', await createCostRes.text());
    if (!createCostRes.ok) return;

    const patchCost = { totalCostPrice: 1100, version: 1 };
    const updateCostRes = await fetch(`${BASE}/batchCosts/${encodeURIComponent(batchName)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patchCost) });
    console.log('BATCH_UPDATE_STATUS', updateCostRes.status);
    console.log('BATCH_UPDATE_BODY', await updateCostRes.text());

    // cleanup: delete batch cost
    const delCostRes = await fetch(`${BASE}/batchCosts/${encodeURIComponent(batchName)}`, { method: 'DELETE' });
    console.log('BATCH_DELETE_STATUS', delCostRes.status);
    console.log('BATCH_DELETE_BODY', await delCostRes.text());

  } catch (err) {
    console.error('BATCH_ERROR', err);
  }
}

run();
