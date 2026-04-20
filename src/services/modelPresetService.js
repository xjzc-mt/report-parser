import { MODEL_PAGE_KEYS, DEFAULT_PRESET_DEFINITIONS } from '../constants/modelPresets.js';
import {
  loadAllPageModelSelections,
  loadModelPresets,
  cleanupLegacyLlmSettings,
  saveModelPresets,
  savePageModelSelection
} from '../utils/modelPresetStorage.js';

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
  return DEFAULT_PRESET_DEFINITIONS
    .map((definition) => {
      const apiKey = String(env[definition.apiKeyEnv] || '').trim();
      const modelName = String(env[definition.modelEnv] || '').trim();
      if (!apiKey || !modelName) {
        return null;
      }

      const baseUrl = String(env[definition.baseUrlEnv] || definition.defaultBaseUrl || '').trim();
      return {
        id: definition.id,
        name: definition.name,
        transportType: definition.transportType,
        vendorKey: definition.vendorKey,
        baseUrl,
        modelName,
        credentialMode: 'env',
        credentialRef: definition.apiKeyEnv,
        manualApiKey: '',
        capabilities: { ...definition.capabilities },
        status: 'active',
        isReadonly: true,
        isDefault: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
    })
    .filter(Boolean);
}

export function initializeModelPresetSystem(env = import.meta.env) {
  const existingPresets = loadModelPresets();
  const existingSelections = loadAllPageModelSelections();

  if (existingPresets.length > 0) {
    return {
      presets: existingPresets,
      selections: existingSelections
    };
  }

  cleanupLegacyLlmSettings();
  const defaultPresets = buildEnvDefaultPresets(env);
  const presets = mergePresetCollections(defaultPresets);

  saveModelPresets(presets);

  if (presets.length > 0 && !existingSelections[MODEL_PAGE_KEYS.PROMPT_ITERATION]) {
    savePageModelSelection(MODEL_PAGE_KEYS.PROMPT_ITERATION, presets[0].id);
  }

  return {
    presets,
    selections: loadAllPageModelSelections()
  };
}
