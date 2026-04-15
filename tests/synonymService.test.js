import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateFieldSimilarity,
  loadConversions,
  loadSynonyms
} from '../src/services/synonymService.js';

test('calculateFieldSimilarity 在存在单位换算规则时将数值型视为相等', () => {
  loadSynonyms([]);
  loadConversions([
    { raw_unit: '吨', standard_unit: '千吨', unit_conversion: 0.001 },
    { raw_unit: '千吨', standard_unit: '吨', unit_conversion: 1000 }
  ]);

  assert.equal(
    calculateFieldSimilarity('8460000', '8460', 'numeric', false, null, {
      leftUnit: '吨',
      rightUnit: '千吨'
    }),
    100
  );

  assert.equal(
    calculateFieldSimilarity('8460000', '8460', 'numeric', false, null, {
      leftUnit: '吨',
      rightUnit: '万吨'
    }),
    0
  );
});
