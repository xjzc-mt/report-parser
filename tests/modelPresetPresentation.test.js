import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPresetSelectOptions } from '../src/utils/modelPresetPresentation.js';

test('buildPresetSelectOptions 会为能力不满足的预设打上 disabled 和原因说明', () => {
  const options = buildPresetSelectOptions(
    [
      {
        id: 'preset_a',
        name: 'Gemini 稳定版',
        vendorKey: 'gemini',
        modelName: 'gemini-2.5-pro',
        capabilities: { supportsPdfUpload: true, supportsJsonMode: true }
      },
      {
        id: 'preset_b',
        name: 'OpenAI 低成本',
        vendorKey: 'openai',
        modelName: 'gpt-4.1-mini',
        capabilities: { supportsPdfUpload: false, supportsJsonMode: true }
      }
    ],
    { supportsPdfUpload: true }
  );

  assert.equal(options[0].disabled, false);
  assert.equal(options[1].disabled, true);
  assert.match(options[1].description, /PDF 直传/);
});
