# 测试集工作台重新设计

## 概述

本设计文档描述测试集工作台的功能重构，目标是支持三种工作模式，满足从 LLM 提取到结果验收再到 Prompt 优化的完整测试流程。

## 背景

### 当前问题

1. 只支持"完整流程"（上传 PDF → LLM 提取 → 自动关联 → 优化），无法处理外部生成的 LLM 结果
2. 缺少独立的"结果验收"入口，用户无法上传其他模型的解析结果进行对比分析
3. 分析结果只有整体视图，无法按报告查看，难以定位工程缺陷导致的性能下降
4. Prompt 优化功能与提取流程耦合，无法独立使用

### 用户需求

1. **快速验收外部结果**：上传从其他地方生成的 LLM 解析结果，与测试集关联对比，分析模型表现
2. **按报告分析**：查看每个报告的独立指标（准确率、召回率等），识别拉低整体表现的报告
3. **灵活优化 Prompt**：支持筛选后的结果进行 Prompt 优化，而不是必须优化全部
4. **支持多报告多指标场景**：一个 Excel 可能包含多份报告的多个指标，也可能是一个指标的 N 份报告

## 设计目标

1. 支持三种独立工作模式，各司其职
2. 统一的分析视图（整体/按报告切换）
3. 模式间可跳转，流程连贯
4. 保持现有功能不受影响

## 架构设计

### 三种工作模式

```
测试工作台
├─ 模式 1: 完整流程模式
│  └─ PDF + 测试集 → LLM1 提取 → 关联分析 → Prompt 优化
│
├─ 模式 2: 快速验收模式
│  └─ LLM 结果 + 测试集 → 关联分析 → (可选)跳转优化
│
└─ 模式 3: 快速优化 Prompt
   └─ 关联对比文件 + PDF → Prompt 优化
```

### 数据流

**完整流程模式：**
```
用户上传 PDF + 测试集
  ↓
LLM 1 提取（按 report_name + pdf_numbers 分组）
  ↓
自动关联测试集（右关联 + 相似度计算）
  ↓
分析结果（整体/按报告）
  ↓
导出关联对比文件
  ↓
(可选) Prompt 优化
```

**快速验收模式：**
```
用户上传 LLM 结果 + 测试集
  ↓
解析 LLM 结果文件
  ↓
关联测试集（右关联 + 相似度计算）
  ↓
分析结果（整体/按报告）
  ↓
导出关联对比文件
  ↓
(可选) 跳转到快速优化模式
```

**快速优化 Prompt 模式：**
```
用户上传关联对比文件 + PDF
  ↓
解析关联对比文件
  ↓
检查 PDF 匹配情况
  ↓
LLM 2 优化（按 indicator_code 跨报告分组）
  ↓
导出优化结果
```

### 状态管理

**共享状态：**
- `testSetFile`: 测试集文件
- `pdfFiles`: PDF 文件列表
- `comparisonRows`: 关联对比结果
- `finalRows`: 优化后的最终结果
- `tokenStats`: Token 消耗统计

**模式独有状态：**
- 完整流程：`llm1Results`（LLM 1 原始提取结果）
- 快速验收：`uploadedLlmResults`（上传的外部 LLM 结果）
- 快速优化：`uploadedComparisonFile`（上传的关联对比文件）

## UI 设计

### 模式选择器

位于工作台顶部，使用单选按钮组：

```
工作模式: ○ 完整流程模式  ○ 快速验收模式  ○ 快速优化 Prompt
```

**交互逻辑：**
- 切换模式时清空当前模式的状态（保留共享状态如已上传的测试集）
- 从"快速验收"跳转到"快速优化"时，自动携带 `comparisonRows` 数据

### 模式 1：完整流程模式

#### 步骤 1：数据准备

```
┌─────────────────────────────────┐
│ 📁 数据准备                      │
├─────────────────────────────────┤
│ PDF 文件 (必需)                  │
│ [上传区域] 已上传: 3个文件       │
│                                  │
│ 测试集 Excel (必需)              │
│ [上传区域] test_set.xlsx         │
│                                  │
│ 指标定义 Excel (可选)            │
│ [上传区域] 未上传                │
│                                  │
│ [清空所有文件]                   │
└─────────────────────────────────┘
```

**字段要求：**
- PDF 文件：文件名（去扩展名）需与测试集中的 `report_name` 匹配
- 测试集：必须包含 `report_name`, `pdf_numbers`, `indicator_code`, `indicator_name`, `data_year`, `text_value`, `value_type_1` 或 `value_type`
- 指标定义：可选，包含 `indicator_code`, `definition`, `guidance`, `prompt`, `value_type_1`

