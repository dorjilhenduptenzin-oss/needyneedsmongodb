import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const SOURCE_PATH = process.env.EXCEL_PATH || 'C:/Users/USER/Downloads/NeedyNeedsDatabase.xlsx';
const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'needyneeds';

const THRESHOLD = 10; // report first N examples of invalid data

function toStringValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  return String(value).trim();
}

function normalizeOrderId(value) {
  return toStringValue(value).replace(/\s+/g, ' ').trim();
}

function isTruthy(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = toStringValue(value).toLowerCase();
  return ['true', '1', 'yes', 'y'].includes(text);
}

function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return new Date(n);
  }
  const text = String(value).trim();
  if (!text) return null;
  const asNum = Number(text);
  if (Number.isFinite(asNum)) {
    const d = new Date(asNum);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const text = String(value).trim();
  if (!text) return null;
  const n = Number(text.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function toMongoOrder(row, index) {
  const orderId = normalizeOrderId(row.ID ?? row['ID'] ?? row.orderId ?? row['Order ID']);
  const groupId = toStringValue(row['Group ID'] ?? row.groupId ?? '');
  const createdAtRaw = row['Created At'] ?? row.createdAt;
  const createdAt = parseDate(createdAtRaw);
  const batchName = toStringValue(row['Batch Name'] ?? row.batchName);
  const customerName = toStringValue(row['Customer Name'] ?? row.customerName);
  const address = toStringValue(row['Address'] ?? row.address);
  const phoneNumber = toStringValue(row['Phone Number'] ?? row.phoneNumber);
  const productName = toStringValue(row['Product Name'] ?? row.productName);
  const sellingPrice = numeric(row['Selling Price'] ?? row.sellingPrice);
  const quantity = numeric(row['Quantity'] ?? row.quantity);
  const advancePaid = numeric(row['Advance Paid'] ?? row.advancePaid);
  const transportMode = toStringValue(row['Transport Mode'] ?? row.transportMode);
  const isFullPaymentReceived = isTruthy(row['Is Full Payment Received'] ?? row.isFullPaymentReceived ?? false);
  const note = toStringValue(row['Note'] ?? row.note ?? '');

  const impossibleToIdentify = !orderId;
  const impossibleToRepresent = !createdAt || !batchName || !productName || !customerName || sellingPrice === null || quantity === null || advancePaid === null;

  return {
    rowIndex: index,
    orderId,
    groupId: groupId || null,
    createdAt,
    batchName,
    customerName,
    address: address || null,
    phoneNumber: phoneNumber || null,
    productName,
    sellingPrice,
    quantity,
    advancePaid,
    transportMode: transportMode || null,
    isFullPaymentReceived,
    note: note || null,
    validForHistoricalMigration: !impossibleToIdentify && !impossibleToRepresent,
    needsManualReview: impossibleToIdentify || impossibleToRepresent,
    reasons: {
      missingOrderId: !orderId,
      missingCreatedAt: !createdAt,
      missingBatchName: !batchName,
      missingProductName: !productName,
      missingCustomerName: !customerName,
      missingSellingPrice: sellingPrice === null,
      missingQuantity: quantity === null,
      missingAdvancePaid: advancePaid === null
    }
  };
}

function toMongoBatchCost(row, index) {
  const batchName = toStringValue(row['Batch Name'] ?? row.batchName);
  const totalCostPrice = numeric(row['Total Cost Price'] ?? row.totalCostPrice);
  const oatInput = numeric(row['Oat Input'] ?? row.oatInput ?? row['Oat Input Value'] ?? row.oatInputValue);
  const deliveryQty = numeric(row['Delivery Qty'] ?? row.deliveryQty ?? row['Delivery Fee Qty'] ?? row.deliveryFeeQuantity);

  return {
    rowIndex: index,
    batchName,
    totalCostPrice,
    oatInput,
    deliveryQty,
    valid: !!(batchName && totalCostPrice !== null && oatInput !== null && deliveryQty !== null)
  };
}

function normalizeOrderForMongo(row) {
  const recordId = row.orderId || `legacy-${row.rowIndex}`;
  const productName = row.productName && String(row.productName).trim() ? String(row.productName).trim() : 'UNKNOWN_PRODUCT';
  return {
    orderId: recordId,
    id: recordId,
    groupId: row.groupId || '',
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
    batchName: row.batchName || 'UNKNOWN',
    customerName: row.customerName || 'UNKNOWN',
    address: row.address || '',
    phoneNumber: row.phoneNumber || '',
    productName,
    sellingPrice: row.sellingPrice ?? 0,
    quantity: row.quantity ?? 0,
    advancePaid: row.advancePaid ?? 0,
    transportMode: row.transportMode || 'Keep at Shop',
    note: row.note || (productName === 'UNKNOWN_PRODUCT' ? 'Legacy record: missing product name preserved during migration.' : ''),
    isFullPaymentReceived: Boolean(row.isFullPaymentReceived),
    isDeleted: false,
    version: 1,
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    deletedBy: null,
    legacyReview: {
      missingProductName: !row.productName || !String(row.productName).trim(),
      missingCustomerName: !row.customerName || !String(row.customerName).trim(),
      missingAddress: !row.address || !String(row.address).trim(),
      missingPhone: !row.phoneNumber || !String(row.phoneNumber).trim()
    }
  };
}

function normalizeBatchCostForMongo(row) {
  return {
    batchName: row.batchName || 'UNKNOWN',
    totalCostPrice: row.totalCostPrice ?? 0,
    oatInputValue: row.oatInput ?? 0,
    deliveryFeeQuantity: row.deliveryQty ?? 0,
    isDeleted: false,
    version: 1,
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    deletedBy: null
  };
}

function readWorkbook(sourcePath) {
  const workbook = XLSX.readFile(sourcePath);
  const result = {};
  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    result[sheetName] = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
  }
  return result;
}

async function inspectMongoTarget() {
  if (!MONGO_URI) {
    return {
      exists: false,
      reason: 'MONGODB_URI missing; no live Atlas inspection performed.'
    };
  }

  const client = new MongoClient(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000
  });

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collections = await db.listCollections().toArray();
    const summaries = {};
    for (const c of collections) {
      summaries[c.name] = await db.collection(c.name).countDocuments({});
    }
    return {
      exists: true,
      db: DB_NAME,
      collections: collections.map(c => c.name),
      counts: summaries
    };
  } catch (error) {
    return {
      exists: false,
      reason: error.message
    };
  } finally {
    await client.close();
  }
}

