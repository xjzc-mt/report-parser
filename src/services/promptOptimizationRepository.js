import {
  clearPromptOptimizationEntries,
  getPromptOptimizationTraceEntry,
  listPromptOptimizationRunEntries,
  listPromptOptimizationVersionEntries,
  savePromptOptimizationAssetEntry,
  savePromptOptimizationDatasetEntry,
  savePromptOptimizationRunEntry,
  savePromptOptimizationTraceEntry,
  savePromptOptimizationVersionEntry
} from './persistenceService.js';

export async function savePromptAsset(asset) {
  await savePromptOptimizationAssetEntry(asset);
  return asset;
}

export async function savePromptOptimizationDataset(dataset) {
  await savePromptOptimizationDatasetEntry(dataset);
  return dataset;
}

export async function savePromptVersion(version) {
  await savePromptOptimizationVersionEntry(version);
  return version;
}

export async function listPromptVersions() {
  const versions = await listPromptOptimizationVersionEntries();
  return [...versions].sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0));
}

export async function savePromptOptimizationRun(run) {
  await savePromptOptimizationRunEntry(run);
  return run;
}

export async function listPromptOptimizationRuns() {
  const runs = await listPromptOptimizationRunEntries();
  return [...runs].sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
}

export async function savePromptOptimizationTrace(runId, entries) {
  await savePromptOptimizationTraceEntry(runId, entries);
}

export async function getPromptOptimizationTrace(runId) {
  return (await getPromptOptimizationTraceEntry(runId))?.entries ?? [];
}

export async function clearPromptOptimizationData() {
  await clearPromptOptimizationEntries();
}
