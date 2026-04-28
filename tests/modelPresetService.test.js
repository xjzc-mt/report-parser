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

test('initializeModelPresetSystem 在没有新预设库时会清理旧 key，并生成 env 默认预设和全局默认选择', () => {
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

  assert.equal(state.presets.length, 1);
  assert.equal(state.presets[0].name, '默认 OpenAI');
  assert.equal(state.globalDefaultPresetId, 'preset_openai_default');
  assert.deepEqual(state.selections, {});
  assert.equal(localStorage.getItem('intelliextract_llm1'), null);
});

test('initializeModelPresetSystem 会刷新旧的 env 只读预设，并保留手动预设', () => {
  localStorage.setItem('llm_lab_model_presets', JSON.stringify([
    {
      id: 'preset_platform_default',
      name: '平台默认模型',
      transportType: 'gemini_native',
      vendorKey: 'gemini',
      baseUrl: 'https://old.example.com',
      modelName: 'old-model',
      credentialMode: 'env',
      credentialRef: 'VITE_PLATFORM_DEFAULT_API_KEY',
      manualApiKey: '',
      capabilities: { supportsPdfUpload: true, supportsJsonMode: true },
      status: 'active',
      isReadonly: true,
      isDefault: true
    },
    {
      id: 'preset_manual_custom',
      name: '手动模型',
      transportType: 'openai_compatible',
      vendorKey: 'custom',
      baseUrl: 'https://manual.example.com/v1',
      modelName: 'manual-model',
      credentialMode: 'manual',
      credentialRef: '',
      manualApiKey: 'manual-key',
      capabilities: { supportsPdfUpload: false, supportsJsonMode: true },
      status: 'active',
      isReadonly: false,
      isDefault: false
    }
  ]));
  localStorage.setItem('llm_lab_global_model_selection', 'preset_platform_default');

  const state = initializeModelPresetSystem({
    VITE_PLATFORM_DEFAULT_VENDOR: 'openai',
    VITE_PLATFORM_DEFAULT_MODEL: 'gpt-4.1',
    VITE_PLATFORM_DEFAULT_BASE_URL: 'https://api.openai.com/v1',
    VITE_PLATFORM_DEFAULT_API_KEY: 'platform-key'
  });

  assert.equal(state.presets.length, 2);
  assert.equal(state.presets[0].id, 'preset_platform_default');
  assert.equal(state.presets[0].vendorKey, 'openai');
  assert.equal(state.presets[0].modelName, 'gpt-4.1');
  assert.equal(state.presets[1].id, 'preset_manual_custom');
  assert.equal(state.globalDefaultPresetId, 'preset_platform_default');
});
