import {
  buildAnalysisV2Index,
  buildAnalysisV2Model,
  getAnalysisSubsetFromIndex,
  normalizeAnalysisValueType,
  summarizeAnalysisSubset
} from './analysisV2Metrics.js';

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function summarizeMergedNode(items = [], hallucinations = []) {
  return summarizeAnalysisSubset(items, hallucinations);
}

function makeNode({ id, section, level, label, items = [], hallucinations = [], children = [], filters = {} }) {
  return {
    id,
    section,
    level,
    label,
    items,
    hallucinations,
    children,
    filters,
    metrics: summarizeMergedNode(items, hallucinations)
  };
}

function indicatorLabel(item) {
  return item.indicatorLabel || `${item.indicatorCode || ''} ${item.indicatorName || ''}`.trim();
}

function buildIndicatorNodes(items, hallucinations, section, levelPrefix, baseFilters = {}) {
  const indicatorMap = new Map();

  for (const item of items) {
    const label = indicatorLabel(item);
    if (!indicatorMap.has(label)) indicatorMap.set(label, []);
    indicatorMap.get(label).push(item);
  }

  return Array.from(indicatorMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .map(([label, groupedItems]) => {
      const nodeHallucinations = hallucinations.filter((row) => {
        const rowLabel = `${String(row.indicator_code || '').trim()} ${String(row.llm_indicator_name || row.indicator_name || '').trim()}`.trim();
        return rowLabel === label;
      });
      return makeNode({
        id: `${levelPrefix}_${label}`,
        section,
        level: 'indicator',
        label,
        items: groupedItems,
        hallucinations: nodeHallucinations,
        filters: {
          ...baseFilters,
          indicators: [label]
        }
      });
    });
}

function buildCrossReportRoot(model) {
  const typeNodes = model.overviews.byType.map((group) => {
    const nodeHallucinations = model.hallucinations.filter((row) => {
      return normalizeAnalysisValueType(row.value_type_1 || row.value_type) === group.key;
    });

    return makeNode({
      id: `cross_type_${group.key}`,
      section: 'cross-report',
      level: 'valueType',
      label: group.key,
      items: group.items,
      hallucinations: nodeHallucinations,
      children: buildIndicatorNodes(
        group.items,
        nodeHallucinations,
        'cross-report',
        `cross_type_${group.key}`,
        { valueTypes: [group.key] }
      ),
      filters: { valueTypes: [group.key] }
    });
  });

  return makeNode({
    id: 'cross_root',
    section: 'cross-report',
    level: 'root',
    label: '全部报告',
    items: model.testItems,
    hallucinations: model.hallucinations,
    children: typeNodes
  });
}

function buildPerReportRoot(model) {
  const reportNodes = model.overviews.byReport
    .filter((group) => group.key !== '全部报告')
    .map((group) => {
      const typeMap = new Map();
      for (const item of group.items) {
        if (!typeMap.has(item.valueType)) typeMap.set(item.valueType, []);
        typeMap.get(item.valueType).push(item);
      }

      const reportHallucinations = model.hallucinations.filter((row) => String(row.report_name || '').trim() === group.key);
      const typeNodes = Array.from(typeMap.entries()).map(([valueType, items]) => {
      const typeHallucinations = reportHallucinations.filter((row) => {
        return normalizeAnalysisValueType(row.value_type_1 || row.value_type) === valueType;
      });

        return makeNode({
          id: `report_${group.key}_type_${valueType}`,
          section: 'per-report',
          level: 'reportType',
          label: valueType,
          items,
          hallucinations: typeHallucinations,
          children: buildIndicatorNodes(items, typeHallucinations, 'per-report', `report_${group.key}_type_${valueType}`, {
            reportNames: [group.key],
            valueTypes: [valueType]
          }),
          filters: {
            reportNames: [group.key],
            valueTypes: [valueType]
          }
        });
      });

      return makeNode({
        id: `report_${group.key}`,
        section: 'per-report',
        level: 'report',
        label: group.key,
        items: group.items,
        hallucinations: reportHallucinations,
        children: typeNodes,
        filters: {
          reportNames: [group.key]
        }
      });
    });

  return makeNode({
    id: 'per_report_root',
    section: 'per-report',
    level: 'root',
    label: '全部指标',
    items: model.testItems,
    hallucinations: model.hallucinations,
    children: reportNodes
  });
}

function buildPerTypeRoot(model) {
  const typeNodes = model.overviews.byType.map((group) => {
    const reportMap = new Map();
    for (const item of group.items) {
      if (!reportMap.has(item.reportName)) reportMap.set(item.reportName, []);
      reportMap.get(item.reportName).push(item);
    }

    const typeHallucinations = model.hallucinations.filter((row) => {
      return normalizeAnalysisValueType(row.value_type_1 || row.value_type) === group.key;
    });

    const reportNodes = Array.from(reportMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'zh-Hans-CN'))
      .map(([reportName, items]) => {
        const reportHallucinations = typeHallucinations.filter((row) => String(row.report_name || '').trim() === reportName);
        return makeNode({
          id: `type_${group.key}_report_${reportName}`,
          section: 'per-type',
          level: 'typeReport',
          label: reportName,
          items,
          hallucinations: reportHallucinations,
          children: buildIndicatorNodes(items, reportHallucinations, 'per-type', `type_${group.key}_report_${reportName}`, {
            reportNames: [reportName],
            valueTypes: [group.key]
          }),
          filters: {
            reportNames: [reportName],
            valueTypes: [group.key]
          }
        });
      });

    return makeNode({
      id: `type_${group.key}`,
      section: 'per-type',
      level: 'type',
      label: group.key,
      items: group.items,
      hallucinations: typeHallucinations,
      children: reportNodes,
      filters: {
        valueTypes: [group.key]
      }
    });
  });

  return makeNode({
    id: 'per_type_root',
    section: 'per-type',
    level: 'root',
    label: '全部指标',
    items: model.testItems,
    hallucinations: model.hallucinations,
    children: typeNodes
  });
}

