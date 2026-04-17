import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_TEST_SET_WORKBENCH_SUBTAB_KEY,
  LS_LLM1,
  LS_LLM2,
  LS_TEST_SET_WORKBENCH_SUBTAB,
  mergeLlmSettings,
  mapLegacyTestSetModeToSubtabKey,
  normalizeTestSetWorkbenchSubtabKey
} from '../src/utils/testSetWorkbenchSettings.js';
import { TEST_SET_SUBTABS } from '../src/constants/labNavigation.js';

test('DEFAULT_TEST_SET_WORKBENCH_SUBTAB_KEY 指向 prompt-iteration', () => {
  assert.equal(DEFAULT_TEST_SET_WORKBENCH_SUBTAB_KEY, 'prompt-iteration');
});

test('mapLegacyTestSetModeToSubtabKey 兼容旧流程模式值', () => {
  assert.equal(mapLegacyTestSetModeToSubtabKey('full'), 'prompt-iteration');
  assert.equal(mapLegacyTestSetModeToSubtabKey('validation'), 'model-validation');
  assert.equal(mapLegacyTestSetModeToSubtabKey('optimization'), 'prompt-optimization');
});

test('mapLegacyTestSetModeToSubtabKey 对非法值回退默认子页', () => {
  assert.equal(mapLegacyTestSetModeToSubtabKey('unknown'), 'prompt-iteration');
  assert.equal(mapLegacyTestSetModeToSubtabKey(''), 'prompt-iteration');
  assert.equal(mapLegacyTestSetModeToSubtabKey(null), 'prompt-iteration');
});

test('normalizeTestSetWorkbenchSubtabKey 只接受合法子页 key', () => {
  const validKeys = TEST_SET_SUBTABS.map((tab) => tab.key);
  validKeys.forEach((key) => {
    assert.equal(normalizeTestSetWorkbenchSubtabKey(key), key);
  });
  assert.equal(normalizeTestSetWorkbenchSubtabKey('invalid'), 'prompt-iteration');
});

test('mergeLlmSettings 保留已保存字段并补默认值', () => {
  const defaults = { apiUrl: 'default-url', apiKey: '', modelName: 'default-model', parallelCount: 5 };
  const saved = { apiKey: 'saved-key', modelName: 'saved-model' };

  assert.deepEqual(mergeLlmSettings(saved, defaults), {
    apiUrl: 'default-url',
    apiKey: 'saved-key',
    modelName: 'saved-model',
    parallelCount: 5
  });
});

test('LS_LLM1 和 LS_LLM2 暴露持久化 key', () => {
  assert.equal(LS_LLM1, 'intelliextract_llm1');
  assert.equal(LS_LLM2, 'intelliextract_llm2');
});

test('LS_TEST_SET_WORKBENCH_SUBTAB 暴露测试集二级页持久化 key', () => {
  assert.equal(LS_TEST_SET_WORKBENCH_SUBTAB, 'llm_lab_test_set_subtab');
});
