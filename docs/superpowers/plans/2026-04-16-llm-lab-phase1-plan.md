# LLM Lab 第一阶段改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前项目安全重组为 `LLM Lab / 大语言模型工程实验室` 的第一阶段平台壳层，建立新的一级导航与三大工作台结构，并把现有成熟能力重新挂载到新入口下。

**Architecture:** 第一阶段只重构壳层，不重写成熟业务链路。通过“平台导航常量 + 工作台容器 + 适配页”的方式，将现有 `ExtractorTab`、`QuickValidationMode`、`QuickOptimizationMode`、`CompressorTab` 以及迁移来的 `PdfSplitterTab` 重新组织到新信息架构中；完整流程能力从 `TestWorkbenchTab` 中抽出到 `FullFlowMode`，再由新的 `TestSetWorkbench` 容器统一承载。

**Tech Stack:** React 19、Vite、Mantine、Tabler Icons、Node `--test`、pdf-lib、xlsx、jszip

---

## 文件结构

- Create: `src/constants/labNavigation.js`
  - 定义品牌、副标题、一级导航、工作台子页和旧名称辅助标注。
- Create: `tests/labNavigation.test.js`
  - 验证一级导航和子页结构符合 spec。
- Create: `src/utils/testSetWorkbenchSettings.js`
  - 提供测试集工作台共享 LLM 设置的 `load/save` 纯函数。
- Create: `tests/testSetWorkbenchSettings.test.js`
  - 验证共享 LLM 设置的默认值合并与持久化 key 行为。
- Create: `src/components/TestSetWorkbench.jsx`
  - 新的测试集工作台容器，管理二级子标签、共享 LLM 设置和跳转桥接。
- Create: `src/components/OnlineValidationWorkbench.jsx`
  - 新的线上验证工作台容器，直接承载 `ExtractorTab`。
- Create: `src/components/DataPreprocessingWorkbench.jsx`
  - 新的数据预处理工作台容器，管理 `Chunking测试 / PDF压缩 / Token统计` 子页。
- Create: `src/components/TokenEstimationPage.jsx`
  - 第一阶段占位页，明确后续目标与当前边界。
- Create: `src/components/PdfSplitterTab.jsx`
  - 从桌面项目迁移的 `Chunking测试` 页面。
- Create: `src/services/pdfSplitterService.js`
  - 从桌面项目迁移的 PDF 页码定位与拆分服务。
- Create: `tests/dataPreprocessingDeps.test.js`
  - 验证 `jszip` 依赖已加入当前项目。
- Modify: `src/App.jsx`
  - 顶层导航切换到四个一级入口，并挂载新工作台容器。
- Modify: `src/components/Header.jsx`
  - 品牌改为 `LLM Lab / 大语言模型工程实验室`，导航改为新结构。
- Modify: `src/components/MethodologyTab.jsx`
  - 页面标题和说明改为“说明文档”语义。
- Modify: `src/components/FullFlowMode.jsx`
  - 从占位组件升级为承载完整流程逻辑的正式页面。
- Modify: `src/components/TestWorkbenchTab.jsx`
  - 去掉旧模式切换壳层，保留为 legacy wrapper 或删减为转发入口。
- Modify: `src/styles/global.css`
  - 新的顶层品牌样式、一级导航、工作台二级标签和占位页样式。
- Modify: `package.json`
  - 为 `Chunking测试` 增加 `jszip` 依赖。

### Task 1: 平台导航配置与纯逻辑测试

**Files:**
- Create: `src/constants/labNavigation.js`
- Test: `tests/labNavigation.test.js`

- [ ] **Step 1: 写失败测试，先锁定第一阶段信息架构**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAB_BRAND,
  APP_TABS,
  TEST_SET_SUBTABS,
  DATA_PREP_SUBTABS
} from '../src/constants/labNavigation.js';

test('LAB_BRAND 暴露新的品牌标题和副标题', () => {
  assert.deepEqual(LAB_BRAND, {
    title: 'LLM Lab',
    subtitle: '大语言模型工程实验室'
  });
});

test('APP_TABS 按 spec 暴露四个一级入口', () => {
  assert.deepEqual(
    APP_TABS.map((tab) => tab.key),
    ['test-workbench', 'online-validation', 'data-prep', 'docs']
  );
});

test('测试集工作台子页包含三个新名称与旧名称辅助标注', () => {
  assert.deepEqual(
    TEST_SET_SUBTABS.map((tab) => tab.key),
    ['prompt-iteration', 'model-validation', 'prompt-optimization']
  );
  assert.match(TEST_SET_SUBTABS[0].legacyLabel, /完整流程模式/);
  assert.match(TEST_SET_SUBTABS[1].legacyLabel, /快速验收模式/);
  assert.match(TEST_SET_SUBTABS[2].legacyLabel, /快速优化模式/);
});

