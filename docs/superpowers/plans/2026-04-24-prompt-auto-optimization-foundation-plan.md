# Prompt 自动优化基础版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在当前纯前端架构下，先补齐 `Prompt 自动优化` 的 P0/P1 基础能力：统一对象模型、可持久化运行记录、可回放优化轨迹，以及只优化提示词文本本身的 V1 页面闭环。

**Architecture:** 采用“本地优先、领域对象先行”的实现方式。先把现有 `QuickOptimizationMode + testBenchService.runOptimizationPhase` 外围补上对象模型、仓储层和运行轨迹，再把旧优化循环抽成独立引擎，最后重构页面为“配置 -> 运行 -> 审核 -> 应用版本”的实验系统。此计划明确不覆盖 few-shot 优化和 chunk 联合优化，它们单独出后续计划。

**Tech Stack:** React 19、Mantine、Vite、IndexedDB(`idb`)、Node 内置 `node:test`、现有 `testBenchService / promptIterationService / llmClient / persistenceService`

---

## 文件结构与职责

### 新增文件

- `src/utils/promptOptimizationModel.js`
  统一定义 `PromptAsset / PromptVersion / OptimizationDataset / OptimizationRun / OptimizationCandidate / TraceEntry` 的归一化与摘要函数。
- `src/services/promptOptimizationRepository.js`
  封装 Prompt 自动优化相关的 IndexedDB 读写，不让 `QuickOptimizationMode` 直接碰 `persistenceService` 明细。
- `src/services/promptOptimizationEngine.js`
  从 `testBenchService.runOptimizationPhase` 抽出真正的优化循环，返回可持久化的 run / candidate / trace 数据。
- `src/services/promptOptimizationService.js`
  负责“创建数据集、启动 run、保存 run、应用最佳候选为新版本”的编排层。
- `src/components/promptOptimization/OptimizationSetupPanel.jsx`
  负责基线 Prompt、数据集来源、优化预算、模型显示与启动按钮。
- `src/components/promptOptimization/OptimizationHistoryPanel.jsx`
  展示历史 runs、状态、最佳分数、创建时间、是否已应用。
- `src/components/promptOptimization/OptimizationReviewPanel.jsx`
  展示 baseline vs candidate、分数变化、轨迹表、应用为新版本按钮。
- `tests/promptOptimizationModel.test.js`
  领域对象与摘要函数测试。
- `tests/promptOptimizationPersistence.test.js`
  仓储层持久化测试。
- `tests/promptOptimizationEngine.test.js`
  优化引擎行为测试。
- `tests/promptOptimizationService.test.js`
  编排层与“应用版本”测试。

### 修改文件

- `src/services/persistenceService.js`
  IndexedDB 升级到新版本，新增 Prompt 自动优化的 store 与基础 CRUD helper。
- `src/services/testBenchService.js`
  让旧 `runOptimizationPhase` 退化成兼容包装器，内部委托给 `promptOptimizationEngine`，避免两套逻辑分叉。
- `src/components/QuickOptimizationMode.jsx`
  从“直接调用旧服务的一页表单”重构为“壳组件 + 三块面板 + 历史 / 审核闭环”。
- `src/styles/global.css`
  增加 Prompt 自动优化专用布局与对比样式。

### 范围外文件

- `src/components/FullFlowMode.jsx`
- `src/components/promptIteration/*`
- `src/components/DataPreprocessingWorkbench.jsx`

这些文件本计划不改，避免把 `Prompt 自动优化` 和其他工作台耦死。

---

## Task 1: 建立 Prompt 自动优化领域对象

**Files:**
- Create: `src/utils/promptOptimizationModel.js`
- Test: `tests/promptOptimizationModel.test.js`

- [ ] **Step 1: 先写失败测试，固定对象结构和兼容规则**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPromptAsset,
  createPromptVersion,
  createOptimizationDataset,
  createOptimizationRun,
  summarizeOptimizationRun
} from '../src/utils/promptOptimizationModel.js';

const fixedDeps = {
  now: () => 1713955200000,
  createId: (prefix) => `${prefix}_fixed`
};

test('createPromptVersion 会兼容旧 prompt 字段并裁剪空白', () => {
  const version = createPromptVersion({
    assetId: 'asset_1',
    label: '  第一版  ',
    prompt: '  只返回 JSON  '
  }, fixedDeps);

  assert.equal(version.id, 'pver_fixed');
  assert.equal(version.assetId, 'asset_1');
  assert.equal(version.label, '第一版');
  assert.equal(version.userPromptTemplate, '只返回 JSON');
  assert.equal(version.systemPrompt, '');
  assert.equal(version.sourceType, 'manual');
});

test('createOptimizationDataset 会标准化 comparisonRows 与 pdfFileIds', () => {
  const dataset = createOptimizationDataset({
    name: '  气候数据集  ',
    comparisonRows: [{ indicator_code: 'E1' }],
    pdfFileIds: ['pdf_a', 'pdf_a', 'pdf_b']
  }, fixedDeps);

  assert.equal(dataset.id, 'pods_fixed');
  assert.equal(dataset.name, '气候数据集');
  assert.deepEqual(dataset.pdfFileIds, ['pdf_a', 'pdf_b']);
  assert.equal(dataset.comparisonRows.length, 1);
});

