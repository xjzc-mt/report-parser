import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getPromptIterationDraft,
  getPromptIterationHistory,
  savePromptIterationDraft,
  savePromptIterationHistory
} from '../src/services/persistenceService.js';

test('PromptIteration draft 可保存并读回', async () => {
  const draft = {
    name: '范围一',
    systemPrompt: '只返回 JSON',
    userPrompt: '提取结果',
    files: [{ id: 'file-1', pageSpec: '1-2' }]
  };

  await savePromptIterationDraft(draft);

  assert.deepEqual(await getPromptIterationDraft(), draft);
});

test('PromptIteration history 默认空数组且可覆盖保存', async () => {
  await savePromptIterationHistory([]);
  assert.deepEqual(await getPromptIterationHistory(), []);

  const history = [
    { createdAt: 1000, name: '范围二', results: [] },
    { createdAt: 2000, name: '范围三', results: [{ fileId: 'a', status: 'success' }] }
  ];

  await savePromptIterationHistory(history);

  assert.deepEqual(await getPromptIterationHistory(), history);
});
