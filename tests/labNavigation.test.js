import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAB_BRAND,
  APP_TABS,
  TEST_SET_SUBTABS,
  DATA_PREP_SUBTABS
} from '../src/constants/labNavigation.js';

test('LAB_BRAND 定义实验室品牌文案', () => {
  assert.deepEqual(LAB_BRAND, {
    title: 'LLM Lab',
    subtitle: '大语言模型工程实验室'
  });
});

test('APP_TABS 固定第一阶段顶层导航顺序', () => {
  assert.deepEqual(
    APP_TABS.map((tab) => tab.key),
    ['test-workbench', 'online-validation', 'data-prep', 'docs']
  );
  assert.deepEqual(
    APP_TABS.map((tab) => tab.label),
    ['测试集工作台', '线上验证工作台', '数据预处理工作台', '说明文档']
  );
});

test('TEST_SET_SUBTABS 固定测试集子导航顺序', () => {
  assert.deepEqual(
    TEST_SET_SUBTABS.map((tab) => tab.key),
    ['prompt-iteration', 'model-validation', 'prompt-optimization']
  );
  assert.deepEqual(
    TEST_SET_SUBTABS.map((tab) => tab.label),
    ['Prompt快速迭代', '模型结果验收', 'Prompt自动优化']
  );
});

test('TEST_SET_SUBTABS 保留 legacyLabel 对应文案', () => {
  assert.deepEqual(
    TEST_SET_SUBTABS.map((tab) => tab.legacyLabel),
    ['完整流程模式', '快速验收模式', '快速优化模式']
  );
});

test('DATA_PREP_SUBTABS 固定数据准备子导航顺序', () => {
  assert.deepEqual(
    DATA_PREP_SUBTABS.map((tab) => tab.key),
    ['chunking', 'pdf-compress', 'token-estimation']
  );
  assert.deepEqual(
    DATA_PREP_SUBTABS.map((tab) => tab.label),
    ['Chunking测试', 'PDF压缩', 'Token统计']
  );
});
