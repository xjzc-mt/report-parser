import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearPromptOptimizationData,
  getPromptOptimizationTrace,
  listPromptOptimizationRuns,
  listPromptVersions,
  savePromptAsset,
  savePromptOptimizationDataset,
  savePromptOptimizationRun,
  savePromptOptimizationTrace,
  savePromptVersion
} from '../src/services/promptOptimizationRepository.js';

test('Prompt 自动优化 run 可保存并列出', async () => {
  await clearPromptOptimizationData();
  await savePromptOptimizationRun({
    id: 'run_1',
    assetId: 'asset_1',
    baselineVersionId: 'pver_1',
    datasetId: 'pods_1',
    status: 'completed',
    updatedAt: 1
  });
  await savePromptOptimizationRun({
    id: 'run_2',
    assetId: 'asset_1',
    baselineVersionId: 'pver_2',
    datasetId: 'pods_2',
    status: 'completed',
    updatedAt: 2
  });

  const runs = await listPromptOptimizationRuns();
  assert.deepEqual(runs.map((item) => item.id), ['run_2', 'run_1']);
});

test('Prompt 自动优化 trace 会按 runId 聚合保存', async () => {
  await clearPromptOptimizationData();
  await savePromptOptimizationTrace('run_1', [
    { id: 'trace_1', phase: 'candidate_generation', message: '生成候选A' }
  ]);
  await savePromptOptimizationTrace('run_1', [
    { id: 'trace_2', phase: 'evaluation', message: '验证候选A' }
  ]);

  const trace = await getPromptOptimizationTrace('run_1');
  assert.deepEqual(trace.map((item) => item.id), ['trace_1', 'trace_2']);
});

test('Prompt 自动优化版本、资产和数据集可分别保存', async () => {
  await clearPromptOptimizationData();

  const asset = await savePromptAsset({ id: 'asset_1', name: '排放目标' });
  const dataset = await savePromptOptimizationDataset({ id: 'pods_1', name: '排放数据集' });
  const version = await savePromptVersion({
    id: 'pver_1',
    assetId: 'asset_1',
    label: '初始版本'
  });

  const versions = await listPromptVersions();

  assert.equal(asset.id, 'asset_1');
  assert.equal(dataset.id, 'pods_1');
  assert.equal(version.id, 'pver_1');
  assert.deepEqual(versions.map((item) => item.id), ['pver_1']);
});
