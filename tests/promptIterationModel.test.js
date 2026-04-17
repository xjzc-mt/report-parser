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

test('parsePromptIterationPageSpec 严格拒绝字母尾缀页码片段', () => {
  assert.equal(parsePromptIterationPageSpec('12a').valid, false);
  assert.equal(parsePromptIterationPageSpec('1-3a').valid, false);
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

test('extractJsonCandidate 不接受裸 JSON 片段兜底', () => {
  assert.deepEqual(extractJsonCandidate('结果如下 {"ok":true}'), {
    status: 'not_found',
    parsed: null,
    source: 'none'
  });
});

test('summarizeParsedJson 对对象和数组生成完整 key 摘要', () => {
  assert.equal(
    summarizeParsedJson({ indicator_code: 'A', year: '2024', report_name: '报告A' }),
    '对象：indicator_code, year, report_name'
  );
  assert.equal(
    summarizeParsedJson([{ ok: true, name: 'a', count: 2 }, { ok: false }]),
    '数组：2 项，首项 key 为 ok, name, count'
  );
});
