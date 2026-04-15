import { parseExcel, parsePDF } from './fileParsers.js';
import { callLLMWithRetry, buildExtractionSystemPrompt } from './llmClient.js';
import { normalizeValueType, getResultsArray } from '../utils/extraction.js';
import {
  buildRowJoinKey,
  extractFieldOptionsFromRows,
  resolveValidationFieldMappings,
  validateValidationFieldMappings
} from '../utils/validationFieldMappings.js';
import { PROMPT_OPTIMIZER_SYSTEM_PROMPT, VALUE_TYPE_EN_TO_ZH } from '../constants/testBench.js';
import { parsePdfNumbers, extractPdfPages, uint8ArrayToBase64 } from './pdfPageExtractor.js';
import { NOT_FOUND_VALUE } from '../constants/extraction.js';
import { areNumericValuesEquivalentWithUnits, calculateFieldSimilarity } from './synonymService.js';
import {
  appendResults,
  getAllResults,
  saveRunState,
  getRunState,
  clearRunState,
  clearResults,
  saveComparisonRows,
  saveFinalRows,
  clearPhaseResults
} from './persistenceService.js';

// ── 相似度计算 ────────────────────────────────────────────────────────────────

/**
 * 计算两个字符串的关键词匹配相似度
 * 支持中英文混合文本，返回 0–100 整数
 */
export function calculateSimilarity(testValue, llmValue) {
  const testStr = String(testValue || '').trim();
  const llmStr = String(llmValue || '').trim();

  if (!testStr && !llmStr) return 100;
  if (!testStr || !llmStr) return 0;
  if (testStr.toLowerCase() === llmStr.toLowerCase()) return 100;
  if (llmStr === NOT_FOUND_VALUE || testStr === NOT_FOUND_VALUE) return 0;

  // 检查包含关系：如果测试集完全包含在LLM结果中，或反之，则100%
  if (llmStr.includes(testStr) || testStr.includes(llmStr)) return 100;

  const simplifyTraditional = (str) => {
    const map = { '萬': '万', '億': '亿', '幣': '币', '員': '员', '時': '时', '間': '间', '產': '产', '業': '业', '環': '环', '質': '质', '減': '减', '噸': '吨', '電': '电', '氣': '气', '標': '标', '準': '准', '總': '总', '數': '数', '據': '据', '報': '报', '導': '导', '購': '购', '銷': '销', '營': '营', '運': '运', '資': '资', '財': '财', '經': '经', '濟': '济', '發': '发', '開': '开', '關': '关', '機': '机', '構': '构', '組': '组', '織': '织', '類': '类', '項': '项', '費': '费', '價': '价', '貨': '货' };
    return str.replace(/[\u4e00-\u9fff]/g, (ch) => map[ch] || ch);
  };

  const tokenize = (str) => {
    const tokens = new Set();
    const normalized = simplifyTraditional(str.toLowerCase());
    const parts = normalized
      .split(/[\s,，。、；;：:""''（）()【】[\]！!？?—\-_/\\|+]+/)
      .filter(Boolean);
    for (const part of parts) {
      tokens.add(part);
      for (const char of part) {
        if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) tokens.add(char);
      }
    }
    return tokens;
  };

  const testTokens = tokenize(testStr);
  const llmTokens = tokenize(llmStr);

  if (testTokens.size === 0 || llmTokens.size === 0) return 0;

  let intersectionCount = 0;
  for (const token of testTokens) {
    if (llmTokens.has(token)) intersectionCount += 1;
  }

  const recall = intersectionCount / testTokens.size;
  const precision = intersectionCount / llmTokens.size;

  // 使用 F1-Score: 2 * (P * R) / (P + R)
  if (recall + precision === 0) return 0;
  const f1 = (2 * precision * recall) / (precision + recall);
  
  return Math.round(f1 * 100);
}

/**
 * 计算基于 LLM 结果的相似度（LLM token 覆盖率）
 * 返回 LLM 结果中有多少比例的 token 在测试集标准答案中出现
 */
function calculateLlmBasedSimilarity(testValue, llmValue) {
  const testStr = String(testValue || '').trim();
  const llmStr = String(llmValue || '').trim();

  if (!testStr && !llmStr) return 100;
  if (!llmStr) return 0;
  if (!testStr) return 0;
  if (testStr.toLowerCase() === llmStr.toLowerCase()) return 100;
  if (llmStr === NOT_FOUND_VALUE || testStr === NOT_FOUND_VALUE) return 0;

  const simplifyTraditional = (str) => {
    const map = { '萬': '万', '億': '亿', '幣': '币', '員': '员', '時': '时', '間': '间', '產': '产', '業': '业', '環': '环', '質': '质', '減': '减', '噸': '吨', '電': '电', '氣': '气', '標': '标', '準': '准', '總': '总', '數': '数', '據': '据', '報': '报', '導': '导', '購': '购', '銷': '销', '營': '营', '運': '运', '資': '资', '財': '财', '經': '经', '濟': '济', '發': '发', '開': '开', '關': '关', '機': '机', '構': '构', '組': '组', '織': '织', '類': '类', '項': '项', '費': '费', '價': '价', '貨': '货' };
    return str.replace(/[\u4e00-\u9fff]/g, (ch) => map[ch] || ch);
  };

  const tokenize = (str) => {
    const tokens = new Set();
    const normalized = simplifyTraditional(str.toLowerCase());
    const parts = normalized
      .split(/[\s,，。、；;：:""''（）()【】[\]！!？?—\-_/\\|+]+/)
      .filter(Boolean);
    for (const part of parts) {
      tokens.add(part);
      for (const char of part) {
        if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) tokens.add(char);
      }
    }
    return tokens;
  };

  const testTokens = tokenize(testStr);
  const llmTokens = tokenize(llmStr);

  let matchCount = 0;
  for (const token of llmTokens) {
    if (testTokens.has(token)) matchCount += 1;
  }

  return llmTokens.size > 0 ? Math.round((matchCount / llmTokens.size) * 100) : 0;
}

/** 判断值是否为空或未披露 */
function isEmptyOrNotFound(v) {
  const s = String(v ?? '').trim();
  return !s || s === NOT_FOUND_VALUE;
}

/**
 * 计算字段相似度：若双端均为空/未披露，返回 null（不参与平均计算）
 */
function fieldSim(testVal, llmVal) {
  if (isEmptyOrNotFound(testVal) && isEmptyOrNotFound(llmVal)) return null;
  return calculateSimilarity(String(testVal ?? ''), String(llmVal ?? ''));
}

/**
 * 计算多个字段相似度的平均值，跳过 null（双端空字段）
 */
