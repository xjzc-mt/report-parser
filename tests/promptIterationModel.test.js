import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractJsonCandidate,
  parsePromptIterationPageSpec,
  summarizeParsedJson
} from '../src/utils/promptIterationModel.js';

test('parsePromptIterationPageSpec 解析混合页码并去重排序', () => {
  assert.deepEqual(parsePromptIterationPageSpec('12-14,16,14,18'), {
    valid: true,
    pages: [12, 13, 14, 16, 18],
    normalized: '12-14,16,18',
    error: ''
  });
});

test('parsePromptIterationPageSpec 识别非法页码', () => {
  const result = parsePromptIterationPageSpec('12-a');
  assert.equal(result.valid, false);
  assert.match(result.error, /页码格式/);
});

test('extractJsonCandidate 优先解析完整 JSON，再回退到代码块 JSON', () => {
  assert.deepEqual(extractJsonCandidate('{"a":1}'), {
    status: 'success',
    parsed: { a: 1 },
    source: 'whole'
  });

  const fromFence = extractJsonCandidate('结果如下\n```json\n{"ok":true}\n```');
  assert.equal(fromFence.status, 'success');
  assert.deepEqual(fromFence.parsed, { ok: true });
  assert.equal(fromFence.source, 'fence');
});

test('summarizeParsedJson 对对象和数组生成可读摘要', () => {
  assert.equal(summarizeParsedJson({ indicator_code: 'A', year: '2024' }), '对象：indicator_code, year');
  assert.equal(summarizeParsedJson([{ ok: true }, { ok: false }]), '数组：2 项，首项 key 为 ok');
});
