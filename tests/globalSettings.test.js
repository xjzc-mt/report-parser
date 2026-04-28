import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_SETTINGS } from '../src/constants/extraction.js';
import { normalizeGlobalSettings } from '../src/utils/globalSettings.js';

test('normalizeGlobalSettings 在 indicatorTypes 非数组时回退默认值', () => {
  const normalized = normalizeGlobalSettings({
    batchSize: 100,
    indicatorTypes: null
  });

  assert.equal(normalized.batchSize, 100);
  assert.deepEqual(normalized.indicatorTypes, DEFAULT_SETTINGS.indicatorTypes);
});

test('normalizeGlobalSettings 会过滤非法 indicatorTypes 并保留合法项', () => {
  const normalized = normalizeGlobalSettings({
    indicatorTypes: ['文字型', '非法类型', '货币型']
  });

  assert.deepEqual(normalized.indicatorTypes, ['文字型', '货币型']);
});
