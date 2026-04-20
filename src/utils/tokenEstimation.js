import { estimateCost } from '../services/llmClient.js';

function countCjkCharacters(text) {
  return (String(text || '').match(/[\u3400-\u9fff]/g) || []).length;
}

function countNonCjkCharacters(text) {
  return String(text || '').replace(/[\u3400-\u9fff]/g, '').length;
}

export function estimateTextTokens(text) {
  const normalizedText = String(text || '');
  const cjkCharacters = countCjkCharacters(normalizedText);
  const nonCjkCharacters = countNonCjkCharacters(normalizedText);
  const estimatedTokens = Math.ceil(cjkCharacters + (nonCjkCharacters / 4));

  return {
    characters: normalizedText.length,
    cjkCharacters,
    nonCjkCharacters,
    estimatedTokens
  };
}

export function summarizeTokenEstimationItems(items = []) {
  const rows = items.map((item) => {
    const stats = estimateTextTokens(item.text);
    return {
      name: item.name || '未命名输入',
      sourceType: item.sourceType || 'text',
      ...stats
    };
  });

  const summary = rows.reduce((acc, row) => {
    acc.totalFiles += 1;
    acc.totalCharacters += row.characters;
    acc.totalTokens += row.estimatedTokens;
    if (!acc.largestItem || row.estimatedTokens > acc.largestItem.estimatedTokens) {
      acc.largestItem = row;
    }
    return acc;
  }, {
    totalFiles: 0,
    totalCharacters: 0,
    totalTokens: 0,
    largestItem: null
  });

  return {
    ...summary,
    rows
  };
}

export function estimateTokenCost(modelName, inputTokens) {
  return estimateCost(modelName || 'default', Number(inputTokens) || 0, 0);
}
