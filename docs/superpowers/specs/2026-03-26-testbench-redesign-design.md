# 测试集工作台与应用总览（当前实现）

**更新时间**：2026-04-13  
**适用范围**：当前 `main` 工作区代码  
**说明**：本文件沿用历史路径，但内容已改写为“当前实现说明”。旧版设计意图请以 Git 历史为准，不再以本文为准。

## 1. 文档目的

本文用于说明当前版本应用的真实模块边界、功能入口、状态流转和持久化策略，作为后续继续升级下一版的起点文档。

当前项目不是一个单一的“报告提取页”，而是一个包含四个主标签页的浏览器端工具集：

1. `Extractor`：单次批量提取 PDF + 需求表。
2. `Methodology`：输入输出规范、批处理策略、系统说明。
3. `PDF 压缩`：单文件 PDF 压缩与下载。
4. `测试集工作台`：围绕测试集、关联分析、Prompt 优化的多模式工作台。

---

## 2. 应用入口与顶层结构

顶层入口位于 [src/App.jsx](/Users/michael_drj/AiProjects/report-parser/src/App.jsx)。

### 2.1 顶层标签页

当前应用使用 4 个主标签页：

| 标签页 | 入口组件 | 说明 |
| --- | --- | --- |
| 提取工作台 | `ExtractorTab` | 上传 PDF 与需求表，执行单轮提取并导出结果 |
| 方法论 | `MethodologyTab` | 展示系统架构、输入输出字段和流程说明 |
| PDF 压缩 | `CompressorTab` | 浏览器内压缩单个 PDF |
| 测试集工作台 | `TestWorkbenchTab` | 测试集驱动的提取、验收、优化和分析 |

### 2.2 顶层共享状态

`App.jsx` 负责维护以下全局状态：

- `settings`
  - 提取页的模型名、批大小、并发数、指标类型等。
- `pdfFiles`
  - 提取页上传的 PDF 列表。
- `requirementsFile`
  - 提取页上传的需求表。
- `progress`
  - 提取过程进度与日志。
- `results / stats`
  - 提取结果和导出摘要统计。

### 2.3 顶层服务依赖

`App.jsx` 当前主要串联这些服务：

- [extractionService.js](/Users/michael_drj/AiProjects/report-parser/src/services/extractionService.js)
  - 执行单轮 PDF 提取。
- [exportService.js](/Users/michael_drj/AiProjects/report-parser/src/services/exportService.js)
  - 导出提取结果 Excel。
- [utils/extraction.js](/Users/michael_drj/AiProjects/report-parser/src/utils/extraction.js)
  - 需求表拆批、结果归一化、导出数据构造。

---

## 3. 主功能模块整理

## 3.1 提取工作台 `ExtractorTab`

组件位置：[ExtractorTab.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/ExtractorTab.jsx)

### 当前能力

- 上传多份 PDF。
- 上传一个需求表 Excel/CSV。
- 选择模型、批大小、并发数、待处理指标类型。
- 调用提取服务并展示进度。
- 在同页过滤“仅显示命中项”。
- 导出带摘要的 Excel。

### 当前工作流

1. 用户上传 PDF 与需求表。
2. 前端校验文件类型。
3. `runExtractionJob()` 读取需求表并按类型拆批。
4. 根据模型提供方选择：
   - Gemini：直接传 PDF Base64。
   - 非 Gemini：本地用 `pdf.js` 先抽文本。
5. 批量并发请求 LLM。
6. 汇总结果、统计 token/cost。
7. 在页面结果面板展示并导出。

### 当前适用场景

- 快速做一次性提取。
- 不依赖测试集。
- 更关注“有无提取结果”，而非测试集级别验收。

---

## 3.2 方法论页 `MethodologyTab`

组件位置：[MethodologyTab.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/MethodologyTab.jsx)

### 当前能力

- 展示系统架构。
- 展示 PDF 与 Excel 输入规范。
- 展示输出字段规范。
- 展示批处理策略与 API 集成方式。
- 展示安全注意事项。

### 数据来源

- [methodologyContent.js](/Users/michael_drj/AiProjects/report-parser/src/content/methodologyContent.js)

### 角色定位

它不是交互模块，而是当前产品的静态说明页，主要服务于：

- 新用户理解输入模板。
- 开发时核对字段约定。
- 手工验证时确认输出口径。

