# 快速验收模式手动关联字段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为测试集工作台的快速验收模式增加可持久化的手动关联字段配置、默认规则回退和分析前严格校验。

**Architecture:** 先把“字段映射默认值、空配置回退、重复字段校验、动态 join key、0 匹配判定”抽成可单测的纯函数，再让 `testBenchService` 和 `QuickValidationMode` 使用这些函数。UI 只负责映射配置的展示、编辑和错误提示；服务层负责基于映射执行关联和返回匹配结果；持久化层只负责用固定 key 保存和恢复快速验收模式的映射配置。

**Tech Stack:** React 19、Vite、Node `--test`、IndexedDB (`idb`)、Mantine、Tabler Icons

---

## 文件结构

- Create: `src/utils/validationFieldMappings.js`
  - 负责默认映射、映射归一化、字段列表提取、静态配置校验、join key 生成。
- Create: `tests/validationFieldMappings.test.js`
  - 负责覆盖默认映射回退、字段重复、字段缺失、动态 join key。
- Modify: `src/services/testBenchService.js`
  - 让快速验收模式支持动态字段映射，并返回 0 匹配可识别结果。
- Modify: `tests/testBenchService.test.js`
  - 负责覆盖快速验收模式的手动映射、删空回退默认映射、0 匹配场景。
- Modify: `src/services/persistenceService.js`
  - 增加快速验收模式映射配置的保存和读取接口。
- Modify: `src/components/QuickValidationMode.jsx`
  - 新增映射折叠面板、字段下拉、增删、持久化恢复、分析前严格校验。
- Modify: `src/styles/global.css`
  - 新增连接触发器和映射面板样式。

### Task 1: 字段映射纯逻辑与测试

**Files:**
- Create: `src/utils/validationFieldMappings.js`
- Test: `tests/validationFieldMappings.test.js`

- [ ] **Step 1: 写失败测试，覆盖默认映射回退、字段重复和 join key**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_VALIDATION_FIELD_MAPPINGS,
  resolveValidationFieldMappings,
  extractFieldOptionsFromRows,
  validateValidationFieldMappings,
  buildRowJoinKey
} from '../src/utils/validationFieldMappings.js';

test('resolveValidationFieldMappings 在空配置时回退默认映射', () => {
  assert.deepEqual(resolveValidationFieldMappings([]), DEFAULT_VALIDATION_FIELD_MAPPINGS);
});

test('extractFieldOptionsFromRows 只提取首行字段名', () => {
  assert.deepEqual(
    extractFieldOptionsFromRows([{ report_name: '报告A', custom_code: 'A-1' }]),
    ['report_name', 'custom_code']
  );
});

