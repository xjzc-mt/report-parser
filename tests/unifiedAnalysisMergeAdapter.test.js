import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMergedTreeData, buildPathFilters } from '../src/utils/unifiedAnalysisMergeAdapter.js';

function makeBaseRow(overrides = {}) {
  return {
    report_name: '报告A',
    indicator_code: 'I1',
    indicator_name: '指标1',
    data_year: '2024',
    value_type_1: '文字型',
    match_status: '已匹配',
    similarity: 80,
    llm_based_similarity: 0,
    llm_text_value: '值',
    llm_num_value: '',
    ...overrides
  };
}

test('buildMergedTreeData 构建旧版树结构所需的三个根节点与新版指标', () => {
  const rows = [
    makeBaseRow({ report_name: '报告A', indicator_code: 'T1', indicator_name: '文本指标', value_type_1: '文字型', similarity: 100 }),
    makeBaseRow({ report_name: '报告A', indicator_code: 'N1', indicator_name: '货币指标', value_type_1: '货币型', similarity: 90, match_status: '多结果', llm_num_value: '100' }),
    makeBaseRow({ report_name: '报告A', indicator_code: 'N1', indicator_name: '货币指标', value_type_1: '货币型', similarity: 40, match_status: '多结果', llm_num_value: '101' }),
    makeBaseRow({ report_name: '报告B', indicator_code: 'I1', indicator_name: '强度指标', value_type_1: '强度型', data_year: '2023', similarity: 60, match_status: '多结果', llm_num_value: '1.1' }),
    makeBaseRow({ report_name: '报告B', indicator_code: 'I1', indicator_name: '强度指标', value_type_1: '强度型', data_year: '2023', similarity: 20, match_status: '多结果', llm_num_value: '1.2' }),
    makeBaseRow({ report_name: '报告B', indicator_code: 'T2', indicator_name: '文本指标2', data_year: '2023', value_type_1: '文字型', similarity: 40 }),
    makeBaseRow({ report_name: '报告C', indicator_code: 'T3', indicator_name: '文本指标3', data_year: '2024', value_type_1: '文字型', similarity: 80 }),
    makeBaseRow({ report_name: '报告C', indicator_code: 'HX', indicator_name: '幻觉指标', data_year: '2024', value_type_1: '数值型', similarity: 0, match_status: '幻觉', llm_num_value: '999' })
  ];

  const tree = buildMergedTreeData(rows, 70);

  assert.equal(tree.crossReportRoot.label, '全部报告');
  assert.equal(tree.perReportRoot.label, '全部指标');
  assert.equal(tree.perTypeRoot.label, '全部指标');
  assert.equal(tree.crossReportRoot.metrics.testItemCount, 5);
  assert.equal(tree.crossReportRoot.metrics.lenientPassRate, 3 / 5);
  assert.deepEqual(tree.crossReportRoot.metrics.categoryBreakdown, {
    perfect_match: 1,
    pass_match: 1,
    single_fail: 1,
    duplicate_with_pass: 1,
    duplicate_without_pass: 1,
    miss: 0,
    hallucination: 1
  });

  const textTypeNode = tree.crossReportRoot.children.find((node) => node.label === '文字型');
  const reportNode = tree.perReportRoot.children.find((node) => node.label === '报告A');
  const indicatorNode = reportNode.children.find((node) => node.label === '数值型').children[0];

  assert.equal(textTypeNode.metrics.testItemCount, 3);
  assert.equal(reportNode.metrics.testItemCount, 2);
  assert.equal(indicatorNode.filters.indicators[0], 'N1 货币指标');
});

test('buildPathFilters 根据树路径自动拼装明细筛选条件', () => {
  const path = [
    { filters: { reportNames: ['报告A'] } },
    { filters: { valueTypes: ['数值型'] } },
    { filters: { indicators: ['N1 货币指标'] } }
  ];

  assert.deepEqual(buildPathFilters(path), {
    reportNames: ['报告A'],
    indicators: ['N1 货币指标'],
    valueTypes: ['数值型'],
    outputCounts: [],
    similarities: [],
    categories: []
  });
});
