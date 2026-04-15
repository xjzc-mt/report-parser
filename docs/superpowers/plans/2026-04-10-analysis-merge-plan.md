# 统一分析页组件实现说明（当前版本）

**更新时间**：2026-04-13  
**说明**：本文件保留原历史路径，但内容已改为当前组件实现说明，重点覆盖 UI 结构、交互逻辑和性能优化结果。

## 1. 当前主组件

统一分析页当前由两层主组件组成：

1. [UnifiedAnalysisMerged.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/UnifiedAnalysisMerged.jsx)
2. [AnalysisDetailsTable.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/AnalysisDetailsTable.jsx)

对应的数据辅助层：

- [analysisDetailsModel.js](/Users/michael_drj/AiProjects/report-parser/src/utils/analysisDetailsModel.js)
- [unifiedAnalysisPanel.js](/Users/michael_drj/AiProjects/report-parser/src/utils/unifiedAnalysisPanel.js)

---

## 2. `UnifiedAnalysisMerged` 当前职责

## 2.1 输入职责

当前负责：

- 读取 `comparisonRows`
- 构建分析索引
- 按阈值、年份、幻觉开关生成树数据
- 管理当前选中节点和展开状态

## 2.2 输出职责

当前负责：

- 渲染左树
- 渲染右侧概览
- 渲染错误分布
- 下发当前节点明细给 `AnalysisDetailsTable`
- 提供分析面板导出能力

---

## 3. 当前页面骨架

当前页面结构大致为：

1. 顶部工具栏
2. 面包屑
3. 置顶汇总摘要
4. 中部双栏
   - 左侧树导航
   - 右侧概览与错误分布
5. 底部明细表

### 3.1 左树导航

当前树节点支持：

- 展开 / 收起
- 选中高亮
- 跨根节点切换

节点当前使用的 3 个根：

- `crossReportRoot`
- `perReportRoot`
- `perTypeRoot`

### 3.2 右侧概览

右侧概览面板根据选中节点层级决定渲染内容：

- 根节点：展示下一层列表
- 中间层：展示下一层列表
- 叶子层：展示当前节点概览卡片

### 3.3 底部明细表

底部始终展示当前节点覆盖的测试项与幻觉行，并自动带入路径筛选条件。

---

## 4. 当前工具栏交互

当前工具栏能力：

- 年份多选
- 阈值输入
- 统计幻觉开关
- 面板导出
- 跳转优化

## 4.1 年份筛选

当前使用 `startTransition` 包裹年份应用逻辑，降低切换时的卡顿感。

## 4.2 阈值输入

当前阈值是分析口径核心参数：

- 影响严格通过率
- 影响宽松通过率
- 影响分类
- 影响错误分布
- 影响右侧概览和明细分类

## 4.3 幻觉开关

当前“统计幻觉”是可切换的：

- 开：汇总与错误分布纳入幻觉项
- 关：树数据仍存在，但统计结果不计入幻觉

---

## 5. `AnalysisDetailsTable` 当前职责

## 5.1 当前渲染内容

表头：

- 报告
- 指标
- 类型
- 相似度
- 分类
- 测试集详情
- LLM详情
- 输出数

表体：

- 从当前节点 `items + hallucinations` 构建 detail rows
- 支持筛选、虚拟滚动和 tooltip

## 5.2 当前样式特征

当前明细表头已回到更接近旧版视觉的紧凑风格：

- 11px 字号
- 更短的表头高度
- 详情列可伸缩，但默认宽度更接近旧版
- `测试集详情 / LLM详情` 与其他表头文字风格已统一

---

## 6. 当前明细行模型

由 [analysisDetailsModel.js](/Users/michael_drj/AiProjects/report-parser/src/utils/analysisDetailsModel.js) 生成。

每个明细行当前包含：

- `reportName`
- `indicatorCode`
- `indicatorName`
- `indicatorLabel`
- `valueType`
- `rawValueType`
- `outputCount`
- `bestSimilarity`
- `categoryKey`
- `category`
- `expectedRow`
- `actualRow`

### 6.1 幻觉行特殊处理

幻觉行会构造成特殊的明细行：

- 测试集侧显示“无对应测试项”
- LLM 侧正常展示输出字段

---

## 7. 当前文字型展示规则

当前文字型是唯一“内容长度不固定”的类型。

### 当前规则

- 值字段最多显示 12 行
- hover 直接展示全量 tooltip
- 高亮共现字符
- 行高固定为 `252px`

这个规则是本轮性能与可读性的折中结果。

---

## 8. 当前固定行高策略

当前行高按类型固定：

| 类型 | 行高 |
| --- | --- |
| 文字型 | `252px` |
| 强度型 | `156px` |
| 数值型 | `116px` |
| 货币型 | `132px` |

### 设计原因

- 非文字型字段结构固定，完全没必要使用大行高。
- 文字型如果过矮，tooltip 体验会变差。
- 动态高度会显著增加虚拟滚动复杂度，因此当前没有采用。

---

## 9. 当前虚拟滚动实现

当前虚拟滚动不是“所有行同高”的简化版，而是：

1. 先通过 `getDetailRowHeight(row)` 计算每行高度。
2. `buildVirtualLayout(rows)` 生成：
   - `heights`
   - `offsets`
   - `totalHeight`
3. `getVirtualWindow()` 使用二分查找计算当前窗口。
4. 表体绝对定位渲染当前窗口内的行。

这样做已经支持：

- 不同类型不同行高
- 大结果集滚动
- 节点切换后快速重建可视区

---

## 10. 当前筛选交互规则

### 已支持筛选列

- 报告
- 指标
- 类型
- 相似度
- 分类
- 输出数

### 当前交互方式

- 点击筛选图标打开 Popover
- 勾选多个值
- 点击“应用”
- 表格刷新结果

当前没有改成“勾选即刷新”，因为这会显著增加大表交互成本。

---

## 11. 当前 tooltip 规则

### 文字型值

当前使用强制 tooltip：

- 即使浏览器未可靠检测到 overflow
- 只要字段被标记为 `alwaysTooltip`
- hover 就能看到完整内容

### 其他字段

仍使用 overflow 检测触发 tooltip。

---

## 12. 当前导出实现

统一分析页导出通过 [analysisPanelExportService.js](/Users/michael_drj/AiProjects/report-parser/src/services/analysisPanelExportService.js) 实现。

导出的是：

- 当前分析面板的概览数据
- 不是底部明细表全量数据

当前导出文件名会自动根据当前节点 label 和当天日期生成。

---

## 13. 当前已确认的性能优化成果

本轮已落地的，不是想法，而是已经进入当前代码的内容：

1. `comparisonRows` 预索引
2. 年份子集不再全量重扫
3. 树节点查找改为 `nodeMap / pathMap`
4. 明细表轻量 row model
5. 明细表虚拟滚动
6. 按类型固定高度
7. 文字型 hover 全量 tooltip 恢复
8. 货币型行高判断与字段展示保持一致

---

## 14. 当前仍建议继续做的 UI 侧升级

1. 将概览区和明细区继续拆组件，降低 `UnifiedAnalysisMerged.jsx` 复杂度。
2. 如果后续还要提升大数据流畅度，可考虑把分析聚合迁移到 `Web Worker`。
3. 如果业务上需要“当前节点明细导出”，应为 `AnalysisDetailsTable` 新增专门导出，而不是复用面板导出。