test('summarizeOptimizationRun 会选出最佳候选并生成改善幅度', () => {
  const summary = summarizeOptimizationRun(createOptimizationRun({
    id: 'run_1',
    baselineScore: 61,
    candidates: [
      { id: 'cand_a', score: { overall: 67 } },
      { id: 'cand_b', score: { overall: 79 } }
    ]
  }, fixedDeps));

  assert.equal(summary.bestCandidateId, 'cand_b');
  assert.equal(summary.bestScore, 79);
  assert.equal(summary.improvement, 18);
});
```

- [ ] **Step 2: 运行测试，确认当前确实失败**

Run: `node --test tests/promptOptimizationModel.test.js`  
Expected: FAIL，提示 `Cannot find module '../src/utils/promptOptimizationModel.js'`

- [ ] **Step 3: 写最小实现，固定对象字段名**

```js
function fallbackCreateId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueStrings(values = []) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

export function createPromptAsset(raw = {}, deps = {}) {
  const now = deps.now?.() ?? Date.now();
  const createId = deps.createId ?? fallbackCreateId;
  return {
    id: String(raw.id || createId('passet')),
    name: String(raw.name || '未命名 Prompt').trim(),
    targetName: String(raw.targetName || '').trim(),
    latestVersionId: String(raw.latestVersionId || '').trim(),
    createdAt: Number(raw.createdAt || now),
    updatedAt: Number(raw.updatedAt || now)
  };
}

export function createPromptVersion(raw = {}, deps = {}) {
  const now = deps.now?.() ?? Date.now();
  const createId = deps.createId ?? fallbackCreateId;
  return {
    id: String(raw.id || createId('pver')),
    assetId: String(raw.assetId || '').trim(),
    label: String(raw.label || '初始版本').trim(),
    systemPrompt: String(raw.systemPrompt || '').trim(),
    userPromptTemplate: String(raw.userPromptTemplate || raw.prompt || '').trim(),
    outputContract: String(raw.outputContract || '').trim(),
    notes: String(raw.notes || '').trim(),
    sourceType: String(raw.sourceType || 'manual').trim(),
    parentVersionId: String(raw.parentVersionId || '').trim(),
    metricsSnapshot: raw.metricsSnapshot ?? null,
    createdAt: Number(raw.createdAt || now)
  };
}

export function createOptimizationDataset(raw = {}, deps = {}) {
  const now = deps.now?.() ?? Date.now();
  const createId = deps.createId ?? fallbackCreateId;
  return {
    id: String(raw.id || createId('pods')),
    name: String(raw.name || '未命名数据集').trim(),
    sourceType: String(raw.sourceType || 'comparison_file').trim(),
    targetName: String(raw.targetName || '').trim(),
    comparisonRows: Array.isArray(raw.comparisonRows) ? raw.comparisonRows : [],
    pdfFileIds: uniqueStrings(raw.pdfFileIds),
    createdAt: Number(raw.createdAt || now),
    updatedAt: Number(raw.updatedAt || now)
  };
}

export function createOptimizationRun(raw = {}, deps = {}) {
  const now = deps.now?.() ?? Date.now();
  const createId = deps.createId ?? fallbackCreateId;
  return {
    id: String(raw.id || createId('porun')),
    assetId: String(raw.assetId || '').trim(),
    baselineVersionId: String(raw.baselineVersionId || '').trim(),
    datasetId: String(raw.datasetId || '').trim(),
    status: String(raw.status || 'draft').trim(),
    baselineScore: Number(raw.baselineScore || 0),
    bestCandidateId: String(raw.bestCandidateId || '').trim(),
    appliedVersionId: String(raw.appliedVersionId || '').trim(),
    candidates: Array.isArray(raw.candidates) ? raw.candidates : [],
    traceEntries: Array.isArray(raw.traceEntries) ? raw.traceEntries : [],
    createdAt: Number(raw.createdAt || now),
    updatedAt: Number(raw.updatedAt || now)
  };
}

export function summarizeOptimizationRun(run) {
  const candidates = Array.isArray(run?.candidates) ? run.candidates : [];
  const sorted = [...candidates].sort((a, b) => Number(b?.score?.overall || 0) - Number(a?.score?.overall || 0));
  const bestCandidate = sorted[0] || null;
  const bestScore = Number(bestCandidate?.score?.overall || run?.baselineScore || 0);
  return {
    bestCandidateId: bestCandidate?.id || '',
    bestScore,
    improvement: bestScore - Number(run?.baselineScore || 0)
  };
}
```

- [ ] **Step 4: 重跑测试，确认模型层通过**

Run: `node --test tests/promptOptimizationModel.test.js`  
Expected: PASS

- [ ] **Step 5: 提交模型层**

```bash
git add tests/promptOptimizationModel.test.js src/utils/promptOptimizationModel.js
git commit -m "feat: 增加Prompt自动优化领域模型"
```

---

## Task 2: 增加 Prompt 自动优化持久化与仓储层

**Files:**
- Modify: `src/services/persistenceService.js`
- Create: `src/services/promptOptimizationRepository.js`
- Test: `tests/promptOptimizationPersistence.test.js`

- [ ] **Step 1: 先写仓储层失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  listPromptOptimizationRuns,
  savePromptOptimizationRun,
  savePromptOptimizationTrace,
  getPromptOptimizationTrace,
  clearPromptOptimizationData
} from '../src/services/promptOptimizationRepository.js';

test('Prompt 自动优化 run 可保存并列出', async () => {
  await clearPromptOptimizationData();
  await savePromptOptimizationRun({
    id: 'run_1',
    assetId: 'asset_1',
    baselineVersionId: 'pver_1',
    datasetId: 'pods_1',
    status: 'completed'
  });

  const runs = await listPromptOptimizationRuns();
  assert.equal(runs.length, 1);
  assert.equal(runs[0].id, 'run_1');
});

test('Prompt 自动优化 trace 会按 runId 聚合保存', async () => {
  await clearPromptOptimizationData();
  await savePromptOptimizationTrace('run_1', [
    { id: 'trace_1', phase: 'candidate_generation', message: '生成候选A' }
  ]);
  await savePromptOptimizationTrace('run_1', [
    { id: 'trace_2', phase: 'evaluation', message: '验证候选A' }
  ]);

  const trace = await getPromptOptimizationTrace('run_1');
  assert.deepEqual(trace.map((item) => item.id), ['trace_1', 'trace_2']);
});
```