---

## 3.3 PDF 压缩页 `CompressorTab`

组件位置：[CompressorTab.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/CompressorTab.jsx)

### 当前能力

- 上传单个 PDF。
- 浏览器内执行图片压缩、PDF 重建。
- 展示压缩进度。
- 生成下载链接并导出压缩结果。

### 核心服务

- [pdfCompressorService.js](/Users/michael_drj/AiProjects/report-parser/src/services/pdfCompressorService.js)

### 当前特点

- 纯前端执行，无后端依赖。
- 主要优化 PDF 内图片体积。
- 支持压缩结果摘要：
  - 原始大小
  - 压缩后大小
  - 节省体积
  - 压缩比例

---

## 3.4 测试集工作台 `TestWorkbenchTab`

组件位置：[TestWorkbenchTab.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/TestWorkbenchTab.jsx)

这是当前应用最复杂、最值得持续迭代的模块。

### 当前目标

围绕“测试集标准答案”构建完整闭环：

1. 上传报告与测试集。
2. 按报告和页码执行提取。
3. 生成关联对比结果。
4. 使用统一分析页定位问题。
5. 按指标代码进行 Prompt 优化。
6. 输出最终优化结果和优化轨迹。

### 当前模式

工作台顶部通过 [ModeSelector.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/ModeSelector.jsx) 提供三种模式：

| 模式 | 状态 | 说明 |
| --- | --- | --- |
| 完整流程模式 | 已实现，主链路最完整 | PDF + 测试集 + 可选定义文件 → 提取 → 分析 → 优化 |
| 快速验收模式 | 已实现 | 外部 LLM 结果 + 测试集 → 手动/默认字段关联分析 → 可跳转优化 |
| 快速优化模式 | 已实现基础链路 | 关联对比文件 + PDF → 执行 Prompt 优化 |

### 重要说明

仓库里虽然存在 [FullFlowMode.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/FullFlowMode.jsx)，但当前完整流程的真实实现不在这个文件里，而是直接写在 `TestWorkbenchTab.jsx` 内。`FullFlowMode.jsx` 目前只是未接入的占位骨架。

---

## 4. 测试集工作台详细设计（当前实现）

## 4.1 完整流程模式

### 输入

- PDF 文件列表
- 测试集 Excel
- 可选：指标定义文件
- LLM1 / LLM2 设置

### 处理链路

1. 读取测试集与定义文件。
2. 依据 `report_name + pdf_numbers` 对测试项分组。
3. 按组切页并调用 LLM1 执行提取。
4. 将 LLM1 结果与测试集做关联对比，得到 `comparisonRows`。
5. 在统一分析页中展示：
   - 树形视角
   - 汇总指标
   - 分类分布
   - 明细表
6. 用户选择待优化指标代码。
7. 按 `indicator_code` 跨报告执行 LLM2 优化。
8. 生成 `finalRows` 与 `iterationDetails`。
9. 导出：
   - 原始提取结果
   - 关联对比文件
   - 分析面板数据
   - 最终优化结果
   - 多轮优化轨迹

### 当前页面区域

完整流程模式当前包含这些区域：

1. 文件上传区
   - PDF
   - 测试集
   - 定义文件
2. 缓存页面树
   - 展示切页缓存
   - 支持按页删除或按报告删除
3. Token 统计条
4. 阶段一提取按钮、进度和日志
5. 阶段一统一分析页
6. 阶段二优化配置
   - 指标代码多选
   - 循环优化开关
   - 最大优化轮数
   - 相似度阈值
7. 阶段二优化日志
8. 优化全过程追踪表

### 当前恢复能力

完整流程模式支持从 IndexedDB 恢复：

- PDF 文件
- 测试集文件
- 定义文件
- 缓存切页
- 阶段一 `comparisonRows`
- 阶段二 `finalRows`
- 未完成的运行状态 `runState`

### 当前中断与续跑机制

- 用户可手动中断。
- 中断不是立刻杀当前请求，而是“当前批次完成后停止”。
- 浏览器刷新后，如 `sessionId` 匹配，可提示从断点继续。

---

## 4.2 快速验收模式

组件位置：[QuickValidationMode.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/QuickValidationMode.jsx)

### 当前能力