function buildLookupMaps(roots = []) {
  const nodeMap = new Map();
  const pathMap = new Map();

  const visit = (node, parentPath = []) => {
    const nextPath = [...parentPath, node];
    nodeMap.set(node.id, node);
    pathMap.set(node.id, nextPath);
    for (const child of node.children || []) {
      visit(child, nextPath);
    }
  };

  roots.forEach((root) => visit(root));

  return { nodeMap, pathMap };
}

export function buildMergedTreeData(source = [], threshold = 70, includeHallucination = true, selectedYears = []) {
  const index = Array.isArray(source) ? buildAnalysisV2Index(source) : source;
  const subset = getAnalysisSubsetFromIndex(index, selectedYears);
  const model = buildAnalysisV2Model(subset, threshold);

  if (!includeHallucination) {
    model.hallucinations = [];
  }

  const crossReportRoot = buildCrossReportRoot(model);
  const perReportRoot = buildPerReportRoot(model);
  const perTypeRoot = buildPerTypeRoot(model);
  const { nodeMap, pathMap } = buildLookupMaps([crossReportRoot, perReportRoot, perTypeRoot]);

  return {
    crossReportRoot,
    perReportRoot,
    perTypeRoot,
    nodeMap,
    pathMap
  };
}

export function buildPathFilters(nodePath = []) {
  const merged = {
    reportNames: [],
    indicators: [],
    valueTypes: [],
    outputCounts: [],
    similarities: [],
    categories: []
  };

  for (const node of nodePath) {
    if (!node?.filters) continue;
    merged.reportNames.push(...(node.filters.reportNames || []));
    merged.indicators.push(...(node.filters.indicators || []));
    merged.valueTypes.push(...(node.filters.valueTypes || []));
    merged.outputCounts.push(...(node.filters.outputCounts || []));
    merged.similarities.push(...(node.filters.similarities || []));
    merged.categories.push(...(node.filters.categories || []));
  }

  return {
    reportNames: unique(merged.reportNames),
    indicators: unique(merged.indicators),
    valueTypes: unique(merged.valueTypes),
    outputCounts: unique(merged.outputCounts),
    similarities: unique(merged.similarities),
    categories: unique(merged.categories)
  };
}