#### 步骤 2：LLM 提取

```
┌─────────────────────────────────┐
│ 🤖 LLM 提取                      │
├─────────────────────────────────┤
│ [⚙️ LLM 1 设置]                  │
│                                  │
│ 状态: 就绪 / 运行中 / 已完成     │
│ [▶️ 开始提取] [⏸️ 暂停] [🔄 继续]│
│                                  │
│ 进度: ████████░░ 80%             │
│ 已完成: 24/30 分组               │
│                                  │
│ Token 消耗: 输入 125k / 输出 45k │
│ 预估成本: $2.34                  │
└─────────────────────────────────┘
```

**功能：**
- 按 `report_name` + `pdf_numbers` 分组提取
- 根据 `pdf_numbers` 自动切分 PDF 页面
- 支持断点续传
- 实时显示进度和成本

#### 步骤 3：结果分析

```
┌─────────────────────────────────┐
│ 📊 结果分析                      │
├─────────────────────────────────┤
│ 分析视图: ● 整体分析 ○ 按报告分析│
│                                  │
│ [整体分析视图]                   │
│ 准确率: 75% | 精确率: 82%        │
│ 召回率: 88% | F1: 85%            │
│ 过摘录率: 12%                    │
│ 平均相似度: 78%                  │
│ 总数: 180 | 已匹配: 156 | 未匹配: 24 │
│                                  │
│ [按报告分析视图]                 │
│ ┌─ 报告列表 ─────────────┐      │
│ │ ✓ 报告A  准确率:85% ↑   │      │
│ │ ✓ 报告B  准确率:72%     │      │
│ │ ✓ 报告C  准确率:45% ↓   │      │
│ └────────────────────────┘      │
│                                  │
│ 选中报告详情: 报告A              │
│ 共 50 条指标                     │
│ 准确率: 85% | 召回率: 90%        │
│ 精确率: 88% | F1: 89%            │
│                                  │
│ [查看详细数据表格]               │
│ [📥 导出关联对比文件]            │
└─────────────────────────────────┘
```

**Why:** 按报告分析可以快速定位性能异常的报告（如报告C准确率45%），帮助识别是否为工程缺陷（如PDF解析问题、特定报告格式问题）。

**How to apply:**
- 整体分析：显示所有报告的汇总指标
- 按报告分析：列表显示每个报告的关键指标，点击查看详情
- 支持导出关联对比文件供后续优化使用

#### 步骤 4：Prompt 优化

```
┌─────────────────────────────────┐
│ ✨ Prompt 优化                   │
├─────────────────────────────────┤
│ [⚙️ LLM 2 设置]                  │
│                                  │
│ 状态: 就绪 / 运行中 / 已完成     │
│ [▶️ 开始优化] [⏸️ 暂停] [🔄 继续]│
│                                  │
│ 优化统计:                        │
│ 总数: 180 | 待优化: 45           │
│ 已优化: 45 | 优化成功: 38        │
│ 优化成功率: 84%                  │
│ 优化后平均相似度: 82%            │
│                                  │
│ Token 消耗: 输入 89k / 输出 23k  │
│ 预估成本: $1.56                  │
│                                  │
│ [📥 导出最终结果]                │
│ [📥 导出优化轮次详情]            │
└─────────────────────────────────┘
```

**功能：**
- 按 `indicator_code` 跨报告分组优化
- 自动提取 PDF 页面上下文
- 支持多轮优化验证
- 导出优化后的 Prompt 和验证结果

### 模式 2：快速验收模式

#### 数据上传

```
┌─────────────────────────────────┐
│ 📤 数据上传                      │
├─────────────────────────────────┤
│ LLM 结果文件 (必需)              │
│ [上传区域] llm_results.xlsx      │
│ 格式要求: 必须包含 report_name,  │
│ indicator_code, year, text_value,│
│ num_value 等字段                 │
│                                  │
│ 测试集 Excel (必需)              │
│ [上传区域] test_set.xlsx         │
│                                  │
│ [开始关联分析]                   │
└─────────────────────────────────┘
```

**Why:** 用户可能使用其他工具或模型生成了 LLM 结果，需要快速验收这些结果的质量，而不需要重新运行提取流程。

**How to apply:**
- LLM 结果文件必须包含：`report_name`, `indicator_code`, `year`（或 `data_year`）, `text_value`, `num_value`
- 可选字段：`unit`, `currency`, `numerator_unit`, `denominator_unit`, `pdf_numbers`
- 系统自动解析并与测试集右关联

#### 关联分析结果

