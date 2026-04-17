import {
  extractJsonCandidate,
  parsePromptIterationPageSpec,
  summarizeParsedJson
} from '../utils/promptIterationModel.js';
import { callLLMWithRetry } from './llmClient.js';
import { extractPdfPages, uint8ArrayToBase64 } from './pdfPageExtractor.js';

async function defaultFileToBase64(file, toBase64) {
  const arrayBuffer = await file.arrayBuffer();
  return toBase64(new Uint8Array(arrayBuffer));
}

export function normalizePromptIterationDraft(raw) {
  const draft = raw && typeof raw === 'object' ? raw : {};

  return {
    name: String(draft.name || ''),
    systemPrompt: String(draft.systemPrompt || ''),
    userPrompt: String(draft.userPrompt || ''),
    files: Array.isArray(draft.files)
      ? draft.files.map((item) => ({
          id: String(item?.id || ''),
          name: String(item?.name || ''),
          type: String(item?.type || 'application/pdf'),
          pageSpec: String(item?.pageSpec || '')
        }))
      : []
  };
}

export function clipPromptIterationHistory(history, limit = 20) {
  return Array.isArray(history) ? history.slice(0, limit) : [];
}

export async function runPromptIteration(input, deps = {}) {
  const {
    callLLMWithRetry: call = callLLMWithRetry,
    extractPdfPages: extractPages = extractPdfPages,
    uint8ArrayToBase64: toBase64 = uint8ArrayToBase64,
    fileToBase64 = (file) => defaultFileToBase64(file, toBase64),
    now = () => Date.now()
  } = deps;

  const results = [];

  for (const item of input.files) {
    const startedAt = now();
    const file = item?.file;
    const fileName = typeof file?.name === 'string' && file.name.trim() ? file.name : '';

    if (!file || !fileName) {
      results.push({
        fileId: item?.id,
        fileName,
        pageSpec: item?.pageSpec || '',
        resolvedPages: [],
        scopeLabel: '文件错误',
        status: 'error',
        errorMessage: '缺少 PDF 文件或文件名',
        rawResponse: '',
        parsedJson: null,
        jsonParseStatus: 'not_found',
        summaryText: '文件错误',
        usage: { input_tokens: 0, output_tokens: 0 },
        durationMs: now() - startedAt
      });
      continue;
    }

    const parsedPageSpec = parsePromptIterationPageSpec(item.pageSpec);

    if (!parsedPageSpec.valid) {
      results.push({
        fileId: item.id,
        fileName,
        pageSpec: item.pageSpec,
        resolvedPages: [],
        scopeLabel: '页码错误',
        status: 'error',
        errorMessage: parsedPageSpec.error,
        rawResponse: '',
        parsedJson: null,
        jsonParseStatus: 'not_found',
        summaryText: '页码错误',
        usage: { input_tokens: 0, output_tokens: 0 },
        durationMs: now() - startedAt
      });
      continue;
    }

    try {
      let pdfBase64 = await fileToBase64(file);
      let resolvedPages = [];
      let scopeLabel = '全文';

      if (parsedPageSpec.pages.length > 0) {
        const extracted = await extractPages(file, parsedPageSpec.pages, fileName);
        pdfBase64 = toBase64(extracted.pdfData);
        resolvedPages = parsedPageSpec.pages;
        scopeLabel = `指定页：${parsedPageSpec.normalized}`;
      }

      const response = await call({
        sysPrompt: input.systemPrompt,
        userPrompt: `${input.userPrompt}\n\n提取目标：${input.name}`,
        apiUrl: input.llmSettings.apiUrl,
        apiKey: input.llmSettings.apiKey,
        modelName: input.llmSettings.modelName,
        providerType: input.llmSettings.providerType,
        pdfBase64
      });

      const parsed = extractJsonCandidate(response.text);
      results.push({
        fileId: item.id,
        fileName,
        pageSpec: item.pageSpec,
        resolvedPages,
        scopeLabel,
        status: 'success',
        errorMessage: '',
        rawResponse: response.text,
        parsedJson: parsed.parsed,
        jsonParseStatus: parsed.status,
        summaryText: parsed.status === 'success' ? summarizeParsedJson(parsed.parsed) : '未解析出 JSON',
        usage: response.usage || { input_tokens: 0, output_tokens: 0 },
        durationMs: now() - startedAt
      });
    } catch (error) {
      results.push({
        fileId: item.id,
        fileName,
        pageSpec: item.pageSpec,
        resolvedPages: parsedPageSpec.pages,
        scopeLabel: parsedPageSpec.pages.length > 0 ? `指定页：${parsedPageSpec.normalized}` : '全文',
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
        rawResponse: '',
        parsedJson: null,
        jsonParseStatus: 'not_found',
        summaryText: '运行失败',
        usage: { input_tokens: 0, output_tokens: 0 },
        durationMs: now() - startedAt
      });
    }
  }

  return {
    createdAt: now(),
    name: input.name,
    systemPrompt: input.systemPrompt,
    userPrompt: input.userPrompt,
    modelName: input.llmSettings.modelName,
    providerType: input.llmSettings.providerType,
    results,
    summary: {
      total: results.length,
      successCount: results.filter((item) => item.status === 'success').length,
      errorCount: results.filter((item) => item.status === 'error').length
    }
  };
}
