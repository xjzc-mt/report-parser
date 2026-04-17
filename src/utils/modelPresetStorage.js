import {
  MODEL_PRESET_STORAGE_KEY,
  PAGE_MODEL_SELECTIONS_STORAGE_KEY,
  TRANSPORT_TYPES,
  VENDOR_KEYS
} from '../constants/modelPresets.js';

function now() {
  return Date.now();
}

function safeJsonParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function getLocalStorage() {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function loadModelPresets() {
  const storage = getLocalStorage();
  if (!storage) return [];
  return safeJsonParse(storage.getItem(MODEL_PRESET_STORAGE_KEY), []);
}

export function saveModelPresets(presets) {
  const storage = getLocalStorage();
  if (!storage) return;
  storage.setItem(MODEL_PRESET_STORAGE_KEY, JSON.stringify(Array.isArray(presets) ? presets : []));
}

export function loadAllPageModelSelections() {
  const storage = getLocalStorage();
  if (!storage) return {};
  return safeJsonParse(storage.getItem(PAGE_MODEL_SELECTIONS_STORAGE_KEY), {});
}

export function loadPageModelSelection(pageKey) {
  return loadAllPageModelSelections()[pageKey] || '';
}

export function savePageModelSelection(pageKey, presetId) {
  const storage = getLocalStorage();
  if (!storage || !pageKey) return;
  const next = {
    ...loadAllPageModelSelections(),
    [pageKey]: presetId
  };
  storage.setItem(PAGE_MODEL_SELECTIONS_STORAGE_KEY, JSON.stringify(next));
}

function mapLegacyProviderToVendor(providerType) {
  if (providerType === 'anthropic') return VENDOR_KEYS.CLAUDE;
  if (providerType === 'openai') return VENDOR_KEYS.OPENAI;
  return VENDOR_KEYS.GEMINI;
}

function mapLegacyProviderToTransport(providerType) {
  if (providerType === 'anthropic') return TRANSPORT_TYPES.ANTHROPIC_NATIVE;
  if (providerType === 'openai') return TRANSPORT_TYPES.OPENAI_COMPATIBLE;
  return TRANSPORT_TYPES.GEMINI_NATIVE;
}

function buildLegacyCapabilities(providerType) {
  return {
    supportsPdfUpload: providerType === 'gemini',
    supportsJsonMode: true,
    supportsVision: false,
    supportsStreaming: false
  };
}

export function migrateLegacyLlmSettings() {
  const storage = getLocalStorage();
  if (!storage) return [];

  const legacyDefinitions = [
    ['intelliextract_llm1', '迁移-提取模型'],
    ['intelliextract_llm2', '迁移-优化模型']
  ];

  return legacyDefinitions
    .map(([storageKey, displayName]) => {
      const parsed = safeJsonParse(storage.getItem(storageKey), null);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      const providerType = String(parsed.providerType || '').trim() || 'gemini';

      return {
        id: `migrated_${storageKey}`,
        name: displayName,
        transportType: mapLegacyProviderToTransport(providerType),
        vendorKey: mapLegacyProviderToVendor(providerType),
        baseUrl: String(parsed.apiUrl || '').trim(),
        modelName: String(parsed.modelName || '').trim(),
        credentialMode: 'manual',
        credentialRef: '',
        manualApiKey: String(parsed.apiKey || '').trim(),
        capabilities: buildLegacyCapabilities(providerType),
        status: 'active',
        isReadonly: false,
        isDefault: false,
        createdAt: now(),
        updatedAt: now()
      };
    })
    .filter(Boolean);
}
