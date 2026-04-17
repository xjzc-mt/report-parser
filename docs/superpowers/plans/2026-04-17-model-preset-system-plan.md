# 统一模型预设系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将全站分散的 LLM 接口配置收束为统一的模型预设系统，并让各页面只选择预设、不再直接编辑底层 API 参数。

**Architecture:** 先建立 `modelPresetStorage / modelPresetService / modelPresetResolver` 三层基础设施，完成默认预设生成、旧 `llm1/llm2` 配置迁移、页面选择持久化，再用新的 `ModelPresetManager` 和 `PagePresetSelect` 替换页面内的直接 API 配置。运行时继续向现有 service 提供兼容的 `apiUrl / apiKey / modelName / providerType` 结构，避免一次性重写业务调用链。

**Tech Stack:** React 18、Mantine、Vite、IndexedDB (`idb`)、Node 内置测试框架

---

## 文件结构

### 新增文件

- `src/constants/modelPresets.js`
  定义 transport/vendor/capability/pageKey 常量、默认标签、环境变量映射。
- `src/utils/modelPresetStorage.js`
  负责 localStorage 中的预设库、页面选择、旧配置迁移读写。
- `src/services/modelPresetService.js`
  负责默认预设生成、CRUD、测试连接、能力合并。
- `src/services/modelPresetResolver.js`
  负责 `presetId/pageKey -> runtime config`、能力校验、页面可用性判断。
- `src/components/modelPresets/ModelPresetManager.jsx`
  新的统一模型预设管理面板。
- `src/components/modelPresets/PagePresetSelect.jsx`
  页面统一模型预设选择器。
- `tests/modelPresetStorage.test.js`
  覆盖预设持久化、旧配置迁移、页面选择恢复。
- `tests/modelPresetResolver.test.js`
  覆盖预设解析、能力校验、默认回退。
- `tests/modelPresetService.test.js`
  覆盖 env 默认预设生成、默认预设只读规则、测试连接。

### 修改文件

- `src/components/LLMSettingsDrawer.jsx`
  替换为新的模型预设管理 UI，移除 `LLM1/LLM2` 双表单。
- `src/components/TestSetWorkbench.jsx`
  移除 `llm1Settings/llm2Settings` 的直接编辑入口；接入页面预设选择，并为 `Prompt自动优化` 注入解析后的 runtime config。
- `src/components/QuickOptimizationMode.jsx`
  接受新的 runtime config，而不是继续依赖页面内 API 编辑。
- `src/components/ExtractorTab.jsx`
  顶部接入页面预设选择，执行前走 resolver。
- `src/components/PdfSplitterTab.jsx`
  顶部接入页面预设选择，执行前校验 `supportsPdfUpload`。
- `src/components/promptIteration/PromptIterationConfigPanel.jsx`
  将当前模型摘要切换成预设摘要。
- `src/components/FullFlowMode.jsx`
  用页面预设替代旧的 `llm1Settings` 持久化。
- `src/utils/testSetWorkbenchSettings.js`
  删除 `LS_LLM1/LS_LLM2` 角色，保留与子页切换相关的最小逻辑。
- `src/services/promptIterationService.js`
  使用 resolver 生成的 runtime config，并让结果记录 `presetId/presetName`。
- `src/services/pdfSplitterService.js`
  改为接收 resolver 输出，并把 PDF 能力校验前置。
- `src/services/extractionService.js`
  兼容新的 runtime config 来源。
- `src/services/testBenchService.js`
  兼容 `llm2` 优化运行时预设。

### 需要核对但尽量少改的文件

- `src/App.jsx`
  如有全局设置入口或 props 链需要传递新设置面板开关，则最小化修改。
- `tests/promptIterationService.test.js`
- `tests/promptIterationModel.test.js`
- `tests/testSetWorkbenchSettings.test.js`

## Task 1: 建立模型预设常量与存储层

**Files:**
- Create: `src/constants/modelPresets.js`
- Create: `src/utils/modelPresetStorage.js`
- Test: `tests/modelPresetStorage.test.js`

