import { ESG_EXPERT_SYSTEM_PROMPT } from '../constants/extraction.js';
import { parseExcel, parsePDF, fileToBase64 } from './fileParsers.js';
import { buildExtractionSystemPrompt, callLLMWithRetry, estimateCost } from './llmClient.js';
import {
  buildMissingResult,
  getRequirementValueType,
  getResultsArray,
  getSelectedIndicatorTypes,
  mapBatchResults,
  normalizeRequirementRow,
  normalizeValueType,
  splitRequirementsIntoBatches
} from '../utils/extraction.js';

function createProgressReporter(onProgress) {
  return (message, percentage = -1) => {
    onProgress?.({
      message,
      percentage,
      timestamp: new Date().toLocaleTimeString()
    });
  };
}

async function processExtractionBatch({
  batch,
  batchIndex,
  batchType,
  totalBatches,
  isGemini,
  systemPrompts,
  apiUrl,
  apiKey,
  modelName,
  pdfBase64,
  docText,
  reportProgress
}) {
  const normalizedBatchType = normalizeValueType(batchType);
  const typeLabel = normalizedBatchType === '文字型' ? 'Text' : normalizedBatchType;
  reportProgress(`Starting batch ${batchIndex + 1}/${totalBatches} (${typeLabel}, ${batch.length} indicators)...`);

  const sysPrompt = systemPrompts[normalizedBatchType];
  const requirementText = batch.map((requirement) => (
    `Indicator Code: ${requirement.indicator_code}\n` +
    `Indicator Name: ${requirement.indicator_name || ''}\n` +
    `Value Type: ${getRequirementValueType(requirement)}\n` +
    `Definition: ${requirement.definition || ''}\n` +
    `Guidance: ${requirement.guidance || 'None'}\n` +
    `Prompt: ${requirement.prompt || 'None'}`
  )).join('\n---\n');

  const taskPrompt = isGemini
    ? `Requirements:\n<requirements>\n${requirementText}\n</requirements>\n\nPlease extract the requested info from the attached PDF. Remember: pdf_numbers = physical PDF page numbers, NOT content page numbers.`
    : `Document:\n<document>\n${docText}\n</document>\n\nRequirements:\n<requirements>\n${requirementText}\n</requirements>\n\nPlease return the structured JSON. Remember: pdf_numbers = [Page X] markers.`;

  const userPrompt = `Global Instructions:\n<global_instructions>\n${ESG_EXPERT_SYSTEM_PROMPT}\n</global_instructions>\n\nTask Instructions:\n<task_instructions>\n${taskPrompt}\n</task_instructions>`;

  const result = await callLLMWithRetry({
    sysPrompt,
    userPrompt,
    apiUrl,
    apiKey,
    modelName,
    pdfBase64
  }, reportProgress);

  const batchCost = estimateCost(modelName, result.usage.input_tokens, result.usage.output_tokens);
  reportProgress(`Batch ${batchIndex + 1} tokens: ${result.usage.input_tokens} in / ${result.usage.output_tokens} out | Cost: $${batchCost.toFixed(4)}`);

  try {
    const cleanJson = result.text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanJson);
    const resultsArray = getResultsArray(parsedData);

    return {
      batchIndex,
      batchResults: mapBatchResults(batch, resultsArray),
      usage: result.usage,
      batchCost
    };
  } catch (error) {
    console.warn(`Failed to parse batch ${batchIndex + 1} JSON`, error);
    reportProgress(
      `Warning: batch ${batchIndex + 1} parse failed, marking ${batch.length} indicators as not found.`
    );
    return {
      batchIndex,
      batchResults: batch.map(buildMissingResult),
      usage: result.usage,
      batchCost
    };
  }
}

export function resolveApiKey(settings) {
  return settings.apiKey?.trim() || import.meta.env.VITE_GEMINI_API_KEY || '';
}