function avgFieldSims(...sims) {
  const valid = sims.filter((s) => s !== null && s !== undefined);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

function buildMatchedComparisonRow(testRow, llmRow, matchCount = 1) {
  const textSim = fieldSim(testRow.text_value, llmRow.text_value);
  const pdfSim = calculateFieldSimilarity(testRow.pdf_numbers, llmRow.pdf_numbers, 'exact');
  const numericEquivalent = isEmptyOrNotFound(testRow.num_value) && isEmptyOrNotFound(llmRow.num_value)
    ? false
    : areNumericValuesEquivalentWithUnits(testRow.num_value, llmRow.num_value, testRow.unit, llmRow.unit);
  const numSim = isEmptyOrNotFound(testRow.num_value) && isEmptyOrNotFound(llmRow.num_value)
    ? null
    : calculateFieldSimilarity(
      testRow.num_value,
      llmRow.num_value,
      'numeric',
      false,
      null,
      { leftUnit: testRow.unit, rightUnit: llmRow.unit }
    );
  const unitSim = isEmptyOrNotFound(testRow.unit) && isEmptyOrNotFound(llmRow.unit)
    ? null
    : (numericEquivalent ? 100 : calculateFieldSimilarity(testRow.unit, llmRow.unit, 'exact'));
  const currencySim = isEmptyOrNotFound(testRow.currency) && isEmptyOrNotFound(llmRow.currency) ? null : calculateFieldSimilarity(testRow.currency, llmRow.currency, 'exact');
  const numeratorSim = isEmptyOrNotFound(testRow.numerator_unit) && isEmptyOrNotFound(llmRow.numerator_unit) ? null : calculateFieldSimilarity(testRow.numerator_unit, llmRow.numerator_unit, 'exact');
  const denominatorSim = isEmptyOrNotFound(testRow.denominator_unit) && isEmptyOrNotFound(llmRow.denominator_unit) ? null : calculateFieldSimilarity(testRow.denominator_unit, llmRow.denominator_unit, 'exact');

  let similarity = 0;
  const vt = getValueTypeZh(testRow);
  const hasCurrency = !isEmptyOrNotFound(testRow.currency) || !isEmptyOrNotFound(llmRow.currency);

  if (vt === '文字型') {
    similarity = Math.round((pdfSim || 0) * 0.05 + (textSim || 0) * 0.95);
  } else if (vt === '数值型') {
    if (hasCurrency) {
      similarity = Math.round((pdfSim || 0) * 0.05 + (numSim || 0) * 0.8 + (unitSim || 0) * 0.05 + (currencySim || 0) * 0.1);
    } else {
      similarity = Math.round((pdfSim || 0) * 0.05 + (numSim || 0) * 0.85 + (unitSim || 0) * 0.1);
    }
  } else if (vt === '强度型') {
    similarity = Math.round((pdfSim || 0) * 0.05 + (numSim || 0) * 0.8 + (unitSim || 0) * 0.1 + (numeratorSim || 0) * 0.025 + (denominatorSim || 0) * 0.025);
  } else if (vt === '货币型') {
    similarity = Math.round((pdfSim || 0) * 0.05 + (numSim || 0) * 0.85 + (unitSim || 0) * 0.1);
  } else {
    similarity = avgFieldSims(textSim, numSim, unitSim, currencySim, numeratorSim, denominatorSim) ?? 0;
  }

  const textLlmSim = isEmptyOrNotFound(testRow.text_value) && isEmptyOrNotFound(llmRow.text_value) ? null : calculateLlmBasedSimilarity(testRow.text_value, llmRow.text_value);
  const numLlmSim = isEmptyOrNotFound(testRow.num_value) && isEmptyOrNotFound(llmRow.num_value) ? null : calculateLlmBasedSimilarity(String(testRow.num_value ?? ''), String(llmRow.num_value ?? ''));
  const llm_based_similarity = avgFieldSims(textLlmSim, numLlmSim) ?? 0;

  return {
    ...testRow,
    match_status: matchCount > 1 ? '多结果' : '已匹配',
    similarity,
    llm_based_similarity,
    llm_year: llmRow.year || llmRow.llm_year || '',
    llm_text_value: llmRow.text_value || llmRow.llm_text_value || '',
    llm_num_value: llmRow.num_value || llmRow.llm_num_value || '',
    llm_unit: llmRow.unit || llmRow.llm_unit || '',
    llm_currency: llmRow.currency || llmRow.llm_currency || '',
    llm_numerator_unit: llmRow.numerator_unit || llmRow.llm_numerator_unit || '',
    llm_denominator_unit: llmRow.denominator_unit || llmRow.llm_denominator_unit || '',
    llm_pdf_numbers: llmRow.pdf_numbers || llmRow.llm_pdf_numbers || '',
    unit_similarity: unitSim,
    currency_similarity: currencySim,
    numerator_unit_similarity: numeratorSim,
    denominator_unit_similarity: denominatorSim,
    improved_prompt: testRow.improved_prompt || '',
    improvement_reason: testRow.improvement_reason || ''
  };
}

// ── 内部辅助函数 ─────────────────────────────────────────────────────────────

function resolveApiKey(settings) {
  return settings.apiKey || import.meta.env.VITE_GEMINI_API_KEY || '';
}

function getValueTypeZh(row) {
  const zh = String(row.value_type_1 || '').trim();
  if (zh) return normalizeValueType(zh);
  const en = String(row.value_type || '').trim().toUpperCase();
  return normalizeValueType(VALUE_TYPE_EN_TO_ZH[en] || '文字型');
}

/** 按 report_name + pdf_numbers 分组 */
function groupByReportAndPages(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.report_name}|||${row.pdf_numbers}`;
    if (!map.has(key)) {
      map.set(key, {
        report_name: String(row.report_name || '').trim(),
        pdf_numbers: String(row.pdf_numbers || '').trim(),
        rows: []
      });
    }
    map.get(key).rows.push(row);
  }
  return Array.from(map.values());
}

/** 按 indicator_code 跨报告分组（供 LLM2 使用） */
function groupByIndicatorCode(rows) {
  const map = new Map();
  for (const row of rows) {
    const code = String(row.indicator_code || '').trim();
    if (!map.has(code)) {
      map.set(code, {
        indicator_code: code,
        indicator_name: String(row.indicator_name || '').trim(),
        rows: []
      });
    }
    map.get(code).rows.push(row);
  }
  return Array.from(map.values());
}

/** 在上传的 PDF 文件中按文件名精确匹配（去掉扩展名后等于 report_name） */
function findPdfFile(pdfFiles, reportName) {
  const target = String(reportName || '').trim();
  return pdfFiles.find((f) => f.name.replace(/\.[^/.]+$/, '') === target) || null;
}

/** 按 value_type 再分组 */
function subGroupByValueType(rows) {
  const map = new Map();
  for (const row of rows) {
    const vt = getValueTypeZh(row);
    if (!map.has(vt)) map.set(vt, []);
    map.get(vt).push(row);
  }
  return Array.from(map.entries()).map(([valueType, indicators]) => ({ valueType, indicators }));
}

function buildTestUserPrompt(indicators, definitionMap = null) {
  const list = indicators
    .map((ind, i) => {
      let instruction = null;
      const indicatorCode = String(ind.indicator_code || '').trim();
      const indicatorName = ind.indicator_name || '未知指标';

      if (definitionMap) {
        const def = definitionMap.get(indicatorCode);
        if (def) {
          if (def.prompt) {
            instruction = def.prompt;
          } else {
            const parts = [];
            if (def.definition) parts.push(`指标定义：${def.definition}`);
            if (def.guidance) parts.push(`摘录规则：${def.guidance}`);
            
            if (parts.length > 0) {
              instruction = parts.join(' ');
            } else {
              instruction = ind.prompt || null;
            }
          }
        } else {
          instruction = ind.prompt || null;
        }
      } else {
        instruction = ind.prompt || null;
      }

      // 最终校验：如果没有任何提取指令，则抛出错误
      if (!instruction || String(instruction).trim() === '') {
        throw new Error(`指标 [${indicatorCode}: ${indicatorName}] 缺少提取提示词 (Prompt)。\n请确保“指标定义文件”中有 prompt 字段，或“测试集 Excel”中有 prompt 列。`);
      }

      return `${i + 1}. Indicator Code: "${indicatorCode}"\n   Indicator Name: "${indicatorName}"\n   Extraction Instructions: "${instruction}"`;
    })
    .join('\n\n');
  return `Please extract the following ${indicators.length} ESG indicators from the provided PDF report:\n\n${list}\n\nReturn results in the JSON format specified in the system prompt.\nFor each indicator, use the EXACT indicator_code provided above.\nIf an indicator cannot be found, use "${NOT_FOUND_VALUE}" as the value.`;
}

/** 从提取后的 PDF 字节获取适合 LLM 的输入（Gemini 用 base64，其他用文本） */
async function getPdfInputForLlm(pdfData, isGemini) {
  if (isGemini) {
    return { pdfBase64: uint8ArrayToBase64(pdfData), pdfText: null };
  }
  const blob = new Blob([pdfData], { type: 'application/pdf' });
  const tempFile = new File([blob], 'extracted_pages.pdf', { type: 'application/pdf' });
  const pages = await parsePDF(tempFile);
  const pdfText = pages.map((p) => `[Page ${p.pageNumber}]\n${p.text}`).join('\n\n');
  return { pdfBase64: null, pdfText };
}

/**
 * 将 LLM 返回的相对页码还原为原始页码（数组索引映射）
 * @param {string} relPageStr - LLM 返回的页码字符串（如 "1", "1,2", NOT_FOUND_VALUE）
 * @param {number[]} pageNumbers - 实际切割的页码数组（如 [10, 11, 12, 13]）
 */
function remapPageNumbers(relPageStr, pageNumbers) {
  if (!relPageStr || relPageStr === NOT_FOUND_VALUE) return relPageStr;
  if (!pageNumbers || pageNumbers.length === 0) return relPageStr;
  return String(relPageStr)
    .split(',')
    .map((p) => {
      const n = parseInt(p.trim(), 10);
      if (isNaN(n)) return p.trim();
      const idx = n - 1; // 1-based → 0-based
      return String(pageNumbers[idx] ?? pageNumbers[0]);
    })
    .join(',');
}

/**
 * 右关联：以测试集为基准关联 LLM 1 结果，同时计算关键词相似度
 * 扩展字段：unit、currency、numerator_unit、denominator_unit 各自计算相似度
 */
function joinTestSetWithLlm1(testSetRows, llm1Results, fieldMappings = null) {
  const effectiveMappings = resolveValidationFieldMappings(fieldMappings);
  const llm1Map = new Map();
  for (const result of llm1Results) {
    const key = buildRowJoinKey(result, effectiveMappings, 'llm');
    if (!llm1Map.has(key)) llm1Map.set(key, []);
    llm1Map.get(key).push(result);
  }

  const comparisonRows = [];
  let matchCount = 0;
  for (const testRow of testSetRows) {
    const key = buildRowJoinKey(testRow, effectiveMappings, 'test');
    const matched = llm1Map.get(key) || [];

    if (matched.length === 0) {
      comparisonRows.push({
        ...testRow,
        match_status: '未匹配',
        similarity: 0,
        llm_based_similarity: 0,
        llm_year: '',
        llm_text_value: '',
        llm_num_value: '',
        llm_unit: '',
        llm_currency: '',
        llm_numerator_unit: '',
        llm_denominator_unit: '',
        llm_pdf_numbers: '',
        // extended field similarities
        unit_similarity: null,
        currency_similarity: null,
        numerator_unit_similarity: null,
        denominator_unit_similarity: null,
        improved_prompt: '',
        improvement_reason: ''
      });
    } else {
      matchCount += matched.length;
      for (const llmRow of matched) {
        comparisonRows.push(buildMatchedComparisonRow(testRow, llmRow, matched.length));
      }
    }
  }

  // ── 追加幻觉行：LLM 输出了但测试集里没有对应 key 的结果 ──────────────────
  // 构建测试集 key 集合（由有效映射决定）
  const testKeySet = new Set(
    testSetRows.map((row) => buildRowJoinKey(row, effectiveMappings, 'test'))
  );

  let hallucinationCount = 0;
  for (const llmRow of llm1Results) {
    const key = buildRowJoinKey(llmRow, effectiveMappings, 'llm');
    if (testKeySet.has(key)) continue; // 测试集有对应行，已经在上面 join 过了
    // 忽略空输出
    const hasVal = !isEmptyOrNotFound(llmRow.text_value) || !isEmptyOrNotFound(llmRow.num_value);
    if (!hasVal) continue;

    hallucinationCount++;

    // 转换英文类型到中文
    const typeMap = {
      'TEXT': '文字型',
      'NUMERIC': '数值型',
      'INTENSITY': '强度型',
      'CURRENCY': '数值型'  // 货币型转换为数值型
    };

    // 优先使用文件中的 value_type，否则推断
    let valueType = llmRow.value_type || '';
    if (valueType) {
      const upper = valueType.toUpperCase();
      valueType = typeMap[upper] || valueType;
      // 货币型也转换为数值型
      if (valueType === '货币型') valueType = '数值型';
    } else {
      if (llmRow.num_value && String(llmRow.num_value).trim() && String(llmRow.num_value).trim() !== NOT_FOUND_VALUE) {
        if (llmRow.currency && String(llmRow.currency).trim()) {
          valueType = '货币型';
        } else if (llmRow.numerator_unit || llmRow.denominator_unit) {
          valueType = '强度型';
        } else {
          valueType = '数值型';
        }
      } else {
        valueType = '文字型';
      }
    }

    comparisonRows.push({
      // 从 LLM 结果填充基本字段
      report_name: llmRow.report_name,
      indicator_code: String(llmRow.indicator_code || '').trim(),
      indicator_name: llmRow.indicator_name || String(llmRow.indicator_code || '').trim() || '未知指标',
      data_year: llmRow.year || '',
      value_type: valueType,
      value_type_1: valueType,
      // 测试集字段全空（没有标准答案）
      text_value: '',
      num_value: '',
      unit: '',
      currency: '',
      numerator_unit: '',
      denominator_unit: '',
      pdf_numbers: '',
      prompt: '',
      // LLM 输出字段
      match_status: '幻觉',
      similarity: 0,
      llm_based_similarity: 0,
      llm_indicator_name: llmRow.indicator_name || '',
      llm_year: llmRow.year || '',
      llm_text_value: llmRow.text_value || '',
      llm_num_value: llmRow.num_value || '',
      llm_unit: llmRow.unit || '',
      llm_currency: llmRow.currency || '',
      llm_numerator_unit: llmRow.numerator_unit || '',
      llm_denominator_unit: llmRow.denominator_unit || '',
      llm_pdf_numbers: llmRow.pdf_numbers || '',
      unit_similarity: null,
      currency_similarity: null,
      numerator_unit_similarity: null,
      denominator_unit_similarity: null,
      improved_prompt: '',
      improvement_reason: ''
    });
  }

  console.log(`[joinTestSetWithLlm1] 追加了 ${hallucinationCount} 条幻觉行`);

  // ── 数据清洗：分离有效和无效数据 ──────────────────────────────────────────
  const validRows = [];
  const invalidRows = [];

  for (const row of comparisonRows) {
    const year = String(row.data_year || '').trim();
    const isValidYear = /^(19|20)\d{2}$/.test(year);

    if (isValidYear || !year) {
      validRows.push(row);
    } else {
      invalidRows.push({ ...row, invalid_reason: '年份格式错误' });
    }
  }

  console.log(`[数据清洗] 有效: ${validRows.length}, 无效: ${invalidRows.length}`);
  return { validRows, invalidRows, matchCount, effectiveMappings };
}

// ── 阶段一：LLM 1 提取 ───────────────────────────────────────────────────────

/**
 * 运行 LLM 1 提取阶段，完成后返回 llm1Results 和带相似度的关联行
 *
 * @param {Object} params
 * @param {File[]}   params.pdfFiles
 * @param {File}     params.testSetFile
 * @param {Object}   params.llm1Settings
 * @param {Function} params.onProgress  - ({ message, percentage, timestamp })
 * @param {Function} params.onExLog     - (logEntry) 提取日志专用回调
 * @param {string}   [params.runId]     - 当前运行 ID
 * @param {Object}   [params.tokenStats] - token 统计对象（会被修改）
 */
/**
 * 运行阶段一：LLM 1 指标提取
 * 
 * @param {Object}   params
 * @param {File[]}   params.pdfFiles    - PDF 文件列表。需匹配测试集 report_name。
 * @param {File}     params.testSetFile - 测试集 Excel。
 *   必填字段：report_name, pdf_numbers, indicator_code, data_year, value_type_1, text_value, prompt。
 * @param {Object}   params.llm1Settings - 模型设置
 * @param {Function} params.onProgress   - 进度回调
 * @param {Function} params.onExLog      - 提取日志回调
 * @param {string}   [params.runId]      - 运行 ID
 * @param {Object}   [params.tokenStats]  - token 统计
 * @param {Map}      [params.definitionMap] - 指标定义映射。只需包含 indicator_code 和 prompt 即可正常运行（该 prompt 具有最高优先级）。
 */
export async function runExtractionPhase({
  pdfFiles,
  testSetFile,
  llm1Settings,
  onProgress,
  onExLog,
  runId,
  tokenStats,
  interruptSignal,
  definitionMap = null,
  sessionId = null
}) {
  const log = (message, percentage = -1) => {
    onProgress?.({ message, percentage, timestamp: new Date().toLocaleTimeString() });
    onExLog?.({ message, timestamp: new Date().toLocaleTimeString() });
  };

  // 恢复已有 runState
  const existingState = runId ? await getRunState() : null;
  const completedGroupKeys = existingState?.phase === 'extraction'
    ? new Set(existingState.completedGroups || [])
    : new Set();
  const accumulatedResults = [];

  if (completedGroupKeys.size > 0) {
    log(`从断点继续：已完成 ${completedGroupKeys.size} 个分组`);
    const saved = runId ? await getAllResults(runId) : [];
    accumulatedResults.push(...saved);
  }

  log('解析测试集文件...', 0);
  let testSetRows = await parseExcel(testSetFile);
  log(`测试集解析完成，共 ${testSetRows.length} 条指标`);

  // 若有定义文件，则仅提取定义文件中存在的指标
  if (definitionMap && definitionMap.size > 0) {
    const originalCount = testSetRows.length;
    testSetRows = testSetRows
      .filter((row) => definitionMap.has(String(row.indicator_code || '').trim()))
      .map((row) => {
        const def = definitionMap.get(String(row.indicator_code || '').trim());
        const updated = { ...row };
        if (def.prompt) updated.prompt = def.prompt;
        if (def.value_type_1 && !row.value_type_1) updated.value_type_1 = def.value_type_1;
        return updated;
      });
    
    const filteredCount = originalCount - testSetRows.length;
    if (filteredCount > 0) {
      log(`⚠️ 已过滤掉 ${filteredCount} 个不在指标定义文件中的指标，实际待提取指标共 ${testSetRows.length} 条`);
    } else if (testSetRows.length > 0) {
      log(`✅ 测试集指标均在定义文件中，共 ${testSetRows.length} 条待提取`);
    }
  }

  const groups = groupByReportAndPages(testSetRows);
  log(`按报告和页码分组，共 ${groups.length} 个分组`);

  const llm1Results = [...accumulatedResults];
  const totalGroups = groups.length;
  const isGemini1 = llm1Settings.providerType === 'gemini' || (!llm1Settings.providerType && (llm1Settings.apiUrl || '').includes('googleapis.com'));
  const maxRetries = llm1Settings.maxRetries || 3;
  const parallelCount = llm1Settings.parallelCount || 5;

  // 已完成分组计数（含本次恢复的）
  let completedCount = completedGroupKeys.size;

  // 并行处理（按 parallelCount 分批）
  const pendingGroups = groups.filter((g) => {
    const key = `${g.report_name}|||${g.pdf_numbers}`;
    return !completedGroupKeys.has(key);
  });

  for (let batchStart = 0; batchStart < pendingGroups.length; batchStart += parallelCount) {
    // 中断检查：当前批次前检查，不阻断已启动的 Promise
    if (interruptSignal?.interrupted) {
      log('⚠️ 已中断，跳过剩余批次（已运行批次仍完成）');
      break;
    }
    const batch = pendingGroups.slice(batchStart, batchStart + parallelCount);
    const globalStart = groups.length - pendingGroups.length + batchStart;

    await Promise.all(batch.map(async (group, batchIdx) => {
      const i = globalStart + batchIdx;
      const groupPct = Math.round(5 + (i / totalGroups) * 85);
      const indicatorNames = group.rows.map((r) => r.indicator_name || r.indicator_code).join('、');
      log(`[${i + 1}/${totalGroups}] ${group.report_name} 第${group.pdf_numbers}页 → 提取：${indicatorNames}`, groupPct);

      const pdfFile = findPdfFile(pdfFiles, group.report_name);
      if (!pdfFile) {
        log(`⚠️ 未找到对应 PDF：${group.report_name}，跳过`);
        return;
      }

      const pageNumbers = parsePdfNumbers(group.pdf_numbers);
      if (pageNumbers.length === 0) {
        log(`⚠️ 无法解析页码：${group.pdf_numbers}，跳过`);
        return;
      }

      let extractResult;
      try {
        extractResult = await extractPdfPages(pdfFile, pageNumbers, group.report_name);
      } catch (err) {
        log(`⚠️ PDF 页面提取失败：${err.message}`);
        return;
      }

      const { pdfData, pageOffset } = extractResult;
      const { pdfBase64, pdfText } = await getPdfInputForLlm(pdfData, isGemini1);
      const subGroups = subGroupByValueType(group.rows);
      const groupKey = `${group.report_name}|||${group.pdf_numbers}`;
      const groupBatchRows = [];

      for (const { valueType, indicators } of subGroups) {
        const sysPrompt = buildExtractionSystemPrompt({ isGemini: isGemini1, batchType: valueType });
        const baseUserPrompt = buildTestUserPrompt(indicators, definitionMap);
        const userPrompt = isGemini1 ? baseUserPrompt : `${baseUserPrompt}\n\n文档内容：\n${pdfText}`;

        try {
          const { text, usage } = await callLLMWithRetry(
            {
              sysPrompt,
              userPrompt,
              apiUrl: llm1Settings.apiUrl,
              apiKey: resolveApiKey(llm1Settings),
              modelName: llm1Settings.modelName,
              providerType: llm1Settings.providerType,
              pdfBase64
            },
            (msg) => log(msg),
            maxRetries
          );

          if (tokenStats) {
            tokenStats.extractInput += (usage?.input_tokens || 0);
            tokenStats.extractOutput += (usage?.output_tokens || 0);
          }

          const results = getResultsArray(JSON.parse(text));
          for (const result of results) {
            const original = indicators.find((ind) => String(ind.indicator_code).trim() === String(result.indicator_code || '').trim());
            const remappedPdfNumbers = remapPageNumbers(result.pdf_numbers, pageNumbers);
            const row = {
              report_name: group.report_name,
              indicator_name: original?.indicator_name || result.indicator_name || '',
              llm_indicator_name: result.indicator_name || '',
              ...result,
              value_type: valueType,
              pdf_numbers: remappedPdfNumbers
            };
            llm1Results.push(row);
            groupBatchRows.push(row);
          }
          log(`  ✅ [${group.report_name}] ${valueType} 提取完成，${results.length} 条结果`);
        } catch (err) {
          log(`  ❌ [${group.report_name}] ${valueType} 提取失败（已重试 ${maxRetries} 次）：${err.message}`);
          // 写入失败占位
          const failRows = indicators.map((ind) => ({
            report_name: group.report_name,
            indicator_code: ind.indicator_code,
            indicator_name: ind.indicator_name || '',
            value_type: valueType,
            llm_text_value: '提取失败',
            llm_num_value: null,
            match_status: 'ERROR'
          }));
          groupBatchRows.push(...failRows);
        }
      }

      // 批次完成后写入 IndexedDB
      if (runId && groupBatchRows.length > 0) {
        try {
          await appendResults(runId, groupKey, groupBatchRows);
        } catch (_) { /* 写入失败不阻断 */ }
      }

      // 更新断点状态
      completedGroupKeys.add(groupKey);
      completedCount += 1;
      // 每个分组完成后上报进度
      onProgress?.({
        message: `[${completedCount}/${totalGroups}] 分组完成：${group.report_name} 第${group.pdf_numbers}页`,
        percentage: Math.round((completedCount / totalGroups) * 100),
        timestamp: new Date().toLocaleTimeString(),
        completed: completedCount,
        total: totalGroups,
        phase: 'extraction'
      });
      if (runId) {
        try {
          await saveRunState({
            phase: 'extraction',
            completedGroups: Array.from(completedGroupKeys),
            completedOptimizations: [],
            sessionId
          });
        } catch (_) { /* 不阻断 */ }
      }
    }));
  }

  const wasInterrupted = !!interruptSignal?.interrupted;
  const statusWord = wasInterrupted ? '已中断' : '完成';
  log(`提取${statusWord}，共 ${llm1Results.length} 条结果，开始生成关联文件...`, 95);
  const { validRows: comparisonRows, invalidRows } = joinTestSetWithLlm1(testSetRows, llm1Results);
  const matched = comparisonRows.filter((r) => r.match_status !== '未匹配').length;
  log(
    `关联${statusWord}：总 ${comparisonRows.length} 条，已匹配 ${matched} 条，未匹配 ${comparisonRows.length - matched} 条`,
    100
  );

  return { llm1Results, comparisonRows, testSetRows, interrupted: wasInterrupted };
}

// ── 阶段二：LLM 2 Prompt 优化（跨报告按指标分组） ─────────────────────────────

function buildCrossReportOptimizationPrompt(indicatorCode, indicatorName, currentPrompt, reportExamples, indicatorDefinition = null) {
  // 按相似度升序排列（低相似度优先，LLM 重点关注失败案例）
  const sorted = [...reportExamples].sort((a, b) => (a.similarity ?? 50) - (b.similarity ?? 50));

  const examplesText = sorted
    .map((ex, i) => {
      // 动态上下文字符数：相似度越低分配越多字符
      const ctxLimit = (ex.similarity ?? 50) < 50 ? 2500 : (ex.similarity ?? 50) < 70 ? 1500 : 600;

      // 预判错误类型（辅助 LLM 诊断）
      const isNotFound = !ex.llm_result || ex.llm_result === '未提取' || ex.llm_result === NOT_FOUND_VALUE;
      const hasAnswer = ex.test_answer && ex.test_answer !== NOT_FOUND_VALUE;
      const noAnswer = !hasAnswer;
      const hasLlm = ex.llm_result && ex.llm_result !== '未提取' && ex.llm_result !== NOT_FOUND_VALUE;
      const hint = isNotFound && hasAnswer ? '【疑似TYPE_A：未找到】'
        : noAnswer && hasLlm ? '【TYPE_D：过摘录 - 标准答案为空但LLM给出了值】'
        : (ex.similarity ?? 0) < 30 && hasAnswer ? '【疑似TYPE_B：值错误】'
        : (ex.similarity ?? 0) >= 70 ? '【TYPE_F：提取正确】'
        : '';

      const context = ex.contextText
        ? `\n  页面原文（截取${ctxLimit}字）：\n${ex.contextText.slice(0, ctxLimit)}`
        : '';
      return `### 案例${i + 1}：${ex.report_name} ${hint}
  页码：${ex.pdf_numbers}
  标准答案：${ex.test_answer || '（无/未披露）'}
  LLM提取结果：${ex.llm_result || '未提取'}
  相似度：${ex.similarity ?? '-'}%${context}`;
    })
    .join('\n\n');

  // 指标定义块（由定义文件提供）
  const definitionBlock = indicatorDefinition
    ? `\n## 指标官方定义\n- 定义：${indicatorDefinition.definition || '（无）'}\n- 摘录规则：${indicatorDefinition.guidance || '（无）'}`
    : '';

  return `请优化以下ESG指标的提取Prompt，使其能准确适用于来自不同企业的大量报告（8000+份）。

## 指标信息
- 指标代码：${indicatorCode}
- 指标名称：${indicatorName}
- 当前提取指令：${currentPrompt || '（无）'}${definitionBlock}

## 跨报告提取案例（${reportExamples.length}条，已按相似度升序排列，前几条为重点优化对象）
${examplesText}

## 你的任务
按照系统提示中的Chain-of-Thought五步流程分析，输出符合要求的JSON。`;
}