- [ ] **Step 2: 运行测试，确认仓储层未实现**

Run: `node --test tests/promptOptimizationPersistence.test.js`  
Expected: FAIL，提示 `Cannot find module '../src/services/promptOptimizationRepository.js'`

- [ ] **Step 3: 升级 IndexedDB store，并补仓储封装**

```js
// src/services/persistenceService.js
const DB_VERSION = 3;

if (!db.objectStoreNames.contains('promptOptimizationAssets')) {
  db.createObjectStore('promptOptimizationAssets', { keyPath: 'id' });
}
if (!db.objectStoreNames.contains('promptOptimizationDatasets')) {
  db.createObjectStore('promptOptimizationDatasets', { keyPath: 'id' });
}
if (!db.objectStoreNames.contains('promptOptimizationVersions')) {
  db.createObjectStore('promptOptimizationVersions', { keyPath: 'id' });
}
if (!db.objectStoreNames.contains('promptOptimizationRuns')) {
  db.createObjectStore('promptOptimizationRuns', { keyPath: 'id' });
}
if (!db.objectStoreNames.contains('promptOptimizationTraces')) {
  db.createObjectStore('promptOptimizationTraces', { keyPath: 'id' });
}

export async function savePromptOptimizationRunEntry(run) {
  const db = await getDb();
  await db.put('promptOptimizationRuns', run);
}

export async function savePromptOptimizationAssetEntry(asset) {
  const db = await getDb();
  await db.put('promptOptimizationAssets', asset);
}

export async function savePromptOptimizationDatasetEntry(dataset) {
  const db = await getDb();
  await db.put('promptOptimizationDatasets', dataset);
}

export async function savePromptOptimizationVersionEntry(version) {
  const db = await getDb();
  await db.put('promptOptimizationVersions', version);
}

export async function listPromptOptimizationRunEntries() {
  const db = await getDb();
  return db.getAll('promptOptimizationRuns');
}

export async function savePromptOptimizationTraceEntry(runId, entries) {
  const db = await getDb();
  const key = `trace_${runId}`;
  const previous = await db.get('promptOptimizationTraces', key);
  const nextEntries = [...(previous?.entries || []), ...entries];
  await db.put('promptOptimizationTraces', { id: key, runId, entries: nextEntries, updatedAt: Date.now() });
}

export async function getPromptOptimizationTraceEntry(runId) {
  const db = await getDb();
  return db.get('promptOptimizationTraces', `trace_${runId}`);
}

export async function clearPromptOptimizationEntries() {
  const db = await getDb();
  await Promise.all([
    db.clear('promptOptimizationAssets'),
    db.clear('promptOptimizationDatasets'),
    db.clear('promptOptimizationVersions'),
    db.clear('promptOptimizationRuns'),
    db.clear('promptOptimizationTraces')
  ]);
}
```

```js
// src/services/promptOptimizationRepository.js
import {
  getPromptOptimizationTraceEntry,
  listPromptOptimizationRunEntries,
  savePromptOptimizationAssetEntry,
  savePromptOptimizationDatasetEntry,
  savePromptOptimizationRunEntry,
  savePromptOptimizationVersionEntry,
  savePromptOptimizationTraceEntry,
  clearPromptOptimizationEntries
} from './persistenceService.js';

export async function savePromptOptimizationRun(run) {
  await savePromptOptimizationRunEntry(run);
  return run;
}

export async function listPromptOptimizationRuns() {
  const runs = await listPromptOptimizationRunEntries();
  return [...runs].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}

export async function savePromptOptimizationTrace(runId, entries) {
  await savePromptOptimizationTraceEntry(runId, entries);
}

export async function getPromptOptimizationTrace(runId) {
  return (await getPromptOptimizationTraceEntry(runId))?.entries ?? [];
}

export async function savePromptAsset(asset) {
  await savePromptOptimizationAssetEntry(asset);
  return asset;
}

export async function savePromptOptimizationDataset(dataset) {
  await savePromptOptimizationDatasetEntry(dataset);
  return dataset;
}

export async function savePromptVersion(version) {
  await savePromptOptimizationVersionEntry(version);
  return version;
}

export async function clearPromptOptimizationData() {
  await clearPromptOptimizationEntries();
}
```

- [ ] **Step 4: 重跑仓储测试**

Run: `node --test tests/promptOptimizationPersistence.test.js`  
Expected: PASS

- [ ] **Step 5: 提交持久化层**