export async function runExtractionJob({ pdfFile, csvFile, settings, onProgress, onPartialResults }) {
  const reportProgress = createProgressReporter(onProgress);
  const startTime = new Date();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;

  reportProgress('Starting file processing...', 0);
  reportProgress('Parsing requirements Excel...', 2);

  const requirements = (await parseExcel(csvFile)).map(normalizeRequirementRow);
  const selectedIndicatorTypes = getSelectedIndicatorTypes(settings.indicatorTypes);

  if (selectedIndicatorTypes.length === 0) {
    throw new Error('Please select at least one indicator type to process.');
  }

  const selectedTypeSet = new Set(selectedIndicatorTypes);
  const filteredRequirements = requirements.filter((requirement) => (
    selectedTypeSet.has(getRequirementValueType(requirement))
  ));

  if (filteredRequirements.length === 0) {
    throw new Error(`No requirements match selected types: ${selectedIndicatorTypes.join(', ')}`);
  }

  reportProgress(
    `Loaded ${requirements.length} requirements, processing ${filteredRequirements.length} across ${selectedIndicatorTypes.join(', ')}`,
    3
  );

  const isGemini = settings.apiUrl.includes('googleapis.com');
  let pdfBase64 = null;
  let documentText = '';

  if (isGemini) {
    reportProgress('Converting PDF for Gemini native extraction...', 5);
    pdfBase64 = await fileToBase64(pdfFile);
    reportProgress('Gemini preparation completed.', 10);
  } else {
    reportProgress('Parsing PDF document locally...', 5);
    const pdfPagesData = await parsePDF(pdfFile, reportProgress);
    documentText = pdfPagesData.map((page) => `[Page ${page.pageNumber}]\n${page.text}`).join('\n\n');
    reportProgress('Local parsing completed.', 10);
  }

  reportProgress('Preparing AI extraction...', 12);

  const { allBatches, counts } = splitRequirementsIntoBatches(filteredRequirements, Number(settings.batchSize));
  const totalBatches = allBatches.length;
  const concurrentBatches = totalBatches > 0 ? Math.min(Number(settings.maxConcurrency), totalBatches) : 0;

  reportProgress(
    `Split into ${totalBatches} batches with batch size ${settings.batchSize} (${counts.textCount} text, ${counts.numericCount} numeric, ${counts.intensityCount} intensity, ${counts.currencyCount} currency)`,
    13
  );

  if (concurrentBatches > 0) {
    reportProgress(`Running up to ${concurrentBatches} requests in parallel...`, 14);
  }

  const systemPrompts = {
    文字型: buildExtractionSystemPrompt({ isGemini, batchType: '文字型' }),
    数值型: buildExtractionSystemPrompt({ isGemini, batchType: '数值型' }),
    强度型: buildExtractionSystemPrompt({ isGemini, batchType: '强度型' }),
    货币型: buildExtractionSystemPrompt({ isGemini, batchType: '货币型' })
  };

  const batchResults = new Array(totalBatches);
  let nextBatchIndex = 0;
  let completedBatches = 0;
  let finalResults = [];

  async function runBatchWorker() {
    while (nextBatchIndex < totalBatches) {
      const currentBatchIndex = nextBatchIndex;
      nextBatchIndex += 1;
      const { batch, batchType } = allBatches[currentBatchIndex];

      let processedBatch;

      try {
        processedBatch = await processExtractionBatch({
          batch,
          batchIndex: currentBatchIndex,
          batchType,
          totalBatches,
          isGemini,
          systemPrompts,
          apiUrl: settings.apiUrl.trim(),
          apiKey: resolveApiKey(settings),
          modelName: settings.modelName.trim(),
          pdfBase64,
          docText: documentText,
          reportProgress
        });
      } catch (error) {
        console.error(`Batch ${currentBatchIndex + 1} failed`, error);
        reportProgress(
          `Batch ${currentBatchIndex + 1} failed after retries: ${error.message}. Marking ${batch.length} indicators as not found.`
        );
        processedBatch = {
          batchIndex: currentBatchIndex,
          batchResults: batch.map(buildMissingResult),
          usage: { input_tokens: 0, output_tokens: 0 },
          batchCost: 0
        };
      }

      batchResults[processedBatch.batchIndex] = processedBatch.batchResults;
      totalInputTokens += processedBatch.usage.input_tokens;
      totalOutputTokens += processedBatch.usage.output_tokens;
      totalCost += processedBatch.batchCost;
      completedBatches += 1;

      finalResults = batchResults.flatMap((result) => result || []);
      onPartialResults?.(finalResults);

      reportProgress(
        `Completed ${completedBatches}/${totalBatches} batches...`,
        15 + Math.round((completedBatches / totalBatches) * 80)
      );
    }
  }

  if (concurrentBatches > 0) {
    await Promise.all(Array.from({ length: concurrentBatches }, () => runBatchWorker()));
    finalResults = batchResults.flatMap((result) => result || []);
  }

  const endTime = new Date();
  const durationMs = endTime - startTime;
  const duration = `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`;

  const extractionStats = {
    model: settings.modelName.trim(),
    selectedTypes: selectedIndicatorTypes.join(', '),
    startTime: startTime.toLocaleString(),
    endTime: endTime.toLocaleString(),
    duration,
    totalInputIndicators: requirements.length,
    totalIndicators: filteredRequirements.length,
    textCount: counts.textCount,
    numericCount: counts.numericCount,
    intensityCount: counts.intensityCount,
    currencyCount: counts.currencyCount,
    totalBatches,
    textBatches: allBatches.filter((item) => item.batchType === '文字型').length,
    numericBatches: allBatches.filter((item) => item.batchType === '数值型').length,
    intensityBatches: allBatches.filter((item) => item.batchType === '强度型').length,
    currencyBatches: allBatches.filter((item) => item.batchType === '货币型').length,
    totalInputTokens,
    totalOutputTokens,
    totalCost
  };

  reportProgress(
    `Extraction completed. Total: ${totalInputTokens + totalOutputTokens} tokens, Cost: $${totalCost.toFixed(4)}, Duration: ${duration}`,
    100
  );

  return {
    results: finalResults,
    stats: extractionStats
  };
}
