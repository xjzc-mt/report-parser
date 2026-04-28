export const LS_QUICK_VALIDATION_THRESHOLD = 'llm_lab_quick_validation_threshold';
export const DEFAULT_QUICK_VALIDATION_THRESHOLD = 70;

export function normalizeQuickValidationThreshold(value) {
  if (value === null || value === undefined || value === '') {
    return DEFAULT_QUICK_VALIDATION_THRESHOLD;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_QUICK_VALIDATION_THRESHOLD;
  }
  return Math.min(100, Math.max(0, parsed));
}

export function loadQuickValidationThreshold(storage = globalThis.localStorage) {
  try {
    return normalizeQuickValidationThreshold(storage?.getItem?.(LS_QUICK_VALIDATION_THRESHOLD));
  } catch (_) {
    return DEFAULT_QUICK_VALIDATION_THRESHOLD;
  }
}

export function saveQuickValidationThreshold(value, storage = globalThis.localStorage) {
  const normalized = normalizeQuickValidationThreshold(value);
  try {
    storage?.setItem?.(LS_QUICK_VALIDATION_THRESHOLD, String(normalized));
  } catch (_) {
    // ignore persistence failures
  }
  return normalized;
}