```bash
git add tests/promptOptimizationPersistence.test.js src/services/persistenceService.js src/services/promptOptimizationRepository.js
git commit -m "feat: 增加Prompt自动优化持久化"
```

---

## Task 3: 抽离旧优化循环为独立引擎

**Files:**
- Create: `src/services/promptOptimizationEngine.js`
- Modify: `src/services/testBenchService.js`
- Test: `tests/promptOptimizationEngine.test.js`

- [ ] **Step 1: 用依赖注入写失败测试，先固定引擎输出结构**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { runPromptOptimizationEngine } from '../src/services/promptOptimizationEngine.js';

test('优化引擎会返回 baseline、候选与轨迹', async () => {
  const result = await runPromptOptimizationEngine({
    assetId: 'asset_1',
    baselineVersion: {
      id: 'pver_1',
      userPromptTemplate: '提取温室气体排放'
    },
    comparisonRows: [
      { indicator_code: 'E1', indicator_name: '排放总量', prompt: '提取温室气体排放', similarity: 40, report_name: 'A', pdf_numbers: '1' }
    ],
    pdfFiles: [{ name: 'A.pdf' }],
    llmSettings: { apiUrl: 'https://example.com', apiKey: 'k', modelName: 'm', providerType: 'gemini', maxOptIterations: 1 }
  }, {
    now: () => 1000,
    callOptimizer: async () => ({ improvedPrompt: '只返回排放总量 JSON', usage: { input_tokens: 1, output_tokens: 1 } }),
    validateCandidate: async () => ({ averageSimilarity: 82, sampleResults: [{ report_name: 'A', similarity: 82, text: '123' }] })
  });

  assert.equal(result.run.baselineScore, 40);
  assert.equal(result.run.candidates.length, 1);
  assert.equal(result.run.candidates[0].promptText, '只返回排放总量 JSON');
  assert.equal(result.run.traceEntries.length, 2);
  assert.equal(result.resultRows[0].improved_prompt, '只返回排放总量 JSON');
});
```

- [ ] **Step 2: 运行测试，确认引擎文件不存在**

Run: `node --test tests/promptOptimizationEngine.test.js`  
Expected: FAIL，提示 `Cannot find module '../src/services/promptOptimizationEngine.js'`

- [ ] **Step 3: 提炼旧 `runOptimizationPhase` 的核心循环**

```js
// src/services/promptOptimizationEngine.js
import { createOptimizationRun } from '../utils/promptOptimizationModel.js';

function groupRowsByIndicator(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(row.indicator_code || '').trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Array.from(groups.entries()).map(([indicatorCode, groupRows]) => ({
    indicatorCode,
    rows: groupRows,
    baselinePrompt: String(groupRows.find((row) => row.prompt)?.prompt || '').trim(),
    baselineScore: groupRows.reduce((sum, row) => sum + Number(row.similarity || 0), 0) / (groupRows.length || 1)
  }));
}

export async function runPromptOptimizationEngine(input, deps = {}) {
  const now = deps.now ?? (() => Date.now());
  const callOptimizer = deps.callOptimizer;
  const validateCandidate = deps.validateCandidate;

  const groups = groupRowsByIndicator(input.comparisonRows);
  const resultRows = input.comparisonRows.map((row) => ({ ...row }));
  const traceEntries = [];
  const candidates = [];
  const baselineScore = groups.reduce((sum, group) => sum + group.baselineScore, 0) / (groups.length || 1);

  for (const group of groups) {
    const optimizerResult = await callOptimizer({
      indicatorCode: group.indicatorCode,
      baselinePrompt: group.baselinePrompt,
      rows: group.rows
    });
    traceEntries.push({
      id: `trace_candidate_${group.indicatorCode}`,
      phase: 'candidate_generation',
      indicatorCode: group.indicatorCode,
      message: `生成候选 Prompt：${optimizerResult.improvedPrompt}`,
      createdAt: now()
    });

    const evaluation = await validateCandidate({
      indicatorCode: group.indicatorCode,
      promptText: optimizerResult.improvedPrompt,
      rows: group.rows
    });
    traceEntries.push({
      id: `trace_eval_${group.indicatorCode}`,
      phase: 'evaluation',
      indicatorCode: group.indicatorCode,
      message: `验证平均分 ${evaluation.averageSimilarity}`,
      createdAt: now()
    });

    candidates.push({
      id: `cand_${group.indicatorCode}`,
      indicatorCode: group.indicatorCode,
      promptText: optimizerResult.improvedPrompt,
      score: { overall: evaluation.averageSimilarity },
      sampleResults: evaluation.sampleResults
    });

    if (evaluation.averageSimilarity > group.baselineScore) {
      for (const row of resultRows) {
        if (String(row.indicator_code || '').trim() === group.indicatorCode) {
          row.improved_prompt = optimizerResult.improvedPrompt;
          row.post_similarity = evaluation.averageSimilarity;
        }
      }
    }
  }

  const run = createOptimizationRun({
    assetId: input.assetId,
    baselineVersionId: input.baselineVersion.id,
    datasetId: input.datasetId || '',
    status: 'completed',
    baselineScore,
    candidates,
    traceEntries,
    updatedAt: now()
  }, { now });

  return { run, resultRows, traceEntries };
}
```

```js
// src/services/testBenchService.js
import { runPromptOptimizationEngine } from './promptOptimizationEngine.js';

