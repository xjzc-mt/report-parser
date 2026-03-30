# 测试集工作台重新设计 - 实现计划

## 概述

基于设计文档 `2026-03-26-testbench-redesign-design.md`，本计划将测试工作台重构为支持三种工作模式的系统。

**设计文档路径：** `docs/superpowers/specs/2026-03-26-testbench-redesign-design.md`

## 实现策略

采用增量式开发，按优先级分阶段实现：

1. **阶段1：基础架构** - 模式切换框架
2. **阶段2：快速验收模式** - 核心新功能
3. **阶段3：按报告分析** - 分析视图增强
4. **阶段4：快速优化模式** - 独立优化入口
5. **阶段5：完整流程重构** - 集成新组件
6. **阶段6：优化测试** - 性能和稳定性

每个阶段独立可测试，确保不影响现有功能。

## 关键文件清单

### 新增文件

```
src/components/
  ModeSelector.jsx              - 模式选择器
  FullFlowMode.jsx              - 完整流程模式
  QuickValidationMode.jsx       - 快速验收模式
  QuickOptimizationMode.jsx     - 快速优化模式
  AnalysisView.jsx              - 分析视图（整体/按报告切换）
  ReportAnalytics.jsx           - 按报告分析组件
  PdfMatchChecker.jsx           - PDF匹配检查组件

src/utils/
  reportAnalytics.js            - 报告分析工具函数
```

### 修改文件

```
src/components/TestWorkbenchTab.jsx    - 重构支持模式切换
src/services/testBenchService.js       - 新增服务函数
```

## 阶段 1：基础架构

### 目标

建立模式切换框架，为三种模式提供基础结构。

### 任务

#### 1.1 创建模式选择器组件

**文件：** `src/components/ModeSelector.jsx`

**功能：**
- 三个单选按钮：完整流程、快速验收、快速优化
- 切换时触发回调
- 显示当前选中模式

**Props：**
```javascript
{
  currentMode: 'full' | 'validation' | 'optimization',
  onModeChange: (mode) => void,
  disabled: boolean  // 运行中时禁用切换
}
```

#### 1.2 创建三个模式骨架组件

**文件：**
- `src/components/FullFlowMode.jsx`
- `src/components/QuickValidationMode.jsx`
- `src/components/QuickOptimizationMode.jsx`

**每个组件包含：**
- 基本布局结构
- Props 接口定义
- 占位符内容

**共享 Props：**
```javascript
{
  globalSettings: object,
  llm1Settings: object,
  llm2Settings: object,
  onChangeLlm1: (key, val) => void,
  onChangeLlm2: (key, val) => void
}
```

#### 1.3 重构 TestWorkbenchTab

**文件：** `src/components/TestWorkbenchTab.jsx`

**修改：**
1. 添加模式状态：`const [mode, setMode] = useState('full')`
2. 根据模式渲染对应组件
3. 模式切换时的确认对话框
4. 保留共享状态（testSetFile, pdfFiles）

**结构：**
```jsx
<div className="test-workbench">
  <ModeSelector currentMode={mode} onModeChange={handleModeChange} />
  {mode === 'full' && <FullFlowMode {...props} />}
  {mode === 'validation' && <QuickValidationMode {...props} />}
  {mode === 'optimization' && <QuickOptimizationMode {...props} />}
</div>
```

### 验收标准

- ✅ 模式选择器正常显示和切换
- ✅ 三个模式组件可独立渲染
- ✅ 切换模式时显示确认对话框
- ✅ 现有功能不受影响

## 阶段 2：快速验收模式

### 目标

实现上传外部 LLM 结果并与测试集关联分析的功能。

### 任务

#### 2.1 实现 LLM 结果解析函数

**文件：** `src/services/testBenchService.js`

**新增函数：** `parseLlmResultsFile(file)`

**功能：**
- 使用 `parseExcel()` 解析文件
- 规范化字段名（支持 `year` 或 `data_year`）
- 验证必需字段：`report_name`, `indicator_code`, `year`
- 返回标准格式数组

**返回格式：**
```javascript
[{
  report_name: string,
  indicator_code: string,
  year: string,
  text_value: string,
  num_value: string,
  unit: string,
  currency: string,
  numerator_unit: string,
  denominator_unit: string,
  pdf_numbers: string
}]
```

#### 2.2 实现关联函数

**文件：** `src/services/testBenchService.js`

**新增函数：** `joinLlmResultsWithTestSet(llmResults, testSetRows)`

**功能：**
- 复用现有的 `joinTestSetWithLlm1()` 逻辑
- 按 `report_name` + `indicator_code` + `year` 右关联
- 计算相似度
- 返回 `comparisonRows`

