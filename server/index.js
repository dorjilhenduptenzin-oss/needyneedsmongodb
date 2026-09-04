import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';

dotenv.config();

// export the app for serverless adapters
// (export after app is defined)

const app = express();
const port = process.env.PORT || 4000;
const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'needyneeds';
const API_KEY = process.env.ADMIN_API_KEY || 'needyneeds-local-dev-key';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const isWriteRequest = (req) => {
  const provided = req.headers['x-api-key'] || req.headers['x-admin-key'];
  return String(provided || '') === API_KEY;
};

// Lightweight write protection removed per project request:
// Allow all requests through to write endpoints in production.
const requireWriteAccess = (req, res, next) => {
  // No-op authorization to allow writes from production frontend.
  return next();
};

// Cache the connection promise on globalThis so warm serverless invocations
// (and concurrent requests during a cold start) reuse one MongoClient/pool
// instead of opening a new one each time and exhausting Atlas connections.
async function connectMongo() {
  if (!mongoUri) {
    throw new Error('MONGODB_URI is missing. Add it in .env');
  }

  if (!globalThis.__needyMongoPromise) {
    globalThis.__needyMongoPromise = (async () => {
      const client = new MongoClient(mongoUri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        maxPoolSize: 10,
        retryWrites: true,
        writeConcern: { w: 'majority' }
      });
      await client.connect();
      const database = client.db(dbName);
      // Fire-and-forget: don't block the first request on index creation.
      ensureIndexes(database).catch((err) => {
        console.warn('ensureIndexes skipped:', err.message);
      });
      return database;
    })().catch((err) => {
      // Don't cache a rejected promise - allow the next request to retry.
      globalThis.__needyMongoPromise = undefined;
      throw err;
    });
  }

  return globalThis.__needyMongoPromise;
}

export function validateNumberField(value, fieldName, allowBlank = false) {
  if (value === undefined || value === null || value === '') {
    if (allowBlank) return 0;
    throw new Error(`${fieldName} is required.`);
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`${fieldName} must be a valid number.`);
  }

  return numberValue;
}

export function validateStringField(value, fieldName, minLength = 1) {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  if (text.length < minLength) {
    throw new Error(`${fieldName} is required.`);
  }
  return text;
}

export function validateOrderPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid order payload.');
  }

  const orderId = validateStringField(payload.orderId ?? payload.id, 'orderId');
  const batchName = validateStringField(payload.batchName, 'batchName');
  const customerName = validateStringField(payload.customerName ?? '', 'customerName', 0);
  const address = validateStringField(payload.address ?? '', 'address', 0);
  const phoneNumber = validateStringField(payload.phoneNumber ?? '', 'phoneNumber', 0);
  const productName = validateStringField(payload.productName ?? '', 'productName', 0);
  const createdAtValue = payload.createdAt ?? Date.now();
  const createdAt = createdAtValue instanceof Date
    ? createdAtValue
    : new Date(Number(createdAtValue) || new Date(createdAtValue).getTime());

  if (Number.isNaN(createdAt.getTime())) {
    throw new Error('createdAt must be a valid date or timestamp.');
  }

  const normalized = {
    orderId,
    id: orderId,
    groupId: String(payload.groupId ?? ''),
    createdAt: createdAt.toISOString(),
    batchName,
    customerName,
    address,
    phoneNumber,
    productName,
    sellingPrice: validateNumberField(payload.sellingPrice ?? 0, 'sellingPrice', true),
    quantity: validateNumberField(payload.quantity ?? 0, 'quantity', true),
    advancePaid: validateNumberField(payload.advancePaid ?? 0, 'advancePaid', true),
    transportMode: validateStringField(payload.transportMode ?? 'Keep at Shop', 'transportMode', 0),
    note: payload.note ?? '',
    isFullPaymentReceived: Boolean(payload.isFullPaymentReceived),
    isDeleted: Boolean(payload.isDeleted),
    version: Number.isInteger(Number(payload.version || 1)) ? Number(payload.version || 1) : 1,
    updatedAt: new Date().toISOString(),
    deletedAt: payload.deletedAt ? new Date(payload.deletedAt).toISOString() : null,
    deletedBy: payload.deletedBy || null
  };

  if (normalized.quantity <= 0) {
    throw new Error('quantity must be greater than 0.');
  }

  if (normalized.sellingPrice < 0 || normalized.advancePaid < 0) {
    throw new Error('sellingPrice and advancePaid must be zero or greater.');
  }

  return normalized;
}

