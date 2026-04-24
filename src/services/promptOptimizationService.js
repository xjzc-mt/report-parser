import {
  createOptimizationDataset,
  createPromptVersion
} from '../utils/promptOptimizationModel.js';
import * as repository from './promptOptimizationRepository.js';
import { runPromptOptimizationEngine } from './promptOptimizationEngine.js';

export function createDatasetFromComparisonRows(
  { name, targetName, comparisonRows, pdfFileIds },
  deps = {}
) {
  return createOptimizationDataset({
    name,
    targetName,
    comparisonRows,
    pdfFileIds,
    sourceType: 'comparison_file'
  }, deps);
}

export async function startPromptOptimizationRun(input, deps = {}) {
  const repo = deps.repository ?? repository;
  const engine = deps.engine ?? runPromptOptimizationEngine;

  await repo.savePromptAsset?.(input.asset);
  await repo.savePromptOptimizationDataset?.(input.dataset);
  await repo.savePromptVersion?.(input.baselineVersion);

  const result = await engine({
    assetId: input.asset.id,
    baselineVersion: input.baselineVersion,
    datasetId: input.dataset.id,
    comparisonRows: input.dataset.comparisonRows,
    pdfFiles: input.pdfFiles,
    llmSettings: input.llmSettings
  }, deps.engineDeps);

  await repo.savePromptOptimizationRun(result.run);
  await repo.savePromptOptimizationTrace(result.run.id, result.run.traceEntries || []);

  return result;
}

export async function applyOptimizationCandidate({ asset, run, candidateId }, deps = {}) {
  const repo = deps.repository ?? repository;
  const candidate = (run.candidates || []).find((item) => item.id === candidateId);

  if (!candidate) {
    throw new Error('未找到待应用的候选 Prompt');
  }

  const version = createPromptVersion({
    assetId: asset.id,
    label: `优化版 ${new Date((deps.now?.() ?? Date.now())).toLocaleString()}`,
    userPromptTemplate: candidate.promptText,
    sourceType: 'optimized',
    metricsSnapshot: candidate.score
  }, deps);

  await repo.savePromptVersion(version);

  const nextRun = {
    ...run,
    appliedVersionId: version.id,
    bestCandidateId: candidateId,
    updatedAt: deps.now?.() ?? Date.now()
  };

  await repo.savePromptOptimizationRun(nextRun);
  return nextRun;
}