test('数据预处理工作台子页包含 chunking pdf 压缩 token 统计', () => {
  assert.deepEqual(
    DATA_PREP_SUBTABS.map((tab) => tab.key),
    ['chunking', 'pdf-compress', 'token-estimation']
  );
});
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `node --test tests/labNavigation.test.js`

Expected: FAIL，报错提示缺少 `src/constants/labNavigation.js`。

- [ ] **Step 3: 最小实现导航常量**

```js
export const LAB_BRAND = {
  title: 'LLM Lab',
  subtitle: '大语言模型工程实验室'
};

export const APP_TABS = [
  { key: 'test-workbench', label: '测试集工作台' },
  { key: 'online-validation', label: '线上验证工作台' },
  { key: 'data-prep', label: '数据预处理工作台' },
  { key: 'docs', label: '说明文档' }
];

export const TEST_SET_SUBTABS = [
  { key: 'prompt-iteration', label: 'Prompt快速迭代', legacyLabel: '原完整流程模式' },
  { key: 'model-validation', label: '模型结果验收', legacyLabel: '原快速验收模式' },
  { key: 'prompt-optimization', label: 'Prompt自动优化', legacyLabel: '原快速优化模式' }
];

export const DATA_PREP_SUBTABS = [
  { key: 'chunking', label: 'Chunking测试', legacyLabel: '' },
  { key: 'pdf-compress', label: 'PDF压缩', legacyLabel: '原 PDF压缩' },
  { key: 'token-estimation', label: 'Token统计', legacyLabel: '' }
];
```

- [ ] **Step 4: 再跑测试，确认信息架构常量绿灯**

Run: `node --test tests/labNavigation.test.js`

Expected: PASS，4 个测试全部通过。

- [ ] **Step 5: 提交导航配置基线**

```bash
git add src/constants/labNavigation.js tests/labNavigation.test.js
git commit -m "test: 锁定 LLM Lab 一阶段导航结构"
```

### Task 2: 顶层壳层、品牌区和一级导航重组

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Header.jsx`
- Modify: `src/components/MethodologyTab.jsx`
- Create: `src/components/OnlineValidationWorkbench.jsx`

- [ ] **Step 1: 先写一个失败测试，锁定测试集工作台共享设置工具**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LS_LLM1,
  LS_LLM2,
  mergeLlmSettings
} from '../src/utils/testSetWorkbenchSettings.js';

test('mergeLlmSettings 用默认值覆盖缺失字段但保留现有字段', () => {
  const result = mergeLlmSettings(
    { modelName: 'gemini-2.5-pro', apiUrl: 'https://example.com' },
    { modelName: 'default-model', apiUrl: '', maxRetries: 2 }
  );

  assert.equal(result.modelName, 'gemini-2.5-pro');
  assert.equal(result.apiUrl, 'https://example.com');
  assert.equal(result.maxRetries, 2);
});

test('共享设置使用稳定的 localStorage key', () => {
  assert.equal(LS_LLM1, 'intelliextract_llm1');
  assert.equal(LS_LLM2, 'intelliextract_llm2');
});
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `node --test tests/testSetWorkbenchSettings.test.js`

Expected: FAIL，报错提示缺少 `src/utils/testSetWorkbenchSettings.js`。

- [ ] **Step 3: 实现共享设置纯函数，并改造 Header / App / Methodology**

```js
// src/utils/testSetWorkbenchSettings.js
export const LS_LLM1 = 'intelliextract_llm1';
export const LS_LLM2 = 'intelliextract_llm2';

export function mergeLlmSettings(savedSettings, defaults) {
  return {
    ...defaults,
    ...(savedSettings || {})
  };
}
```

```jsx
// src/components/Header.jsx
import { IconBooks, IconFlask, IconBinaryTree2, IconBolt } from '@tabler/icons-react';
import { APP_TABS, LAB_BRAND } from '../constants/labNavigation.js';

const TAB_ICONS = {
  'test-workbench': IconFlask,
  'online-validation': IconBolt,
  'data-prep': IconBinaryTree2,
  docs: IconBooks
};