```
┌─────────────────────────────────┐
│ 🔗 关联分析结果                  │
├─────────────────────────────────┤
│ 状态: 关联完成 ✓                 │
│ 成功关联: 156/180 条             │
│ 未匹配: 24 条                    │
│                                  │
│ 分析视图: ● 整体分析 ○ 按报告分析│
│                                  │
│ [整体/按报告分析展示区域]        │
│ (与完整流程模式的步骤3相同)      │
│                                  │
│ [📥 导出关联对比文件]            │
│                                  │
│ ─────────────────────────────── │
│ 下一步操作:                      │
│ [➡️ 进入快速优化 Prompt 模式]    │
│ 💡 可先下载结果筛选后再优化      │
└─────────────────────────────────┘
```

**功能：**
- 自动关联测试集，计算相似度
- 支持整体和按报告两种分析视图
- 可导出关联对比文件
- 提供跳转到优化模式的入口

### 模式 3：快速优化 Prompt

#### 数据上传

```
┌─────────────────────────────────┐
│ ⚡ 快速优化 Prompt               │
├─────────────────────────────────┤
│ 关联对比文件 (必需)              │
│ [上传区域] comparison.xlsx       │
│ 要求: 包含 report_name,          │
│ pdf_numbers, indicator_code,     │
│ similarity, text_value 等字段    │
│                                  │
│ PDF 文件 (必需)                  │
│ [上传区域] 已上传: 3个文件       │
│                                  │
│ 📊 匹配检查:                     │
│ ✓ 报告A.pdf - 匹配 (45条指标)    │
│ ✓ 报告B.pdf - 匹配 (60条指标)    │
│ ✗ 报告C.pdf - 缺失 (30条指标)    │
│                                  │
│ ⚠️ 缺失的 PDF 对应行将跳过优化   │
│                                  │
│ [⚙️ LLM 2 设置]                  │
│ [▶️ 开始优化]                    │
└─────────────────────────────────┘
```

**Why:** 用户可能在"快速验收"后下载了关联对比文件，筛选出需要优化的指标（删除不需要优化的行），然后上传回来进行针对性优化。

**How to apply:**
- 关联对比文件必须包含：`report_name`, `pdf_numbers`, `indicator_code`, `indicator_name`, `text_value`（测试集标准答案）, `similarity`, `prompt`（原始提取指令）
- 系统根据 `report_name` 匹配上传的 PDF 文件
- 只优化有对应 PDF 的行，缺失 PDF 的行跳过并在日志中提示

#### 优化结果

```
┌─────────────────────────────────┐
│ ✨ Prompt 优化结果               │
├─────────────────────────────────┤
│ 优化统计:                        │
│ 总数: 135 (跳过30条缺失PDF)      │
│ 待优化: 45 | 已优化: 45          │
│ 优化成功: 38 | 优化成功率: 84%   │
│ 优化后平均相似度: 82%            │
│                                  │
│ Token 消耗: 输入 89k / 输出 23k  │
│ 预估成本: $1.56                  │
│                                  │
│ [📥 导出最终结果]                │
│ [📥 导出优化轮次详情]            │
└─────────────────────────────────┘
```

**功能：**
- 解析关联对比文件
- 检查 PDF 匹配情况
- 按 `indicator_code` 跨报告分组优化
- 自动按 `pdf_numbers` 切分 PDF 页面
- 导出优化结果

## 组件设计

### 共享组件

#### 1. 分析视图切换组件 `AnalysisView`

**Props:**
- `rows`: 关联对比结果数组
- `similarityThreshold`: 相似度阈值（默认70）

**状态:**
- `viewMode`: 'overall' | 'by-report'
- `selectedReport`: 当前选中的报告名称

**整体分析视图显示：**
- `ResultsAnalytics` 组件：准确率、精确率、召回率、F1、过摘录率
- `SummaryStrip` 组件：总数、已匹配、未匹配、平均相似度

**按报告分析视图显示：**
- 报告列表（左侧）：显示每个报告的关键指标
- 报告详情（右侧）：选中报告的详细指标和数据表格

#### 2. PDF 匹配检查组件 `PdfMatchChecker`

**Props:**
- `requiredReports`: 从数据中提取的 report_name 列表
- `uploadedPdfFiles`: 用户上传的 PDF 文件列表

**功能：**
- 检查每个 `report_name` 是否有对应的 PDF 文件（文件名去扩展名后匹配）
- 显示匹配状态：✓ 已匹配 / ✗ 缺失
- 统计覆盖率
- 提供单个上传和批量上传入口

#### 3. 模式跳转组件 `ModeTransition`

**Props:**
- `currentMode`: 当前模式
- `targetMode`: 目标模式
- `data`: 需要传递的数据

