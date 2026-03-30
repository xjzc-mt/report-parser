const NOT_FOUND = '未披露';

function hasLlmOutput(row) {
  const t = String(row.llm_text_value ?? '').trim();
  const n = String(row.llm_num_value ?? '').trim();
  return (t && t !== NOT_FOUND) || (n && n !== NOT_FOUND && n !== '');
}

function hasGroundTruth(row) {
  const t = String(row.text_value ?? '').trim();
  const n = String(row.num_value ?? '').trim();
  return (t && t !== NOT_FOUND) || (n && n !== NOT_FOUND && n !== '');
}

function calculateMetrics(rows, similarityThreshold = 70, useLlmBasedSimilarity = false) {
  const total = rows.length;
  const th = similarityThreshold;
  const totalLlmOutput = rows.filter((r) => r.match_status !== '未匹配').length;
  const simField = useLlmBasedSimilarity ? 'llm_based_similarity' : 'similarity';
  const TP = rows.filter((r) => r.match_status !== '未匹配' && (r[simField] ?? 0) >= th).length;
  const FP = rows.filter((r) => hasLlmOutput(r) && !hasGroundTruth(r)).length;
  const TN = rows.filter((r) => !hasGroundTruth(r) && !hasLlmOutput(r)).length;

  const accuracy = total > 0 ? (TP + TN) / total : null;
  const precision = totalLlmOutput > 0 ? TP / totalLlmOutput : null;
  const recall = total > 0 ? totalLlmOutput / total : null;
  const f1 = (precision !== null && recall !== null && (precision + recall) > 0)
    ? 2 * precision * recall / (precision + recall)
    : null;
  const overExtractionRate = totalLlmOutput > 0 ? FP / totalLlmOutput : null;

  const matchedRows = rows.filter((r) => r.match_status !== '未匹配');
  const validSims = matchedRows.map((r) => r.similarity).filter((s) => s !== null && s !== undefined);
  const avgSimilarity = validSims.length > 0
    ? Math.round(validSims.reduce((s, v) => s + v, 0) / validSims.length)
    : 0;

  const validLlmSims = matchedRows.map((r) => r.llm_based_similarity).filter((s) => s !== null && s !== undefined);
  const avgLlmBasedSimilarity = validLlmSims.length > 0
    ? Math.round(validLlmSims.reduce((s, v) => s + v, 0) / validLlmSims.length)
    : 0;

  return {
    totalCount: total,
    matchedCount: totalLlmOutput,
    unmatchedCount: total - totalLlmOutput,
    avgSimilarity,
    avgLlmBasedSimilarity,
    accuracy,
    precision,
    recall,
    f1,
    overExtractionRate
  };
}

export function calculateOverallMetrics(comparisonRows, similarityThreshold = 70) {
  return calculateMetrics(comparisonRows, similarityThreshold, false);
}

export function calculateOverallMetricsLlmBased(comparisonRows, similarityThreshold = 70) {
  return calculateMetrics(comparisonRows, similarityThreshold, true);
}

export function groupRowsByYear(rows, similarityThreshold = 70) {
  const yearMap = new Map();
  for (const row of rows) {
    const year = String(row.data_year || '').trim() || '未知年份';
    if (!yearMap.has(year)) yearMap.set(year, []);
    yearMap.get(year).push(row);
  }

  return Array.from(yearMap.entries()).map(([year, yearRows]) => ({
    year,
    ...calculateMetrics(yearRows, similarityThreshold, false)
  }));
}

export function groupRowsByReport(comparisonRows) {
  const reportMap = new Map();

  for (const row of comparisonRows) {
    const reportName = String(row.report_name || '').trim();
    if (!reportMap.has(reportName)) {
      reportMap.set(reportName, []);
    }
    reportMap.get(reportName).push(row);
  }

  return Array.from(reportMap.entries()).map(([reportName, rows]) => ({
    reportName,
    ...calculateMetrics(rows, 70, false),
    rows
  }));
}

// ── 新增评估指标工具函数 ───────────────────────────────────────────────────────

const NOT_FOUND_2 = '未披露';

/**
 * 将单行数据分类为 6 种错误类型之一
 * @param {object} row
 * @param {number} threshold 0-100
 * @returns {'perfect'|'pass'|'partial'|'miss'|'hallucination'|'tn'}
 */
export function classifyRow(row, threshold = 70) {
  const matched = row.match_status !== '未匹配';
  const gt = hasGroundTruth(row);
  const llmOut = hasLlmOutput(row);
  const sim = row.similarity ?? 0;

  if (!gt && !llmOut) return 'tn';
  if (!gt && llmOut) return 'hallucination';
  if (gt && !matched) return 'miss';
  if (sim === 100) return 'perfect';
  if (sim >= threshold) return 'pass';
  return 'partial';
}