#### 2.3 实现快速验收模式组件

**文件：** `src/components/QuickValidationMode.jsx`

**状态：**
- `llmResultFile`: 上传的 LLM 结果文件
- `testSetFile`: 测试集文件
- `comparisonRows`: 关联结果
- `isProcessing`: 处理中标志

**UI 结构：**
1. 数据上传区（LLM 结果 + 测试集）
2. 开始关联按钮
3. 关联结果展示（复用现有的 SummaryStrip 和 ResultsAnalytics）
4. 导出按钮
5. 跳转到优化模式按钮

### 验收标准

- ✅ 可上传 LLM 结果文件和测试集
- ✅ 关联成功并显示统计
- ✅ 可导出关联对比文件
- ✅ 缺少必需字段时显示错误提示

## 阶段 3：按报告分析

### 目标

实现按报告查看分析结果的功能，快速定位性能异常的报告。

### 任务

#### 3.1 实现报告分组函数

**文件：** `src/utils/reportAnalytics.js`

**新增函数：** `groupRowsByReport(comparisonRows)`

**功能：**
- 按 `report_name` 分组
- 为每个报告计算独立指标
- 返回报告数组

**返回格式：**
```javascript
[{
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
  rows: Array
}]
```

#### 3.2 创建按报告分析组件

**文件：** `src/components/ReportAnalytics.jsx`

**Props：**
```javascript
{
  comparisonRows: Array,
  similarityThreshold: number
}
```

**UI 结构：**
- 报告列表（左侧）：显示所有报告及关键指标
- 报告详情（右侧）：选中报告的完整指标
- 颜色标识：绿色（良好）、黄色（一般）、红色（需关注）

#### 3.3 创建分析视图切换组件

**文件：** `src/components/AnalysisView.jsx`

**Props：**
```javascript
{
  comparisonRows: Array,
  similarityThreshold: number
}
```

**状态：**
- `viewMode`: 'overall' | 'by-report'

**UI 结构：**
- 视图切换按钮（单选按钮组）
- 整体分析视图：复用现有 ResultsAnalytics 和 SummaryStrip
- 按报告分析视图：使用 ReportAnalytics 组件

### 验收标准

- ✅ 可切换整体和按报告分析视图
- ✅ 按报告分析正确显示每个报告的指标
- ✅ 颜色标识准确反映性能
- ✅ 点击报告可查看详情

## 阶段 4：快速优化模式

### 目标

实现独立的 Prompt 优化入口，支持上传关联对比文件进行优化。

### 任务

#### 4.1 实现 PDF 匹配检查函数

**文件：** `src/services/testBenchService.js`

**新增函数：** `checkPdfMatching(requiredReports, pdfFiles)`

**功能：**
- 提取所需的 `report_name` 列表
- 检查每个报告是否有对应 PDF（文件名去扩展名匹配）
- 返回匹配状态

**返回格式：**
```javascript
{
  matched: [{reportName, pdfFile, rowCount}],
  missing: [{reportName, rowCount}],
  coverage: 0.75
}
```

#### 4.2 实现行过滤函数

**文件：** `src/services/testBenchService.js`

**新增函数：** `filterRowsByPdfAvailability(comparisonRows, availablePdfs)`

**功能：**
- 过滤出有对应 PDF 的行
- 返回可优化的行和被跳过的行

**返回格式：**
```javascript
{
  optimizableRows: Array,
  skippedRows: Array
}
```

#### 4.3 创建 PDF 匹配检查组件

**文件：** `src/components/PdfMatchChecker.jsx`

**Props：**
```javascript
{
  requiredReports: Array,
  uploadedPdfFiles: Array,
  onPdfUpload: (files) => void
}
```

**UI 显示：**
- 匹配状态列表（✓ 已匹配 / ✗ 缺失）
- 每个报告的指标数量
- 覆盖率统计
- 上传按钮

#### 4.4 实现快速优化模式组件

**文件：** `src/components/QuickOptimizationMode.jsx`

**状态：**
- `comparisonFile`: 关联对比文件
- `pdfFiles`: PDF 文件列表
- `matchStatus`: PDF 匹配状态
- `isOptimizing`: 优化中标志

**UI 结构：**
1. 上传区（关联对比文件 + PDF）
2. PDF 匹配检查组件
3. LLM 2 设置
4. 开始优化按钮
5. 优化结果展示

### 验收标准

- ✅ 可上传关联对比文件和 PDF
- ✅ PDF 匹配检查准确
- ✅ 缺失 PDF 的行被跳过
- ✅ 优化成功并导出结果

## 阶段 5：完整流程模式重构

### 目标

将现有完整流程逻辑迁移到新组件，集成分析视图。

### 任务