/**
 * 运行 LLM 2 Prompt 优化阶段（跨报告按指标分组），支持循环优化
 *
 * @param {Object} params
 * @param {File[]}   params.pdfFiles
 * @param {Array}    params.comparisonRows
 * @param {Object}   params.llm2Settings
 * @param {Function} params.onProgress
 * @param {Function} params.onOptLog      - 优化日志专用回调
 * @param {string}   [params.runId]
 * @param {Object}   [params.tokenStats]
 */
export async function runOptimizationPhase({
  pdfFiles,
  comparisonRows,
  llm2Settings,
  onProgress,
  onOptLog,
  runId,
  tokenStats,
  interruptSignal,
  onPartialResults,
  definitionMap = null,
  sessionId = null
}) {
  const log = (message, percentage = -1) => {
    onProgress?.({ message, percentage, timestamp: new Date().toLocaleTimeString() });
  };
  const optLog = (message) => {
    onOptLog?.({ message, timestamp: new Date().toLocaleTimeString() });
  };

  const existingState = runId ? await getRunState() : null;
  const completedOptimizations = new Set(existingState?.completedOptimizations || []);

  const indicatorGroups = groupByIndicatorCode(comparisonRows);
  const totalGroups = indicatorGroups.length;
  log(`按指标分组（跨报告），共 ${totalGroups} 个不同指标`, 0);

  const resultRows = comparisonRows.map((r) => ({ ...r }));
  const isGemini2 = llm2Settings.providerType === 'gemini' || (!llm2Settings.providerType && (llm2Settings.apiUrl || '').includes('googleapis.com'));
  const maxRetries = llm2Settings.maxRetries || 3;
  const maxOptIterations = llm2Settings.maxOptIterations || 1;
  const similarityThreshold = llm2Settings.similarityThreshold ?? 70;
  const parallelCount = llm2Settings.parallelCount || 1;

  // 关键：详细记录每一轮的优化轨迹
  const iterationDetails = [];

  for (let batchStart = 0; batchStart < indicatorGroups.length; batchStart += parallelCount) {
    if (interruptSignal?.interrupted) {
      log('⚠️ 已中断，停止优化后续指标');
      break;
    }
    const batch = indicatorGroups.slice(batchStart, batchStart + parallelCount);

    await Promise.all(batch.map(async (group) => {
      if (completedOptimizations.has(group.indicator_code)) {
        return;
      }

      // 计算初始表现
      let currentBestPrompt = group.rows.find((r) => r.prompt)?.prompt || '';
      let currentBestSim = group.rows.reduce((s, r) => s + (r.similarity || 0), 0) / (group.rows.length || 1);
      let lastPrompt = currentBestPrompt;

      // 记录 Iteration 0 (原始状态)
      for (const row of group.rows) {
        iterationDetails.push({
          indicator_code: group.indicator_code,
          indicator_name: group.indicator_name,
          iter: 0,
          prompt: currentBestPrompt,
          avg_similarity: currentBestSim.toFixed(1),
          report_name: row.report_name,
          similarity: row.similarity,
          llm_text: row.llm_text_value || '',
          is_accepted: 'ORIGINAL'
        });
      }

      for (let iter = 1; iter <= maxOptIterations; iter++) {
        if (currentBestSim >= similarityThreshold) {
          optLog(`[${group.indicator_code}] 已达标 (${currentBestSim.toFixed(1)}%)，停止优化`);
          break;
        }

        optLog(`[${group.indicator_code}] 第 ${iter}/${maxOptIterations} 轮优化开始...`);

        // 1. 准备上下文（基于表现最差的 5 个案例）
        const worstCases = [...group.rows]
          .sort((a, b) => (a.similarity ?? 0) - (b.similarity ?? 0))
          .slice(0, 5);
        
        const reportExamples = [];
        for (const row of worstCases) {
          let contextText = '';
          const pdfFile = findPdfFile(pdfFiles, row.report_name);
          if (pdfFile) {
            const pageNumbers = parsePdfNumbers(String(row.pdf_numbers || ''));
            try {
              const { pdfData } = await extractPdfPages(pdfFile, pageNumbers, row.report_name);
              const { pdfText } = await getPdfInputForLlm(pdfData, false);
              contextText = pdfText;
            } catch (_) {}
          }
          reportExamples.push({
            report_name: row.report_name,
            pdf_numbers: row.pdf_numbers,
            test_answer: String(row.text_value || row.num_value || '').trim(),
            llm_result: String(row.llm_text_value || row.llm_num_value || '').trim() || '未提取',
            similarity: row.similarity,
            contextText
          });
        }

        // 2. 生成新 Prompt
        const indicatorDef = definitionMap?.get(group.indicator_code) || null;
        const userPrompt = buildCrossReportOptimizationPrompt(
          group.indicator_code,
          group.indicator_name,
          currentBestPrompt,
          reportExamples,
          indicatorDef
        );

        let newPrompt = '';
        try {
          const { text, usage } = await callLLMWithRetry({
            sysPrompt: PROMPT_OPTIMIZER_SYSTEM_PROMPT,
            userPrompt,
            apiUrl: llm2Settings.apiUrl,
            apiKey: resolveApiKey(llm2Settings),
            modelName: llm2Settings.modelName,
            providerType: llm2Settings.providerType
          }, null, maxRetries);

          if (tokenStats) {
            tokenStats.optInput += usage.input_tokens;
            tokenStats.optOutput += usage.output_tokens;
          }

          const optData = JSON.parse(text);
          const optRes = Array.isArray(optData.results) ? optData.results[0] : optData;
          newPrompt = optRes?.improved_prompt || currentBestPrompt;
        } catch (err) {
          optLog(`  ❌ LLM 2 失败: ${err.message}`);
          continue;
        }

        // 3. 验证新 Prompt（随机抽 3 个样本重测）
        optLog(`  🔍 正在验证新 Prompt 的表现...`);
        const verifySamples = [...group.rows].sort(() => 0.5 - Math.random()).slice(0, 3);
        let newTotalSim = 0;
        let vCount = 0;
        const roundResults = [];

        for (const sample of verifySamples) {
          const pdfFile = findPdfFile(pdfFiles, sample.report_name);
          if (!pdfFile) continue;
          const pageNumbers = parsePdfNumbers(sample.pdf_numbers);
          const pdfInput = await getPdfInputForLlm(pdfFile, isGemini2, pageNumbers);
          const sysPrompt = buildExtractionSystemPrompt({ isGemini: isGemini2, batchType: getValueTypeZh(sample) });
          const uPrompt = buildTestUserPrompt([{ ...sample, prompt: newPrompt }]);
          const finalUserPrompt = isGemini2 ? uPrompt : `${uPrompt}\n\n文档内容：\n${pdfInput.pdfText}`;

          try {
            const { text: vText, usage: vUsage } = await callLLMWithRetry({
              sysPrompt,
              userPrompt: finalUserPrompt,
              apiUrl: llm2Settings.apiUrl,
              apiKey: resolveApiKey(llm2Settings),
              modelName: llm2Settings.modelName,
              providerType: llm2Settings.providerType,
              pdfBase64: pdfInput.pdfBase64
            }, null, maxRetries);
            
            if (tokenStats) {
              tokenStats.optInput += vUsage.input_tokens;
              tokenStats.optOutput += vUsage.output_tokens;
            }

            const results = getResultsArray(vText);
            const res = results.find(r => String(r.indicator_code).trim() === group.indicator_code);
            if (res) {
              const sim = calculateSimilarity(sample.text_value, res.text_value);
              newTotalSim += sim;
              vCount++;
              roundResults.push({ report_name: sample.report_name, similarity: sim, text: res.text_value });
            }
          } catch (_) {}
        }

        const newAvgSim = vCount > 0 ? newTotalSim / vCount : 0;
        const isImproved = newAvgSim > currentBestSim;
        optLog(`  📊 验证结果：新平均相似度 ${newAvgSim.toFixed(1)}% (原最佳 ${currentBestSim.toFixed(1)}%)`);

        // 4. 择优录用
        if (isImproved) {
          optLog(`  ✅ 接受新 Prompt！性能提升了 ${(newAvgSim - currentBestSim).toFixed(1)}%`);
          currentBestSim = newAvgSim;
          currentBestPrompt = newPrompt;
          
          // 更新 resultRows
          for (const row of resultRows) {
            if (String(row.indicator_code).trim() === group.indicator_code) {
              row.improved_prompt = newPrompt;
              row.post_similarity = newAvgSim; // 这里记录的是验证集的平均分
              row.iteration = iter;
            }
          }
        } else {
          optLog(`  ⚠️ 性能未提升，保留原 Prompt`);
        }

        // 记录本轮轨迹
        for (const vr of roundResults) {
          iterationDetails.push({
            indicator_code: group.indicator_code,
            indicator_name: group.indicator_name,
            iter,
            prompt: newPrompt,
            avg_similarity: newAvgSim.toFixed(1),
            report_name: vr.report_name,
            similarity: vr.similarity,
            llm_text: vr.text,
            is_accepted: isImproved ? 'YES' : 'NO'
          });
        }
      }

      completedOptimizations.add(group.indicator_code);
      const done = completedOptimizations.size;
      onProgress?.({
        message: `[${done}/${totalGroups}] 优化完成：${group.indicator_code}`,
        percentage: Math.round((done / totalGroups) * 100),
        timestamp: new Date().toLocaleTimeString(),
        completed: done,
        total: totalGroups,
        phase: 'optimization'
      });
      onPartialResults?.(resultRows.slice());
    }));
  }

  log('Prompt 优化全部完成！', 100);
  return { rows: resultRows, iterationDetails };
}