export function validateBatchCostPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid batch cost payload.');
  }

  const batchName = validateStringField(payload.batchName, 'batchName');
  const totalCostPrice = validateNumberField(payload.totalCostPrice, 'totalCostPrice');
  const oatInputValue = validateNumberField(payload.oatInputValue, 'oatInputValue');
  const deliveryFeeQuantity = payload.deliveryFeeQuantity === undefined || payload.deliveryFeeQuantity === null || payload.deliveryFeeQuantity === ''
    ? 0
    : validateNumberField(payload.deliveryFeeQuantity, 'deliveryFeeQuantity');

  const isPacked = Boolean(payload.isPacked);
  const packedAt = payload.packedAt === undefined || payload.packedAt === null || payload.packedAt === ''
    ? (isPacked ? new Date().toISOString() : null)
    : new Date(payload.packedAt).toISOString();

  return {
    batchName,
    totalCostPrice,
    oatInputValue,
    deliveryFeeQuantity,
    isPacked,
    packedAt,
    isDeleted: Boolean(payload.isDeleted),
    version: Number.isInteger(Number(payload.version || 1)) ? Number(payload.version || 1) : 1,
    updatedAt: new Date().toISOString(),
    deletedAt: payload.deletedAt ? new Date(payload.deletedAt).toISOString() : null,
    deletedBy: payload.deletedBy || null
  };
}

export function buildOrderUpdate(currentDoc, patch) {
  const merged = { ...currentDoc, ...patch };
  const nextDoc = validateOrderPayload(merged);
  nextDoc.version = Number(currentDoc.version || 0) + 1;
  nextDoc.updatedAt = new Date().toISOString();
  nextDoc.isDeleted = Boolean(nextDoc.isDeleted);
  return nextDoc;
}

export function buildBatchCostUpdate(currentDoc, patch) {
  const merged = { ...currentDoc, ...patch };
  const nextDoc = validateBatchCostPayload(merged);
  nextDoc.version = Number(currentDoc.version || 0) + 1;
  nextDoc.updatedAt = new Date().toISOString();
  nextDoc.isDeleted = Boolean(nextDoc.isDeleted);
  return nextDoc;
}

