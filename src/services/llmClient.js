import { ESG_EXPERT_SYSTEM_PROMPT, NOT_FOUND_VALUE, PRICING } from '../constants/extraction.js';
import { normalizeValueType } from '../utils/extraction.js';

export function estimateCost(modelName, inputTokens, outputTokens) {
  const key = Object.keys(PRICING).find((candidate) => modelName.includes(candidate)) || 'default';
  const pricing = PRICING[key];
  return inputTokens * pricing.input + outputTokens * pricing.output;
}

export async function callLLM({ sysPrompt, userPrompt, apiUrl, apiKey, modelName, pdfBase64 = null }) {
  const isGemini = apiUrl.includes('googleapis.com');
  let finalUrl = apiUrl;
  let requestBody = {};
  const headers = { 'Content-Type': 'application/json' };

  if (isGemini) {
    headers['x-goog-api-key'] = apiKey;
    if (!finalUrl.endsWith('generateContent')) {
      finalUrl = `${apiUrl.replace(/\/$/, '')}/models/${modelName}:generateContent`;
    }

    const contents = [{ role: 'user', parts: [{ text: userPrompt }] }];

    if (pdfBase64) {
      contents[0].parts.unshift({
        inline_data: {
          mime_type: 'application/pdf',
          data: pdfBase64
        }
      });
    }

    requestBody = {
      system_instruction: { parts: [{ text: sysPrompt }] },
      contents,
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0.1
      }
    };
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
    requestBody = {
      model: modelName,
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    };
  }

  const response = await fetch(finalUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const usage = { input_tokens: 0, output_tokens: 0 };

  if (isGemini) {
    if (data.usageMetadata) {
      usage.input_tokens = data.usageMetadata.promptTokenCount || 0;
      usage.output_tokens = data.usageMetadata.candidatesTokenCount || 0;
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Unexpected Gemini API response structure');
    }
    return { text, usage };
  }

  if (data.usage) {
    usage.input_tokens = data.usage.prompt_tokens || 0;
    usage.output_tokens = data.usage.completion_tokens || 0;
  }

  return { text: data.choices?.[0]?.message?.content || '', usage };
}

export async function callLLMWithRetry(params, onProgress, maxRetries = 3) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      return await callLLM(params);
    } catch (error) {
      lastError = error;
      const waitMs = Math.min(1000 * 2 ** attempt, 16000);
      onProgress?.(`API error (attempt ${attempt + 1}/${maxRetries}): ${error.message}. Retrying in ${waitMs / 1000}s...`, -1);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError;
}

export function buildExtractionSystemPrompt({ isGemini, batchType }) {
  const normalizedBatchType = normalizeValueType(batchType);
  const isTextBatch = normalizedBatchType === '文字型';
  const pageRule = isGemini
    ? '- "pdf_numbers" MUST be the physical PDF page number(s) (the page index in the PDF file), NOT any page number printed in the document content.'
    : '- "pdf_numbers" refers to the [Page X] markers in the document, NOT any page number printed in the content.';

  let fieldRule = '- Extract the text and put it in "text_value".';
  let schema = `{
  "results": [
    {
      "indicator_code": "code matching requirement",
      "year": "2024",
      "text_value": "extracted text. Output '${NOT_FOUND_VALUE}' if not found.",
      "pdf_numbers": "page reference(s). Output '${NOT_FOUND_VALUE}' if not found."
    }
  ]
}`;

  if (normalizedBatchType === '数值型') {
    fieldRule = '- Extract the number in "num_value" and the unit in "unit".';
    schema = `{
  "results": [
    {
      "indicator_code": "code matching requirement",
      "year": "2024",
      "num_value": "extracted number. Output '${NOT_FOUND_VALUE}' if not found.",
      "unit": "unit of the value (e.g. %, tonnes, MWh). Output '${NOT_FOUND_VALUE}' if not found.",
      "pdf_numbers": "page reference(s). Output '${NOT_FOUND_VALUE}' if not found."
    }
  ]
}`;
  } else if (normalizedBatchType === '货币型') {
    fieldRule = '- Extract the number in "num_value", the reporting unit in "unit", and the currency in "currency".';
    schema = `{
  "results": [
    {
      "indicator_code": "code matching requirement",
      "year": "2024",
      "num_value": "extracted number. Output '${NOT_FOUND_VALUE}' if not found.",
      "unit": "reporting unit such as million/billion if present. Output '${NOT_FOUND_VALUE}' if not found.",
      "currency": "currency code or symbol from the document. Output '${NOT_FOUND_VALUE}' if not found.",
      "pdf_numbers": "page reference(s). Output '${NOT_FOUND_VALUE}' if not found."
    }
  ]
}`;
  } else if (normalizedBatchType === '强度型') {
    fieldRule = '- Extract the number in "num_value", and separately extract "numerator_unit" and "denominator_unit". If a combined unit is clearly shown, also put it in "unit".';
    schema = `{
  "results": [
    {
      "indicator_code": "code matching requirement",
      "year": "2024",
      "num_value": "extracted number. Output '${NOT_FOUND_VALUE}' if not found.",
      "unit": "combined unit if explicitly shown. Output '${NOT_FOUND_VALUE}' if not found.",
      "numerator_unit": "unit in the numerator. Output '${NOT_FOUND_VALUE}' if not found.",
      "denominator_unit": "unit in the denominator. Output '${NOT_FOUND_VALUE}' if not found.",
      "pdf_numbers": "page reference(s). Output '${NOT_FOUND_VALUE}' if not found."
    }
  ]
}`;
  }

  return `${ESG_EXPERT_SYSTEM_PROMPT}

## Task Instructions
You are extracting ${isTextBatch ? 'TEXT' : normalizedBatchType} ESG requirements from the provided report.

IMPORTANT RULES:
${pageRule}
- If an indicator has values for MULTIPLE YEARS, return SEPARATE entries for each year with the "year" field filled.
${fieldRule}
- For each indicator, strictly follow its "Prompt" field as an additional extraction instruction.
- For this application, if an indicator is not found, output "${NOT_FOUND_VALUE}".

Output STRICTLY in JSON format:
${schema}`;
}

export { ESG_EXPERT_SYSTEM_PROMPT };
