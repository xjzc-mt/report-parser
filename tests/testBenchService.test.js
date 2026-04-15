import test from 'node:test';
import assert from 'node:assert/strict';

import { loadConversions, loadSynonyms } from '../src/services/synonymService.js';
import {
  joinLlmResultsWithTestSet,
  refreshComparisonRowsWithCurrentSimilarityRules
} from '../src/services/testBenchService.js';

test('refreshComparisonRowsWithCurrentSimilarityRules 会按最新单位换算规则重算旧结果相似度', () => {
  loadSynonyms([]);
  loadConversions([
    { raw_unit: '吨', standard_unit: '千吨', unit_conversion: 0.001 },
    { raw_unit: '千吨', standard_unit: '吨', unit_conversion: 1000 }
  ]);

  const rows = refreshComparisonRowsWithCurrentSimilarityRules([
    {
      report_name: '报告A',
      indicator_code: 'N1',
      indicator_name: '废水排放量',
      data_year: '2024',
      value_type_1: '数值型',
      match_status: '已匹配',
      pdf_numbers: '102',
      num_value: '8460000',
      unit: '吨',
      currency: '',
      numerator_unit: '',
      denominator_unit: '',
      llm_year: '2024',
      llm_text_value: '',
      llm_num_value: '8460',
      llm_unit: '千吨',
      llm_currency: '',
      llm_numerator_unit: '',
      llm_denominator_unit: '',
      llm_pdf_numbers: '102',
      similarity: 5,
      llm_based_similarity: 0,
      unit_similarity: 0,
      currency_similarity: null,
      numerator_unit_similarity: null,
      denominator_unit_similarity: null
    }
  ]);

  assert.equal(rows[0].similarity, 100);
  assert.equal(rows[0].unit_similarity, 100);
});

test('joinLlmResultsWithTestSet 支持按手动字段映射关联', () => {
  const llmRows = [
    {
      report_name: '',
      indicator_code: '',
      year: '',
      report_alias: '报告A',
      indicator_alias: 'E1',
      fiscal_year: '2024',
      indicator_name: '范围一排放',
      text_value: '已披露'
    }
  ];
  const testRows = [
    {
      report_name: '报告A',
      indicator_code: 'E1',
      indicator_name: '范围一排放',
      data_year: '2024',
      value_type_1: '文字型',
      text_value: '已披露'
    }
  ];

  const result = joinLlmResultsWithTestSet(llmRows, testRows, {
    fieldMappings: [
      { llmField: 'report_alias', testField: 'report_name' },
      { llmField: 'indicator_alias', testField: 'indicator_code' },
      { llmField: 'fiscal_year', testField: 'data_year' }
    ]
  });

  assert.equal(result.validRows.length, 1);
  assert.equal(result.validRows[0].match_status, '已匹配');
  assert.equal(result.matchCount, 1);
});

test('joinLlmResultsWithTestSet 在空映射时回退默认规则', () => {
  const llmRows = [
    {
      report_name: '报告A',
      indicator_code: 'E1',
      year: '2024',
      indicator_name: '范围一排放',
      text_value: '已披露'
    }
  ];
  const testRows = [
    {
      report_name: '报告A',
      indicator_code: 'E1',
      indicator_name: '范围一排放',
      data_year: '2024',
      value_type_1: '文字型',
      text_value: '已披露'
    }
  ];

  const result = joinLlmResultsWithTestSet(llmRows, testRows, {
    fieldMappings: []
  });

  assert.equal(result.validRows[0].match_status, '已匹配');
  assert.equal(result.matchCount, 1);
});

test('joinLlmResultsWithTestSet 在合法映射但无匹配时返回 0 匹配信息', () => {
  const llmRows = [
    {
      report_alias: '报告B',
      indicator_alias: 'E1',
      fiscal_year: '2024',
      text_value: '已披露'
    }
  ];
  const testRows = [
    {
      report_name: '报告A',
      indicator_code: 'E1',
      indicator_name: '范围一排放',
      data_year: '2024',
      value_type_1: '文字型',
      text_value: '已披露'
    }
  ];

  const result = joinLlmResultsWithTestSet(llmRows, testRows, {
    fieldMappings: [
      { llmField: 'report_alias', testField: 'report_name' },
      { llmField: 'indicator_alias', testField: 'indicator_code' },
      { llmField: 'fiscal_year', testField: 'data_year' }
    ]
  });

  assert.equal(result.matchCount, 0);
  assert.equal(result.validRows[0].match_status, '未匹配');
});
