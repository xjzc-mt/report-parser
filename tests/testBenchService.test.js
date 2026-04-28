import test from 'node:test';
import assert from 'node:assert/strict';

import { loadConversions, loadSynonyms } from '../src/services/synonymService.js';
import {
  createComparisonRowsWorkbookFile,
  buildCrossReportOptimizationPrompt,
  buildOptimizationPageContext,
  joinLlmResultsWithTestSet,
  parseComparisonFile,
  refreshComparisonRowsWithCurrentSimilarityRules,
  selectOptimizationTrainingAndValidationRows
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

test('joinLlmResultsWithTestSet 会为幻觉行按报告身份映射回填测试集报告元数据', () => {
  const llmRows = [
    {
      announcement_id: 'ANN-001',
      report_name: '模型里的旧报告名',
      indicator_code: 'E2',
      indicator_name: '模型额外指标',
      year: '2024',
      value_type: 'CURRENCY',
      num_value: '100',
      currency: 'CNY'
    }
  ];
  const testRows = [
    {
      source_announce_id: 'ANN-001',
      report_name: '测试集报告A',
      report_type: 'ESG',
      indicator_code: 'E1',
      indicator_name: '范围一排放',
      data_year: '2024',
      value_type_1: '文字型',
      text_value: '已披露'
    }
  ];

  const result = joinLlmResultsWithTestSet(llmRows, testRows, {
    fieldMappings: [
      { llmField: 'announcement_id', testField: 'source_announce_id' },
      { llmField: 'indicator_code', testField: 'indicator_code' },
      { llmField: 'year', testField: 'data_year' }
    ]
  });

  const hallucinationRow = result.validRows.find((row) => row.match_status === '幻觉');
  assert.ok(hallucinationRow);
  assert.equal(hallucinationRow.source_announce_id, 'ANN-001');
  assert.equal(hallucinationRow.report_name, '测试集报告A');
  assert.equal(hallucinationRow.report_type, 'ESG');
  assert.equal(hallucinationRow.indicator_code, 'E2');
  assert.equal(hallucinationRow.indicator_name, '模型额外指标');
  assert.equal(hallucinationRow.value_type, 'NUMERIC');
  assert.equal(hallucinationRow.value_type_1, 'NUMERIC');
});

test('joinLlmResultsWithTestSet 的幻觉行 indicator_name 缺失时保持空，value_type 按英文口径推断', () => {
  const llmRows = [
    {
      announcement_id: 'ANN-002',
      indicator_code: 'E9',
      indicator_name: '',
      year: '2024',
      text_value: '额外文本'
    }
  ];
  const testRows = [
    {
      source_announce_id: 'ANN-002',
      report_name: '测试集报告B',
      report_type: '年度报告',
      indicator_code: 'E1',
      indicator_name: '已有指标',
      data_year: '2024',
      value_type_1: '文字型',
      text_value: '已披露'
    }
  ];

  const result = joinLlmResultsWithTestSet(llmRows, testRows, {
    fieldMappings: [
      { llmField: 'announcement_id', testField: 'source_announce_id' },
      { llmField: 'indicator_code', testField: 'indicator_code' },
      { llmField: 'year', testField: 'data_year' }
    ]
  });

  const hallucinationRow = result.validRows.find((row) => row.match_status === '幻觉');
  assert.ok(hallucinationRow);
  assert.equal(hallucinationRow.indicator_name, '');
  assert.equal(hallucinationRow.value_type, 'TEXT');
  assert.equal(hallucinationRow.value_type_1, 'TEXT');
});

test('buildOptimizationPageContext 会同时生成测试集页码、LLM 页码与诊断组合页码', () => {
  const context = buildOptimizationPageContext({
    pdf_numbers: '12',
    llm_pdf_numbers: '18-19'
  });

  assert.deepEqual(context.goldPages, [12]);
  assert.deepEqual(context.llmPages, [18, 19]);
  assert.deepEqual(context.diagnosticPages, [11, 12, 13, 17, 18, 19, 20]);
});

test('buildCrossReportOptimizationPrompt 会包含测试集与初版 LLM 的双切片上下文', () => {
  const prompt = buildCrossReportOptimizationPrompt(
    'E1',
    '范围一排放',
    '提取范围一排放',
    [
      {
        report_name: '报告A',
        gold_pdf_numbers: '12',
        llm_pdf_numbers: '18',
        diagnostic_pdf_numbers: '11,12,13,17,18,19',
        test_answer: '100 吨',
        llm_result: '90 吨',
        similarity: 20,
        goldContextText: '测试集页切片原文',
        llmContextText: '初版 LLM 命中页切片原文',
        diagnosticContextText: '组合诊断切片原文'
      }
    ]
  );

  assert.match(prompt, /测试集页码：12/);
  assert.match(prompt, /初版LLM命中页码：18/);
  assert.match(prompt, /诊断组合页码：11,12,13,17,18,19/);
  assert.match(prompt, /测试集切片原文/);
  assert.match(prompt, /初版LLM切片原文/);
  assert.match(prompt, /诊断组合切片原文/);
});

test('selectOptimizationTrainingAndValidationRows 优先使用未参与优化的报告做验证', () => {
  const rows = [
    { report_name: '报告A', similarity: 10 },
    { report_name: '报告A', similarity: 20 },
    { report_name: '报告B', similarity: 40 },
    { report_name: '报告C', similarity: 50 }
  ];

  const { trainingRows, validationRows, usesHoldoutReports } = selectOptimizationTrainingAndValidationRows(rows, {
    trainingLimit: 2,
    validationLimit: 2,
    random: () => 0
  });

  assert.equal(usesHoldoutReports, true);
  assert.deepEqual(trainingRows.map((item) => item.report_name), ['报告A', '报告A']);
  assert.deepEqual(
    validationRows.map((item) => item.report_name).sort(),
    ['报告B', '报告C']
  );
});

test('createComparisonRowsWorkbookFile 生成的关联对比文件可直接再被解析', async () => {
  const file = await createComparisonRowsWorkbookFile([
    {
      source_announce_id: 'ANN-001',
      report_name: '报告A',
      report_type: 'ESG',
      indicator_code: 'E1',
      indicator_name: '范围一排放',
      data_year: '2024',
      value_type: 'TEXT',
      value_type_1: 'TEXT',
      pdf_numbers: '12',
      scope: '全集团',
      text_value: '已披露',
      num_value: '',
      unit: '',
      currency: '',
      numerator_unit: '',
      denominator_unit: '',
      prompt: '提取范围一排放',
      match_status: '已匹配',
      similarity: 91,
      llm_year: '2024',
      llm_text_value: '已披露',
      llm_num_value: '',
      llm_unit: '',
      llm_currency: '',
      llm_numerator_unit: '',
      llm_denominator_unit: '',
      llm_pdf_numbers: '12'
    }
  ], {
    fileName: 'validation_to_optimization.xlsx'
  });

  assert.equal(file instanceof File, true);
  assert.equal(file.name, 'validation_to_optimization.xlsx');

  const rows = await parseComparisonFile(file);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].report_name, '报告A');
  assert.equal(rows[0].indicator_code, 'E1');
  assert.equal(rows[0].prompt, '提取范围一排放');
  assert.equal(rows[0].similarity, 91);
});