/**
 * 计算错误类型分布
 * @param {object[]} rows
 * @param {number} threshold 0-100
 * @returns {{ perfect, pass, partial, miss, hallucination, tn }}
 */
export function calculateErrorTypeBreakdown(rows, threshold = 70) {
  const bd = { perfect: 0, pass: 0, partial: 0, miss: 0, hallucination: 0, tn: 0 };
  for (const row of rows) {
    bd[classifyRow(row, threshold)]++;
  }
  return bd;
}

/**
 * 完全匹配率：similarity === 100 的行 / 有标准答案的总行数
 * @param {object[]} rows
 * @returns {number|null} 0-1，无标准答案行时返回 null
 */
export function calculateExactMatchRate(rows) {
  const withGt = rows.filter(hasGroundTruth);
  if (withGt.length === 0) return null;
  const perfect = withGt.filter(
    (r) => r.match_status !== '未匹配' && (r.similarity ?? 0) === 100
  ).length;
  return perfect / withGt.length;
}

/**
 * 计算每个指标的跨报告稳定性（仅跨报告视角使用）
 * @param {object[]} rows
 * @param {number} threshold 0-100
 * @returns {Map<string, { score: number, dots: ('pass'|'fail')[] }>}
 */
export function calculateIndicatorConsistency(rows, threshold = 70) {
  // 单次遍历构建 code → report → rows 的三层 Map（O(n)）
  const codeReportMap = new Map();
  for (const row of rows) {
    const code = String(row.indicator_code || '').trim();
    if (!code) continue;
    const rpt = String(row.report_name || '').trim();

    if (!codeReportMap.has(code)) codeReportMap.set(code, new Map());
    const reportMap = codeReportMap.get(code);
    if (!reportMap.has(rpt)) reportMap.set(rpt, []);
    reportMap.get(rpt).push(row);
  }

  const result = new Map();
  for (const [code, reportMap] of codeReportMap) {
    const dots = [];
    for (const [, rptRows] of reportMap) {
      const sims = rptRows.map((r) => r.similarity ?? 0);
      const avg = sims.reduce((a, b) => a + b, 0) / sims.length;
      dots.push(avg >= threshold ? 'pass' : 'fail');
    }

    const passCount = dots.filter((d) => d === 'pass').length;
    result.set(code, {
      score: dots.length > 0 ? passCount / dots.length : 0,
      dots
    });
  }
  return result;
}

// ── 树构建 ────────────────────────────────────────────────────────────────────

const VT_ORDER = ['文字型', '数值型', '货币型', '强度型'];
const VT_EN_MAP = { TEXT: '文字型', NUMERIC: '数值型', INTENSITY: '强度型', CURRENCY: '货币型' };

function getValueTypeZh(row) {
  const zh = String(row.value_type_1 || '').trim();
  if (zh) return normalizeVT(zh);
  const en = String(row.value_type || '').trim().toUpperCase();
  return normalizeVT(VT_EN_MAP[en] || '文字型');
}

function normalizeVT(zh) {
  if (zh.includes('文字') || zh.includes('文本')) return '文字型';
  if (zh.includes('数值') || zh.includes('数字')) return '数值型';
  if (zh.includes('货币') || zh.includes('金额')) return '货币型';
  if (zh.includes('强度')) return '强度型';
  return zh;
}

function computeNodeMetrics(rows, threshold, consistencyEntry = null, useLlmBased = false) {
  const m = calculateMetrics(rows, threshold, useLlmBased);
  const metrics = {
    totalCount: m.totalCount,
    matchedCount: m.matchedCount,
    accuracy: m.accuracy,
    recall: m.recall,
    precision: m.precision,
    f1: m.f1,
    exactMatchRate: calculateExactMatchRate(rows),
    avgSimilarity: m.avgSimilarity,
    avgLlmBasedSimilarity: m.avgLlmBasedSimilarity,
    errorBreakdown: calculateErrorTypeBreakdown(rows, threshold)
  };
  if (consistencyEntry !== null) {
    metrics.consistencyScore = consistencyEntry.score;
    metrics.consistencyDots = consistencyEntry.dots;
  }
  return metrics;
}

function makeNode(id, section, level, label, rows, children, threshold, consistencyEntry = null, useLlmBased = false) {
  return {
    id,
    section,
    level,
    label,
    rows,
    children,
    metrics: computeNodeMetrics(rows, threshold, consistencyEntry, useLlmBased)
  };
}