// ── 导出 ─────────────────────────────────────────────────────────────────────

/** 计算指标维度统计 */
function calculateIndicatorStats(comparisonRows, includeHallucination) {
  const rows = includeHallucination ? comparisonRows : comparisonRows.filter(r => r.match_status !== '幻觉');
  const grouped = new Map();

  for (const row of rows) {
    const code = row.indicator_code || '';
    if (!grouped.has(code)) {
      grouped.set(code, { code, name: row.indicator_name || '', rows: [] });
    }
    grouped.get(code).rows.push(row);
  }

  return Array.from(grouped.values()).map(g => {
    const matched = g.rows.filter(r => r.match_status === '已匹配').length;
    const unmatched = g.rows.filter(r => r.match_status === '未匹配').length;
    const hallucination = g.rows.filter(r => r.match_status === '幻觉').length;
    const multi = g.rows.filter(r => r.match_status === '多结果').length;
    const sims = g.rows.map(r => r.similarity ?? 0).filter(s => s > 0);

    return {
      指标代码: g.code,
      指标名称: g.name,
      总条数: g.rows.length,
      已匹配数: matched,
      未匹配数: unmatched,
      ...(includeHallucination ? { 幻觉数: hallucination } : {}),
      多结果数: multi,
      平均相似度: sims.length ? Math.round(sims.reduce((a, b) => a + b, 0) / sims.length) : 0,
      最高相似度: sims.length ? Math.max(...sims) : 0,
      最低相似度: sims.length ? Math.min(...sims) : 0
    };
  });
}