- 上传外部 LLM 结果文件。
- 上传测试集文件。
- 在两个上传区之间通过弱存在感连接触发器展开关联字段配置。
- 关联字段支持按上传文件真实列名手动选择，并支持增减映射行数。
- 当手动映射被完全清空时，分析时自动回退默认规则：`report_name = report_name`、`indicator_code = indicator_code`、`year = data_year`。
- 点击分析按钮时会先执行严格校验，拦截字段未选、字段不存在、重复映射和 0 匹配配置。
- 执行右关联对比，得到 `comparisonRows`。
- 在统一分析页中查看当前验收结果。
- 导出关联文件。
- 导出分析面板数据。
- 跳转到快速优化模式，并携带待优化指标范围。

### 当前持久化

快速验收模式独立持久化：

- `validation_llm`
- `validation_test`
- `validation_comparison`
- `validation_field_mappings`

即使切换工作模式或刷新页面，也会自动恢复上次上传文件、分析结果与手动关联字段配置。

### 当前阈值行为

- 阈值状态在页面内维护。
- 默认读取 `llm2Settings.similarityThreshold`。
- 变更阈值时，统一分析页即时重算，但不重新做文件关联。

---

## 4.3 快速优化模式

组件位置：[QuickOptimizationMode.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/QuickOptimizationMode.jsx)

### 当前能力

- 上传关联对比文件。
- 上传 PDF 文件。
- 校验报告与 PDF 是否匹配。
- 根据当前预选指标范围过滤待优化行。
- 执行 LLM2 优化。
- 导出最终结果。

### 当前特点

- 这是“脱离完整流程”的独立优化入口。
- 适合只想复用已有 `comparisonRows` 文件的人。
- 当前页面逻辑比完整流程模式简单：
  - 无统一分析页内联展示
  - 无多轮轨迹表
  - 结果主要通过导出查看

---

## 5. 核心数据对象

## 5.1 `comparisonRows`

这是当前分析与优化的核心输入。

来源有两条：

1. 完整流程模式阶段一生成。
2. 快速验收模式从“外部 LLM 结果 + 测试集”生成。

用途：

- 构建统一分析页树结构。
- 生成明细表。
- 推导不达标指标代码。
- 作为 Prompt 优化输入。

## 5.2 `finalRows`

阶段二优化完成后的最终结果集。

用途：

- 导出最终优化结果。
- 作为当前最佳结果基线。

## 5.3 `iterationDetails`

记录每个指标在各轮优化中的表现。

当前主要用于：

- 优化全过程追踪表
- 导出多 Sheet 文件
- 人工判断某轮 Prompt 是否真的优于原始基线

---

## 6. 核心服务分层

## 6.1 文件解析层

- [fileParsers.js](/Users/michael_drj/AiProjects/report-parser/src/services/fileParsers.js)
  - `parseExcel`
  - `parsePDF`
  - `fileToBase64`

职责：

- Excel/CSV 读取
- PDF 文本抽取
- PDF Base64 编码

## 6.2 LLM 调用层

- [llmClient.js](/Users/michael_drj/AiProjects/report-parser/src/services/llmClient.js)

职责：

- 识别 Gemini / Anthropic / OpenAI 兼容接口
- 发起调用
- 重试
- token 费用估算
- 生成按类型区分的提取 system prompt

## 6.3 单次提取层

- [extractionService.js](/Users/michael_drj/AiProjects/report-parser/src/services/extractionService.js)

职责：

- 处理提取页的单次运行
- 需求表归一化与拆批
- LLM 批处理执行
- 提取统计与结果汇总

## 6.4 测试工作台服务层

- [testBenchService.js](/Users/michael_drj/AiProjects/report-parser/src/services/testBenchService.js)

职责：

- 完整流程阶段一提取
- 快速验收文件解析与关联
- 独立优化与完整流程优化
- PDF 切页与缓存
- 结果导出
- 相似度与字段级比对

## 6.5 持久化层

- [persistenceService.js](/Users/michael_drj/AiProjects/report-parser/src/services/persistenceService.js)

当前 IndexedDB store：

| store | 用途 |
| --- | --- |
| `files` | 持久化 PDF、测试集、定义文件、验收模式文件 |
| `pdfPages` | 持久化切页后的子 PDF |
| `runState` | 持久化未完成运行状态 |
| `results` | 批次级中间结果 |
| `phaseResults` | 阶段结果、验收结果 |

