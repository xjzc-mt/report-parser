import { createOptimizationRun } from './promptOptimizationModel.js';

function normalizeString(value) {
  return String(value || '').trim();
}

function average(values = []) {
  if (!values.length) {
    return 0;
  }
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function buildPromptOptimizationTargetOptions(rows = [], preselectedCodes = []) {
  const allowedCodes = new Set(
    (Array.isArray(preselectedCodes) ? preselectedCodes : [])
      .map((value) => normalizeString(value))
      .filter(Boolean)
  );
  const optionMap = new Map();

  for (const row of rows) {
    const code = normalizeString(row?.indicator_code);
    if (!code) {
      continue;
    }
    if (allowedCodes.size > 0 && !allowedCodes.has(code)) {
      continue;
    }

    if (!optionMap.has(code)) {
      const name = normalizeString(row?.indicator_name) || '未命名指标';
      optionMap.set(code, {
        value: code,
        label: `${code} · ${name}`,
        code,
        name
      });
    }
  }

  return Array.from(optionMap.values()).sort((left, right) => left.code.localeCompare(right.code, 'zh-Hans-CN'));
}

function buildTraceEntries(iterationDetails = [], now = () => Date.now()) {
  return iterationDetails.map((item, index) => ({
    id: `trace_${index + 1}`,
    phase: Number(item?.iter || 0) === 0 ? 'baseline' : 'evaluation',
    indicatorCode: normalizeString(item?.indicator_code),
    indicatorName: normalizeString(item?.indicator_name),
    message: `${Number(item?.iter || 0) === 0 ? '原始' : `第${item.iter}轮`} · ${normalizeString(item?.report_name)} · ${Number(item?.similarity || 0)} 分`,
    promptText: normalizeString(item?.prompt),
    llmText: normalizeString(item?.llm_text),
    accepted: normalizeString(item?.is_accepted),
    createdAt: now()
  }));
}

export function buildPromptOptimizationRunSnapshot({
  assetId,
  baselineVersionId,
  baselinePromptText,
  targetName,
  rows = [],
  updatedRows = [],
  iterationDetails = [],
  llmSettings = {},
  now = () => Date.now()
}) {
  const baselineScore = average(rows.map((row) => Number(row?.similarity || 0)));
  const candidatePromptText = normalizeString(
    updatedRows.find((row) => normalizeString(row?.improved_prompt))?.improved_prompt || baselinePromptText
  );
  const candidateScore = average(
    updatedRows.map((row) => Number((row?.post_similarity ?? row?.similarity) || 0))
  );
  const indicatorCode = normalizeString(rows[0]?.indicator_code);
  const indicatorName = normalizeString(rows[0]?.indicator_name);
  const candidateId = `cand_${indicatorCode || 'prompt'}_1`;
  const traceEntries = buildTraceEntries(iterationDetails, now);

  const run = {
    ...createOptimizationRun({
      assetId,
      baselineVersionId,
      status: 'completed',
      baselineScore,
      baselinePromptText,
      bestCandidateId: candidateId,
      candidates: [
        {
          id: candidateId,
          indicatorCode,
          indicatorName,
          promptText: candidatePromptText,
          score: { overall: candidateScore },
          sampleResults: updatedRows.map((row) => ({
            report_name: normalizeString(row?.report_name),
            similarity: Number((row?.post_similarity ?? row?.similarity) || 0),
            text: normalizeString(row?.llm_text_value || row?.llm_num_value)
          }))
        }
      ],
      traceEntries,
      createdAt: now(),
      updatedAt: now()
    }, { now }),
    targetName: normalizeString(targetName) || indicatorName,
    indicatorCode,
    indicatorName,
    modelName: normalizeString(llmSettings?.modelName),
    providerType: normalizeString(llmSettings?.providerType),
    resultRows: updatedRows,
    iterationDetails,
    bestScore: candidateScore
  };

  return {
    run,
    resultRows: updatedRows
  };
}
