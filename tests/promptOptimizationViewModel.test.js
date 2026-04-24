import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPromptOptimizationRunSnapshot,
  buildPromptOptimizationTargetOptions
} from '../src/utils/promptOptimizationViewModel.js';

test('buildPromptOptimizationTargetOptions 会按预选指标过滤并生成标签', () => {
  const options = buildPromptOptimizationTargetOptions([
    { indicator_code: 'E1', indicator_name: '范围一排放' },
    { indicator_code: 'E1', indicator_name: '范围一排放' },
    { indicator_code: 'E2', indicator_name: '范围二排放' }
  ], ['E2']);

  assert.deepEqual(options, [
    {
      value: 'E2',
      label: 'E2 · 范围二排放',
      code: 'E2',
      name: '范围二排放'
    }
  ]);
});

test('buildPromptOptimizationRunSnapshot 会根据旧优化结果生成单候选 run', () => {
  const snapshot = buildPromptOptimizationRunSnapshot({
    assetId: 'asset_1',
    baselineVersionId: 'pver_1',
    baselinePromptText: '提取排放总量',
    targetName: '排放总量',
    rows: [
      {
        indicator_code: 'E1',
        indicator_name: '排放总量',
        report_name: 'A',
        similarity: 40
      },
      {
        indicator_code: 'E1',
        indicator_name: '排放总量',
        report_name: 'B',
        similarity: 60
      }
    ],
    updatedRows: [
      {
        indicator_code: 'E1',
        indicator_name: '排放总量',
        report_name: 'A',
        similarity: 40,
        improved_prompt: '严格输出 JSON',
        post_similarity: 82
      },
      {
        indicator_code: 'E1',
        indicator_name: '排放总量',
        report_name: 'B',
        similarity: 60,
        improved_prompt: '严格输出 JSON',
        post_similarity: 82
      }
    ],
    iterationDetails: [
      {
        indicator_code: 'E1',
        indicator_name: '排放总量',
        iter: 0,
        prompt: '提取排放总量',
        report_name: 'A',
        similarity: 40,
        llm_text: '旧结果',
        is_accepted: 'ORIGINAL'
      },
      {
        indicator_code: 'E1',
        indicator_name: '排放总量',
        iter: 1,
        prompt: '严格输出 JSON',
        report_name: 'A',
        similarity: 82,
        llm_text: '新结果',
        is_accepted: 'YES'
      }
    ],
    llmSettings: {
      modelName: 'gemini-2.5-pro',
      providerType: 'gemini'
    },
    now: () => 1000
  });

  assert.equal(snapshot.run.assetId, 'asset_1');
  assert.equal(snapshot.run.bestCandidateId, 'cand_E1_1');
  assert.equal(snapshot.run.baselineScore, 50);
  assert.equal(snapshot.run.candidates[0].score.overall, 82);
  assert.equal(snapshot.run.traceEntries.length, 2);
  assert.equal(snapshot.run.targetName, '排放总量');
  assert.equal(snapshot.run.resultRows.length, 2);
});