- [ ] **Step 1: 写失败测试，覆盖预设库与页面选择读写**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveModelPresets,
  loadModelPresets,
  savePageModelSelection,
  loadPageModelSelection,
  migrateLegacyLlmSettings
} from '../src/utils/modelPresetStorage.js';

test('saveModelPresets/loadModelPresets roundtrip', () => {
  const presets = [{ id: 'preset_gemini_default', name: '默认 Gemini' }];
  saveModelPresets(presets);
  assert.deepEqual(loadModelPresets(), presets);
});

test('savePageModelSelection/loadPageModelSelection roundtrip', () => {
  savePageModelSelection('prompt-iteration', 'preset_gemini_default');
  assert.equal(loadPageModelSelection('prompt-iteration'), 'preset_gemini_default');
});

test('migrateLegacyLlmSettings creates presets from llm1 and llm2', () => {
  localStorage.setItem('intelliextract_llm1', JSON.stringify({
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: 'legacy-key-1',
    modelName: 'gemini-2.5-pro',
    providerType: 'gemini'
  }));
  localStorage.setItem('intelliextract_llm2', JSON.stringify({
    apiUrl: 'https://api.openai.example.com/v1',
    apiKey: 'legacy-key-2',
    modelName: 'gpt-4.1',
    providerType: 'openai'
  }));

  const migrated = migrateLegacyLlmSettings();
  assert.equal(migrated.length, 2);
  assert.equal(migrated[0].credentialMode, 'manual');
  assert.equal(migrated[1].vendorKey, 'openai');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/modelPresetStorage.test.js`  
Expected: FAIL，提示 `Cannot find module '../src/utils/modelPresetStorage.js'`

- [ ] **Step 3: 实现最小存储层**

```js
export const LS_MODEL_PRESETS = 'llm_lab_model_presets';
export const LS_PAGE_MODEL_SELECTIONS = 'llm_lab_page_model_selections';

export function saveModelPresets(presets) {
  localStorage.setItem(LS_MODEL_PRESETS, JSON.stringify(presets));
}

export function loadModelPresets() {
  try {
    return JSON.parse(localStorage.getItem(LS_MODEL_PRESETS) || '[]');
  } catch (_) {
    return [];
  }
}

export function savePageModelSelection(pageKey, presetId) {
  const current = loadAllPageModelSelections();
  current[pageKey] = presetId;
  localStorage.setItem(LS_PAGE_MODEL_SELECTIONS, JSON.stringify(current));
}

export function loadPageModelSelection(pageKey) {
  return loadAllPageModelSelections()[pageKey] || '';
}

export function loadAllPageModelSelections() {
  try {
    return JSON.parse(localStorage.getItem(LS_PAGE_MODEL_SELECTIONS) || '{}');
  } catch (_) {
    return {};
  }
}
```

- [ ] **Step 4: 实现旧配置迁移函数**

```js
function mapProviderToVendor(providerType) {
  if (providerType === 'anthropic') return 'claude';
  if (providerType === 'openai') return 'openai';
  return 'gemini';
}

export function migrateLegacyLlmSettings() {
  const legacyKeys = [
    ['intelliextract_llm1', '迁移-提取模型'],
    ['intelliextract_llm2', '迁移-优化模型']
  ];

  return legacyKeys
    .map(([storageKey, name]) => {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return {
        id: `migrated_${storageKey}`,
        name,
        transportType: parsed.providerType === 'anthropic' ? 'anthropic_native' : 'openai_compatible',
        vendorKey: mapProviderToVendor(parsed.providerType),
        baseUrl: parsed.apiUrl || '',
        modelName: parsed.modelName || '',
        credentialMode: 'manual',
        manualApiKey: parsed.apiKey || '',
        capabilities: {
          supportsPdfUpload: parsed.providerType === 'gemini',
          supportsJsonMode: true,
          supportsVision: false,
          supportsStreaming: false
        },
        status: 'active',
        isReadonly: false,
        isDefault: false
      };
    })
    .filter(Boolean);
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node --test tests/modelPresetStorage.test.js`  
Expected: PASS，3/3 通过

- [ ] **Step 6: Commit**

```bash
git add tests/modelPresetStorage.test.js src/constants/modelPresets.js src/utils/modelPresetStorage.js
git commit -m "feat: 新增模型预设存储层"
```

## Task 2: 建立默认预设生成与运行时解析层

**Files:**
- Create: `src/services/modelPresetService.js`
- Create: `src/services/modelPresetResolver.js`
- Test: `tests/modelPresetService.test.js`
- Test: `tests/modelPresetResolver.test.js`

- [ ] **Step 1: 写失败测试，覆盖 env 默认预设生成**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEnvDefaultPresets } from '../src/services/modelPresetService.js';

test('buildEnvDefaultPresets only emits configured providers', () => {
  const presets = buildEnvDefaultPresets({
    VITE_DEFAULT_GEMINI_API_KEY: 'k1',
    VITE_DEFAULT_GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta',
    VITE_DEFAULT_GEMINI_MODEL: 'gemini-2.5-pro',
    VITE_DEFAULT_OPENAI_API_KEY: '',
    VITE_DEFAULT_OPENAI_MODEL: ''
  });

  assert.equal(presets.length, 1);
  assert.equal(presets[0].credentialMode, 'env');
  assert.equal(presets[0].isReadonly, true);
});
```

- [ ] **Step 2: 写失败测试，覆盖 preset -> runtime config 解析**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRuntimeLlmConfig, getPresetCapabilityError } from '../src/services/modelPresetResolver.js';

test('resolveRuntimeLlmConfig maps gemini preset to current runtime shape', () => {
  const runtime = resolveRuntimeLlmConfig({
    id: 'preset_gemini_default',
    transportType: 'gemini_native',
    vendorKey: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    modelName: 'gemini-2.5-pro',
    credentialMode: 'manual',
    manualApiKey: 'k',
    capabilities: { supportsPdfUpload: true, supportsJsonMode: true }
  });

  assert.equal(runtime.providerType, 'gemini');
  assert.equal(runtime.apiKey, 'k');
});

test('getPresetCapabilityError returns message when page requires pdf upload', () => {
  const error = getPresetCapabilityError(
    { capabilities: { supportsPdfUpload: false } },
    { supportsPdfUpload: true }
  );
  assert.match(error, /PDF 直传/);
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `node --test tests/modelPresetService.test.js tests/modelPresetResolver.test.js`  
Expected: FAIL，提示缺少 service 模块

- [ ] **Step 4: 实现默认预设生成**

```js
export function buildEnvDefaultPresets(env) {
  const definitions = [
    {
      id: 'preset_gemini_default',
      vendorKey: 'gemini',
      transportType: 'gemini_native',
      key: env.VITE_DEFAULT_GEMINI_API_KEY,
      baseUrl: env.VITE_DEFAULT_GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
      modelName: env.VITE_DEFAULT_GEMINI_MODEL,
      capabilities: { supportsPdfUpload: true, supportsJsonMode: true, supportsVision: true, supportsStreaming: false }
    }
  ];

  return definitions
    .filter((item) => item.key && item.modelName)
    .map((item) => ({
      id: item.id,
      name: `默认 ${item.vendorKey.toUpperCase()}`,
      transportType: item.transportType,
      vendorKey: item.vendorKey,
      baseUrl: item.baseUrl,
      modelName: item.modelName,
      credentialMode: 'env',
      credentialRef: `VITE_DEFAULT_${item.vendorKey.toUpperCase()}_API_KEY`,
      capabilities: item.capabilities,
      status: 'active',
      isReadonly: true,
      isDefault: true
    }));
}
```

- [ ] **Step 5: 实现 resolver**

```js
function mapTransportToProvider(transportType, vendorKey) {
  if (transportType === 'gemini_native') return 'gemini';
  if (transportType === 'anthropic_native') return 'anthropic';
  return vendorKey === 'oneapi' ? 'openai' : vendorKey;
}

export function resolveRuntimeLlmConfig(preset, env = import.meta.env) {
  const apiKey = preset.credentialMode === 'env'
    ? env[preset.credentialRef] || ''
    : preset.manualApiKey || '';

  return {
    presetId: preset.id,
    presetName: preset.name,
    apiUrl: preset.baseUrl,
    apiKey,
    modelName: preset.modelName,
    providerType: mapTransportToProvider(preset.transportType, preset.vendorKey),
    capabilities: preset.capabilities || {}
  };
}

export function getPresetCapabilityError(preset, requiredCapabilities) {
  if (requiredCapabilities?.supportsPdfUpload && !preset?.capabilities?.supportsPdfUpload) {
    return '当前页面要求 PDF 直传，该预设不支持。';
  }
  if (requiredCapabilities?.supportsJsonMode && !preset?.capabilities?.supportsJsonMode) {
    return '当前页面要求 JSON 输出能力，该预设不支持。';
  }
  return '';
}
```

- [ ] **Step 6: 跑测试确认通过**

Run: `node --test tests/modelPresetService.test.js tests/modelPresetResolver.test.js`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add tests/modelPresetService.test.js tests/modelPresetResolver.test.js src/services/modelPresetService.js src/services/modelPresetResolver.js
git commit -m "feat: 新增模型预设解析与默认生成"
```

## Task 3: 替换设置面板为模型预设管理

**Files:**
- Create: `src/components/modelPresets/ModelPresetManager.jsx`
- Modify: `src/components/LLMSettingsDrawer.jsx`
- Modify: `src/styles/global.css`
- Test: `tests/modelPresetManager.test.js`

- [ ] **Step 1: 写失败测试，覆盖默认预设 key 不可见**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModelPresetManager } from '../src/components/modelPresets/ModelPresetManager.jsx';

test('readonly env preset does not render actual api key', () => {
  const html = renderToStaticMarkup(
    <ModelPresetManager
      presets={[{
        id: 'preset_gemini_default',
        name: '默认 Gemini',
        credentialMode: 'env',
        credentialRef: 'VITE_DEFAULT_GEMINI_API_KEY',
        isReadonly: true,
        vendorKey: 'gemini',
        modelName: 'gemini-2.5-pro',
        capabilities: { supportsPdfUpload: true }
      }]}
      selectedPresetId="preset_gemini_default"
      onSelectPreset={() => {}}
      onSavePreset={() => {}}
    />
  );

  assert.doesNotMatch(html, /VITE_DEFAULT_GEMINI_API_KEY|sk-|AIza/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/modelPresetManager.test.js`  
Expected: FAIL，提示组件不存在

- [ ] **Step 3: 新增管理面板并改造抽屉**

```jsx
export function LLMSettingsDrawer({ opened, onClose, presets, ...props }) {
  return (
    <Drawer opened={opened} onClose={onClose} title="模型预设管理" position="right" size="lg" padding="lg">
      <ModelPresetManager presets={presets} {...props} />
    </Drawer>
  );
}
```

```jsx
export function ModelPresetManager({ presets, selectedPresetId, onSelectPreset, onSavePreset, onDeletePreset }) {
  const selectedPreset = presets.find((item) => item.id === selectedPresetId) || presets[0] || null;

  return (
    <div className="preset-manager-layout">
      <aside className="preset-manager-list">
        {presets.map((preset) => (
          <button key={preset.id} type="button" onClick={() => onSelectPreset(preset.id)}>
            <strong>{preset.name}</strong>
            <span>{preset.vendorKey} · {preset.modelName}</span>
          </button>
        ))}
      </aside>
      <section className="preset-manager-editor">
        <TextInput label="名称" value={selectedPreset?.name || ''} />
        <TextInput label="模型名称" value={selectedPreset?.modelName || ''} />
        {selectedPreset?.credentialMode === 'manual' ? (
          <PasswordInput label="API Key" value={selectedPreset?.manualApiKey || ''} />
        ) : (
          <Text size="sm" c="dimmed">此预设来自环境变量，API Key 不在页面内展示。</Text>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/modelPresetManager.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/modelPresetManager.test.js src/components/LLMSettingsDrawer.jsx src/components/modelPresets/ModelPresetManager.jsx src/styles/global.css
git commit -m "feat: 新增模型预设管理面板"
```

## Task 4: 接入页面级预设选择器与恢复逻辑

**Files:**
- Create: `src/components/modelPresets/PagePresetSelect.jsx`
- Modify: `src/components/promptIteration/PromptIterationConfigPanel.jsx`
- Modify: `src/components/ExtractorTab.jsx`
- Modify: `src/components/PdfSplitterTab.jsx`
- Modify: `src/components/QuickOptimizationMode.jsx`
- Modify: `src/components/TestSetWorkbench.jsx`
- Test: `tests/pagePresetSelection.test.js`

- [ ] **Step 1: 写失败测试，覆盖页面选择恢复**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPageModelSelection, savePageModelSelection } from '../src/utils/modelPresetStorage.js';

test('page preset selection persists independently per page', () => {
  savePageModelSelection('prompt-iteration', 'preset_a');
  savePageModelSelection('online-validation', 'preset_b');

  assert.equal(loadPageModelSelection('prompt-iteration'), 'preset_a');
  assert.equal(loadPageModelSelection('online-validation'), 'preset_b');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/pagePresetSelection.test.js`  
Expected: FAIL，如果 helper 未导出完整，补导出后继续

- [ ] **Step 3: 新增通用选择器并接入页面**

```jsx
export function PagePresetSelect({ pageKey, presets, value, onChange, requiredCapabilities }) {
  const data = presets.map((preset) => {
    const error = getPresetCapabilityError(preset, requiredCapabilities);
    return {
      value: preset.id,
      label: `${preset.name} · ${preset.vendorKey} · ${preset.modelName}`,
      disabled: Boolean(error)
    };
  });

  return (
    <Select
      label="当前模型预设"
      data={data}
      value={value}
      onChange={(next) => next && onChange(next)}
      allowDeselect={false}
    />
  );
}
```

```jsx
<PagePresetSelect
  pageKey="prompt-iteration"
  presets={presets}
  value={selectedPresetId}
  onChange={(nextId) => {
    setSelectedPresetId(nextId);
    savePageModelSelection('prompt-iteration', nextId);
  }}
  requiredCapabilities={{ supportsPdfUpload: true, supportsJsonMode: true }}
/>
```

- [ ] **Step 4: 将页面执行参数改为 resolver 输出**

```js
const selectedPreset = resolvePagePreset('prompt-iteration', presets);
const runtimeConfig = resolveRuntimeLlmConfig(selectedPreset);

await runPromptIteration({
  draft,
  llmSettings: runtimeConfig,
  files
});
```

- [ ] **Step 5: 跑相关测试**

Run: `node --test tests/pagePresetSelection.test.js tests/promptIterationService.test.js tests/promptIterationModel.test.js`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tests/pagePresetSelection.test.js src/components/modelPresets/PagePresetSelect.jsx src/components/promptIteration/PromptIterationConfigPanel.jsx src/components/ExtractorTab.jsx src/components/PdfSplitterTab.jsx src/components/QuickOptimizationMode.jsx src/components/TestSetWorkbench.jsx
git commit -m "feat: 接入页面级模型预设选择"
```

## Task 5: 接入旧配置迁移与全站运行时兼容

**Files:**
- Modify: `src/services/promptIterationService.js`
- Modify: `src/services/pdfSplitterService.js`
- Modify: `src/services/extractionService.js`
- Modify: `src/services/testBenchService.js`
- Modify: `src/App.jsx`
- Test: `tests/promptIterationService.test.js`
- Test: `tests/modelPresetMigrationFlow.test.js`

- [ ] **Step 1: 写失败测试，覆盖旧配置升级后的回退逻辑**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeModelPresetSystem } from '../src/services/modelPresetService.js';

test('initializeModelPresetSystem migrates legacy settings before env defaults', () => {
  localStorage.setItem('intelliextract_llm1', JSON.stringify({
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: 'legacy-key',
    modelName: 'gemini-2.5-pro',
    providerType: 'gemini'
  }));

  const state = initializeModelPresetSystem({});
  assert.equal(state.presets[0].name, '迁移-提取模型');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/modelPresetMigrationFlow.test.js`  
Expected: FAIL，提示初始化函数不存在

- [ ] **Step 3: 实现初始化与服务层兼容**

```js
export function initializeModelPresetSystem(env = import.meta.env) {
  const existing = loadModelPresets();
  if (existing.length > 0) {
    return { presets: existing, selections: loadAllPageModelSelections() };
  }

  const migrated = migrateLegacyLlmSettings();
  const defaults = buildEnvDefaultPresets(env);
  const presets = [...migrated, ...defaults];

  saveModelPresets(presets);
  if (presets.length > 0) {
    savePageModelSelection('prompt-iteration', presets[0].id);
  }

  return { presets, selections: loadAllPageModelSelections() };
}
```

```js
export async function runPromptIteration(input) {
  const runtimeConfig = input.llmSettings;
  return callLLM({
    sysPrompt: input.systemPrompt,
    userPrompt: input.userPrompt,
    apiUrl: runtimeConfig.apiUrl,
    apiKey: runtimeConfig.apiKey,
    modelName: runtimeConfig.modelName,
    providerType: runtimeConfig.providerType,
    pdfBase64: input.pdfBase64
  });
}
```

- [ ] **Step 4: 跑回归测试**

Run: `node --test tests/modelPresetMigrationFlow.test.js tests/promptIterationService.test.js tests/modelPresetStorage.test.js tests/modelPresetResolver.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/modelPresetMigrationFlow.test.js src/services/modelPresetService.js src/services/promptIterationService.js src/services/pdfSplitterService.js src/services/extractionService.js src/services/testBenchService.js src/App.jsx
git commit -m "feat: 完成模型预设迁移与运行时兼容"
```

## Task 6: 全量验证与文档收口

**Files:**
- Modify: `docs/interview/project-intro.md`
- Modify: `docs/superpowers/specs/2026-04-17-model-preset-system-design.md`
- Modify: `docs/superpowers/plans/2026-04-17-model-preset-system-plan.md`

- [ ] **Step 1: 更新文档中的模型配置表述**

```md
- 模型配置不再由页面直接填写 API 参数
- 统一改为在“模型预设管理”中维护
- 页面只选择预设，并自动恢复上次选择
```

- [ ] **Step 2: 跑定向测试**

Run: `node --test tests/modelPresetStorage.test.js tests/modelPresetService.test.js tests/modelPresetResolver.test.js tests/pagePresetSelection.test.js tests/promptIterationService.test.js`
Expected: PASS

- [ ] **Step 3: 跑全量测试**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: 跑生产构建**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add docs/interview/project-intro.md docs/superpowers/specs/2026-04-17-model-preset-system-design.md docs/superpowers/plans/2026-04-17-model-preset-system-plan.md
git commit -m "docs: 同步模型预设系统说明"
```

## 自检结论

- Spec 覆盖：
  - 统一配置、页面选用、默认预设生成、页面选择恢复、能力校验、旧配置迁移、运行时兼容、设置页改造，均已对应到 Task 1-5。
- 占位符扫描：
  - 已去掉 `TODO/TBD/后续补` 这类占位词，所有任务都给出明确文件、命令和最小代码示例。
- 命名一致性：
  - 全文统一使用 `ModelPreset / PageModelSelection / modelPresetStorage / modelPresetService / modelPresetResolver / PagePresetSelect / ModelPresetManager` 这组命名。