async function ensureIndexes(database) {
  const duplicateOrders = await database.collection('orders').aggregate([
    { $group: { _id: '$orderId', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();

  if (duplicateOrders.length > 0) {
    console.warn('Duplicate orderId values detected; unique order index creation was skipped until duplicates are resolved.');
  } else {
    await database.collection('orders').createIndex({ orderId: 1 }, { unique: true }).catch(() => {});
  }

  const duplicateCosts = await database.collection('batchCosts').aggregate([
    { $group: { _id: '$batchName', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();

  if (duplicateCosts.length > 0) {
    console.warn('Duplicate batchName values detected; unique batch index creation was skipped until duplicates are resolved.');
  } else {
    await database.collection('batchCosts').createIndex({ batchName: 1 }, { unique: true }).catch(() => {});
  }

  await database.collection('orders').createIndex({ batchName: 1 }).catch(() => {});
  await database.collection('orders').createIndex({ createdAt: -1 }).catch(() => {});
  await database.collection('batchCosts').createIndex({ batchName: 1 }).catch(() => {});
  await database.collection('summary').createIndex({ month: 1, batches: 1 }).catch(() => {});
}

app.get('/api/health', async (req, res) => {
  try {
    await connectMongo();
    res.json({ ok: true, db: dbName });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'MongoDB connection unavailable.' });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const database = await connectMongo();

    // Optional pagination: ?limit=&skip= over the same createdAt-desc order.
    // With no params the response is unchanged (every order), so older clients
    // and any non-paginating caller keep working exactly as before.
    const rawLimit = Number(req.query.limit);
    const rawSkip = Number(req.query.skip);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 5000) : 0;
    const skip = Number.isFinite(rawSkip) && rawSkip > 0 ? Math.floor(rawSkip) : 0;

    // Sort by createdAt only so the existing createdAt_-1 index streams the
    // result. Rare ties at a page boundary are de-duped by id on the client.
    let cursor = database.collection('orders')
      .find({ isDeleted: { $ne: true } })
      .sort({ createdAt: -1 });
    if (skip) cursor = cursor.skip(skip);
    if (limit) cursor = cursor.limit(limit);

    const orders = await cursor.toArray();
    res.json(orders.map((entry) => ({ ...entry, createdAt: entry.createdAt ? new Date(entry.createdAt).getTime() : Date.now() })));
  } catch (error) {
    res.status(500).json({ error: 'Unable to load orders.' });
  }
});

app.post('/api/orders', requireWriteAccess, async (req, res) => {
  try {
    const payload = validateOrderPayload(req.body);
    const database = await connectMongo();
    const existing = await database.collection('orders').findOne({ orderId: payload.orderId, isDeleted: { $ne: true } });

    if (existing) {
      return res.status(409).json({ error: 'An order with this orderId already exists.' });
    }

    const created = {
      ...payload,
      createdAt: new Date(payload.createdAt).toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      version: 1
    };

    await database.collection('orders').insertOne(created);
    res.status(201).json({ ok: true, order: created, message: 'Order created successfully.' });
  } catch (error) {
    const message = error.message || 'Unable to create order.';
    res.status(400).json({ error: message });
  }
});

app.patch('/api/orders/:orderId', requireWriteAccess, async (req, res) => {
  try {
    const orderId = String(req.params.orderId || req.body.orderId || req.body.id || '');
    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required.' });
    }

    const database = await connectMongo();
    const current = await database.collection('orders').findOne({ orderId, isDeleted: { $ne: true } });
    if (!current) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const incomingVersion = req.body && req.body.version !== undefined ? Number(req.body.version) : current.version || 1;
    if (incomingVersion !== Number(current.version || 1)) {
      return res.status(409).json({ error: 'This order was modified by another user. Please reload the order before saving.' });
    }

    const patch = validateOrderPayload({ ...current, ...req.body, orderId, id: orderId, version: current.version || 1 });
    const next = buildOrderUpdate(current, patch);

    const updated = await database.collection('orders').findOneAndUpdate(
      { _id: current._id },
      { $set: next },
      { returnDocument: 'after' }
    );

    // mongodb driver v6: findOneAndUpdate returns the document directly (or null),
    // not a { value } wrapper, unless includeResultMetadata:true is passed.
    res.json({ ok: true, order: updated, message: 'Order updated successfully.' });
  } catch (error) {
    const message = error.message || 'Unable to update order.';
    res.status(400).json({ error: message });
  }
});

app.delete('/api/orders/:orderId', requireWriteAccess, async (req, res) => {
  try {
    const orderId = String(req.params.orderId || '');
    const database = await connectMongo();
    // Try to mark deleted by orderId first (common case)
    let result = await database.collection('orders').findOneAndUpdate(
      { orderId, isDeleted: { $ne: true } },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date().toISOString(),
          deletedBy: req.headers['x-admin-key'] || 'system',
          updatedAt: new Date().toISOString()
        }
      },
      { returnDocument: 'after' }
    );

    // If not found, attempt to interpret orderId as an ObjectId and try again
    if (!result) {
      try {
        const { ObjectId } = await import('mongodb');
        if (ObjectId.isValid(orderId)) {
          result = await database.collection('orders').findOneAndUpdate(
            { _id: new ObjectId(orderId), isDeleted: { $ne: true } },
            {
              $set: {
                isDeleted: true,
                deletedAt: new Date().toISOString(),
                deletedBy: req.headers['x-admin-key'] || 'system',
                updatedAt: new Date().toISOString()
              }
            },
            { returnDocument: 'after' }
          );
        }
      } catch (e) {
        // ignore and continue
      }
    }

    // If still not found, attempt a permissive update (idempotent) to set isDeleted=true for any matching orderId
    if (!result) {
      const updateRes = await database.collection('orders').updateMany(
        { orderId },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date().toISOString(),
            deletedBy: req.headers['x-admin-key'] || 'system',
            updatedAt: new Date().toISOString()
          }
        }
      );

      if (updateRes.modifiedCount > 0) {
        // Return a synthetic response indicating success
        return res.json({ ok: true, deleted: true, modifiedCount: updateRes.modifiedCount, message: 'Order(s) marked deleted.' });
      }

      // Nothing matched; return 404 to inform caller
      return res.status(404).json({ error: 'Order not found.' });
    }

    res.json({ ok: true, deleted: true, order: result, message: 'Order deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Unable to delete order.' });
  }
});