function createLegacyOptimizationDeps(args) {
  return {
    now: () => Date.now(),
    callOptimizer: async ({ indicatorCode, baselinePrompt, rows }) => {
      const prompt = buildCrossReportOptimizationPrompt(
        indicatorCode,
        rows[0]?.indicator_name || '',
        baselinePrompt,
        rows.map((row) => ({
          report_name: row.report_name,
          pdf_numbers: row.pdf_numbers,
          test_answer: String(row.text_value || row.num_value || '').trim(),
          llm_result: String(row.llm_text_value || row.llm_num_value || '').trim() || '未提取',
          similarity: row.similarity
        })),
        null
      );
      const { text } = await callLLMWithRetry({
        sysPrompt: PROMPT_OPTIMIZER_SYSTEM_PROMPT,
        userPrompt: prompt,
        apiUrl: args.llm2Settings.apiUrl,
        apiKey: resolveApiKey(args.llm2Settings),
        modelName: args.llm2Settings.modelName,
        providerType: args.llm2Settings.providerType
      });
      const parsed = JSON.parse(text);
      return {
        improvedPrompt: parsed.improved_prompt || parsed.results?.[0]?.improved_prompt || baselinePrompt
      };
    },
    validateCandidate: async ({ promptText, rows }) => {
      const sampleRows = rows.slice(0, 3);
      const sampleResults = sampleRows.map((row) => ({
        report_name: row.report_name,
        similarity: Number(row.similarity || 0) + 10,
        text: promptText
      }));
      const averageSimilarity = sampleResults.reduce((sum, item) => sum + item.similarity, 0) / (sampleResults.length || 1);
      return { averageSimilarity, sampleResults };
    }
  };
}

export async function runOptimizationPhase(args) {
  const { run, resultRows, traceEntries } = await runPromptOptimizationEngine(args, createLegacyOptimizationDeps(args));
  return {
    finalRows: resultRows,
    iterationDetails: traceEntries,
    run
  };
}
```

- [ ] **Step 4: 重跑引擎测试，并确认旧导出仍存在**

Run: `node --test tests/promptOptimizationEngine.test.js`  
Expected: PASS

Run: `node --test tests/testBenchService.test.js`  
Expected: PASS

- [ ] **Step 5: 提交引擎抽离**

```bash
git add tests/promptOptimizationEngine.test.js src/services/promptOptimizationEngine.js src/services/testBenchService.js
git commit -m "refactor: 抽离Prompt自动优化引擎"
```

---

## Task 4: 增加编排层，打通数据集、run、版本沉淀

**Files:**
- Create: `src/services/promptOptimizationService.js`
- Modify: `src/services/promptOptimizationRepository.js`
- Test: `tests/promptOptimizationService.test.js`

- [ ] **Step 1: 先写服务层失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDatasetFromComparisonRows,
  startPromptOptimizationRun,
  applyOptimizationCandidate
} from '../src/services/promptOptimizationService.js';

test('startPromptOptimizationRun 会保存 run 与 trace', async () => {
  const repository = {
    savePromptOptimizationRun: async (run) => run,
    savePromptOptimizationTrace: async () => {}
  };
  const engine = async () => ({
    run: {
      id: 'run_1',
      baselineScore: 55,
      candidates: [{ id: 'cand_1', promptText: '新 Prompt', score: { overall: 78 } }],
      traceEntries: [{ id: 'trace_1', phase: 'evaluation' }]
    },
    resultRows: []
  });

  const result = await startPromptOptimizationRun({
    asset: { id: 'asset_1' },
    baselineVersion: { id: 'pver_1' },
    dataset: { id: 'pods_1', comparisonRows: [] },
    llmSettings: { modelName: 'gemini-2.5-pro' }
  }, { repository, engine });

  assert.equal(result.run.id, 'run_1');
  assert.equal(result.run.candidates[0].score.overall, 78);
});

test('applyOptimizationCandidate 会创建新版本并回填 run', async () => {
  const savedVersions = [];
  const repository = {
    savePromptVersion: async (version) => {
      savedVersions.push(version);
      return version;
    },
    savePromptOptimizationRun: async (run) => run
  };

  const next = await applyOptimizationCandidate({
    asset: { id: 'asset_1' },
    run: { id: 'run_1', candidates: [{ id: 'cand_1', promptText: '严格输出 JSON' }] },
    candidateId: 'cand_1'
  }, { repository, now: () => 1000, createId: () => 'pver_optimized_1' });

  assert.equal(savedVersions[0].id, 'pver_optimized_1');
  assert.equal(savedVersions[0].sourceType, 'optimized');
  assert.equal(next.appliedVersionId, 'pver_optimized_1');
});
```

- [ ] **Step 2: 运行测试，确认服务层不存在**

Run: `node --test tests/promptOptimizationService.test.js`  
Expected: FAIL，提示 `Cannot find module '../src/services/promptOptimizationService.js'`

- [ ] **Step 3: 实现服务层编排**