/** 计算报告维度统计 */
function calculateReportStats(comparisonRows, includeHallucination) {
  const rows = includeHallucination ? comparisonRows : comparisonRows.filter(r => r.match_status !== '幻觉');
  const grouped = new Map();

  for (const row of rows) {
    const name = row.report_name || '';
    if (!grouped.has(name)) {
      grouped.set(name, { name, rows: [] });
    }
    grouped.get(name).rows.push(row);
  }

  return Array.from(grouped.values()).map(g => {
    const matched = g.rows.filter(r => r.match_status === '已匹配').length;
    const unmatched = g.rows.filter(r => r.match_status === '未匹配').length;
    const hallucination = g.rows.filter(r => r.match_status === '幻觉').length;
    const multi = g.rows.filter(r => r.match_status === '多结果').length;
    const sims = g.rows.map(r => r.similarity ?? 0).filter(s => s > 0);

    return {
      报告名称: g.name,
      总条数: g.rows.length,
      已匹配数: matched,
      未匹配数: unmatched,
      ...(includeHallucination ? { 幻觉数: hallucination } : {}),
      多结果数: multi,
      平均相似度: sims.length ? Math.round(sims.reduce((a, b) => a + b, 0) / sims.length) : 0,
      最高相似度: sims.length ? Math.max(...sims) : 0,
      最低相似度: sims.length ? Math.min(...sims) : 0
    };
  });
}

