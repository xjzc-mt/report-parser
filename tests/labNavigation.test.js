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

test('测试集工作台仍保留 3 个子页，Prompt快速迭代是第一个入口', () => {
  assert.equal(TEST_SET_SUBTABS.length, 3);
  assert.equal(TEST_SET_SUBTABS[0].key, 'prompt-iteration');
  assert.equal(TEST_SET_SUBTABS[0].label, 'Prompt快速迭代');
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
