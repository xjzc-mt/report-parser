import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEnvDefaultPresets,
  initializeModelPresetSystem,
  mergePresetCollections
} from '../src/services/modelPresetService.js';

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

test('buildEnvDefaultPresets 只生成已配置的默认预设，且默认预设只读', () => {
  const presets = buildEnvDefaultPresets({
    VITE_DEFAULT_GEMINI_API_KEY: 'k1',
    VITE_DEFAULT_GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta',
    VITE_DEFAULT_GEMINI_MODEL: 'gemini-2.5-pro',
    VITE_DEFAULT_OPENAI_API_KEY: '',
    VITE_DEFAULT_OPENAI_BASE_URL: 'https://api.openai.com/v1',
    VITE_DEFAULT_OPENAI_MODEL: ''
  });

  assert.equal(presets.length, 1);
  assert.equal(presets[0].credentialMode, 'env');
  assert.equal(presets[0].isReadonly, true);
  assert.equal(presets[0].vendorKey, 'gemini');
  assert.equal(presets[0].credentialRef, 'VITE_DEFAULT_GEMINI_API_KEY');
});

test('mergePresetCollections 会按 id 去重并保留前者优先级', () => {
  const merged = mergePresetCollections(
    [{ id: 'preset_a', name: 'A' }, { id: 'preset_b', name: 'B' }],
    [{ id: 'preset_b', name: 'B2' }, { id: 'preset_c', name: 'C' }]
  );

  assert.deepEqual(merged, [
    { id: 'preset_a', name: 'A' },
    { id: 'preset_b', name: 'B' },
    { id: 'preset_c', name: 'C' }
  ]);
});

test('initializeModelPresetSystem 在没有新预设库时会先迁移旧配置，再补 env 默认预设和页面默认选择', () => {
  localStorage.setItem('intelliextract_llm1', JSON.stringify({
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: 'legacy-key',
    modelName: 'gemini-2.5-pro',
    providerType: 'gemini'
  }));

  const state = initializeModelPresetSystem({
    VITE_DEFAULT_OPENAI_API_KEY: 'openai-key',
    VITE_DEFAULT_OPENAI_BASE_URL: 'https://api.openai.com/v1',
    VITE_DEFAULT_OPENAI_MODEL: 'gpt-4.1'
  });

  assert.equal(state.presets[0].name, '迁移-提取模型');
  assert.equal(state.presets[1].name, '默认 OpenAI');
  assert.equal(state.selections['prompt-iteration'], 'migrated_intelliextract_llm1');
});