/** 导出关联后的对比文件（阶段一结果，含相似度，供下载 / 独立优化入口使用） */
export async function exportComparisonRows(comparisonRows) {
  const XLSX = await import('xlsx');
  const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');

  const baseFields = (r) => ({
    source_announce_id: r.source_announce_id || '',
    report_name: r.report_name || '',
    report_type: r.report_type || '',
    indicator_code: r.indicator_code || '',
    indicator_name: r.indicator_name || '',
    data_year: r.data_year || '',
    value_type: r.value_type || '',
    value_type_1: r.value_type_1 || '',
    pdf_numbers: r.pdf_numbers || '',
    scope: r.scope || '',
    test_text_value: r.text_value || '',
    test_num_value: r.num_value || '',
    test_unit: r.unit || '',
    test_currency: r.currency || '',
    test_numerator_unit: r.numerator_unit || '',
    test_denominator_unit: r.denominator_unit || '',
    original_prompt: r.prompt || '',
    match_status: r.match_status || '',
    llm_year: r.llm_year || '',
    llm_text_value: r.llm_text_value || '',
    llm_num_value: r.llm_num_value || '',
    llm_unit: r.llm_unit || '',
    llm_currency: r.llm_currency || '',
    llm_numerator_unit: r.llm_numerator_unit || '',
    llm_denominator_unit: r.llm_denominator_unit || '',
    llm_pdf_numbers: r.llm_pdf_numbers || ''
  });

  const testBasedRows = comparisonRows.map((r) => ({
    ...baseFields(r),
    similarity: r.similarity ?? '',
    unit_similarity: r.unit_similarity ?? '',
    currency_similarity: r.currency_similarity ?? '',
    numerator_unit_similarity: r.numerator_unit_similarity ?? '',
    denominator_unit_similarity: r.denominator_unit_similarity ?? ''
  }));

  const llmBasedRows = comparisonRows.map((r) => ({
    ...baseFields(r),
    similarity: r.llm_based_similarity ?? '',
    unit_similarity: r.unit_similarity ?? '',
    currency_similarity: r.currency_similarity ?? '',
    numerator_unit_similarity: r.numerator_unit_similarity ?? '',
    denominator_unit_similarity: r.denominator_unit_similarity ?? ''
  }));

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(testBasedRows);
  const ws2 = XLSX.utils.json_to_sheet(llmBasedRows);
  XLSX.utils.book_append_sheet(wb, ws1, '基于测试集');
  XLSX.utils.book_append_sheet(wb, ws2, '基于LLM');
  XLSX.writeFile(wb, `comparison_${ts}.xlsx`);
}