**功能：**
- 从"快速验收"跳转到"快速优化"时，自动携带 `comparisonRows`
- 提示用户可以先下载筛选后再上传

## 技术实现

### 服务层新增功能

#### 1. `testBenchService.js` 新增函数

**`parseLlmResultsFile(file)`**
- 解析用户上传的 LLM 结果文件
- 规范化字段名（支持 `year` 或 `data_year`）
- 返回标准格式的结果数组

**`joinLlmResultsWithTestSet(llmResults, testSetRows)`**
- 将上传的 LLM 结果与测试集右关联
- 复用现有的 `joinTestSetWithLlm1` 逻辑
- 计算相似度并返回 `comparisonRows`

**`checkPdfMatching(requiredReports, pdfFiles)`**
- 检查所需的报告是否都有对应的 PDF 文件
- 返回匹配状态：`{ matched: [], missing: [], coverage: 0.75 }`

**`filterRowsByPdfAvailability(comparisonRows, availablePdfs)`**
- 过滤出有对应 PDF 的行
- 返回可优化的行和被跳过的行

#### 2. 数据格式定义

**LLM 结果文件格式（用户上传）：**
```javascript
{
  report_name: string,      // 必需
  indicator_code: string,   // 必需
  year: string,             // 必需（或 data_year）
  text_value: string,       // 可选
  num_value: string,        // 可选
  unit: string,             // 可选
  currency: string,         // 可选
  numerator_unit: string,   // 可选
  denominator_unit: string, // 可选
  pdf_numbers: string       // 可选
}
```

**关联对比文件格式（导出/上传）：**
```javascript
{
  // 测试集字段
  report_name: string,
  indicator_code: string,
  indicator_name: string,
  data_year: string,
  text_value: string,       // 标准答案
  num_value: string,
  unit: string,
  currency: string,
  numerator_unit: string,
  denominator_unit: string,
  pdf_numbers: string,
  prompt: string,           // 原始提取指令
  value_type_1: string,

  // 关联结果字段
  match_status: string,     // '已匹配' | '未匹配' | '多结果'
  similarity: number,       // 0-100
  llm_year: string,
  llm_text_value: string,
  llm_num_value: string,
  llm_unit: string,
  llm_currency: string,
  llm_numerator_unit: string,
  llm_denominator_unit: string,
  llm_pdf_numbers: string,

  // 扩展相似度字段
  unit_similarity: number,
  currency_similarity: number,
  numerator_unit_similarity: number,
  denominator_unit_similarity: number,

  // 优化字段
  improved_prompt: string,
  improvement_reason: string
}
```

### 按报告分析实现

#### 数据处理

**`groupRowsByReport(comparisonRows)`**
- 按 `report_name` 分组
- 为每个报告计算独立的分析指标
- 返回格式：
```javascript
{
  reportName: string,
  totalCount: number,
  matchedCount: number,
  unmatchedCount: number,
  avgSimilarity: number,
  accuracy: number,
  precision: number,
  recall: number,
  f1: number,
  overExtractionRate: number,
  rows: Array  // 该报告的所有行
}
```

#### UI 交互

**报告列表：**
- 显示所有报告及其关键指标
- 用颜色标识性能：绿色（良好）、黄色（一般）、红色（需关注）
- 点击报告展开详情

**报告详情：**
- 显示该报告的完整分析指标
- 显示该报告的数据表格（可筛选、排序）
- 支持导出单个报告的结果

### 文件结构变更

#### 新增文件

```
src/
├── components/
│   ├── TestWorkbenchTab.jsx           (重构)
│   ├── ModeSelector.jsx               (新增：模式选择器)
│   ├── FullFlowMode.jsx               (新增：完整流程模式)
│   ├── QuickValidationMode.jsx        (新增：快速验收模式)
│   ├── QuickOptimizationMode.jsx      (新增：快速优化模式)
│   ├── AnalysisView.jsx               (新增：分析视图组件)
│   ├── ReportAnalytics.jsx            (新增：按报告分析)
│   └── PdfMatchChecker.jsx            (新增：PDF匹配检查)
│
├── services/
│   └── testBenchService.js            (扩展)
│       ├── parseLlmResultsFile()      (新增)
│       ├── joinLlmResultsWithTestSet() (新增)
│       ├── checkPdfMatching()         (新增)
│       ├── filterRowsByPdfAvailability() (新增)
│       └── groupRowsByReport()        (新增)
│
└── utils/
    └── reportAnalytics.js             (新增)
        ├── calculateReportMetrics()
        └── compareReports()
```

#### 修改文件