#### 5.1 迁移现有逻辑到 FullFlowMode

**文件：** `src/components/FullFlowMode.jsx`

**迁移内容：**
- 数据准备区（PDF + 测试集 + 指标定义上传）
- LLM 1 提取逻辑
- 进度显示
- Token 统计

**保持不变：**
- 复用现有的 `runExtractionPhase()` 函数
- 复用现有的 LLM 设置组件
- 复用现有的进度面板

#### 5.2 集成分析视图组件

**修改：** `src/components/FullFlowMode.jsx`

**替换：**
- 将现有的结果展示替换为 `AnalysisView` 组件
- 支持整体和按报告两种视图

#### 5.3 集成 Prompt 优化

**修改：** `src/components/FullFlowMode.jsx`

**保持：**
- 复用现有的 `runOptimizationPhase()` 函数
- 复用现有的优化结果展示

### 验收标准

- ✅ 完整流程模式功能完整
- ✅ 集成了新的分析视图
- ✅ 现有功能不受影响
- ✅ 向后兼容

## 阶段 6：优化和测试

### 目标

性能优化、错误处理和端到端测试。

### 任务

#### 6.1 性能优化

**大数据集处理：**
- 分析视图使用虚拟滚动（如数据超过 500 行）
- 按报告分析时懒加载详情
- 导出时使用 Web Worker（如适用）

#### 6.2 错误处理

**文件格式错误：**
- 解析时验证必需字段
- 显示明确错误提示和缺失字段列表

**PDF 文件名不匹配：**
- 显示缺失的报告列表
- 提供补充上传入口

**关联失败：**
- 显示未匹配行数
- 导出时保留未匹配行

**空数据集：**
- 显示"未找到有效数据"提示
- 禁用后续操作按钮

**模式切换确认：**
- 弹出确认对话框
- 提示先导出结果

#### 6.3 端到端测试

**测试场景：**
1. 完整流程：上传 → 提取 → 分析 → 优化
2. 快速验收：上传外部结果 → 关联 → 分析
3. 快速优化：上传关联文件 → 优化
4. 模式切换：验收 → 优化
5. 按报告分析：切换视图 → 查看详情

### 验收标准

- ✅ 大数据集（1000+ 条）无明显卡顿
- ✅ 错误提示清晰明确
- ✅ 所有测试场景通过

## 实现顺序建议

按以下顺序实现可最小化风险：

1. **阶段 1** → 建立框架，不影响现有功能
2. **阶段 2** → 快速验收是核心新功能，优先实现
3. **阶段 3** → 按报告分析增强用户体验
4. **阶段 4** → 快速优化补充完整工作流
5. **阶段 5** → 重构完整流程，集成新组件
6. **阶段 6** → 优化和测试，确保稳定性

## 关键技术决策

### 1. 复用现有逻辑

**决策：** 最大化复用现有服务函数

**理由：**
- `runExtractionPhase()` 已稳定，无需重写
- `runOptimizationPhase()` 逻辑复杂，复用降低风险
- `joinTestSetWithLlm1()` 可直接用于快速验收

### 2. 组件拆分策略

**决策：** 按模式拆分顶层组件，按功能拆分共享组件

**理由：**
- 三个模式独立，便于并行开发
- 共享组件（AnalysisView、PdfMatchChecker）提高复用性
- 降低单个文件复杂度

### 3. 状态管理

**决策：** 在 TestWorkbenchTab 管理共享状态，模式组件管理独有状态

**理由：**
- 共享状态（testSetFile、pdfFiles）需跨模式传递
- 模式独有状态（llm1Results、uploadedLlmResults）隔离
- 简化模式切换逻辑

## 风险和缓解

### 风险 1：现有功能受影响

**缓解：**
- 阶段 1 先建立框架，确保现有功能正常
- 阶段 5 最后重构完整流程
- 每个阶段独立测试

### 风险 2：数据格式不兼容

**缓解：**
- 明确定义 LLM 结果文件格式
- 解析时验证必需字段
- 提供清晰的错误提示

### 风险 3：性能问题

**缓解：**
- 阶段 6 专门处理性能优化
- 使用虚拟滚动处理大数据集
- 必要时使用 Web Worker

## 总结

本实现计划将测试工作台重构为支持三种工作模式的系统，采用增量式开发策略，确保每个阶段独立可测试，最小化对现有功能的影响。

**核心改进：**
1. 快速验收外部 LLM 结果
2. 按报告分析定位性能问题
3. 灵活的 Prompt 优化流程

**预计工作量：**
- 阶段 1-2：核心功能，约 40% 工作量
- 阶段 3-4：增强功能，约 40% 工作量
- 阶段 5-6：重构优化，约 20% 工作量
