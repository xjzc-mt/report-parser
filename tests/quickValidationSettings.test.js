import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_QUICK_VALIDATION_THRESHOLD,
  LS_QUICK_VALIDATION_THRESHOLD,
  loadQuickValidationThreshold,
  normalizeQuickValidationThreshold,
  saveQuickValidationThreshold
} from '../src/utils/quickValidationSettings.js';

test('normalizeQuickValidationThreshold 会裁剪到 0-100 并回退默认值', () => {
  assert.equal(normalizeQuickValidationThreshold(85), 85);
  assert.equal(normalizeQuickValidationThreshold(999), 100);
  assert.equal(normalizeQuickValidationThreshold(-12), 0);
  assert.equal(normalizeQuickValidationThreshold('abc'), DEFAULT_QUICK_VALIDATION_THRESHOLD);
});

test('load/saveQuickValidationThreshold 会持久化模型结果验收阈值', () => {
  const storage = {
    data: new Map(),
    getItem(key) {
      return this.data.has(key) ? this.data.get(key) : null;
    },
    setItem(key, value) {
      this.data.set(key, value);
    }
  };

  assert.equal(loadQuickValidationThreshold(storage), DEFAULT_QUICK_VALIDATION_THRESHOLD);
  assert.equal(saveQuickValidationThreshold(88, storage), 88);
  assert.equal(storage.getItem(LS_QUICK_VALIDATION_THRESHOLD), '88');
  assert.equal(loadQuickValidationThreshold(storage), 88);
});
