import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadAllPageModelSelections,
  loadModelPresets,
  loadPageModelSelection,
  migrateLegacyLlmSettings,
  saveModelPresets,
  savePageModelSelection
} from '../src/utils/modelPresetStorage.js';

function installLocalStorageMock() {
  const store = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };
  return store;
}

test.beforeEach(() => {
  installLocalStorageMock();
});

test('saveModelPresets/loadModelPresets 可完整往返', () => {
  const presets = [{ id: 'preset_gemini_default', name: '默认 Gemini' }];
  saveModelPresets(presets);

  assert.deepEqual(loadModelPresets(), presets);
});

test('savePageModelSelection/loadPageModelSelection 可按页面独立恢复', () => {
  savePageModelSelection('prompt-iteration', 'preset_gemini_default');
  savePageModelSelection('online-validation', 'preset_claude_default');

  assert.equal(loadPageModelSelection('prompt-iteration'), 'preset_gemini_default');
  assert.equal(loadPageModelSelection('online-validation'), 'preset_claude_default');
  assert.deepEqual(loadAllPageModelSelections(), {
    'prompt-iteration': 'preset_gemini_default',
    'online-validation': 'preset_claude_default'
  });
});

test('migrateLegacyLlmSettings 会将旧 llm1/llm2 配置迁移为自定义预设', () => {
  localStorage.setItem('intelliextract_llm1', JSON.stringify({
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: 'legacy-key-1',
    modelName: 'gemini-2.5-pro',
    providerType: 'gemini'
  }));
  localStorage.setItem('intelliextract_llm2', JSON.stringify({
    apiUrl: 'https://api.openai.example.com/v1',
    apiKey: 'legacy-key-2',
    modelName: 'gpt-4.1',
    providerType: 'openai',
    similarityThreshold: 70
  }));

  const migrated = migrateLegacyLlmSettings();

  assert.equal(migrated.length, 2);
  assert.equal(migrated[0].credentialMode, 'manual');
  assert.equal(migrated[0].manualApiKey, 'legacy-key-1');
  assert.equal(migrated[0].vendorKey, 'gemini');
  assert.equal(migrated[1].vendorKey, 'openai');
  assert.equal(migrated[1].transportType, 'openai_compatible');
});
