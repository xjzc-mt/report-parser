import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clipPromptIterationHistory,
  normalizePromptIterationDraft,
  runPromptIteration
} from '../src/services/promptIterationService.js';

test('runPromptIteration 对每个 PDF 独立执行并聚合结果', async () => {
  const extractCalls = [];
  const llmCalls = [];
  const result = await runPromptIteration({
    name: '温室气体排放',
    systemPrompt: '只返回 JSON',
    userPrompt: '提取目标内容',
    files: [
      { id: 'a', file: { name: 'A.pdf' }, pageSpec: '1-2' },
      { id: 'b', file: { name: 'B.pdf' }, pageSpec: '' }
    ],
    llmSettings: {
      apiUrl: 'https://example.com',
      apiKey: 'k',
      modelName: 'gemini-2.5-pro',
      providerType: 'gemini'
    }
  }, {
    extractPdfPages: async (_, pages) => {
      extractCalls.push(pages);
      return { pdfData: new Uint8Array([1, 2]), pageOffset: pages[0] };
    },
    fileToBase64: async (file) => `FULL:${file.name}`,
    uint8ArrayToBase64: () => 'BASE64',
    callLLMWithRetry: async (payload) => {
      llmCalls.push(payload);
      return {
        text: JSON.stringify({ prompt: payload.userPrompt }),
        usage: { input_tokens: 12, output_tokens: 6 }
      };
    },
    now: () => 1000
  });

  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].jsonParseStatus, 'success');
  assert.equal(result.summary.successCount, 2);
  assert.deepEqual(extractCalls, [[1, 2]]);
  assert.equal(llmCalls[0].pdfBase64, 'BASE64');
  assert.equal(llmCalls[1].pdfBase64, 'FULL:B.pdf');
  assert.match(llmCalls[0].userPrompt, /提取目标：温室气体排放/);
});

test('runPromptIteration 非 JSON 回复会标记未解析出 JSON', async () => {
  const result = await runPromptIteration({
    name: '废弃物',
    systemPrompt: '只返回 JSON',
    userPrompt: '提取',
    files: [{ id: 'a', file: { name: 'A.pdf' }, pageSpec: '' }],
    llmSettings: {
      apiUrl: 'https://example.com',
      apiKey: 'k',
      modelName: 'gemini-2.5-pro',
      providerType: 'gemini'
    }
  }, {
    fileToBase64: async () => 'FULL:BASE64',
    callLLMWithRetry: async () => ({
      text: 'plain text',
      usage: { input_tokens: 12, output_tokens: 6 }
    }),
    now: () => 1000
  });

  assert.equal(result.results[0].jsonParseStatus, 'not_found');
  assert.equal(result.results[0].summaryText, '未解析出 JSON');
});

test('runPromptIteration 单文件失败不阻断其他文件', async () => {
  let callCount = 0;
  const result = await runPromptIteration({
    name: '用水量',
    systemPrompt: '只返回 JSON',
    userPrompt: '提取',
    files: [
      { id: 'a', file: { name: 'A.pdf' }, pageSpec: '1000' },
      { id: 'b', file: { name: 'B.pdf' }, pageSpec: '' }
    ],
    llmSettings: {
      apiUrl: 'https://example.com',
      apiKey: 'k',
      modelName: 'gemini-2.5-pro',
      providerType: 'gemini'
    }
  }, {
    extractPdfPages: async () => {
      throw new Error('指定页码超出 PDF 范围');
    },
    fileToBase64: async () => 'FULL:BASE64',
    uint8ArrayToBase64: () => 'BASE64',
    callLLMWithRetry: async () => {
      callCount += 1;
      return { text: 'plain text', usage: { input_tokens: 1, output_tokens: 1 } };
    },
    now: () => 2000
  });

  assert.equal(result.results[0].status, 'error');
  assert.equal(result.results[1].status, 'success');
  assert.equal(callCount, 1);
});

test('runPromptIteration 缺失 file 时按单文件错误记录并继续后续文件', async () => {
  let callCount = 0;
  const result = await runPromptIteration({
    name: '社会指标',
    systemPrompt: '只返回 JSON',
    userPrompt: '提取',
    files: [
      { id: 'a', pageSpec: '' },
      { id: 'b', file: { name: 'B.pdf' }, pageSpec: '' }
    ],
    llmSettings: {
      apiUrl: 'https://example.com',
      apiKey: 'k',
      modelName: 'gemini-2.5-pro',
      providerType: 'gemini'
    }
  }, {
    fileToBase64: async () => 'FULL:BASE64',
    callLLMWithRetry: async () => {
      callCount += 1;
      return { text: '{}', usage: { input_tokens: 1, output_tokens: 1 } };
    },
    now: () => 3000
  });

  assert.equal(result.results[0].status, 'error');
  assert.match(result.results[0].errorMessage, /缺少 PDF 文件/);
  assert.equal(result.results[1].status, 'success');
  assert.equal(callCount, 1);
});

test('clipPromptIterationHistory 只保留最近 20 条历史', () => {
  const clipped = clipPromptIterationHistory(
    Array.from({ length: 25 }, (_, index) => ({ id: 25 - index })),
    20
  );

  assert.equal(clipped.length, 20);
  assert.deepEqual(clipped[0], { id: 25 });
});

test('normalizePromptIterationDraft 用默认值补齐草稿', () => {
  const draft = normalizePromptIterationDraft({
    name: '范围三',
    files: [{ id: 'a', pageSpec: '1-2' }]
  });

  assert.equal(draft.systemPrompt, '');
  assert.equal(draft.userPrompt, '');
  assert.equal(draft.files[0].pageSpec, '1-2');
  assert.equal(draft.files[0].type, 'application/pdf');
});
