# 统一分析页设计说明（当前实现）

**更新时间**：2026-04-13  
**适用组件**：`UnifiedAnalysisMerged` + `AnalysisDetailsTable`  
**说明**：本文件不再描述“待实现方案”，而是描述当前统一分析页的真实结构、指标口径与交互规则。

## 1. 目标定位

当前统一分析页承担 3 件事：

1. 用统一的测试项口径汇总 `comparisonRows`。
2. 让用户按不同视角下钻定位问题。
3. 在同页查看当前节点的可筛选明细表，并支持导出分析面板数据。

它已经是当前测试集工作台和快速验收模式的主分析入口。

---

## 2. 入口与依赖

主组件位置：[UnifiedAnalysisMerged.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/UnifiedAnalysisMerged.jsx)

底层依赖：

- [analysisV2Metrics.js](/Users/michael_drj/AiProjects/report-parser/src/utils/analysisV2Metrics.js)
- [unifiedAnalysisMergeAdapter.js](/Users/michael_drj/AiProjects/report-parser/src/utils/unifiedAnalysisMergeAdapter.js)
- [analysisDetailsModel.js](/Users/michael_drj/AiProjects/report-parser/src/utils/analysisDetailsModel.js)
- [AnalysisDetailsTable.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/AnalysisDetailsTable.jsx)
- [analysisPanelExportService.js](/Users/michael_drj/AiProjects/report-parser/src/services/analysisPanelExportService.js)

---

## 3. 数据输入与输出

## 3.1 输入

统一分析页接收：

- `comparisonRows`
- `threshold`
- `onThresholdChange`
- `onJumpToOptimization`（可选）

## 3.2 输出

统一分析页当前提供这些输出能力：

- 当前树节点下的汇总指标展示
- 当前树节点下的错误类型分布
- 当前节点子级概览表
- 当前节点明细表
- 当前分析面板 Excel 导出
- 向优化模式传递“不达标指标代码集合”

---

## 4. 当前分析视角

统一分析页当前有 3 个一级视角根节点：

1. `跨报告视角`
2. `按报告视角`
3. `按类型视角`

### 4.1 跨报告视角

结构：

`全部报告 → 指标类型 → 指标`

适合回答：

- 当前整体哪类指标最差。
- 某个指标跨报告表现如何。

### 4.2 按报告视角

结构：

`全部指标 → 报告 → 指标类型 → 指标`

适合回答：

- 哪份报告拖累整体结果。
- 某份报告里哪个类型最差。

### 4.3 按类型视角

结构：

`全部指标 → 指标类型 → 报告 → 指标`

适合回答：

- 某类指标在不同报告中的分布。
- 同一类型下哪些报告是异常点。

---

## 5. 当前树节点模型

树节点由 [unifiedAnalysisMergeAdapter.js](/Users/michael_drj/AiProjects/report-parser/src/utils/unifiedAnalysisMergeAdapter.js) 生成。

当前节点结构包含：

- `id`
- `section`
- `level`
- `label`
- `items`
- `hallucinations`
- `children`
- `filters`
- `metrics`

### 5.1 `items`

这里不是原始 `comparisonRows`，而是已经聚合到“测试项级”的对象。

一个测试项由以下组合确定：

- `reportName`
- `indicatorCode`
- `dataYear`

### 5.2 `hallucinations`

单独存放 `match_status === '幻觉'` 的输出行，用于：

- 幻觉率统计
- 错误类型分布
- 明细表展示

### 5.3 `filters`

每个节点带有路径过滤条件，例如：

- `reportNames`
- `indicators`
- `valueTypes`

这些过滤条件会沿路径合并，并自动传给底部明细表。

---

## 6. 当前指标口径

所有汇总指标都基于“测试项级”而不是原始行级。

## 6.1 测试项级聚合

在 [analysisV2Metrics.js](/Users/michael_drj/AiProjects/report-parser/src/utils/analysisV2Metrics.js) 中，多个原始关联行会先聚合为一个测试项：

- 测试项下可能有 0 条输出
- 也可能有 1 条输出
- 也可能有多条输出

系统会记录：