/** 导出最终优化结果（阶段二结果，含 improved_prompt 和优化轮次明细） */
export async function exportFinalResults(finalRows, tokenStats, iterationDetails = null) {
  const XLSX = await import('xlsx');
  const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');

  // 主 sheet：与 exportComparisonRows 字段完全一致，再追加优化相关列
  const rows = finalRows.map((r) => ({
    source_announce_id: r.source_announce_id || '',
    report_name: r.report_name || '',
    report_type: r.report_type || '',
    indicator_code: r.indicator_code || '',
    indicator_name: r.indicator_name || '',
    data_year: r.data_year || '',
    value_type: r.value_type || '',
    value_type_1: r.value_type_1 || '',
    pdf_numbers: r.pdf_numbers || '',
    scope: r.scope || '',
    test_text_value: r.text_value || '',
    test_num_value: r.num_value || '',
    test_unit: r.unit || '',
    test_currency: r.currency || '',
    test_numerator_unit: r.numerator_unit || '',
    test_denominator_unit: r.denominator_unit || '',
    original_prompt: r.prompt || '',
    match_status: r.match_status || '',
    similarity: r.similarity ?? '',
    llm_year: r.llm_year || '',
    llm_text_value: r.llm_text_value || '',
    llm_num_value: r.llm_num_value || '',
    llm_unit: r.llm_unit || '',
    unit_similarity: r.unit_similarity ?? '',
    llm_currency: r.llm_currency || '',
    currency_similarity: r.currency_similarity ?? '',
    llm_numerator_unit: r.llm_numerator_unit || '',
    numerator_unit_similarity: r.numerator_unit_similarity ?? '',
    llm_denominator_unit: r.llm_denominator_unit || '',
    denominator_unit_similarity: r.denominator_unit_similarity ?? '',
    llm_pdf_numbers: r.llm_pdf_numbers || '',
    improved_prompt: r.improved_prompt || '',
    improvement_reason: r.improvement_reason || '',
    error_types: r.error_types || '',
    pattern_analysis: r.pattern_analysis || '',
    post_similarity: r.post_similarity ?? ''
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, '测试集对比优化');

  // 优化轮次 sheet（iter=0 为原始LLM结果，iter>=1 为每轮验证结果）
  if (iterationDetails && iterationDetails.length > 0) {
    const iterRows = iterationDetails.map((d) => ({
      indicator_code: d.indicator_code,
      indicator_name: d.indicator_name,
      轮次: d.iter === 0 ? '原始' : `第${d.iter}轮`,
      使用的Prompt: d.prompt || '',
      验证报告: d.verify_report || '',
      验证相似度: d.verify_sim ?? '',
      llm_text_value: d.llm_text || '',
      llm_num_value: d.llm_num || ''
    }));
    const iterWs = XLSX.utils.json_to_sheet(iterRows);
    XLSX.utils.book_append_sheet(wb, iterWs, '优化轮次明细');
  }

  // 统计 Sheet
  if (tokenStats) {
    const { estimateCost } = await import('./llmClient.js');
    const totalCost = estimateCost('default', tokenStats.extractInput + tokenStats.optInput, tokenStats.extractOutput + tokenStats.optOutput);
    const statsRows = [
      { 项目: '提取阶段 输入Token', 数值: tokenStats.extractInput },
      { 项目: '提取阶段 输出Token', 数值: tokenStats.extractOutput },
      { 项目: '优化阶段 输入Token', 数值: tokenStats.optInput },
      { 项目: '优化阶段 输出Token', 数值: tokenStats.optOutput },
      { 项目: '总输入Token', 数值: tokenStats.extractInput + tokenStats.optInput },
      { 项目: '总输出Token', 数值: tokenStats.extractOutput + tokenStats.optOutput },
      { 项目: '估算总费用(USD)', 数值: totalCost.toFixed(4) }
    ];
    const statsWs = XLSX.utils.json_to_sheet(statsRows);
    XLSX.utils.book_append_sheet(wb, statsWs, 'Token统计');
  }

  // 新增分析统计 Sheet
  const indicatorStatsWithHall = calculateIndicatorStats(finalRows, true);
  const indicatorStatsNoHall = calculateIndicatorStats(finalRows, false);
  const reportStatsWithHall = calculateReportStats(finalRows, true);
  const reportStatsNoHall = calculateReportStats(finalRows, false);

  const ws3 = XLSX.utils.json_to_sheet(indicatorStatsWithHall);
  const ws4 = XLSX.utils.json_to_sheet(indicatorStatsNoHall);
  const ws5 = XLSX.utils.json_to_sheet(reportStatsWithHall);
  const ws6 = XLSX.utils.json_to_sheet(reportStatsNoHall);

  XLSX.utils.book_append_sheet(wb, ws3, '指标维度统计（含幻觉）');
  XLSX.utils.book_append_sheet(wb, ws4, '指标维度统计（不含幻觉）');
  XLSX.utils.book_append_sheet(wb, ws5, '报告维度统计（含幻觉）');
  XLSX.utils.book_append_sheet(wb, ws6, '报告维度统计（不含幻觉）');

  XLSX.writeFile(wb, `testbench_final_${ts}.xlsx`);
}

/** 解析用户上传的关联文件（comparison Excel），用于独立优化入口 */
export async function parseComparisonFile(file) {
  const rows = await parseExcel(file);
  return rows.map((r) => ({
    ...r,
    text_value: r.text_value || r.test_text_value || '',
    num_value: r.num_value || r.test_num_value || '',
    prompt: r.prompt || r.original_prompt || '',
    llm_text_value: r.llm_text_value || '',
    llm_num_value: r.llm_num_value || '',
    similarity: r.similarity !== undefined ? Number(r.similarity) : null,
    improved_prompt: r.improved_prompt || '',
    improvement_reason: r.improvement_reason || ''
  }));
}

/**
 * 解析指标摘录定义文件，返回以 indicator_code 为 key 的 Map
 * @param {File} definitionFile
 * @returns {Promise<Map<string, {indicator_code, indicator_name, definition, guidance, prompt}>>}
 */
export async function parseDefinitionFile(definitionFile) {
  const rows = await parseExcel(definitionFile);
  const map = new Map();
  for (const row of rows) {
    const code = String(row.indicator_code || '').trim();
    if (!code) continue;
    map.set(code, {
      indicator_code: code,
      indicator_name: String(row.indicator_name || '').trim(),
      definition: String(row.definition || '').trim(),
      guidance: String(row.guidance || '').trim(),
      prompt: String(row.prompt || '').trim(),
      value_type_1: String(row.value_type_1 || row.value_type || '').trim()
    });
  }
  return map;
}

/** 清除当前运行的所有持久化状态 */
export async function resetRunState(runId) {
  await clearRunState();
  if (runId) {
    await clearResults(runId);
    await clearPhaseResults(runId);
  }
}

/** 导出 LLM1 原始提取结果（关联前，仅 LLM 提取字段） */
export async function exportLlm1Results(llm1Rows) {
  const XLSX = await import('xlsx');
  const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');

  const rows = llm1Rows.map((r) => ({
    report_name: r.report_name || '',
    indicator_code: r.indicator_code || '',
    indicator_name: r.indicator_name || '',
    value_type: r.value_type || '',
    year: r.year || '',
    text_value: r.text_value || '',
    num_value: r.num_value ?? '',
    unit: r.unit || '',
    currency: r.currency || '',
    numerator_unit: r.numerator_unit || '',
    denominator_unit: r.denominator_unit || '',
    pdf_numbers: r.pdf_numbers || ''
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'LLM提取结果');
  XLSX.writeFile(wb, `llm1_results_${ts}.xlsx`);
}

/** 解析用户上传的 LLM 结果文件（快速验收模式） */
export async function parseLlmResultsFile(file) {
  const rows = await parseExcel(file);

  return rows.map((r) => ({
    ...r,
    ...('report_name' in r ? { report_name: String(r.report_name || '').trim() } : {}),
    ...('indicator_code' in r ? { indicator_code: String(r.indicator_code || '').trim() } : {}),
    ...('indicator_name' in r ? { indicator_name: String(r.indicator_name || '').trim() } : {}),
    ...('value_type' in r ? { value_type: String(r.value_type || '').trim() } : {}),
    ...(('year' in r) || ('data_year' in r) ? { year: String(r.year || r.data_year || '').trim() } : {}),
    ...('text_value' in r ? { text_value: String(r.text_value || '').trim() } : {}),
    ...('num_value' in r ? { num_value: String(r.num_value || '').trim() } : {}),
    ...('unit' in r ? { unit: String(r.unit || '').trim() } : {}),
    ...('currency' in r ? { currency: String(r.currency || '').trim() } : {}),
    ...('numerator_unit' in r ? { numerator_unit: String(r.numerator_unit || '').trim() } : {}),
    ...('denominator_unit' in r ? { denominator_unit: String(r.denominator_unit || '').trim() } : {}),
    ...('pdf_numbers' in r ? { pdf_numbers: String(r.pdf_numbers || '').trim() } : {})
  }));
}

/** 将上传的 LLM 结果与测试集关联（快速验收模式） */
export function joinLlmResultsWithTestSet(llmResults, testSetRows, options = {}) {
  const { validRows, invalidRows, matchCount, effectiveMappings } = joinTestSetWithLlm1(
    testSetRows,
    llmResults,
    options.fieldMappings
  );
  return { validRows, invalidRows, matchCount, effectiveMappings };
}

export function validateQuickValidationAnalysisInput({ llmResults, testSetRows, fieldMappings }) {
  const llmFields = extractFieldOptionsFromRows(llmResults);
  const testFields = extractFieldOptionsFromRows(testSetRows);
  return validateValidationFieldMappings({
    mappings: fieldMappings,
    llmFields,
    testFields
  });
}

export function refreshComparisonRowsWithCurrentSimilarityRules(rows = []) {
  return rows.map((row) => {
    if (!row || row.match_status === '幻觉') return row;

    if (row.match_status === '未匹配') {
      return {
        ...row,
        similarity: 0,
        llm_based_similarity: 0,
        unit_similarity: null,
        currency_similarity: null,
        numerator_unit_similarity: null,
        denominator_unit_similarity: null
      };
    }

    const testRow = {
      ...row,
      pdf_numbers: row.pdf_numbers || '',
      text_value: row.text_value || '',
      num_value: row.num_value || '',
      unit: row.unit || '',
      currency: row.currency || '',
      numerator_unit: row.numerator_unit || '',
      denominator_unit: row.denominator_unit || ''
    };
    const llmRow = {
      year: row.llm_year || '',
      text_value: row.llm_text_value || '',
      num_value: row.llm_num_value || '',
      unit: row.llm_unit || '',
      currency: row.llm_currency || '',
      numerator_unit: row.llm_numerator_unit || '',
      denominator_unit: row.llm_denominator_unit || '',
      pdf_numbers: row.llm_pdf_numbers || ''
    };

    return buildMatchedComparisonRow(testRow, llmRow, row.match_status === '多结果' ? 2 : 1);
  });
}

/** 检查 PDF 匹配情况（快速优化模式） */
export function checkPdfMatching(requiredReports, pdfFiles) {
  const matched = [];
  const missing = [];

  for (const reportName of requiredReports) {
    const pdfFile = pdfFiles.find(f => f.name.replace(/\.[^/.]+$/, '') === reportName);
    if (pdfFile) {
      matched.push({ reportName, pdfFile });
    } else {
      missing.push({ reportName });
    }
  }

  const coverage = requiredReports.length > 0 ? matched.length / requiredReports.length : 0;
  return { matched, missing, coverage };
}

/** 过滤出有对应 PDF 的行（快速优化模式） */
export function filterRowsByPdfAvailability(comparisonRows, availablePdfs) {
  const pdfSet = new Set(availablePdfs.map(p => p.reportName));
  const optimizableRows = comparisonRows.filter(r => pdfSet.has(r.report_name));
  const skippedRows = comparisonRows.filter(r => !pdfSet.has(r.report_name));
  return { optimizableRows, skippedRows };
}