test('validateValidationFieldMappings 会拦截重复字段与不存在字段', () => {
  const result = validateValidationFieldMappings({
    mappings: [
      { llmField: 'report_name', testField: 'report_name' },
      { llmField: 'report_name', testField: 'data_year' }
    ],
    llmFields: ['report_name', 'indicator_code', 'year'],
    testFields: ['report_name', 'indicator_code', 'data_year']
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /LLM 字段 "report_name" 被重复使用/);
});

test('buildRowJoinKey 按映射字段顺序生成 join key', () => {
  const mappings = [
    { llmField: 'report_name', testField: 'report_name' },
    { llmField: 'custom_indicator', testField: 'indicator_code' }
  ];

  assert.equal(
    buildRowJoinKey({ report_name: '报告A', custom_indicator: 'E1' }, mappings, 'llm'),
    '报告A|||E1'
  );
});
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `node --test tests/validationFieldMappings.test.js`

Expected: FAIL，报错提示找不到 `../src/utils/validationFieldMappings.js` 或找不到对应导出。

- [ ] **Step 3: 以最小实现新增字段映射工具文件**

```js
export const DEFAULT_VALIDATION_FIELD_MAPPINGS = Object.freeze([
  { llmField: 'report_name', testField: 'report_name' },
  { llmField: 'indicator_code', testField: 'indicator_code' },
  { llmField: 'year', testField: 'data_year' }
]);

export function resolveValidationFieldMappings(mappings) {
  const normalized = Array.isArray(mappings)
    ? mappings
      .map((item) => ({
        llmField: String(item?.llmField || '').trim(),
        testField: String(item?.testField || '').trim()
      }))
      .filter((item) => item.llmField || item.testField)
    : [];

  return normalized.length > 0 ? normalized : DEFAULT_VALIDATION_FIELD_MAPPINGS;
}

export function extractFieldOptionsFromRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0 || !rows[0]) return [];
  return Object.keys(rows[0]);
}

export function validateValidationFieldMappings({ mappings, llmFields, testFields }) {
  const effectiveMappings = resolveValidationFieldMappings(mappings);
  const llmSeen = new Set();
  const testSeen = new Set();

  for (let index = 0; index < effectiveMappings.length; index += 1) {
    const item = effectiveMappings[index];
    if (!item.llmField || !item.testField) {
      return { ok: false, error: `第 ${index + 1} 组关联字段未选择完整，请检查 LLM 字段和测试集字段。` };
    }
    if (!llmFields.includes(item.llmField)) {
      return { ok: false, error: `LLM 字段 "${item.llmField}" 不存在于当前文件中。` };
    }
    if (!testFields.includes(item.testField)) {
      return { ok: false, error: `测试集字段 "${item.testField}" 不存在于当前文件中。` };
    }
    if (llmSeen.has(item.llmField)) {
      return { ok: false, error: `LLM 字段 "${item.llmField}" 被重复使用，请调整关联配置。` };
    }
    if (testSeen.has(item.testField)) {
      return { ok: false, error: `测试集字段 "${item.testField}" 被重复使用，请调整关联配置。` };
    }
    llmSeen.add(item.llmField);
    testSeen.add(item.testField);
  }

  return { ok: true, mappings: effectiveMappings };
}

export function buildRowJoinKey(row, mappings, side) {
  return mappings
    .map((item) => {
      const key = side === 'llm' ? item.llmField : item.testField;
      return String(row?.[key] || '').trim();
    })
    .join('|||');
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `node --test tests/validationFieldMappings.test.js`

Expected: PASS，4 个测试全部通过。

- [ ] **Step 5: 提交纯逻辑测试与实现**

```bash
git add tests/validationFieldMappings.test.js src/utils/validationFieldMappings.js
git commit -m "test: 补充快速验收关联字段纯逻辑测试"
```

### Task 2: 快速验收模式服务层动态关联

**Files:**
- Modify: `src/services/testBenchService.js`
- Modify: `tests/testBenchService.test.js`

- [ ] **Step 1: 先写失败测试，覆盖手动映射、清空回退和 0 匹配**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { joinLlmResultsWithTestSet } from '../src/services/testBenchService.js';

test('joinLlmResultsWithTestSet 支持按手动字段映射关联', () => {
  const llmRows = [
    {
      report_alias: '报告A',
      indicator_alias: 'E1',
      fiscal_year: '2024',
      report_name: '报告A',
      indicator_code: 'E1',
      year: '2024',
      text_value: '已披露'
    }
  ];
  const testRows = [
    {
      report_name: '报告A',
      indicator_code: 'E1',
      data_year: '2024',
      value_type_1: '文字型',
      text_value: '已披露'
    }
  ];

  const result = joinLlmResultsWithTestSet(llmRows, testRows, {
    fieldMappings: [
      { llmField: 'report_alias', testField: 'report_name' },
      { llmField: 'indicator_alias', testField: 'indicator_code' },
      { llmField: 'fiscal_year', testField: 'data_year' }
    ]
  });

  assert.equal(result.validRows[0].match_status, '已匹配');
});

test('joinLlmResultsWithTestSet 在空映射时回退默认规则', () => {
  const llmRows = [{ report_name: '报告A', indicator_code: 'E1', year: '2024', text_value: '已披露' }];
  const testRows = [{ report_name: '报告A', indicator_code: 'E1', data_year: '2024', value_type_1: '文字型', text_value: '已披露' }];

  const result = joinLlmResultsWithTestSet(llmRows, testRows, { fieldMappings: [] });

  assert.equal(result.validRows[0].match_status, '已匹配');
});

test('joinLlmResultsWithTestSet 在合法映射但无匹配时返回 0 匹配信息', () => {
  const llmRows = [{ report_alias: '报告B', indicator_alias: 'E1', fiscal_year: '2024', text_value: '已披露' }];
  const testRows = [{ report_name: '报告A', indicator_code: 'E1', data_year: '2024', value_type_1: '文字型', text_value: '已披露' }];

  const result = joinLlmResultsWithTestSet(llmRows, testRows, {
    fieldMappings: [
      { llmField: 'report_alias', testField: 'report_name' },
      { llmField: 'indicator_alias', testField: 'indicator_code' },
      { llmField: 'fiscal_year', testField: 'data_year' }
    ]
  });

  assert.equal(result.matchCount, 0);
  assert.equal(result.validRows[0].match_status, '未匹配');
});
```

- [ ] **Step 2: 运行测试，确认新场景失败**

Run: `node --test tests/testBenchService.test.js`

Expected: FAIL，`joinLlmResultsWithTestSet` 当前不接受第三个参数或无法按自定义字段匹配。

- [ ] **Step 3: 最小改造服务层，接入动态映射**

```js
import {
  resolveValidationFieldMappings,
  extractFieldOptionsFromRows,
  validateValidationFieldMappings,
  buildRowJoinKey
} from '../utils/validationFieldMappings.js';

function joinTestSetWithLlmByMappings(testSetRows, llmResults, fieldMappings) {
  const effectiveMappings = resolveValidationFieldMappings(fieldMappings);
  const llmMap = new Map();

  for (const row of llmResults) {
    const key = buildRowJoinKey(row, effectiveMappings, 'llm');
    if (!llmMap.has(key)) llmMap.set(key, []);
    llmMap.get(key).push(row);
  }

  const comparisonRows = [];
  let matchCount = 0;

  for (const testRow of testSetRows) {
    const key = buildRowJoinKey(testRow, effectiveMappings, 'test');
    const matched = llmMap.get(key) || [];
    if (matched.length === 0) {
      comparisonRows.push({ ...testRow, match_status: '未匹配', similarity: 0, llm_based_similarity: 0 });
      continue;
    }
    matchCount += matched.length;
    for (const llmRow of matched) {
      comparisonRows.push(buildMatchedComparisonRow(testRow, llmRow, matched.length));
    }
  }

  return { validRows: comparisonRows, invalidRows: [], matchCount, effectiveMappings };
}

export function joinLlmResultsWithTestSet(llmResults, testSetRows, options = {}) {
  return joinTestSetWithLlmByMappings(testSetRows, llmResults, options.fieldMappings);
}

export function validateQuickValidationAnalysisInput({ llmResults, testSetRows, fieldMappings }) {
  const llmFields = extractFieldOptionsFromRows(llmResults);
  const testFields = extractFieldOptionsFromRows(testSetRows);
  return validateValidationFieldMappings({ mappings: fieldMappings, llmFields, testFields });
}
```

- [ ] **Step 4: 运行测试，确认服务层通过**

Run: `node --test tests/testBenchService.test.js tests/validationFieldMappings.test.js`

Expected: PASS，新增映射场景通过，旧的相似度回算测试仍为绿色。

- [ ] **Step 5: 提交服务层改造**

```bash
git add src/services/testBenchService.js tests/testBenchService.test.js src/utils/validationFieldMappings.js tests/validationFieldMappings.test.js
git commit -m "feat: 支持验收模式手动关联字段"
```

### Task 3: 快速验收模式持久化与 UI 交互

**Files:**
- Modify: `src/services/persistenceService.js`
- Modify: `src/components/QuickValidationMode.jsx`
- Modify: `src/styles/global.css`

- [ ] **Step 1: 先在组件里接入失败态分支，使用现有服务层接口**

```js
const [mappingExpanded, setMappingExpanded] = useState(false);
const [fieldMappings, setFieldMappings] = useState(DEFAULT_VALIDATION_FIELD_MAPPINGS);
const [llmFieldOptions, setLlmFieldOptions] = useState([]);
const [testFieldOptions, setTestFieldOptions] = useState([]);

const validation = validateValidationFieldMappings({
  mappings: fieldMappings,
  llmFields: llmFieldOptions,
  testFields: testFieldOptions
});

if (!validation.ok) {
  setError(validation.error);
  return;
}
```

- [ ] **Step 2: 运行定向测试，确认当前因缺少持久化接口或常量失败**

Run: `npm test -- tests/testBenchService.test.js tests/validationFieldMappings.test.js`

Expected: PASS（纯逻辑仍然绿色）；此时组件代码若直接引用未实现的持久化接口会导致 `npm run build` FAIL。

- [ ] **Step 3: 最小实现持久化接口和 UI 展示**

```js
const VALIDATION_FIELD_MAPPINGS_KEY = 'validation_field_mappings';

export async function saveValidationFieldMappings(fieldMappings) {
  const db = await getDb();
  await db.put('phaseResults', {
    id: VALIDATION_FIELD_MAPPINGS_KEY,
    fieldMappings,
    savedAt: Date.now()
  });
}

export async function getValidationFieldMappings() {
  const db = await getDb();
  const entry = await db.get('phaseResults', VALIDATION_FIELD_MAPPINGS_KEY);
  return entry?.fieldMappings ?? null;
}
```

```jsx
<div className="quick-validation-join-bridge">
  <button
    type="button"
    className={`quick-validation-join-trigger ${mappingExpanded ? 'expanded' : ''}`}
    onClick={() => setMappingExpanded((prev) => !prev)}
    aria-label="切换关联字段配置"
  >
    <span className="quick-validation-join-line" />
    <span className="quick-validation-join-dot" />
  </button>
</div>

{mappingExpanded ? (
  <div className="quick-validation-mapping-panel">
    {fieldMappings.map((mapping, index) => (
      <div className="quick-validation-mapping-row" key={`mapping-${index}`}>
        <select value={mapping.llmField} onChange={(event) => updateMapping(index, 'llmField', event.target.value)}>
          {llmFieldOptions.map((field) => <option key={field} value={field}>{field}</option>)}
        </select>
        <span className="quick-validation-mapping-equals">=</span>
        <select value={mapping.testField} onChange={(event) => updateMapping(index, 'testField', event.target.value)}>
          {testFieldOptions.map((field) => <option key={field} value={field}>{field}</option>)}
        </select>
        <button type="button" onClick={() => removeMapping(index)}>删除</button>
      </div>
    ))}
    <button type="button" onClick={appendMapping}>新增一组</button>
  </div>
) : null}
```

- [ ] **Step 4: 运行构建，确认 UI 与持久化接线无编译错误**

Run: `npm run build`

Expected: PASS，Vite 构建成功。

- [ ] **Step 5: 提交 UI 与持久化实现**

```bash
git add src/services/persistenceService.js src/components/QuickValidationMode.jsx src/styles/global.css
git commit -m "feat: 增加验收模式关联字段配置面板"
```

### Task 4: 严格校验联调与回归

**Files:**
- Modify: `src/components/QuickValidationMode.jsx`
- Modify: `src/services/testBenchService.js`
- Test: `tests/testBenchService.test.js`

- [ ] **Step 1: 补失败测试，覆盖“合法映射但 0 匹配”提示分支所需元数据**

```js
test('joinLlmResultsWithTestSet 返回 effectiveMappings 供界面提示与导出复用', () => {
  const result = joinLlmResultsWithTestSet(
    [{ report_name: '报告A', indicator_code: 'E1', year: '2024', text_value: '已披露' }],
    [{ report_name: '报告A', indicator_code: 'E1', data_year: '2024', value_type_1: '文字型', text_value: '已披露' }],
    { fieldMappings: [] }
  );

  assert.deepEqual(result.effectiveMappings, [
    { llmField: 'report_name', testField: 'report_name' },
    { llmField: 'indicator_code', testField: 'indicator_code' },
    { llmField: 'year', testField: 'data_year' }
  ]);
});
```

- [ ] **Step 2: 运行测试，确认新增断言失败**

Run: `node --test tests/testBenchService.test.js`

Expected: FAIL，结果中尚未稳定返回 `effectiveMappings`。

- [ ] **Step 3: 完善联调逻辑并增加手工回归**

```js
const joinResult = joinLlmResultsWithTestSet(llmResults, testSetRows, {
  fieldMappings
});

if (joinResult.matchCount === 0) {
  setError('当前关联字段配置无有效匹配，请检查两侧字段是否一一对应。');
  return;
}

setComparisonRows(joinResult.validRows);
await saveValidationResults(joinResult.validRows).catch(() => {});
```

手工回归：

1. 上传两份标准字段文件，直接分析成功。
2. 修改映射到自定义列名，分析成功。
3. 删空所有映射，分析按默认规则成功。
4. 构造重复字段、缺失字段、无匹配字段，均被阻止。
5. 刷新页面，映射配置可恢复。

- [ ] **Step 4: 运行完整验证**

Run: `npm test -- tests/validationFieldMappings.test.js tests/testBenchService.test.js`

Expected: PASS，所有新增测试通过。

Run: `npm run build`

Expected: PASS，生产构建成功。

- [ ] **Step 5: 提交联调与验证**

```bash
git add src/components/QuickValidationMode.jsx src/services/testBenchService.js tests/testBenchService.test.js tests/validationFieldMappings.test.js
git commit -m "fix: 补齐验收模式关联字段严格校验"
```