**`TestWorkbenchTab.jsx`**
- 添加模式状态管理
- 根据模式渲染不同的子组件
- 管理模式间的数据传递

**`testBenchService.js`**
- 保持现有函数不变
- 新增上述函数支持新模式

## 实现计划

### 阶段 1：基础架构（优先级：高）

1. 创建模式选择器组件 `ModeSelector`
2. 重构 `TestWorkbenchTab` 支持模式切换
3. 创建三个模式的骨架组件

### 阶段 2：快速验收模式（优先级：高）

1. 实现 `parseLlmResultsFile()` 函数
2. 实现 `joinLlmResultsWithTestSet()` 函数
3. 实现 `QuickValidationMode` 组件
4. 测试上传外部结果并关联

### 阶段 3：按报告分析（优先级：高）

1. 实现 `groupRowsByReport()` 函数
2. 实现 `ReportAnalytics` 组件
3. 实现 `AnalysisView` 组件（整体/按报告切换）
4. 集成到完整流程和快速验收模式

### 阶段 4：快速优化模式（优先级：中）

1. 实现 `checkPdfMatching()` 函数
2. 实现 `filterRowsByPdfAvailability()` 函数
3. 实现 `PdfMatchChecker` 组件
4. 实现 `QuickOptimizationMode` 组件
5. 测试从验收模式跳转到优化模式

### 阶段 5：完整流程模式重构（优先级：中）

1. 将现有逻辑迁移到 `FullFlowMode` 组件
2. 集成新的分析视图组件
3. 确保向后兼容

### 阶段 6：优化和测试（优先级：低）

1. 性能优化（大数据集处理）
2. 错误处理和用户提示
3. 端到端测试

## 边界情况处理

### 1. 文件格式错误

**场景：** 用户上传的 LLM 结果文件缺少必需字段

**处理：**
- 解析时检查必需字段（`report_name`, `indicator_code`, `year`）
- 缺少字段时显示明确错误提示
- 列出缺少的字段名称

### 2. PDF 文件名不匹配

**场景：** 测试集中的 `report_name` 与上传的 PDF 文件名不一致

**处理：**
- 在 PDF 匹配检查中显示缺失的报告
- 允许用户继续（跳过缺失的报告）或补充上传
- 在优化时自动跳过无 PDF 的行

### 3. 关联失败

**场景：** LLM 结果与测试集无法关联（`report_name` + `indicator_code` + `year` 不匹配）

**处理：**
- 显示未匹配的行数
- 在分析结果中标记为"未匹配"
- 导出时保留未匹配的行

### 4. 空数据集

**场景：** 上传的文件解析后为空或所有行都被过滤

**处理：**
- 显示明确提示："未找到有效数据"
- 禁用后续操作按钮
- 提供格式示例链接

### 5. 模式切换时的数据丢失

**场景：** 用户在模式间切换时可能丢失未保存的数据

**处理：**
- 切换前弹出确认对话框
- 提示用户先导出结果
- 保留共享状态（测试集、PDF 文件）

### 6. 大数据集性能

**场景：** 处理数千条指标时界面卡顿

**处理：**
- 分析视图使用虚拟滚动
- 按报告分析时懒加载详情
- 导出时使用 Web Worker

## 成功标准

### 功能完整性

- ✅ 支持三种工作模式独立运行
- ✅ 快速验收模式可上传外部 LLM 结果
- ✅ 按报告分析视图正常工作
- ✅ 模式间可正确跳转和传递数据
- ✅ PDF 匹配检查准确

### 用户体验

- ✅ 模式切换流畅，无数据丢失
- ✅ 错误提示清晰明确
- ✅ 大数据集（1000+ 条）无明显卡顿
- ✅ 导出文件格式正确

### 兼容性

- ✅ 现有完整流程功能不受影响
- ✅ 现有导出文件格式保持兼容
- ✅ 现有 LLM 设置和配置正常工作

## 总结

本设计通过引入三种工作模式，解决了测试工作台的核心痛点：

1. **快速验收模式**：支持上传外部 LLM 结果，满足多模型对比需求
2. **按报告分析**：快速定位性能异常的报告，识别工程缺陷
3. **快速优化模式**：支持筛选后的针对性优化，提高灵活性

设计遵循以下原则：

- **模块化**：三种模式独立实现，职责清晰
- **复用性**：共享分析视图和核心逻辑
- **向后兼容**：保持现有功能不受影响
- **用户友好**：清晰的流程引导和错误提示

实现后，用户可以：

- 快速验收任何来源的 LLM 结果
- 按报告查看性能，定位问题报告
- 灵活选择优化范围，提高效率
- 在完整流程和快速验收间无缝切换