---

## 7. 当前导出能力

当前产品支持的导出项如下：

| 导出内容 | 入口 |
| --- | --- |
| 提取页结果 Excel | `ExtractorTab` |
| 阶段一 LLM1 提取结果 | `TestWorkbenchTab` |
| 阶段一关联对比文件 | `TestWorkbenchTab` / `QuickValidationMode` |
| 统一分析页面板数据 | `UnifiedAnalysisMerged` |
| 最终优化结果 | `TestWorkbenchTab` / `QuickOptimizationMode` |
| 优化轨迹多 Sheet 文件 | 完整流程模式阶段二 |

---

## 8. 当前已知限制

这部分不是缺陷列表，而是后续升级时应默认知道的现实边界。

### 8.1 模式实现不完全对称

- 完整流程模式功能最完整。
- 快速验收模式已有统一分析页和结果恢复。
- 快速优化模式仍是较轻量入口。
- `FullFlowMode.jsx` 仍是未接入占位文件。

### 8.2 上传持久化仍会读取大文件

当前文件持久化会对选中文件调用 `arrayBuffer()` 并写入 IndexedDB。大文件上传时的性能问题未在本轮作为主目标彻底重构。

### 8.3 分析面板状态不做刷新恢复

当前不持久化这些 UI 状态：

- 当前选中的树节点
- 树展开状态
- 明细表筛选状态
- 明细表滚动位置

这是有意为之，目的是优先保证分析交互性能。

### 8.4 代码结构中仍存在历史遗留命名

例如：

- 文档路径仍保留历史日期。
- 部分工具函数仍带 `analysis-v2` / `merge` 等阶段性命名。
- 少量占位组件与未使用导入仍可能存在。

---

## 9. 后续升级建议

下一版如果继续升级，建议以本文为基线，优先看下面几个方向：

1. 继续优化大文件上传与恢复链路。
2. 拆分 `TestWorkbenchTab.jsx`，降低单组件复杂度。
3. 将完整流程模式从内联 JSX 拆回独立组件。
4. 继续提升统一分析页的大数据量响应速度。
5. 梳理快速优化模式与完整流程模式的能力差距。

---

## 10. 当前实现对应文件索引

### 应用入口

- [src/App.jsx](/Users/michael_drj/AiProjects/report-parser/src/App.jsx)

### 主标签页

- [src/components/ExtractorTab.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/ExtractorTab.jsx)
- [src/components/MethodologyTab.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/MethodologyTab.jsx)
- [src/components/CompressorTab.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/CompressorTab.jsx)
- [src/components/TestWorkbenchTab.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/TestWorkbenchTab.jsx)

### 测试工作台相关

- [src/components/ModeSelector.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/ModeSelector.jsx)
- [src/components/QuickValidationMode.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/QuickValidationMode.jsx)
- [src/components/QuickOptimizationMode.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/QuickOptimizationMode.jsx)
- [src/components/UnifiedAnalysisMerged.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/UnifiedAnalysisMerged.jsx)
- [src/components/AnalysisDetailsTable.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/AnalysisDetailsTable.jsx)

### 服务与工具

- [src/services/extractionService.js](/Users/michael_drj/AiProjects/report-parser/src/services/extractionService.js)
- [src/services/testBenchService.js](/Users/michael_drj/AiProjects/report-parser/src/services/testBenchService.js)
- [src/services/llmClient.js](/Users/michael_drj/AiProjects/report-parser/src/services/llmClient.js)
- [src/services/persistenceService.js](/Users/michael_drj/AiProjects/report-parser/src/services/persistenceService.js)
- [src/utils/analysisV2Metrics.js](/Users/michael_drj/AiProjects/report-parser/src/utils/analysisV2Metrics.js)
- [src/utils/unifiedAnalysisMergeAdapter.js](/Users/michael_drj/AiProjects/report-parser/src/utils/unifiedAnalysisMergeAdapter.js)
- [src/utils/analysisDetailsModel.js](/Users/michael_drj/AiProjects/report-parser/src/utils/analysisDetailsModel.js)
- [src/utils/unifiedAnalysisPanel.js](/Users/michael_drj/AiProjects/report-parser/src/utils/unifiedAnalysisPanel.js)
