import test from 'node:test';
import assert from 'node:assert/strict';

import {
  estimateTextTokens,
  estimateTokenCost,
  summarizeTokenEstimationItems
} from '../src/utils/tokenEstimation.js';

test('estimateTextTokens 按中英文混合文本给出稳定粗略估算', () => {
  const result = estimateTextTokens('Hello world，这是一个 Token 统计测试。');

  assert.equal(result.characters, 28);
  assert.equal(result.cjkCharacters, 8);
  assert.equal(result.nonCjkCharacters, 20);
  assert.equal(result.estimatedTokens, 13);
});

test('summarizeTokenEstimationItems 聚合多条输入并保留最大项', () => {
  const summary = summarizeTokenEstimationItems([
    { name: 'A.txt', text: '短文本' },
    { name: 'B.md', text: 'This is a longer english text for estimation.' }
  ]);

  assert.equal(summary.totalFiles, 2);
  assert.equal(summary.totalCharacters, 48);
  assert.equal(summary.totalTokens, 15);
  assert.equal(summary.largestItem.name, 'B.md');
});

test('estimateTokenCost 复用模型价格表估算输入成本', () => {
  const cost = estimateTokenCost('gemini-2.5-pro', 1000);

  assert.equal(cost, 0.00125);
});
