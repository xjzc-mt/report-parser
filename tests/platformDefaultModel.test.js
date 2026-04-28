import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAllEnvDefaultPresets,
  resolvePlatformDefaultRuntimeConfig,
  resolveSettingsWithPlatformDefaults
} from '../src/utils/platformDefaultModel.js';

test('buildAllEnvDefaultPresets 优先生成平台默认预设，并支持通用 env 切换厂商', () => {
  const presets = buildAllEnvDefaultPresets({
    VITE_PLATFORM_DEFAULT_PRESET_NAME: '平台 OpenAI',
    VITE_PLATFORM_DEFAULT_VENDOR: 'openai',
    VITE_PLATFORM_DEFAULT_MODEL: 'gpt-4.1',
    VITE_PLATFORM_DEFAULT_BASE_URL: 'https://api.openai.com/v1',
    VITE_PLATFORM_DEFAULT_API_KEY: 'platform-key',
    VITE_DEFAULT_GEMINI_API_KEY: 'gemini-key',
    VITE_DEFAULT_GEMINI_MODEL: 'gemini-2.5-pro'
  });

  assert.equal(presets.length, 2);
  assert.equal(presets[0].id, 'preset_platform_default');
  assert.equal(presets[0].name, '平台 OpenAI');
  assert.equal(presets[0].vendorKey, 'openai');
  assert.equal(presets[0].modelName, 'gpt-4.1');
  assert.equal(presets[0].credentialRef, 'VITE_PLATFORM_DEFAULT_API_KEY');
  assert.equal(presets[1].id, 'preset_gemini_default');
});

test('resolvePlatformDefaultRuntimeConfig 在只有旧 VITE_GEMINI_API_KEY 时仍回退到 Gemini 平台默认', () => {
  const runtimeConfig = resolvePlatformDefaultRuntimeConfig({
    VITE_GEMINI_API_KEY: 'legacy-gemini-key'
  });

  assert.equal(runtimeConfig?.providerType, 'gemini');
  assert.equal(runtimeConfig?.apiKey, 'legacy-gemini-key');
  assert.equal(runtimeConfig?.apiUrl, 'https://generativelanguage.googleapis.com/v1beta');
  assert.equal(runtimeConfig?.modelName, 'gemini-2.5-pro');
});

test('resolveSettingsWithPlatformDefaults 只在字段缺失时回退平台默认配置', () => {
  const resolved = resolveSettingsWithPlatformDefaults({
    apiKey: '',
    apiUrl: '',
    modelName: '',
    providerType: ''
  }, {
    VITE_PLATFORM_DEFAULT_VENDOR: 'glm',
    VITE_PLATFORM_DEFAULT_MODEL: 'glm-4.5',
    VITE_PLATFORM_DEFAULT_BASE_URL: 'https://open.bigmodel.cn/api/paas/v4',
    VITE_PLATFORM_DEFAULT_API_KEY: 'glm-key'
  });

  assert.equal(resolved.apiKey, 'glm-key');
  assert.equal(resolved.apiUrl, 'https://open.bigmodel.cn/api/paas/v4');
  assert.equal(resolved.modelName, 'glm-4.5');
  assert.equal(resolved.providerType, 'glm');

  const manual = resolveSettingsWithPlatformDefaults({
    apiKey: 'manual-key',
    apiUrl: 'https://example.com/v1',
    modelName: 'custom-model',
    providerType: 'openai'
  }, {
    VITE_PLATFORM_DEFAULT_VENDOR: 'gemini',
    VITE_PLATFORM_DEFAULT_MODEL: 'gemini-2.5-pro',
    VITE_PLATFORM_DEFAULT_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta',
    VITE_PLATFORM_DEFAULT_API_KEY: 'platform-key'
  });

  assert.equal(manual.apiKey, 'manual-key');
  assert.equal(manual.apiUrl, 'https://example.com/v1');
  assert.equal(manual.modelName, 'custom-model');
  assert.equal(manual.providerType, 'openai');
});