/**
 * 构建完整树数据结构
 * @param {object[]} comparisonRows
 * @param {number} threshold 0-100（用于指标分类和稳定性计算）
 * @param {boolean} useLlmBased 是否使用 llm_based_similarity
 * @returns {{ crossReportRoot: TreeNode, perReportRoot: TreeNode }}
 */
export function buildTreeData(comparisonRows, threshold = 70, useLlmBased = false) {
  const consistencyMap = calculateIndicatorConsistency(comparisonRows, threshold);

  // ── 跨报告视角 ──────────────────────────────────────────────────────────────

  // 按 value_type 分组
  const vtMap = new Map();
  for (const vt of VT_ORDER) vtMap.set(vt, []);
  for (const row of comparisonRows) {
    const vt = getValueTypeZh(row);
    if (!vtMap.has(vt)) vtMap.set(vt, []);
    vtMap.get(vt).push(row);
  }

  const valueTypeNodes = [];
  for (const [vt, vtRows] of vtMap) {
    if (vtRows.length === 0) continue;

    // 按 indicator_code 分组
    const codeMap = new Map();
    for (const row of vtRows) {
      const code = String(row.indicator_code || '').trim();
      if (!codeMap.has(code)) codeMap.set(code, { rows: [], name: '' });
      const entry = codeMap.get(code);
      entry.rows.push(row);
      if (!entry.name) entry.name = String(row.indicator_name || '').trim();
    }

    const indicatorNodes = [];
    for (const [code, { rows: indRows, name }] of codeMap) {
      const label = name ? `${code} ${name}` : code;
      indicatorNodes.push(
        makeNode(`ind_${code}`, 'cross-report', 'indicator', label, indRows, [], threshold, consistencyMap.get(code) ?? null, useLlmBased)
      );
    }

    valueTypeNodes.push(
      makeNode(`vt_${vt}`, 'cross-report', 'valueType', vt, vtRows, indicatorNodes, threshold, null, useLlmBased)
    );
  }

  const crossReportRoot = makeNode('all', 'cross-report', 'root', '全部报告', comparisonRows, valueTypeNodes, threshold, null, useLlmBased);

  // ── 按报告视角 ──────────────────────────────────────────────────────────────

  const reportMap = new Map();
  for (const row of comparisonRows) {
    const rpt = String(row.report_name || '').trim();
    if (!reportMap.has(rpt)) reportMap.set(rpt, []);
    reportMap.get(rpt).push(row);
  }

  const perReportNodes = [];
  for (const [rpt, rptRows] of reportMap) {
    // 按 value_type 分组
    const vtMap = new Map();
    for (const vt of VT_ORDER) vtMap.set(vt, []);
    for (const row of rptRows) {
      const vt = getValueTypeZh(row);
      if (!vtMap.has(vt)) vtMap.set(vt, []);
      vtMap.get(vt).push(row);
    }

    const reportTypeNodes = [];
    for (const [vt, vtRows] of vtMap) {
      if (vtRows.length === 0) continue;

      // 按 indicator_code 分组
      const rIndMap = new Map();
      for (const row of vtRows) {
        const code = String(row.indicator_code || '').trim();
        if (!rIndMap.has(code)) rIndMap.set(code, { rows: [], name: '' });
        const entry = rIndMap.get(code);
        entry.rows.push(row);
        if (!entry.name) entry.name = String(row.indicator_name || '').trim();
      }

      const reportIndicatorNodes = [];
      for (const [code, { rows: riRows, name }] of rIndMap) {
        const label = name ? `${code} ${name}` : code;
        reportIndicatorNodes.push(
          makeNode(
            `rpt_${rpt}_vt_${vt}_ind_${code}`,
            'per-report', 'reportIndicator', label, riRows, [], threshold, null, useLlmBased
          )
        );
      }

      reportTypeNodes.push(
        makeNode(
          `rpt_${rpt}_vt_${vt}`,
          'per-report', 'reportType', vt, vtRows, reportIndicatorNodes, threshold, null, useLlmBased
        )
      );
    }

    perReportNodes.push(
      makeNode(`rpt_${rpt}`, 'per-report', 'report', rpt, rptRows, reportTypeNodes, threshold, null, useLlmBased)
    );
  }

  const perReportRoot = makeNode(
    'all_reports',
    'per-report',
    'perReportRoot',
    '全部报告',
    comparisonRows,
    perReportNodes,
    threshold,
    null,
    useLlmBased
  );

  return { crossReportRoot, perReportRoot };
}
