import { openDB } from 'idb';
import { normalizePromptIterationDraft } from './promptIterationService.js';

const DB_NAME = 'intelliextract';
const DB_VERSION = 2;
const memoryStores = new Map();

function createMemoryStore(name) {
  if (!memoryStores.has(name)) {
    memoryStores.set(name, new Map());
  }
  return memoryStores.get(name);
}

function createMemoryDb() {
  return {
    async put(storeName, value) {
      createMemoryStore(storeName).set(value.id, value);
    },
    async get(storeName, key) {
      return createMemoryStore(storeName).get(key);
    },
    async delete(storeName, key) {
      createMemoryStore(storeName).delete(key);
    },
    async getAll(storeName) {
      return Array.from(createMemoryStore(storeName).values());
    },
    async clear(storeName) {
      createMemoryStore(storeName).clear();
    },
    transaction(storeName) {
      const store = createMemoryStore(storeName);
      return {
        store: {
          async add(value) {
            const nextId = value.id ?? store.size + 1;
            store.set(nextId, { ...value, id: nextId });
            return nextId;
          },
          async getAll() {
            return Array.from(store.values());
          },
          async delete(key) {
            store.delete(key);
          }
        },
        done: Promise.resolve()
      };
    }
  };
}

function getDb() {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(createMemoryDb());
  }
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
  await db.put('files', {
    id,
    name,
    type,
    data: arrayBuffer,
    lastModified,
    size: arrayBuffer?.byteLength ?? null,
    uploadedAt: Date.now()
  });
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

// ── 快速验收模式结果持久化（固定 key，不依赖 runId）─────────────────────────

const VALIDATION_KEY = 'validation_comparison';
const VALIDATION_FIELD_MAPPINGS_KEY = 'validation_field_mappings';
const PROMPT_ITERATION_DRAFT_KEY = 'prompt_iteration_draft';
const PROMPT_ITERATION_HISTORY_KEY = 'prompt_iteration_history';
const PROMPT_ITERATION_FILE_TYPE = 'prompt_iteration_pdf';
const PROMPT_ITERATION_FILE_PREFIX = 'prompt_iteration__';

function getPromptIterationFileStorageId(fileId) {
  return `${PROMPT_ITERATION_FILE_PREFIX}${fileId}`;
}

function hasPersistablePromptIterationFile(item) {
  return Boolean(item?.file && typeof item.file.arrayBuffer === 'function');
}

export async function saveValidationResults(rows) {
  const db = await getDb();
  await db.put('phaseResults', { id: VALIDATION_KEY, rows, savedAt: Date.now() });
}

export async function getValidationResults() {
  const db = await getDb();
  const entry = await db.get('phaseResults', VALIDATION_KEY);
  return entry?.rows ?? null;
}

export async function clearValidationResults() {
  const db = await getDb();
  await db.delete('phaseResults', VALIDATION_KEY);
}

export async function saveValidationFieldMappings(fieldMappings) {
  const db = await getDb();
  await db.put('phaseResults', {
    id: VALIDATION_FIELD_MAPPINGS_KEY,
    fieldMappings,
    savedAt: Date.now()
  });
}

export async function getValidationFieldMappings() {
  const db = await getDb();
  const entry = await db.get('phaseResults', VALIDATION_FIELD_MAPPINGS_KEY);
  return entry?.fieldMappings ?? null;
}

export async function savePromptIterationDraft(draft) {
  const db = await getDb();
  await db.put('phaseResults', {
    id: PROMPT_ITERATION_DRAFT_KEY,
    draft,
    savedAt: Date.now()
  });
}

export async function getPromptIterationDraft() {
  const db = await getDb();
  const entry = await db.get('phaseResults', PROMPT_ITERATION_DRAFT_KEY);
  return entry?.draft ?? null;
}

export async function savePromptIterationDraftFiles(files) {
  const currentFiles = Array.isArray(files) ? files : [];
  const existingRecords = await listFiles(PROMPT_ITERATION_FILE_TYPE);
  const recordById = new Map(existingRecords.map((item) => [item.id, item]));
  const expectedIds = new Set(currentFiles.map((item) => getPromptIterationFileStorageId(item?.id || '')));

  await Promise.all(
    existingRecords
      .filter((item) => !expectedIds.has(item.id))
      .map((item) => deleteFile(item.id))
  );

  await Promise.all(currentFiles.map(async (item) => {
    if (!item?.id || !hasPersistablePromptIterationFile(item)) {
      return;
    }

    const storageId = getPromptIterationFileStorageId(item.id);
    const existing = recordById.get(storageId);
    const file = item.file;

    if (
      existing &&
      existing.name === file.name &&
      existing.type === PROMPT_ITERATION_FILE_TYPE &&
      existing.lastModified === (file.lastModified ?? null) &&
      existing.size === file.size
    ) {
      return;
    }

    const arrayBuffer = await file.arrayBuffer();
    await saveFile(storageId, file.name, PROMPT_ITERATION_FILE_TYPE, arrayBuffer, file.lastModified ?? null);
  }));
}

export async function restorePromptIterationDraftFiles(rawDraft) {
  const draft = normalizePromptIterationDraft(rawDraft);
  const restoredFiles = await Promise.all(draft.files.map(async (item) => {
    const record = await getFile(getPromptIterationFileStorageId(item.id));

    if (!record?.data) {
      return {
        ...item,
        file: null
      };
    }

    return {
      ...item,
      name: item.name || record.name || '',
      type: item.type || 'application/pdf',
      file: new File([record.data], record.name || item.name || 'restored.pdf', {
        type: 'application/pdf',
        lastModified: typeof record.lastModified === 'number' ? record.lastModified : Date.now()
      })
    };
  }));

  return {
    ...draft,
    files: restoredFiles
  };
}

export async function savePromptIterationHistory(history) {
  const db = await getDb();
  await db.put('phaseResults', {
    id: PROMPT_ITERATION_HISTORY_KEY,
    history,
    savedAt: Date.now()
  });
}

export async function getPromptIterationHistory() {
  const db = await getDb();
  const entry = await db.get('phaseResults', PROMPT_ITERATION_HISTORY_KEY);
  return entry?.history ?? [];
}
