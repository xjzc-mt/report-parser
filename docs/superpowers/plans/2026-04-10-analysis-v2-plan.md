# 分析数据层与指标口径说明（当前版本）

**更新时间**：2026-04-13  
**说明**：本文件保留原路径，但内容已重写为当前分析数据层实现说明。

## 1. 角色定位

分析数据层的任务是把原始 `comparisonRows` 转成统一分析页可以消费的稳定模型，并尽量避免每次交互都全量重扫原始数据。

当前核心文件：

- [analysisV2Metrics.js](/Users/michael_drj/AiProjects/report-parser/src/utils/analysisV2Metrics.js)
- [unifiedAnalysisMergeAdapter.js](/Users/michael_drj/AiProjects/report-parser/src/utils/unifiedAnalysisMergeAdapter.js)

---

## 2. 当前数据流

当前统一分析页的数据流是：

1. 原始 `comparisonRows`
2. `buildAnalysisV2Index()`
3. `getAnalysisSubsetFromIndex()`
4. `buildAnalysisV2Model()`
5. `buildMergedTreeData()`
6. UI 消费 `nodeMap / pathMap / node.metrics / node.items / node.hallucinations`

这意味着当前已经不是“每次改阈值或切年份就从头遍历所有原始行构树”的旧模式。

---

## 3. 当前类型归一化规则

## 3.1 面向分析汇总的类型归一化

函数：

- `normalizeAnalysisValueType()`

当前规则：

- `文字/文本/TEXT` → `文字型`
- `强度/INTENSITY` → `强度型`
- `货币/数值/数字/NUMERIC/CURRENCY` → `数值型`

说明：

在汇总层，货币型会并入数值型，以减少树节点分散。

## 3.2 面向明细展示的类型归一化

函数：

- `normalizeDetailValueType()`

当前规则：

- `货币/CURRENCY` 保留为 `货币型`

说明：

明细展示需要保留货币型，因为其字段结构与普通数值型不同。

---

## 4. 当前索引模型

函数：

- `buildAnalysisV2Index(comparisonRows)`

输出对象带 `kind: 'analysis-v2-index'`，当前包含：

- `baseItems`
- `hallucinations`
- `itemsByYear`
- `hallucinationsByYear`
- `itemsWithoutYear`
- `hallucinationsWithoutYear`
- `allYears`

## 4.1 `baseItems`

每个 `baseItem` 当前代表一个测试项，唯一 key 由以下字段组成：

- `report_name`
- `indicator_code`
- `data_year`

并记录：

- `indicatorName`
- `indicatorLabel`
- `valueType`
- `rawValueType`
- `rows`
- `outputRows`
- `outputCount`
- `bestRow`
- `bestSimilarity`
- `hit`
- `duplicate`
- `miss`

## 4.2 `hallucinations`

单独收集所有 `match_status === '幻觉'` 的原始输出行。

## 4.3 按年份索引

当前会分别维护：

- 有年份的数据
- 无年份的数据

这样在筛年份时，可以做到：

- 命中年份的数据进入子集
- 无年份数据仍然保留

---

## 5. 当前测试项分类逻辑

函数：

- `evaluateTestItems(baseItems, threshold)`

当前分类逻辑如下：

| 条件 | 分类 |
| --- | --- |
| 无输出 | `miss` |
| 多条输出且含达标 | `duplicate_with_pass` |
| 多条输出且无达标 | `duplicate_without_pass` |
| 单条输出、达标且相似度 100 | `perfect_match` |
| 单条输出、达标但未满分 | `pass_match` |
| 其余单条输出失败 | `single_fail` |

这个分类直接驱动：

- 错误类型分布条
- 明细分类标签
- 宽松通过率
- 重复率
- 漏摘率

---

## 6. 当前汇总指标计算

函数：

- `summarizeAnalysisSubset(testItems, hallucinations)`

### 当前统计项

- `testItemCount`
- `modelOutputCount`
- `strictPassCount`
- `lenientPassCount`
- `hitCount`
- `duplicateCount`
- `missCount`
- `hallucinationCount`

### 当前派生指标

- `strictPassRate`
- `lenientPassRate`
- `recall`
- `precision`
- `duplicateRate`
- `missRate`
- `hallucinationRate`
- `averageBestSimilarity`

### 当前精确率口径

`precision = lenientPassCount / modelOutputCount`

这意味着：

- 统计以“输出项”为分母
- 重复摘录和幻觉会拉低精确率

---

## 7. 当前年份子集策略

函数：

- `getAnalysisSubsetFromIndex(index, selectedYears)`

行为：

- 无年份筛选时返回全量。
- 有年份筛选时：
  - 合并所有选中年份的 `itemsByYear`
  - 合并所有选中年份的 `hallucinationsByYear`
  - 再补上无年份项

这样能保证：

- 年份筛选有效
- 无年份项不被误删
- 同一测试项不会因为多次选中年份被重复加入

---

## 8. 当前模型层

函数：

- `buildAnalysisV2Model(source, threshold)`

`source` 当前支持 3 种输入：

1. 原始 `comparisonRows`
2. `analysis-v2-index`
3. `analysis-v2-subset`

输出模型当前包含：

- `testItems`
- `hallucinations`
- `summary`
- `overviews.byType`
- `overviews.byReport`

这些概览列表会作为树适配层的主要输入。

---

## 9. 当前树适配层

函数：

- `buildMergedTreeData(source, threshold, includeHallucination, selectedYears)`

它会把模型转换成 3 套树根：

1. `crossReportRoot`
2. `perReportRoot`
3. `perTypeRoot`

并同步生成：

- `nodeMap`
- `pathMap`

---

## 10. 当前过滤路径合并规则

函数：

- `buildPathFilters(nodePath)`

当前会把路径上所有节点的这些过滤条件做并集：

- `reportNames`
- `indicators`
- `valueTypes`
- `outputCounts`
- `similarities`
- `categories`

用途：

- 把树路径自动映射到底部明细表初始筛选条件。

---

## 11. 当前性能优化点

## 11.1 索引和子集分离

已经做到：

- 原始数据变化时构建索引
- 年份切换只做索引子集选择
- 阈值变化只重做测试项分类与汇总

## 11.2 树节点查找不再递归扫描

当前统一分析页使用：

- `nodeMap.get(id)`
- `pathMap.get(id)`

避免每次点击节点都递归扫整棵树。

## 11.3 货币型与数值型双口径

当前分析层和明细层对类型的归一化不同，这是刻意设计，不是 bug：

- 汇总层并入数值型
- 明细层保留货币型结构

---

## 12. 当前测试覆盖点

相关测试：

- [tests/analysisV2Metrics.test.js](/Users/michael_drj/AiProjects/report-parser/tests/analysisV2Metrics.test.js)
- [tests/analysisIndex.test.js](/Users/michael_drj/AiProjects/report-parser/tests/analysisIndex.test.js)
- [tests/unifiedAnalysisMergeAdapter.test.js](/Users/michael_drj/AiProjects/report-parser/tests/unifiedAnalysisMergeAdapter.test.js)

当前已覆盖的关键点包括：

- 类型归一化
- 测试项分类
- 汇总指标
- 年份子集构造
- 树适配结果
- 路径过滤条件

---

## 13. 下一版可继续演进的方向

1. 做更细粒度的 memo 或缓存复用。
2. 将部分纯数据重算迁移到 `Web Worker`。
3. 为导出新增更明确的“当前节点明细导出模型”。
4. 继续整理命名，降低 `analysis-v2 / merge` 阶段性痕迹。
