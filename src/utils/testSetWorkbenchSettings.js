import { TEST_SET_SUBTABS } from '../constants/labNavigation.js';

export const LS_LLM1 = 'intelliextract_llm1';
export const LS_LLM2 = 'intelliextract_llm2';
export const LS_TEST_SET_WORKBENCH_SUBTAB = 'llm_lab_test_set_subtab';
export const DEFAULT_TEST_SET_WORKBENCH_SUBTAB_KEY = 'prompt-iteration';

const LEGACY_MODE_TO_SUBTAB_KEY = {
  full: 'prompt-iteration',
  validation: 'model-validation',
  optimization: 'prompt-optimization'
};

const VALID_TEST_SET_SUBTAB_KEYS = new Set(TEST_SET_SUBTABS.map((tab) => tab.key));

export function mergeLlmSettings(saved, defaults) {
  const merged = { ...(defaults || {}) };
  if (!saved || typeof saved !== 'object') {
    return merged;
  }

  Object.entries(saved).forEach(([key, value]) => {
    if (value !== undefined) {
      merged[key] = value;
    }
  });

  return merged;
}

export function mapLegacyTestSetModeToSubtabKey(mode) {
  const normalizedMode = String(mode || '').trim();
  return LEGACY_MODE_TO_SUBTAB_KEY[normalizedMode] || DEFAULT_TEST_SET_WORKBENCH_SUBTAB_KEY;
}

export function normalizeTestSetWorkbenchSubtabKey(value) {
  const normalizedValue = String(value || '').trim();
  return VALID_TEST_SET_SUBTAB_KEYS.has(normalizedValue)
    ? normalizedValue
    : DEFAULT_TEST_SET_WORKBENCH_SUBTAB_KEY;
}