export function Header({ activeTab, onTabChange }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <div className="brand-block">
            <div className="brand-copy">
              <h1>{LAB_BRAND.title}</h1>
              <p>{LAB_BRAND.subtitle}</p>
            </div>
          </div>

          <nav className="tab-nav" aria-label="Main tabs">
            {APP_TABS.map((tab) => {
              const Icon = TAB_ICONS[tab.key];
              return (
                <button
                  key={tab.key}
                  type="button"
                  className={`tab-button ${activeTab === tab.key ? 'active' : ''}`}
                  onClick={() => onTabChange(tab.key)}
                >
                  <Icon size={18} stroke={1.8} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
```

```jsx
// src/components/MethodologyTab.jsx
<h2 className="section-title">
  <IconBooks size={20} stroke={1.8} />
  <span>说明文档</span>
</h2>
<p className="section-caption">平台说明、输入输出规范与使用边界。</p>
```

```jsx
// src/components/OnlineValidationWorkbench.jsx
import { ExtractorTab } from './ExtractorTab.jsx';

export function OnlineValidationWorkbench(props) {
  return <ExtractorTab {...props} />;
}
```

```jsx
// src/App.jsx 关键挂载片段
import { OnlineValidationWorkbench } from './components/OnlineValidationWorkbench.jsx';
import { DataPreprocessingWorkbench } from './components/DataPreprocessingWorkbench.jsx';
import { TestSetWorkbench } from './components/TestSetWorkbench.jsx';

const [activeTab, setActiveTab] = useState('test-workbench');

{activeTab === 'test-workbench' && <TestSetWorkbench globalSettings={settings} />}
{activeTab === 'online-validation' && (
  <OnlineValidationWorkbench
    settings={settings}
    pdfFiles={pdfFiles}
    requirementsFile={requirementsFile}
    isRunning={isRunning}
    progress={progress}
    results={results}
    stats={stats}
    filterOnlyFound={filterOnlyFound}
    displayedResults={displayedResults}
    onSettingChange={handleSettingChange}
    onIndicatorTypeToggle={handleIndicatorTypeToggle}
    onPdfSelect={handlePdfSelect}
    onPdfRemove={handlePdfRemove}
    onRequirementsSelect={handleRequirementsSelect}
    onStart={handleStart}
    onFilterOnlyFoundChange={setFilterOnlyFound}
    resultsAnchorRef={resultsAnchorRef}
  />
)}
{activeTab === 'data-prep' && <DataPreprocessingWorkbench globalSettings={settings} />}
{activeTab === 'docs' && <MethodologyTab />}
```

- [ ] **Step 4: 验证共享设置测试和构建**

Run: `node --test tests/testSetWorkbenchSettings.test.js tests/labNavigation.test.js`

Expected: PASS。

Run: `npm run build`

Expected: FAIL 或 PASS 都可以；如果 FAIL，失败点应来自尚未创建的 `TestSetWorkbench.jsx` / `DataPreprocessingWorkbench.jsx`，说明顶层接线已生效。

- [ ] **Step 5: 提交壳层与品牌重组**

```bash
git add src/App.jsx src/components/Header.jsx src/components/MethodologyTab.jsx src/components/OnlineValidationWorkbench.jsx src/utils/testSetWorkbenchSettings.js tests/testSetWorkbenchSettings.test.js
git commit -m "feat: 重组 LLM Lab 顶层壳层与品牌区"
```

### Task 3: 测试集工作台容器化并隔离完整流程入口

**Files:**
- Create: `src/components/TestSetWorkbench.jsx`
- Modify: `src/components/FullFlowMode.jsx`
- Modify: `src/components/TestWorkbenchTab.jsx`
- Modify: `src/components/QuickValidationMode.jsx`
- Modify: `src/components/QuickOptimizationMode.jsx`
- Modify: `src/components/LLMSettingsDrawer.jsx`

- [ ] **Step 1: 先写失败测试，锁定测试集工作台二级子页结构**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { TEST_SET_SUBTABS } from '../src/constants/labNavigation.js';

test('测试集工作台保持三个独立子页入口', () => {
  assert.deepEqual(TEST_SET_SUBTABS, [
    { key: 'prompt-iteration', label: 'Prompt快速迭代', legacyLabel: '原完整流程模式' },
    { key: 'model-validation', label: '模型结果验收', legacyLabel: '原快速验收模式' },
    { key: 'prompt-optimization', label: 'Prompt自动优化', legacyLabel: '原快速优化模式' }
  ]);
});
```

- [ ] **Step 2: 运行测试，确认当前仍由常量测试兜底**

Run: `node --test tests/labNavigation.test.js`

Expected: PASS；此步确认我们有稳定的结构基线，再开始大组件迁移。

- [ ] **Step 3: 新建测试集工作台容器，并把完整流程从旧模式壳层中抽出**

```jsx
// src/components/TestSetWorkbench.jsx
import { useState } from 'react';
import { TEST_SET_SUBTABS } from '../constants/labNavigation.js';
import { mergeLlmSettings, LS_LLM1, LS_LLM2 } from '../utils/testSetWorkbenchSettings.js';
import { DEFAULT_LLM1_SETTINGS, DEFAULT_LLM2_SETTINGS } from '../constants/testBench.js';
import { LLMSettingsDrawer } from './LLMSettingsDrawer.jsx';
import { FullFlowMode } from './FullFlowMode.jsx';
import { QuickValidationMode } from './QuickValidationMode.jsx';
import { QuickOptimizationMode } from './QuickOptimizationMode.jsx';

function loadSettings(key, defaults) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? mergeLlmSettings(JSON.parse(raw), defaults) : { ...defaults };
  } catch {
    return { ...defaults };
  }
}

export function TestSetWorkbench({ globalSettings }) {
  const [activeSubtab, setActiveSubtab] = useState('prompt-iteration');
  const [preselectedOptCodes, setPreselectedOptCodes] = useState([]);
  const [llm1Settings, setLlm1Settings] = useState(() => loadSettings(LS_LLM1, {
    ...DEFAULT_LLM1_SETTINGS,
    apiUrl: globalSettings.apiUrl,
    apiKey: ''
  }));
  const [llm2Settings, setLlm2Settings] = useState(() => loadSettings(LS_LLM2, {
    ...DEFAULT_LLM2_SETTINGS,
    apiUrl: globalSettings.apiUrl,
    apiKey: ''
  }));

  return (
    <section className="glass-panel main-panel testbench-panel">
      {/* 子标签条 */}
      {/* activeSubtab === 'prompt-iteration' => <FullFlowMode ... /> */}
      {/* activeSubtab === 'model-validation' => <QuickValidationMode ... /> */}
      {/* activeSubtab === 'prompt-optimization' => <QuickOptimizationMode ... /> */}
    </section>
  );
}
```

```jsx
// src/components/FullFlowMode.jsx
export function FullFlowMode({
  globalSettings,
  llm1Settings,
  llm2Settings,
  onChangeLlm1,
  onChangeLlm2,
  onOpenSettings
}) {
  return (
    <div className="full-flow-mode">
      {/* 从 TestWorkbenchTab.jsx 当前 mode === 'full' 分支搬运完整流程逻辑 */}
    </div>
  );
}
```

搬运规则：

- 将 `src/components/TestWorkbenchTab.jsx` 当前 `mode === 'full'` 分支的 JSX 和其依赖的完整流程 handlers/state 搬到 `FullFlowMode.jsx`。
- 将 `ModeSelector` 从 `TestWorkbenchTab.jsx` 中彻底移出，不再对用户暴露旧模式切换语义。
- 将 `QuickValidationMode` 的 `onSwitchToOptimization` 保留，并在 `TestSetWorkbench.jsx` 中改为：

```jsx
onSwitchToOptimization={(rows, preselectedCodes) => {
  setPreselectedOptCodes(preselectedCodes || []);
  setActiveSubtab('prompt-optimization');
}}
```

- [ ] **Step 4: 运行构建，确认测试集工作台完成容器化**

Run: `npm run build`

Expected: PASS，顶层不再依赖旧 `TestWorkbenchTab` 的模式选择器入口。

- [ ] **Step 5: 提交测试集工作台重组**

```bash
git add src/components/TestSetWorkbench.jsx src/components/FullFlowMode.jsx src/components/TestWorkbenchTab.jsx src/components/QuickValidationMode.jsx src/components/QuickOptimizationMode.jsx src/components/LLMSettingsDrawer.jsx
git commit -m "feat: 重组测试集工作台为三子页结构"
```

### Task 4: 数据预处理工作台、Chunking测试接入与 Token 占位页

**Files:**
- Modify: `package.json`
- Create: `src/components/DataPreprocessingWorkbench.jsx`
- Create: `src/components/PdfSplitterTab.jsx`
- Create: `src/components/TokenEstimationPage.jsx`
- Create: `src/services/pdfSplitterService.js`
- Create: `tests/dataPreprocessingDeps.test.js`
- Modify: `src/styles/global.css`

- [ ] **Step 1: 先写失败测试，锁定新依赖与占位语义**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import pkg from '../package.json' with { type: 'json' };

test('package.json 为 Chunking测试 提供 jszip 依赖', () => {
  assert.equal(pkg.dependencies.jszip, '^3.10.1');
});
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `node --test tests/viteConfig.test.js`

Expected: PASS（现有 vite 测试仍绿）。

Run: `node --test tests/dataPreprocessingDeps.test.js`

Expected: FAIL，提示缺少 `tests/dataPreprocessingDeps.test.js` 或 `jszip` 依赖未声明。

- [ ] **Step 3: 迁移 `PdfSplitterTab` 和 `pdfSplitterService`，同时接入数据预处理工作台**

```json
// package.json
{
  "dependencies": {
    "jszip": "^3.10.1"
  }
}
```

```jsx
// src/components/DataPreprocessingWorkbench.jsx
import { useState } from 'react';
import { DATA_PREP_SUBTABS } from '../constants/labNavigation.js';
import { CompressorTab } from './CompressorTab.jsx';
import { PdfSplitterTab } from './PdfSplitterTab.jsx';
import { TokenEstimationPage } from './TokenEstimationPage.jsx';

export function DataPreprocessingWorkbench({ globalSettings }) {
  const [activeSubtab, setActiveSubtab] = useState('chunking');

  return (
    <section className="glass-panel main-panel data-prep-panel">
      {/* 子标签条 */}
      {activeSubtab === 'chunking' && (
        <PdfSplitterTab
          settings={globalSettings}
          apiKey={globalSettings.apiKey || ''}
        />
      )}
      {activeSubtab === 'pdf-compress' && <CompressorTab />}
      {activeSubtab === 'token-estimation' && <TokenEstimationPage />}
    </section>
  );
}
```

```jsx
// src/components/TokenEstimationPage.jsx
export function TokenEstimationPage() {
  return (
    <section className="glass-panel token-estimation-placeholder">
      <h3>Token统计</h3>
      <p>该页面将在下一阶段用于估计文本与文件输入的 token 量。</p>
      <ul>
        <li>支持纯文本输入</li>
        <li>支持多种文件类型</li>
        <li>支持后续扩展不同模型口径</li>
      </ul>
    </section>
  );
}
```

迁移边界：

- 从 `/Users/michael_drj/Desktop/report-parser/src/components/PdfSplitterTab.jsx` 迁入 `src/components/PdfSplitterTab.jsx`
- 从 `/Users/michael_drj/Desktop/report-parser/src/services/pdfSplitterService.js` 迁入 `src/services/pdfSplitterService.js`
- 保持 `UploadCard.jsx`、`ProgressPanel.jsx`、`fileParsers.js`、`llmClient.js` 的现有复用方式，不将新服务揉进 `testBenchService.js`

- [ ] **Step 4: 运行完整构建验证**

Run: `npm install`

Expected: 新增 `jszip` 安装完成。

Run: `npm run build`

Expected: PASS，`Chunking测试 / PDF压缩 / Token统计` 三个子页都已在数据预处理工作台可挂载。

- [ ] **Step 5: 提交数据预处理工作台**

```bash
git add package.json package-lock.json src/components/DataPreprocessingWorkbench.jsx src/components/PdfSplitterTab.jsx src/components/TokenEstimationPage.jsx src/services/pdfSplitterService.js src/styles/global.css
git commit -m "feat: 接入数据预处理工作台与 Chunking 测试"
```

### Task 5: 壳层样式、占位页文案与最终验证

**Files:**
- Modify: `src/styles/global.css`
- Modify: `src/components/Header.jsx`
- Modify: `src/components/MethodologyTab.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: 为新壳层补最小样式和文案收口**

```css
.brand-copy p {
  margin: 4px 0 0;
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.workbench-subtabs {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

.workbench-subtab-button {
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.38);
  color: var(--text-primary);
}

.workbench-subtab-button .legacy-label {
  color: var(--text-secondary);
  font-size: 0.75rem;
}

.token-estimation-placeholder ul {
  margin: 10px 0 0;
}
```

- [ ] **Step 2: 跑完整自动化验证**

Run: `npm test`

Expected: PASS，现有测试和新增常量/设置测试全部通过。

Run: `npm run build`

Expected: PASS，生产构建成功。

- [ ] **Step 3: 做手工回归清单**

手工验证：

1. 打开首页，确认品牌显示 `LLM Lab / 大语言模型工程实验室`
2. 一级导航显示 4 个入口
3. `测试集工作台` 内 3 个子页都能切换
4. `模型结果验收` 分析后可跳转 `Prompt自动优化`
5. `线上验证工作台` 可进入原摘录链路
6. `数据预处理工作台` 可进入 `Chunking测试 / PDF压缩 / Token统计`
7. `说明文档` 显示正常

- [ ] **Step 4: 提交阶段一壳层落地结果**

```bash
git add src/App.jsx src/components/Header.jsx src/components/MethodologyTab.jsx src/styles/global.css
git commit -m "feat: 完成 LLM Lab 一阶段平台壳层改版"
```