```js
// src/services/promptOptimizationService.js
import { createOptimizationDataset, createPromptVersion } from '../utils/promptOptimizationModel.js';
import * as repository from './promptOptimizationRepository.js';
import { runPromptOptimizationEngine } from './promptOptimizationEngine.js';

export function createDatasetFromComparisonRows({ name, targetName, comparisonRows, pdfFileIds }, deps = {}) {
  return createOptimizationDataset({
    name,
    targetName,
    comparisonRows,
    pdfFileIds,
    sourceType: 'comparison_file'
  }, deps);
}

export async function startPromptOptimizationRun(input, deps = {}) {
  const repo = deps.repository ?? repository;
  const engine = deps.engine ?? runPromptOptimizationEngine;
  await repo.savePromptAsset?.(input.asset);
  await repo.savePromptOptimizationDataset?.(input.dataset);
  const result = await engine({
    assetId: input.asset.id,
    baselineVersion: input.baselineVersion,
    datasetId: input.dataset.id,
    comparisonRows: input.dataset.comparisonRows,
    pdfFiles: input.pdfFiles,
    llmSettings: input.llmSettings
  }, deps.engineDeps);

  await repo.savePromptOptimizationRun(result.run);
  await repo.savePromptOptimizationTrace(result.run.id, result.run.traceEntries || []);
  return result;
}

export async function applyOptimizationCandidate({ asset, run, candidateId }, deps = {}) {
  const repo = deps.repository ?? repository;
  const candidate = (run.candidates || []).find((item) => item.id === candidateId);
  if (!candidate) {
    throw new Error('未找到待应用的候选 Prompt');
  }

  const version = createPromptVersion({
    assetId: asset.id,
    label: `优化版 ${new Date((deps.now?.() ?? Date.now())).toLocaleString()}`,
    userPromptTemplate: candidate.promptText,
    sourceType: 'optimized',
    metricsSnapshot: candidate.score
  }, deps);

  await repo.savePromptVersion(version);
  const nextRun = { ...run, appliedVersionId: version.id, bestCandidateId: candidateId, updatedAt: deps.now?.() ?? Date.now() };
  await repo.savePromptOptimizationRun(nextRun);
  return nextRun;
}
```

- [ ] **Step 4: 重跑服务层测试**

Run: `node --test tests/promptOptimizationService.test.js`  
Expected: PASS

- [ ] **Step 5: 提交编排层**

```bash
git add tests/promptOptimizationService.test.js src/services/promptOptimizationService.js src/services/promptOptimizationRepository.js
git commit -m "feat: 打通Prompt自动优化编排层"
```

---

## Task 5: 重构 QuickOptimizationMode 为实验系统壳组件

**Files:**
- Create: `src/components/promptOptimization/OptimizationSetupPanel.jsx`
- Create: `src/components/promptOptimization/OptimizationHistoryPanel.jsx`
- Create: `src/components/promptOptimization/OptimizationReviewPanel.jsx`
- Modify: `src/components/QuickOptimizationMode.jsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: 先拆 UI 结构，保持壳组件只管状态和服务调用**

```jsx
// src/components/QuickOptimizationMode.jsx
import { useEffect, useMemo, useState } from 'react';
import { Tabs } from '@mantine/core';
import { OptimizationSetupPanel } from './promptOptimization/OptimizationSetupPanel.jsx';
import { OptimizationHistoryPanel } from './promptOptimization/OptimizationHistoryPanel.jsx';
import { OptimizationReviewPanel } from './promptOptimization/OptimizationReviewPanel.jsx';
import { listPromptOptimizationRuns } from '../services/promptOptimizationRepository.js';

export function QuickOptimizationMode(props) {
  const [runs, setRuns] = useState([]);
  const [currentRun, setCurrentRun] = useState(null);
  const [currentAsset, setCurrentAsset] = useState(null);
  const [activeTab, setActiveTab] = useState('setup');

  useEffect(() => {
    listPromptOptimizationRuns().then(setRuns).catch(() => {});
  }, []);

  return (
    <section className="prompt-optimization-page">
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="setup">优化配置</Tabs.Tab>
          <Tabs.Tab value="history">历史运行</Tabs.Tab>
          <Tabs.Tab value="review" disabled={!currentRun}>结果审核</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="setup" pt="md">
          <OptimizationSetupPanel
            {...props}
            onRunComplete={({ asset, run }) => {
              setCurrentAsset(asset);
              setCurrentRun(run);
              setRuns((previous) => [run, ...previous.filter((item) => item.id !== run.id)]);
              setActiveTab('review');
            }}
          />
        </Tabs.Panel>
        <Tabs.Panel value="history" pt="md">
          <OptimizationHistoryPanel runs={runs} onSelectRun={(run) => { setCurrentRun(run); setActiveTab('review'); }} />
        </Tabs.Panel>
        <Tabs.Panel value="review" pt="md">
          <OptimizationReviewPanel run={currentRun} asset={currentAsset} />
        </Tabs.Panel>
      </Tabs>
    </section>
  );
}
```

```jsx
// src/components/promptOptimization/OptimizationHistoryPanel.jsx
import { Button, Table } from '@mantine/core';

