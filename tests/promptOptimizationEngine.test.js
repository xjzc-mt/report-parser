import test from 'node:test';
import assert from 'node:assert/strict';

import { runPromptOptimizationEngine } from '../src/services/promptOptimizationEngine.js';

test('优化引擎会返回 baseline、候选与轨迹', async () => {
  const result = await runPromptOptimizationEngine({
    assetId: 'asset_1',
    baselineVersion: {
      id: 'pver_1',
      userPromptTemplate: '提取温室气体排放'
    },
    comparisonRows: [
      {
        indicator_code: 'E1',
        indicator_name: '排放总量',
        prompt: '提取温室气体排放',
        similarity: 40,
        report_name: 'A',
        pdf_numbers: '1'
      }
    ],
    pdfFiles: [{ name: 'A.pdf' }],
    llmSettings: {
      apiUrl: 'https://example.com',
      apiKey: 'k',
      modelName: 'm',
      providerType: 'gemini',
      maxOptIterations: 1
    }
  }, {
    now: () => 1000,
    callOptimizer: async () => ({
      improvedPrompt: '只返回排放总量 JSON',
      usage: { input_tokens: 1, output_tokens: 1 }
    }),
    validateCandidate: async () => ({
      averageSimilarity: 82,
      sampleResults: [{ report_name: 'A', similarity: 82, text: '123' }]
    })
  });

  assert.equal(result.run.baselineScore, 40);
  assert.equal(result.run.bestCandidateId, 'cand_E1_1');
  assert.equal(result.run.candidates.length, 1);
  assert.equal(result.run.candidates[0].promptText, '只返回排放总量 JSON');
  assert.equal(result.run.traceEntries.length, 2);
  assert.equal(result.run.baselinePromptText, '提取温室气体排放');
  assert.equal(result.resultRows[0].improved_prompt, '只返回排放总量 JSON');
});

test('候选分数未提升时不会回写 improved_prompt', async () => {
  const result = await runPromptOptimizationEngine({
    assetId: 'asset_1',
    baselineVersion: {
      id: 'pver_1',
      userPromptTemplate: '提取温室气体排放'
    },
    comparisonRows: [
      {
        indicator_code: 'E1',
        indicator_name: '排放总量',
        prompt: '提取温室气体排放',
        similarity: 70,
        report_name: 'A',
        pdf_numbers: '1'
      }
    ],
    pdfFiles: [{ name: 'A.pdf' }],
    llmSettings: {
      apiUrl: 'https://example.com',
      apiKey: 'k',
      modelName: 'm',
      providerType: 'gemini',
      maxOptIterations: 1
    }
  }, {
    now: () => 1000,
    callOptimizer: async () => ({
      improvedPrompt: '严格输出 JSON',
      usage: { input_tokens: 1, output_tokens: 1 }
    }),
    validateCandidate: async () => ({
      averageSimilarity: 65,
      sampleResults: [{ report_name: 'A', similarity: 65, text: '123' }]
    })
  });

  assert.equal(result.run.bestCandidateId, 'cand_E1_1');
  assert.equal(result.resultRows[0].improved_prompt, undefined);
  assert.equal(result.resultRows[0].post_similarity, undefined);
});