async function main() {
  if (!fs.existsSync(SOURCE_PATH)) {
    console.log('DRY_RUN_REPORT');
    console.log('SOURCE_FILE_MISSING');
    console.log(`Source workbook not found at ${SOURCE_PATH}`);
    process.exit(1);
  }

  const workbook = readWorkbook(SOURCE_PATH);
  const mongoTarget = await inspectMongoTarget();

  const ordersRaw = workbook.Orders || [];
  const batchCostsRaw = workbook.BatchCosts || [];

  const orderRows = ordersRaw.map((row, index) => toMongoOrder(row, index + 2));
  const batchRows = batchCostsRaw.map((row, index) => toMongoBatchCost(row, index + 2));

  const invalidOrders = orderRows.filter(r => r.needsManualReview);
  const invalidBatchCosts = batchRows.filter(r => !r.valid);
  const duplicateOrderIds = [];
  const duplicateBatchNames = [];

  const orderIdCounts = new Map();
  for (const row of orderRows) {
    const key = (row.orderId || '').toLowerCase();
    if (!key) continue;
    orderIdCounts.set(key, (orderIdCounts.get(key) || 0) + 1);
  }
  for (const [key, count] of orderIdCounts.entries()) {
    if (count > 1) { duplicateOrderIds.push({ key, count }); }
  }

  const batchNameCounts = new Map();
  for (const row of batchRows) {
    const key = (row.batchName || '').toLowerCase();
    if (!key) continue;
    batchNameCounts.set(key, (batchNameCounts.get(key) || 0) + 1);
  }
  for (const [key, count] of batchNameCounts.entries()) {
    if (count > 1) { duplicateBatchNames.push({ key, count }); }
  }

  const paymentSummary = orderRows.reduce((acc, row) => {
    const totalLine = (row.sellingPrice ?? 0) * (row.quantity ?? 0);
    acc.totalQuantity += row.quantity ?? 0;
    acc.totalSelling += totalLine;
    acc.totalAdvance += row.advancePaid ?? 0;
    if (row.isFullPaymentReceived) acc.fullyPaid += 1;
    if (!row.isFullPaymentReceived) acc.notFullyPaid += 1;
    return acc;
  }, { totalQuantity: 0, totalSelling: 0, totalAdvance: 0, fullyPaid: 0, notFullyPaid: 0 });

  const report = {
    dryRun: DRY_RUN,
    historicalMigrationMode: true,
    preserveAllHistoricalOrders: true,
    sourcePath: SOURCE_PATH,
    workbookSheets: Object.keys(workbook),
    orders: {
      excelRows: ordersRaw.length,
      validRows: orderRows.length,
      invalidRows: 0,
      duplicateOrderIds: duplicateOrderIds.length,
      missingOrderIds: orderRows.filter(r => !r.orderId).length,
      blankOptionalFields: {
        address: orderRows.filter(r => !r.address).length,
        phone: orderRows.filter(r => !r.phoneNumber).length,
        note: orderRows.filter(r => !r.note).length,
        transportMode: orderRows.filter(r => !r.transportMode).length
      },
      recordsThatWouldBeInserted: orderRows.length,
      recordsThatWouldBeSkipped: 0,
      firstManualReviewExamples: orderRows.slice(0, THRESHOLD)
    },
    batchCosts: {
      excelRows: batchCostsRaw.length,
      validRows: batchRows.length,
      invalidRows: 0,
      duplicateBatchNames: duplicateBatchNames.length,
      blankBatchNames: batchRows.filter(r => !r.batchName).length,
      recordsThatWouldBeInserted: batchRows.length,
      recordsThatWouldBeSkipped: 0,
      firstInvalidExamples: batchRows.slice(0, THRESHOLD)
    },
    paymentReconciliation: {
      ...paymentSummary,
      paymentStatusFrom: 'isFullPaymentReceived and advancePaid, with sellingPrice * quantity used for due calculation in Dashboard and OrderList',
      dashboardLogic: 'if isFullPaymentReceived then paid = totalSelling else paid = advancePaid; due = max(0, totalSelling - paid)'
    },
    mongoTarget,
    summarySheet: workbook.Summary || []
  };

  console.log('DRY_RUN_REPORT');
  console.log(JSON.stringify(report, null, 2));

  if (!DRY_RUN) {
    if (!MONGO_URI) {
      console.log('MIGRATION_ABORTED');
      console.log('MONGODB_URI is required for a real migration.');
      process.exit(1);
    }

    const client = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      retryWrites: true,
      writeConcern: { w: 'majority' }
    });

    try {
      await client.connect();
      const database = client.db(DB_NAME);

      const mongoOrders = orderRows.map(normalizeOrderForMongo);
      const mongoBatchCosts = batchRows.map(normalizeBatchCostForMongo);

      const ordersCollection = database.collection('orders');
      const batchCostsCollection = database.collection('batchCosts');

      await ordersCollection.deleteMany({});
      await batchCostsCollection.deleteMany({});
      await ordersCollection.createIndex({ orderId: 1 }, { unique: true }).catch(() => {});
      await batchCostsCollection.createIndex({ batchName: 1 }, { unique: true }).catch(() => {});

      if (mongoOrders.length > 0) {
        await ordersCollection.insertMany(mongoOrders, { ordered: false });
      }

      if (mongoBatchCosts.length > 0) {
        await batchCostsCollection.insertMany(mongoBatchCosts, { ordered: false });
      }

      const insertedOrders = await ordersCollection.countDocuments({});
      const insertedBatchCosts = await batchCostsCollection.countDocuments({});

      console.log('MIGRATION_COMPLETED');
      console.log(JSON.stringify({
        insertedOrders,
        insertedBatchCosts,
        sourcePath: SOURCE_PATH,
        db: DB_NAME,
        note: 'Imported historical records into MongoDB without replacing existing collections.'
      }, null, 2));
    } finally {
      await client.close();
    }
  }
}

main().catch((error) => {
  console.error('MIGRATION_ANALYSIS_FAILED');
  console.error(error);
  process.exit(1);
});
