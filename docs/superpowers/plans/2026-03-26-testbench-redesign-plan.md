# 测试集工作台实现清单（当前版本）

**更新时间**：2026-04-13  
**说明**：文件名保留 `plan`，但内容已改写为“当前实现清单 + 后续升级入口”，不再表示待实施计划。

## 1. 当前实现状态总表

| 模块 | 当前状态 | 说明 |
| --- | --- | --- |
| 顶层四标签页 | 已实现 | `Extractor / Methodology / PDF压缩 / 测试集工作台` |
| 单次提取工作台 | 已实现 | 支持 PDF + 需求表提取与导出 |
| 方法论说明页 | 已实现 | 静态说明内容已独立成 tab |
| PDF 压缩页 | 已实现 | 单文件压缩与下载 |
| 测试集工作台模式切换 | 已实现 | 三模式切换，运行中禁切 |
| 完整流程模式 | 已实现主链路 | 真实逻辑写在 `TestWorkbenchTab.jsx` |
| 快速验收模式 | 已实现 | 支持恢复文件、分析结果与手动关联字段配置，并增加严格校验 |
| 快速优化模式 | 已实现基础链路 | 偏轻量入口 |
| 统一分析页 | 已实现 | 已替换为当前主分析入口 |
| 分析数据导出 | 已实现 | 导出当前面板概览 |
| 分析性能重构 | 已实现一版 | 已完成索引化、局部映射、虚拟滚动 |
| 优化轨迹展示 | 已实现 | 完整流程模式可查看 |

---

## 2. 工作台模块结构

## 2.1 当前模式职责

### 完整流程模式

职责：

- 上传 PDF
- 上传测试集
- 可选上传定义文件
- 执行提取
- 关联分析
- 选择指标做优化
- 导出阶段结果与最终结果

当前真实实现文件：

- [TestWorkbenchTab.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/TestWorkbenchTab.jsx)

### 快速验收模式

职责：

- 上传外部 LLM 结果
- 上传测试集
- 执行关联
- 使用统一分析页验收
- 跳转优化模式

当前实现文件：

- [QuickValidationMode.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/QuickValidationMode.jsx)

### 快速优化模式

职责：

- 上传关联对比文件
- 上传 PDF
- 校验 PDF 覆盖情况
- 执行优化
- 导出最终结果

当前实现文件：

- [QuickOptimizationMode.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/QuickOptimizationMode.jsx)

---

## 3. 当前完整流程清单

## 3.1 上传与准备

已实现：

- PDF 多选上传
- 测试集上传
- 指标定义文件上传
- 文件格式校验
- IndexedDB 文件恢复

## 3.2 提取阶段

已实现：

- 按 `report_name + pdf_numbers` 分组
- 切页缓存
- 调用 LLM1 提取
- 断点状态保存
- 手动中断
- 断点继续
- 提取日志与进度条
- LLM1 原始结果导出

## 3.3 分析阶段

已实现：

- 统一分析页接入
- 阈值调整
- 年份筛选
- 幻觉开关
- 面板数据导出

## 3.4 优化阶段

已实现：

- 指标代码多选
- 循环优化开关
- 最大轮数设置
- 相似度阈值设置
- LLM2 优化
- 优化日志
- 最终结果导出
- 优化轨迹表

---

## 4. 当前持久化清单

## 4.1 `files`

持久化：

- PDF 文件
- 测试集文件
- 定义文件
- 快速验收模式文件

## 4.2 `pdfPages`

持久化：

- 切分后的 PDF 子页面

支持：

- 单页删除
- 按报告删除

## 4.3 `runState`

持久化：

- 当前运行进度
- 已完成分组
- session 相关恢复信息

## 4.4 `phaseResults`

持久化：

- 完整流程 `comparisonRows`
- 完整流程 `finalRows`
- 快速验收 `validation_comparison`

---

## 5. 当前代码角色分工

## 5.1 UI 组件层

### 当前主组件

- [TestWorkbenchTab.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/TestWorkbenchTab.jsx)
- [QuickValidationMode.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/QuickValidationMode.jsx)
- [QuickOptimizationMode.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/QuickOptimizationMode.jsx)
- [UnifiedAnalysisMerged.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/UnifiedAnalysisMerged.jsx)
- [AnalysisDetailsTable.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/AnalysisDetailsTable.jsx)

### 辅助组件

- [UploadCard.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/UploadCard.jsx)
- [PdfPageTree.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/PdfPageTree.jsx)
- [ProgressPanel.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/ProgressPanel.jsx)
- [ErrorTypeBar.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/ErrorTypeBar.jsx)
- [PdfMatchChecker.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/PdfMatchChecker.jsx)
- [LLMSettingsDrawer.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/LLMSettingsDrawer.jsx)

## 5.2 服务层

- [testBenchService.js](/Users/michael_drj/AiProjects/report-parser/src/services/testBenchService.js)
- [persistenceService.js](/Users/michael_drj/AiProjects/report-parser/src/services/persistenceService.js)
- [analysisPanelExportService.js](/Users/michael_drj/AiProjects/report-parser/src/services/analysisPanelExportService.js)
- [pdfPageExtractor.js](/Users/michael_drj/AiProjects/report-parser/src/services/pdfPageExtractor.js)
- [synonymService.js](/Users/michael_drj/AiProjects/report-parser/src/services/synonymService.js)

## 5.3 工具层

- [analysisV2Metrics.js](/Users/michael_drj/AiProjects/report-parser/src/utils/analysisV2Metrics.js)
- [unifiedAnalysisMergeAdapter.js](/Users/michael_drj/AiProjects/report-parser/src/utils/unifiedAnalysisMergeAdapter.js)
- [analysisDetailsModel.js](/Users/michael_drj/AiProjects/report-parser/src/utils/analysisDetailsModel.js)
- [unifiedAnalysisPanel.js](/Users/michael_drj/AiProjects/report-parser/src/utils/unifiedAnalysisPanel.js)
- [reportAnalytics.js](/Users/michael_drj/AiProjects/report-parser/src/utils/reportAnalytics.js)

---

## 6. 当前已完成的关键重构

## 6.1 分析页单轨化

历史上的“旧版分析 / 新版分析 / 合并版分析”阶段性思路已经收敛到当前主入口：

- `UnifiedAnalysisMerged`

当前项目中，统一分析页已是主分析视图，不再维持多套分析页并行对照。

## 6.2 分析性能重构

已完成：

- 分析索引预构建
- 年份子集索引化
- `nodeMap / pathMap` 节点映射
- 明细表虚拟滚动
- 明细表轻量 row model
- 按类型固定行高

## 6.3 快速验收结果恢复

已完成：

- 验收模式文件恢复
- 验收模式分析结果恢复

---

## 7. 当前未彻底收口的点

## 7.1 完整流程模式组件拆分

问题：

- 完整流程主逻辑仍集中在 `TestWorkbenchTab.jsx`
- 组件体量较大

当前结论：

- 功能已经可用
- 但下一版应继续拆分

## 7.2 快速优化模式能力仍偏轻

当前缺少：

- 内联分析页
- 更完整的轨迹展示
- 与完整流程模式更一致的持久化能力

## 7.3 上传持久化链路仍偏重

当前写入 IndexedDB 时仍会全量读取文件 `arrayBuffer()`，后续如继续做大文件优化，需要优先处理这一层。

---

## 8. 下一版建议优先级

建议按这个顺序继续升级：

1. 拆分 `TestWorkbenchTab.jsx`
2. 补齐快速优化模式能力
3. 继续优化文件持久化链路
4. 增强统一分析页导出与联动能力
5. 清理历史阶段性命名与未接入占位组件
