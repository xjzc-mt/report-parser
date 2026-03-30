# 设计文档：统一分析视图 & 验收模式增强

**日期**：2026-03-27
**状态**：已审批，待实现
**目标**：通过精确的多维评估指标，支持将 LLM 摘录的准确率和召回率优化至 95% 以上

---

## 背景与问题

当前「快速验收模式」（QuickValidationMode）存在三个主要问题：

1. **分析维度不足**：只有「整体分析」和「按报告分析」两个平行 Tab，无法按指标类型或具体指标粒度查看，也无法组合维度（如「某类型在某报告某年的表现」）。

2. **数据不持久**：切换到其他工作模式再切回来，上传的文件和分析结果全部丢失，需要重新上传和重新分析。

3. **评估指标不全**：缺少「错误类型分布」「完全匹配率」「跨报告稳定性」这三类对 Prompt 优化决策最关键的指标，导致知道「哪里不好」但不知道「为什么不好」。

---

## 整体方案

### 分析视图：从多 Tab 改为统一下钻树

废弃原有的「整体分析」「按报告分析」两个 Tab，改为**一个统一分析视图**，左侧是两段式树，右侧是当前节点子项的指标列表，顶部是置顶汇总行。

**树结构：**

```
🌐 跨报告视角（section 1）
  ▼ 全部报告                     ← 等价于原「整体分析」
      ▶ 文字型 (180)
          ENV-001 温室气体总排放量
          ENV-002 可再生能源比例
          ⋯
      ▶ 数值型 (210)
      ▶ 货币型 (65)
      ▶ 强度型 (45)

─── 分隔线 ───

📄 按报告视角（section 2）
  ▶ 公司A 年报 (150)
      ▶ 2023年 (50)
          ▶ 文字型 (18)
              ENV-001
              ⋯
          ▶ 数值型 (22)
          ▶ 货币型 (7)
          ▶ 强度型 (3)
      ▶ 2022年 (50)
      ▶ 2021年 (50)
  ▶ 公司B 年报 (100)
  ⋯
```

**右侧面板规则（始终显示当前节点的「下一层子项」）：**

| 选中节点（跨报告） | 右侧列表行 |
|---|---|
| 全部报告 | 4 种指标类型 |
| 文字型 | 各指标（含跨报告稳定性列） |
| 具体指标 | 各报告中该指标的表现 |

| 选中节点（按报告） | 右侧列表行 |
|---|---|
| 某份报告 | 年份列表 |
| 某年 | 4 种指标类型 |
| 某年某类型 | 该类型下的指标列表 |
| 某指标 | 该指标在这份报告这一年的原始数据行 |

面包屑导航支持跳回任意上级层级。

---

## 新增评估指标

### 1. 错误类型分布（Error Type Breakdown）

将每行数据分为 5 类：

| 类型 | 定义 | 颜色 | Prompt 修复方向 |
|------|------|------|----------------|
| ✅ 完全匹配 | `match_status !== '未匹配'` 且 `similarity === 100` | 深绿 | 无需修复 |
| 🟢 达标匹配 | 已匹配且 `similarity >= threshold`（但 < 100） | 浅绿 | 微调即可 |
| 🟡 部分匹配 | 已匹配但 `similarity < threshold` | 黄 | 优化输出格式 |
| 🔴 漏提取 | 测试集有值，LLM 返回未披露/未匹配 | 红 | 加「若有则必须提取」类指令 |
| 🟣 过摘录 | 测试集无值，LLM 返回了值 | 紫 | 加「若无明确数据则留空」约束 |

在置顶汇总行下方显示水平堆叠条形图，各区段宽度按百分比，悬停显示具体条数。

### 2. 完全匹配率（Exact Match Rate, EMR）

```
EMR = similarity === 100 的行数 / 有标准答案的总行数
```

显示在置顶汇总行，与「准确率」并列。准确率是「阈值及格线」，EMR 是「真正满分」，两者结合判断质量上限。

### 3. 跨报告稳定性（Indicator Consistency Score）

仅在「跨报告视角」的指标层列表中显示（按报告视角不需要）：

```
稳定性 = 该指标在多少份报告中 similarity >= threshold / 该指标出现的总报告数
```

以小色块序列可视化（每个色块代表一份报告：绿=达标，红=未达标），并显示百分比数字。

**用途**：稳定性 0% → Prompt 根本有问题，优先修；稳定性 50-99% → 部分报告格式差异，具体分析。

---

## 数据持久化

### 持久化范围
- 上传的文件（已部分实现，需补全 QuickValidationMode）
- **分析结果 comparisonRows**（新增）

### 持久化策略

利用现有 `phaseResults` IndexedDB store，新增固定 key：

```javascript
// persistenceService.js 新增
const VALIDATION_KEY = 'validation_comparison';

export async function saveValidationResults(rows) { ... }
export async function getValidationResults() { ... }
export async function clearValidationResults() { ... }
```

### 交互规则
- 进入快速验收模式时：自动从 IDB 恢复 comparisonRows，直接渲染分析树（无需重新分析）
- 点「重新分析」：重跑关联分析，结果覆盖写入 IDB
- 文件删除后重新上传：自动清除旧的 comparisonRows，提示用户重新分析

---

## 跳转到快速优化

### 入口
- 位于验收模式分析区域的操作栏，常驻显示
- 按钮文案：「跳转到快速优化 →」

### 携带数据
跳转时将当前树中**选中节点所覆盖的 rows** 中 `similarity < threshold` 的指标集合（去重 indicator_code）作为预选优化范围。