- `outputCount`
- `bestRow`
- `bestSimilarity`
- `hit`
- `duplicate`
- `miss`

## 6.2 分类规则

当前分类共有 7 类：

| 分类 key | 展示名 | 含义 |
| --- | --- | --- |
| `perfect_match` | 完美匹配 | 单条输出且相似度 100 |
| `pass_match` | 达标匹配 | 单条输出且相似度达到阈值但未满分 |
| `single_fail` | 单条错误 | 单条输出但未达到阈值 |
| `duplicate_with_pass` | 重复摘录-含达标 | 多条输出，至少一条达标 |
| `duplicate_without_pass` | 重复摘录-无达标 | 多条输出，无一条达标 |
| `miss` | 漏摘录 | 测试项无输出 |
| `hallucination` | 幻觉 | 无对应测试项却输出了结果 |

## 6.3 汇总指标

当前节点指标包括：

- `测试项`
- `输出项`
- `严格通过率`
- `宽松通过率`
- `召回率`
- `精确率`
- `重复率`
- `漏摘率`
- `平均最佳相似度`
- `幻觉率`

### 6.4 指标含义

#### 严格通过率

仅统计：

- 单条输出
- 且达到阈值

#### 宽松通过率

统计：

- 完美匹配
- 达标匹配
- 重复摘录但含达标

#### 召回率

有输出的测试项占全部测试项的比例。

#### 精确率

使用 `宽松通过数 / 输出项数` 的口径。

#### 幻觉率

使用 `幻觉数 / 输出项数` 的口径。

---

## 7. 当前年份过滤规则

年份过滤通过 [analysisV2Metrics.js](/Users/michael_drj/AiProjects/report-parser/src/utils/analysisV2Metrics.js) 中的索引能力实现。

当前规则：

- 未选择年份：使用全量数据。
- 选择年份：只取所选年份数据。
- 没有年份的测试项与幻觉项会被保留在结果里，不会因为年份筛选直接消失。

这个规则的目的是避免：

- 用户一筛年份，缺失年份的数据全部被误删。
- 某些无法识别年份的行不再参与分析。

---

## 8. 当前页面布局

统一分析页当前分为 5 个主要区域：

1. 工具栏
2. 面包屑
3. 置顶汇总条
4. 错误类型分布 + 右侧子级概览
5. 底部明细表

### 8.1 工具栏

当前工具栏支持：

- 年份多选
- 相似度阈值输入
- “统计幻觉”开关
- 导出分析面板数据
- 跳转优化入口（当父组件提供时）

### 8.2 面包屑

点击任意父级节点后，可通过面包屑回跳上层。

### 8.3 置顶汇总条

当前用于固定展示选中节点的关键摘要：

- 当前标题
- 输出项数
- 一组核心指标 badge

### 8.4 错误类型分布

由 [ErrorTypeBar.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/ErrorTypeBar.jsx) 展示。

当前分类颜色与标签与明细表保持一致。

### 8.5 右侧概览面板

根据当前节点层级展示“下一层子项”列表。

例如：

- 选中“全部报告”时，右侧展示类型列表。
- 选中“某类型”时，右侧展示该类型下的指标列表。
- 选中“某报告”时，右侧展示该报告下的类型列表。

---

## 9. 当前明细表设计

底部明细表组件为 [AnalysisDetailsTable.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/AnalysisDetailsTable.jsx)。

## 9.1 当前列结构

当前固定列为：

1. 报告
2. 指标
3. 类型
4. 相似度
5. 分类
6. 测试集详情
7. LLM详情
8. 输出数

## 9.2 当前列宽策略

使用 grid 布局：

- 前 5 列和最后一列固定宽
- `测试集详情 / LLM详情` 两列使用 `minmax(311px, 1fr)` 弹性布局

这样做的目标是：

- 保持结构稳定
- 让长详情列在大屏下可适度变宽
- 但又不至于像更早的宽版实现那样过度拉伸

## 9.3 当前筛选能力

支持对以下列做多选筛选并“应用”：

- 报告
- 指标
- 类型
- 相似度
- 分类
- 输出数

当前不支持对“测试集详情 / LLM详情”做列级多选筛选。