app.post('/api/orders/:orderId/restore', requireWriteAccess, async (req, res) => {
  try {
    const orderId = String(req.params.orderId || '');
    const database = await connectMongo();
    const result = await database.collection('orders').findOneAndUpdate(
      { orderId },
      {
        $set: {
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          updatedAt: new Date().toISOString()
        }
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    res.json({ ok: true, restored: true, order: result, message: 'Order restored successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Unable to restore order.' });
  }
});

app.get('/api/batchCosts', async (req, res) => {
  try {
    const database = await connectMongo();
    const rows = await database.collection('batchCosts').find({ isDeleted: { $ne: true } }).toArray();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Unable to load batch costs.' });
  }
});

app.post('/api/batchCosts', requireWriteAccess, async (req, res) => {
  try {
    const payload = validateBatchCostPayload(req.body);
    const database = await connectMongo();
    const ifExists = await database.collection('batchCosts').findOne({ batchName: payload.batchName, isDeleted: { $ne: true } });

    if (ifExists) {
      return res.status(409).json({ error: 'A batch cost with this batchName already exists.' });
    }

    const created = {
      ...payload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      version: 1
    };

    await database.collection('batchCosts').insertOne(created);
    res.status(201).json({ ok: true, batchCost: created, message: 'Batch cost created successfully.' });
  } catch (error) {
    const message = error.message || 'Unable to create batch cost.';
    res.status(400).json({ error: message });
  }
});

app.patch('/api/batchCosts/:batchName', requireWriteAccess, async (req, res) => {
  try {
    const batchName = String(req.params.batchName || req.body.batchName || '');
    if (!batchName) {
      return res.status(400).json({ error: 'batchName is required.' });
    }

    const database = await connectMongo();
    const current = await database.collection('batchCosts').findOne({ batchName, isDeleted: { $ne: true } });
    if (!current) {
      return res.status(404).json({ error: 'Batch cost not found.' });
    }

    const incomingVersion = req.body && req.body.version !== undefined ? Number(req.body.version) : current.version || 1;
    if (incomingVersion !== Number(current.version || 1)) {
      return res.status(409).json({ error: 'This batch cost was modified by another user. Please reload before saving.' });
    }

    const patch = validateBatchCostPayload({ ...current, ...req.body, batchName, version: current.version || 1 });
    const next = buildBatchCostUpdate(current, patch);

    const updated = await database.collection('batchCosts').findOneAndUpdate(
      { _id: current._id },
      { $set: next },
      { returnDocument: 'after' }
    );

    res.json({ ok: true, batchCost: updated, message: 'Batch cost updated successfully.' });
  } catch (error) {
    const message = error.message || 'Unable to update batch cost.';
    res.status(400).json({ error: message });
  }
});

app.delete('/api/batchCosts/:batchName', requireWriteAccess, async (req, res) => {
  try {
    const batchName = String(req.params.batchName || '');
    const database = await connectMongo();
    const result = await database.collection('batchCosts').findOneAndUpdate(
      { batchName, isDeleted: { $ne: true } },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date().toISOString(),
          deletedBy: req.headers['x-admin-key'] || 'system',
          updatedAt: new Date().toISOString()
        }
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(404).json({ error: 'Batch cost not found.' });
    }

    res.json({ ok: true, deleted: true, batchCost: result, message: 'Batch cost deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Unable to delete batch cost.' });
  }
});

app.get('/api/summary', async (req, res) => {
  try {
    const database = await connectMongo();
    const items = await database.collection('summary').find({}).toArray();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Unable to load summary.' });
  }
});

app.post('/api/summary', requireWriteAccess, async (req, res) => {
  try {
    const database = await connectMongo();
    const entry = req.body;
    const filter = { month: entry.month, batches: entry.batches };
    await database.collection('summary').updateOne(filter, { $set: { ...entry, updatedAt: new Date().toISOString() } }, { upsert: true });
    res.json({ ok: true, message: 'Summary saved successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Unable to save summary.' });
  }
});

const isDirectServerRun = (() => {
  if (!process.argv[1]) {
    return false;
  }

  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

export default app;

if (isDirectServerRun) {
  app.listen(port, () => {
    // connectMongo() now runs ensureIndexes() internally.
    connectMongo()
      .then(() => console.log(`Mongo API running on http://localhost:${port}`))
      .catch((error) => {
        console.error('Mongo startup failed:', error.message);
      });
  });
}

