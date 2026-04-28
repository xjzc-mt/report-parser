import { DEFAULT_SETTINGS, PROCESSABLE_VALUE_TYPES } from '../constants/extraction.js';

function normalizeIndicatorTypes(indicatorTypes) {
  if (!Array.isArray(indicatorTypes)) {
    return [...DEFAULT_SETTINGS.indicatorTypes];
  }

  const normalized = indicatorTypes.filter((item) => PROCESSABLE_VALUE_TYPES.includes(item));
  return normalized.length > 0 ? normalized : [...DEFAULT_SETTINGS.indicatorTypes];
}

export function normalizeGlobalSettings(rawSettings) {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(rawSettings && typeof rawSettings === 'object' ? rawSettings : {})
  };

  return {
    ...merged,
    indicatorTypes: normalizeIndicatorTypes(merged.indicatorTypes)
  };
}