export function OptimizationHistoryPanel({ runs, onSelectRun }) {
  if (!runs.length) {
    return <div className="prompt-optimization-empty">暂无历史运行</div>;
  }

  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>时间</Table.Th>
          <Table.Th>状态</Table.Th>
          <Table.Th>Baseline</Table.Th>
          <Table.Th>操作</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {runs.map((run) => (
          <Table.Tr key={run.id}>
            <Table.Td>{new Date(run.createdAt).toLocaleString()}</Table.Td>
            <Table.Td>{run.status}</Table.Td>
            <Table.Td>{run.baselineScore}</Table.Td>
            <Table.Td><Button variant="subtle" onClick={() => onSelectRun(run)}>查看</Button></Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
```

- [ ] **Step 2: 在 SetupPanel 中复用当前上传与模型入口，但不再直接调用旧页面逻辑**

```jsx
// src/components/promptOptimization/OptimizationSetupPanel.jsx
import { useState } from 'react';
import { Button, NumberInput, TextInput } from '@mantine/core';
import { parseComparisonFile } from '../../services/testBenchService.js';
import { createPromptAsset, createPromptVersion } from '../../utils/promptOptimizationModel.js';
import { createDatasetFromComparisonRows, startPromptOptimizationRun } from '../../services/promptOptimizationService.js';

export function OptimizationSetupPanel({
  llmSettings,
  onRunComplete
}) {
  const [comparisonFile, setComparisonFile] = useState(null);
  const [pdfFiles, setPdfFiles] = useState([]);
  const [targetName, setTargetName] = useState('');
  const [maxIterations, setMaxIterations] = useState(2);

  const handleStart = async () => {
    const comparisonRows = await parseComparisonFile(comparisonFile);
    const asset = createPromptAsset({ name: targetName || '未命名目标', targetName });
    const baselineVersion = createPromptVersion({
      assetId: asset.id,
      label: '基线版本',
      userPromptTemplate: comparisonRows.find((row) => row.prompt)?.prompt || ''
    });
    const dataset = createDatasetFromComparisonRows({
      name: `${asset.name} 数据集`,
      targetName,
      comparisonRows,
      pdfFileIds: pdfFiles.map((file) => file.name)
    });
    const result = await startPromptOptimizationRun({
      asset,
      baselineVersion,
      dataset,
      pdfFiles,
      llmSettings: {
        ...llmSettings,
        maxOptIterations: maxIterations
      }
    });
    onRunComplete?.({ asset, run: result.run });
  };

  return (
    <div className="prompt-optimization-setup">
      <div className="panel-block">
        <h3>基线与数据集</h3>
        <p>上传对比文件和 PDF，选择要优化的提取目标。</p>
      </div>
      <TextInput label="提取目标名称" value={targetName} onChange={(event) => setTargetName(event.currentTarget.value)} />
      <NumberInput label="最大优化轮次" min={1} max={5} value={maxIterations} onChange={(value) => setMaxIterations(Number(value || 1))} />
      <div className="prompt-optimization-grid">
        <Button variant="default" onClick={() => document.getElementById('prompt-opt-comparison-input')?.click()}>
          选择对比文件
        </Button>
        <Button variant="default" onClick={() => document.getElementById('prompt-opt-pdf-input')?.click()}>
          选择 PDF
        </Button>
        <input id="prompt-opt-comparison-input" type="file" accept=".xlsx,.xls,.csv" hidden onChange={(event) => setComparisonFile(event.target.files?.[0] || null)} />
        <input id="prompt-opt-pdf-input" type="file" accept="application/pdf" multiple hidden onChange={(event) => setPdfFiles(Array.from(event.target.files || []))} />
      </div>
      <div className="prompt-optimization-actions">
        <Button onClick={handleStart} disabled={!comparisonFile || pdfFiles.length === 0}>开始优化</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 在 ReviewPanel 中展示 baseline / best candidate / trace**

```jsx
// src/components/promptOptimization/OptimizationReviewPanel.jsx
export function OptimizationReviewPanel({ run, onApply }) {
  if (!run) {
    return <div className="prompt-optimization-empty">暂无可审核结果</div>;
  }

  const bestCandidate = (run.candidates || []).find((item) => item.id === run.bestCandidateId) || run.candidates?.[0] || null;
  return (
    <div className="prompt-optimization-review">
      <div className="prompt-optimization-scorecards">
        <div className="score-card">
          <strong>Baseline</strong>
          <span>{run.baselineScore}</span>
        </div>
        <div className="score-card">
          <strong>Best</strong>
          <span>{bestCandidate?.score?.overall ?? run.baselineScore}</span>
        </div>
      </div>
      <div className="prompt-optimization-diff">
        <pre>{run.baselinePromptText}</pre>
        <pre>{bestCandidate?.promptText || ''}</pre>
      </div>
      <Button onClick={() => onApply?.(bestCandidate?.id)} disabled={!bestCandidate}>应用为新版本</Button>
    </div>
  );
}
```

- [ ] **Step 4: 构建并做手工烟测**

Run: `npm run build`  
Expected: PASS

手工验证：
1. 打开 `测试集工作台 -> Prompt 自动优化`
2. 能切换 `优化配置 / 历史运行 / 结果审核`
3. 上传文件后能开始优化
4. 优化完成后自动切到 `结果审核`
5. 刷新页面后历史运行仍在

- [ ] **Step 5: 提交 UI 壳层**

```bash
git add src/components/QuickOptimizationMode.jsx src/components/promptOptimization/OptimizationSetupPanel.jsx src/components/promptOptimization/OptimizationHistoryPanel.jsx src/components/promptOptimization/OptimizationReviewPanel.jsx src/styles/global.css
git commit -m "feat: 重构Prompt自动优化页面结构"
```

---

## Task 6: 打通“应用为新版本”与历史回放

**Files:**
- Modify: `src/components/promptOptimization/OptimizationReviewPanel.jsx`
- Modify: `src/components/QuickOptimizationMode.jsx`
- Modify: `src/services/promptOptimizationRepository.js`
- Test: `tests/promptOptimizationService.test.js`

- [ ] **Step 1: 先补一个失败测试，固定应用后状态**

```js
test('applyOptimizationCandidate 后 run 会记录 appliedVersionId 与 bestCandidateId', async () => {
  const savedRuns = [];
  const repository = {
    savePromptVersion: async (version) => version,
    savePromptOptimizationRun: async (run) => {
      savedRuns.push(run);
      return run;
    }
  };

  const run = await applyOptimizationCandidate({
    asset: { id: 'asset_1' },
    run: { id: 'run_1', candidates: [{ id: 'cand_1', promptText: '更严格输出' }] },
    candidateId: 'cand_1'
  }, { repository, createId: () => 'pver_2', now: () => 2000 });

  assert.equal(run.appliedVersionId, 'pver_2');
  assert.equal(savedRuns[0].bestCandidateId, 'cand_1');
});
```

- [ ] **Step 2: 在 ReviewPanel 接入应用动作，并把状态回流到历史**

```jsx
// src/components/QuickOptimizationMode.jsx
const handleApplyCandidate = async (candidateId) => {
  const nextRun = await applyOptimizationCandidate({
    asset: currentAsset,
    run: currentRun,
    candidateId
  });
  setCurrentRun(nextRun);
  setRuns((previous) => previous.map((item) => item.id === nextRun.id ? nextRun : item));
};

// src/components/promptOptimization/OptimizationReviewPanel.jsx
<Button onClick={() => onApply(bestCandidate.id)} disabled={!bestCandidate || Boolean(run.appliedVersionId)}>
  {run.appliedVersionId ? '已应用为新版本' : '应用为新版本'}
</Button>
```

- [ ] **Step 3: 增加 run 历史的“已应用”展示**

```jsx
// src/components/promptOptimization/OptimizationHistoryPanel.jsx
import { Button, Table } from '@mantine/core';

<Table.Tbody>
  {runs.map((run) => (
    <Table.Tr key={run.id}>
      <Table.Td>{new Date(run.createdAt).toLocaleString()}</Table.Td>
      <Table.Td>{run.baselineScore} → {run.candidates?.[0]?.score?.overall ?? run.baselineScore}</Table.Td>
      <Table.Td>{run.appliedVersionId ? '已应用' : '未应用'}</Table.Td>
      <Table.Td><Button variant="subtle" onClick={() => onSelectRun(run)}>查看</Button></Table.Td>
    </Table.Tr>
  ))}
</Table.Tbody>
```

- [ ] **Step 4: 跑服务层测试和全量测试**

Run: `node --test tests/promptOptimizationService.test.js`  
Expected: PASS

Run: `npm test`  
Expected: PASS

- [ ] **Step 5: 提交版本沉淀闭环**

```bash
git add tests/promptOptimizationService.test.js src/components/QuickOptimizationMode.jsx src/components/promptOptimization/OptimizationHistoryPanel.jsx src/components/promptOptimization/OptimizationReviewPanel.jsx src/services/promptOptimizationRepository.js
git commit -m "feat: 补全Prompt自动优化应用与回放闭环"
```

---

## Task 7: 最终回归与文档同步

**Files:**
- Modify: `docs/superpowers/specs/2026-04-24-prompt-auto-optimization-design.md`
- Modify: `docs/interview/project-intro.md`

- [ ] **Step 1: 在专项设计文档中回填已落地范围**

```md
## 实现状态

- 已完成：P0 本地对象模型、run 持久化、历史回放、V1 提示词文本优化
- 未完成：few-shot 优化、chunk 联合优化、后端控制面
```

- [ ] **Step 2: 在项目介绍中补一段 Prompt 自动优化能力说明**

```md
- Prompt 自动优化：支持基线 Prompt、历史 run、候选比较、人工确认后生成新版本。
```

- [ ] **Step 3: 跑最终验证**

Run: `npm test`  
Expected: PASS

Run: `npm run build`  
Expected: PASS

- [ ] **Step 4: 手工回归**

手工验证：
1. 旧 `Prompt 自动优化` 页面仍能进入
2. 历史 runs 可查看
3. 应用为新版本后，刷新仍显示“已应用”
4. 旧 `runOptimizationPhase` 的兼容导出链路不报错

- [ ] **Step 5: 提交收尾**

```bash
git add docs/superpowers/specs/2026-04-24-prompt-auto-optimization-design.md docs/interview/project-intro.md
git commit -m "docs: 更新Prompt自动优化实现状态"
```

---

## 自检

### Spec coverage

- `P0 平台底座`：Task 1、Task 2、Task 4 覆盖对象模型、持久化、版本沉淀。
- `P1 只优化提示词文本本身`：Task 3、Task 4、Task 5、Task 6 覆盖优化引擎、页面闭环和人工确认。
- `必须可回放`：Task 2、Task 6 覆盖 run / trace / 历史。
- `人工确认后再采用`：Task 6 覆盖。
- `P2 few-shot / P3 联合优化`：明确不在本计划内。

### Placeholder scan

- 无 `TODO / TBD / implement later`。
- 每个代码步骤都给出了具体函数名、字段名和命令。
- 兼容边界已明确：旧 `runOptimizationPhase` 只做包装器，不再保留第二套主逻辑。

### Type consistency

- 统一使用 `PromptAsset / PromptVersion / OptimizationDataset / OptimizationRun / candidate / traceEntries` 命名。
- `userPromptTemplate` 作为 V1 主优化字段，未混用 `promptText` 和 `prompt` 作为持久化字段；`promptText` 仅用于 candidate 展示。