### 优化范围确认面板（OptimizationScopeConfirm）

跳转后弹出确认面板（覆盖在优化模式入口上方）：

```
┌─────────────────────────────────────────────┐
│ 📋 本次优化范围确认                            │
│                                              │
│  来源：强度型（全部报告）                       │
│  待优化指标：32 条（similarity < 70%）         │
│  预计 API 调用次数：约 64 次                   │
│                                              │
│  [修改范围（展开指标清单）]    [确认，开始优化]   │
└─────────────────────────────────────────────┘
```

「修改范围」展开可多选的指标代码列表，用户可取消勾选不想优化的指标。

---

## 阈值设置

- 保留现有的两个阈值输入框（基于测试集 / 基于 LLM）
- 默认值从 `llm2Settings.similarityThreshold` 读取
- 阈值变更后，所有指标（准确率、召回率、EMR、错误分布、稳定性）**实时重算**，无需重新关联分析

---

## 组件变更清单

### 新建
| 文件 | 职责 |
|------|------|
| `src/components/UnifiedAnalysisTree.jsx` | 统一分析视图主组件（左树 + 右面板 + 面包屑 + 置顶行） |
| `src/components/ErrorTypeBar.jsx` | 错误类型堆叠条形图 |
| `src/components/OptimizationScopeConfirm.jsx` | 跳转优化前的范围确认面板 |

### 修改
| 文件 | 改动 |
|------|------|
| `src/utils/reportAnalytics.js` | 新增 `calculateExactMatchRate`、`calculateErrorTypeBreakdown`、`calculateIndicatorConsistency`、`buildTreeData` |
| `src/services/persistenceService.js` | 新增 `saveValidationResults`、`getValidationResults`、`clearValidationResults` |
| `src/components/QuickValidationMode.jsx` | 替换 AnalysisView 为 UnifiedAnalysisTree；接入结果持久化；传递选中范围给优化模式 |
| `src/components/TestWorkbenchTab.jsx` | 接收跳转时的预选指标并传入 QuickOptimizationMode |

### 废弃（可保留文件但不再使用）
| 文件 | 说明 |
|------|------|
| `src/components/AnalysisView.jsx` | 被 UnifiedAnalysisTree 替代 |
| `src/components/ReportAnalytics.jsx` | 被 UnifiedAnalysisTree 替代 |

---

## 关键数据结构

### 树节点（TreeNode）
```typescript
interface TreeNode {
  id: string;
  section: 'cross-report' | 'per-report';
  level: 'root' | 'valueType' | 'indicator' | 'report' | 'year' | 'reportType' | 'reportIndicator';
  label: string;
  rows: ComparisonRow[];     // 该节点覆盖的原始数据行
  children: TreeNode[];
  // 预计算指标（由 buildTreeData 生成）
  metrics: NodeMetrics;
}

interface NodeMetrics {
  totalCount: number;
  matchedCount: number;
  accuracy: number | null;
  recall: number | null;
  precision: number | null;
  f1: number | null;
  exactMatchRate: number | null;
  avgSimilarity: number;
  avgLlmBasedSimilarity: number;
  errorBreakdown: {
    perfect: number; pass: number; partial: number;
    miss: number; hallucination: number; tn: number;
  };
  // 仅 indicator 节点（跨报告视角）有此字段
  consistencyScore?: number;
  consistencyDots?: ('pass' | 'fail')[];
}
```

---

## 新增工具函数签名

```javascript
// reportAnalytics.js

/** 单行错误类型分类 */
function classifyRow(row, threshold)
  // → 'perfect' | 'pass' | 'partial' | 'miss' | 'hallucination' | 'tn'

/** 错误类型分布统计 */
export function calculateErrorTypeBreakdown(rows, threshold)
  // → { perfect, pass, partial, miss, hallucination, tn }

/** 完全匹配率 */
export function calculateExactMatchRate(rows)
  // → number (0-1) | null

/** 每个指标的跨报告稳定性（仅跨报告视角使用） */
export function calculateIndicatorConsistency(rows, threshold)
  // → Map<indicator_code, { score: number, dots: ('pass'|'fail')[] }>

/** 构建完整树数据结构 */
export function buildTreeData(comparisonRows, threshold)
  // → { crossReportRoot: TreeNode, perReportNodes: TreeNode[] }
```

---

## 验证方案

1. **树导航**
   - 跨报告视角：全部报告 → 文字型 → ENV-001 → 各报告行，确认面包屑和指标都正确
   - 按报告视角：某报告 → 某年 → 某类型 → 具体指标行

2. **新指标正确性**
   - 选一个已知数据集手工验算：EMR、错误类型分布、稳定性
   - 验证阈值改变后所有指标实时更新

3. **持久化**
   - 完成关联分析后切换到「完整流程」模式再切回，确认文件和 comparisonRows 均在
   - 点「重新分析」确认结果被覆盖

4. **跳转优化**
   - 在树中选中「强度型（全部报告）」后点跳转
   - 确认确认面板显示正确的指标数量
   - 确认「修改范围」可取消勾选个别指标
   - 确认进入优化模式后只优化选定范围

5. **简繁体相似度**
   - 构造「百万」vs「百萬」的测试用例，确认 similarity = 100

---

## 不在本次范围内

- 相似度分布直方图（EMR 和错误类型分布已能反映分布形状，直方图留后续）
- 导出包含新指标的 Excel 报告（后续迭代）
- 快速优化模式本身的 UI 改动（仅接收预选指标，不改优化逻辑）
