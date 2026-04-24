import { createOptimizationRun } from '../utils/promptOptimizationModel.js';

function normalizeIndicatorCode(value) {
  return String(value || '').trim();
}

function average(values = []) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function groupRowsByIndicator(rows = []) {
  const groups = new Map();

  for (const row of rows) {
    const indicatorCode = normalizeIndicatorCode(row?.indicator_code);
    if (!indicatorCode) {
      continue;
    }

    if (!groups.has(indicatorCode)) {
      groups.set(indicatorCode, []);
    }
    groups.get(indicatorCode).push(row);
  }

  return Array.from(groups.entries()).map(([indicatorCode, groupRows]) => ({
    indicatorCode,
    indicatorName: String(groupRows[0]?.indicator_name || '').trim(),
    rows: groupRows,
    baselinePrompt: String(
      groupRows.find((row) => String(row?.prompt || '').trim())?.prompt ||
      groupRows[0]?.prompt ||
      ''
    ).trim(),
    baselineScore: average(groupRows.map((row) => Number(row?.similarity || 0)))
  }));
}

function sortCandidatesByScore(candidates = []) {
  return [...candidates].sort(
    (left, right) => Number(right?.score?.overall || 0) - Number(left?.score?.overall || 0)
  );
}

export async function runPromptOptimizationEngine(input, deps = {}) {
  const now = deps.now ?? (() => Date.now());
  const callOptimizer = deps.callOptimizer;
  const validateCandidate = deps.validateCandidate;

  if (typeof callOptimizer !== 'function') {
    throw new Error('Prompt 自动优化引擎缺少 callOptimizer 依赖');
  }
  if (typeof validateCandidate !== 'function') {
    throw new Error('Prompt 自动优化引擎缺少 validateCandidate 依赖');
  }

  const groups = groupRowsByIndicator(input?.comparisonRows);
  const resultRows = Array.isArray(input?.comparisonRows)
    ? input.comparisonRows.map((row) => ({ ...row }))
    : [];
  const candidates = [];
  const traceEntries = [];
  const baselinePromptText = String(
    input?.baselineVersion?.userPromptTemplate ||
    groups.find((group) => group.baselinePrompt)?.baselinePrompt ||
    ''
  ).trim();
  const baselineScore = average(groups.map((group) => group.baselineScore));

  for (const group of groups) {
    const candidateIndex = candidates.length + 1;
    const candidateId = `cand_${group.indicatorCode}_${candidateIndex}`;

    const optimizerResult = await callOptimizer({
      indicatorCode: group.indicatorCode,
      indicatorName: group.indicatorName,
      baselinePrompt: group.baselinePrompt || baselinePromptText,
      rows: group.rows,
      llmSettings: input?.llmSettings,
      pdfFiles: input?.pdfFiles
    });

    const promptText = String(
      optimizerResult?.improvedPrompt ||
      optimizerResult?.promptText ||
      group.baselinePrompt ||
      baselinePromptText
    ).trim();

    traceEntries.push({
      id: `trace_candidate_${group.indicatorCode}_${candidateIndex}`,
      phase: 'candidate_generation',
      indicatorCode: group.indicatorCode,
      indicatorName: group.indicatorName,
      message: `生成候选 Prompt：${promptText}`,
      createdAt: now()
    });

    const evaluation = await validateCandidate({
      indicatorCode: group.indicatorCode,
      indicatorName: group.indicatorName,
      promptText,
      baselinePrompt: group.baselinePrompt || baselinePromptText,
      rows: group.rows,
      llmSettings: input?.llmSettings,
      pdfFiles: input?.pdfFiles
    });

    const score = Number(evaluation?.averageSimilarity || 0);
    traceEntries.push({
      id: `trace_eval_${group.indicatorCode}_${candidateIndex}`,
      phase: 'evaluation',
      indicatorCode: group.indicatorCode,
      indicatorName: group.indicatorName,
      message: `验证平均分 ${score}`,
      createdAt: now()
    });

    candidates.push({
      id: candidateId,
      indicatorCode: group.indicatorCode,
      indicatorName: group.indicatorName,
      promptText,
      score: { overall: score },
      sampleResults: Array.isArray(evaluation?.sampleResults) ? evaluation.sampleResults : []
    });

    if (score > group.baselineScore) {
      for (const row of resultRows) {
        if (normalizeIndicatorCode(row?.indicator_code) === group.indicatorCode) {
          row.improved_prompt = promptText;
          row.post_similarity = score;
        }
      }
    }
  }

  const sortedCandidates = sortCandidatesByScore(candidates);
  const bestCandidateId = sortedCandidates[0]?.id || '';
  const run = createOptimizationRun({
    assetId: String(input?.assetId || '').trim(),
    baselineVersionId: String(input?.baselineVersion?.id || '').trim(),
    datasetId: String(input?.datasetId || '').trim(),
    status: 'completed',
    baselineScore,
    baselinePromptText,
    bestCandidateId,
    candidates: sortedCandidates,
    traceEntries,
    createdAt: now(),
    updatedAt: now()
  }, { now });

  return {
    run,
    resultRows,
    traceEntries
  };
}