## 9.4 当前详情字段规则

### 文字型

字段：

- 页码
- 值

当前行为：

- 值最多显示 12 行
- 超出后 hover tooltip 展示全量内容
- 字符级共享内容高亮仍保留

### 数值型

字段：

- 页码
- 值
- 单位

### 货币型

字段：

- 页码
- 值
- 单位
- 货币

### 强度型

字段：

- 页码
- 值
- 单位
- 分子单位
- 分母单位

### 当前“货币型”判断规则

行高判断已与字段展示保持一致：

- 如果类型本身是 `货币型`，使用货币型高度。
- 如果类型是 `数值型`，但任一侧存在 `currency` 字段，也按货币型高度处理。

---

## 10. 当前行高与虚拟滚动策略

这是本轮性能优化后的关键实现。

## 10.1 行高策略

当前不是“所有行同高”，而是“按类型固定高度”：

| 类型 | 当前高度 |
| --- | --- |
| 文字型 | `252px` |
| 强度型 | `156px` |
| 数值型 | `116px` |
| 货币型 | `132px` |

这样做的原因：

- 文字型内容长度天然不稳定。
- 其余三类字段结构固定，适合更紧凑的高度。
- 比“完全动态高度”更稳定，也更适合虚拟滚动。

## 10.2 虚拟滚动

当前明细表不再一次性渲染全部行，而是：

1. 先根据每行类型计算高度。
2. 生成累计 offset 布局。
3. 根据 `scrollTop + viewportHeight` 计算虚拟窗口。
4. 只渲染可见区和少量 overscan 行。

对应实现位于 [analysisDetailsModel.js](/Users/michael_drj/AiProjects/report-parser/src/utils/analysisDetailsModel.js)。

---

## 11. 当前性能策略

统一分析页当前使用了以下性能策略：

## 11.1 索引先行

`comparisonRows` 不再每次交互都全量重扫。

当前流程是：

1. 先构建 `analysis index`
2. 再从索引里按年份取 subset
3. 再基于 subset 和阈值生成模型

## 11.2 节点查找使用映射表

树数据生成后会同步生成：

- `nodeMap`
- `pathMap`

用于：

- O(1) 取当前节点
- 快速生成面包屑路径

## 11.3 明细表使用轻量行模型

不是把原始行直接塞到表格里，而是先构建：

- 轻量 `detail row model`
- 列筛选项
- 虚拟布局信息

## 11.4 列筛选“选择后应用”

多选筛选不是每勾一项就立刻全表刷新，而是：

1. 临时选择
2. 点击“应用”
3. 再触发表格结果更新

## 11.5 非关键状态使用 `startTransition`

当前年份切换和幻觉开关等交互已通过 `startTransition` 降低主线程阻塞感。

---

## 12. 当前导出规则

统一分析页当前支持导出“当前分析面板”的概览数据。

导出规则由 [unifiedAnalysisPanel.js](/Users/michael_drj/AiProjects/report-parser/src/utils/unifiedAnalysisPanel.js) 决定：

- 自动推断面板主列标签：
  - 指标类型 / 指标 / 报告 / 名称
- 导出当前节点子项
- 自动附带当前日期构造文件名

导出内容偏“概览表”，不是明细表全量导出。

---

## 13. 当前已知边界

### 13.1 不是所有 UI 状态都持久化

当前不会持久化：

- 树展开状态
- 当前选中节点
- 明细筛选条件
- 明细滚动位置

### 13.2 统一分析页主要面向大结果集定位问题

它现在优先保证：

- 汇总视角切换
- 节点定位
- 明细筛选与滚动

不追求“每个按钮点击后 0 延迟无感”，而是追求“大数据量下不再整页卡死”。

### 13.3 面板导出仍偏概览

如果后续需要“当前节点全量明细导出”，需要新增明细导出链路，而不是复用现有面板导出。

---

## 14. 后续升级入口

如果下一版继续升级统一分析页，建议优先看：

1. 更细粒度的局部重算。
2. 明细导出。
3. 树节点与优化范围联动可视化。
4. 进一步拆分 `UnifiedAnalysisMerged.jsx` 的职责。
