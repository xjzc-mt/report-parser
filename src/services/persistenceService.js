import { openDB } from 'idb';

const DB_NAME = 'intelliextract';
const DB_VERSION = 2;

function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('pdfPages')) {
        db.createObjectStore('pdfPages', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('runState')) {
        db.createObjectStore('runState', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('results')) {
        db.createObjectStore('results', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('phaseResults')) {
        db.createObjectStore('phaseResults', { keyPath: 'id' });
      }
    }
  });
}

// ── files store ───────────────────────────────────────────────────────────────

export async function saveFile(id, name, type, arrayBuffer, lastModified = null) {
  const db = await getDb();
  await db.put('files', { id, name, type, data: arrayBuffer, lastModified, uploadedAt: Date.now() });
}

export async function getFile(id) {
  const db = await getDb();
  return db.get('files', id);
}

export async function deleteFile(id) {
  const db = await getDb();
  await db.delete('files', id);
}

export async function listFiles(type) {
  const db = await getDb();
  const all = await db.getAll('files');
  return type ? all.filter((f) => f.type === type) : all;
}

// ── pdfPages store ────────────────────────────────────────────────────────────

/** key 格式: "${reportName}[${pageRange}]" */
export async function savePdfPage(id, reportName, pageRange, pdfData) {
  const db = await getDb();
  await db.put('pdfPages', { id, reportName, pageRange, pdfData, savedAt: Date.now() });
}

export async function getPdfPage(id) {
  const db = await getDb();
  return db.get('pdfPages', id);
}

export async function deletePdfPage(id) {
  const db = await getDb();
  await db.delete('pdfPages', id);
}

export async function deletePdfPagesByReport(reportName) {
  const db = await getDb();
  const all = await db.getAll('pdfPages');
  await Promise.all(
    all.filter((p) => p.reportName === reportName).map((p) => db.delete('pdfPages', p.id))
  );
}

export async function listPdfPages() {
  const db = await getDb();
  return db.getAll('pdfPages');
}

// ── runState store ────────────────────────────────────────────────────────────

const RUN_STATE_KEY = 'current';

export async function saveRunState(state) {
  const db = await getDb();
  await db.put('runState', { id: RUN_STATE_KEY, ...state, updatedAt: Date.now() });
}

export async function getRunState() {
  const db = await getDb();
  return db.get('runState', RUN_STATE_KEY);
}

export async function clearRunState() {
  const db = await getDb();
  await db.delete('runState', RUN_STATE_KEY);
}

// ── results store ─────────────────────────────────────────────────────────────

export async function appendResults(runId, batchId, rows) {
  const db = await getDb();
  const tx = db.transaction('results', 'readwrite');
  await Promise.all(rows.map((row) => tx.store.add({ runId, batchId, row })));
  await tx.done;
}

export async function getAllResults(runId) {
  const db = await getDb();
  const all = await db.getAll('results');
  const filtered = runId ? all.filter((r) => r.runId === runId) : all;
  return filtered.map((r) => r.row);
}

export async function clearResults(runId) {
  const db = await getDb();
  if (!runId) {
    await db.clear('results');
    return;
  }
  const tx = db.transaction('results', 'readwrite');
  const all = await tx.store.getAll();
  await Promise.all(
    all.filter((r) => r.runId === runId).map((r) => tx.store.delete(r.id))
  );
  await tx.done;
}

// ── phaseResults store（comparison rows + final rows 整体持久化）─────────────

export async function saveComparisonRows(runId, rows) {
  const db = await getDb();
  await db.put('phaseResults', { id: `${runId}_comparison`, rows, savedAt: Date.now() });
}

export async function getComparisonRows(runId) {
  const db = await getDb();
  const entry = await db.get('phaseResults', `${runId}_comparison`);
  return entry?.rows ?? null;
}

export async function saveFinalRows(runId, rows) {
  const db = await getDb();
  await db.put('phaseResults', { id: `${runId}_final`, rows, savedAt: Date.now() });
}

export async function getFinalRows(runId) {
  const db = await getDb();
  const entry = await db.get('phaseResults', `${runId}_final`);
  return entry?.rows ?? null;
}

export async function clearPhaseResults(runId) {
  const db = await getDb();
  await db.delete('phaseResults', `${runId}_comparison`);
  await db.delete('phaseResults', `${runId}_final`);
}
