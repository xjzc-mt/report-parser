import {
  loadGlobalDefaultModelSelection,
  loadModelPresets,
  cleanupLegacyLlmSettings,
  saveGlobalDefaultModelSelection,
  saveModelPresets,
  loadAllPageModelSelections
} from '../utils/modelPresetStorage.js';
import { buildAllEnvDefaultPresets } from '../utils/platformDefaultModel.js';

export function mergePresetCollections(...collections) {
  const seen = new Set();
  const merged = [];

  collections.flat().forEach((item) => {
    if (!item?.id || seen.has(item.id)) {
      return;
    }
    seen.add(item.id);
    merged.push(item);
  });

  return merged;
}

export function buildEnvDefaultPresets(env = {}) {
  return buildAllEnvDefaultPresets(env);
}

export function initializeModelPresetSystem(env = import.meta.env) {
  cleanupLegacyLlmSettings();
  const existingPresets = loadModelPresets();
  const existingSelections = loadAllPageModelSelections();
  const existingGlobalDefaultPresetId = loadGlobalDefaultModelSelection();
  const defaultPresets = buildEnvDefaultPresets(env);
  const customPresets = existingPresets.filter((item) => !(item?.credentialMode === 'env' && item?.isReadonly));
  const presets = mergePresetCollections(defaultPresets, customPresets);

  saveModelPresets(presets);

  const nextGlobalDefaultPresetId = presets.some((item) => item.id === existingGlobalDefaultPresetId)
    ? existingGlobalDefaultPresetId
    : (defaultPresets[0]?.id || presets.find((item) => item.isDefault)?.id || presets[0]?.id || '');

  if (nextGlobalDefaultPresetId) {
    saveGlobalDefaultModelSelection(nextGlobalDefaultPresetId);
  } else {
    saveGlobalDefaultModelSelection('');
  }

  return {
    presets,
    selections: existingSelections,
    globalDefaultPresetId: loadGlobalDefaultModelSelection()
  };
}
