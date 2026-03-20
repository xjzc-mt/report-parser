import * as XLSX from 'xlsx';

// Selectors
const pdfFileInput = document.getElementById('pdfFileInput');
const csvFileInput = document.getElementById('csvFileInput');
const pdfDropZone = document.getElementById('pdfDropZone');
const csvDropZone = document.getElementById('csvDropZone');
const pdfFileInfo = document.getElementById('pdfFileInfo');
const csvFileInfo = document.getElementById('csvFileInfo');
const startBtn = document.getElementById('startBtn');
const apiUrlInput = document.getElementById('apiUrl');
const apiKeyInput = document.getElementById('apiKey');
const modelNameInput = document.getElementById('modelName');
const batchSizeInput = document.getElementById('batchSize');
const maxConcurrencyInput = document.getElementById('maxConcurrency');
const indicatorTypeInputs = Array.from(document.querySelectorAll('input[name="indicatorTypes"]'));

// State
let pdfFile = null;
let csvFile = null;
let parsedRequirements = []; // Will hold normalized requirement objects
let extractedData = []; // Final output array
let filterOnlyFound = false; // Filter state
let extractionStats = {};    // Stats for Summary tab
const NOT_FOUND_VALUE = '未披露';
const PROCESSABLE_VALUE_TYPES = ['文字型', '数值型', '货币型', '强度型'];

// Helper to check if a text/num is valid (not N/A or empty)
function isValidValue(val) {
  if (!val) return false;
  const v = String(val).trim().toLowerCase();
  return v !== 'n/a' && v !== 'na' && v !== '-' && v !== '无' && v !== '未提及' && v !== '未找到' && v !== NOT_FOUND_VALUE;
}

function normalizeValueType(type) {
  const valueType = String(type || '').trim();
  if (valueType === '文本型' || valueType === '文字型' || valueType === '') {
    return '文字型';
  }
  if (valueType === '数值型' || valueType === '强度型' || valueType === '货币型') {
    return valueType;
  }
  return valueType || '文字型';
}

function getRequirementValueType(requirement) {
  return normalizeValueType(requirement.value_type || requirement.indicator_type || '');
}

function isTextType(type) {
  return normalizeValueType(type) === '文字型';
}

function isIntensityType(type) {
  return normalizeValueType(type) === '强度型';
}

function isCurrencyType(type) {
  return normalizeValueType(type) === '货币型';
}

function isNumericType(type) {
  const valueType = normalizeValueType(type);
  return valueType === '数值型' || valueType === '强度型' || valueType === '货币型';
}

function isResultFound(item) {
  if (isTextType(item.value_type || item.indicator_type)) {
    return isValidValue(item.text_value);
  }
  return isValidValue(item.num_value);
}

function normalizeRequirementRow(row) {
  return {
    value_type: getRequirementValueType(row),
    indicator_code: String(row.indicator_code || '').trim(),
    indicator_name: String(row.indicator_name || '').trim(),
    definition: String(row.definition || '').trim(),
    guidance: String(row.guidance || '').trim(),
    prompt: String(row.prompt || '').trim()
  };
}

function buildExportData(results) {
  return results
    .filter(isResultFound)
    .map(item => ({
      indicator_code: item.indicator_code || '',
      indicator_name: item.indicator_name || '',
      value_type: item.value_type || getRequirementValueType(item),
      year: item.year || '',
      text_value: item.text_value || '',
      num_value: item.num_value || '',
      unit: item.unit || '',
      currency: item.currency || '',
      numerator_unit: item.numerator_unit || '',
      denominator_unit: item.denominator_unit || '',
      pdf_numbers: item.pdf_numbers || ''
    }));
}

function getApiKey() {
  return apiKeyInput?.value?.trim() || import.meta.env.VITE_GEMINI_API_KEY || '';
}

function getBatchSize() {
  const batchSize = Number(batchSizeInput?.value || 100);
  return Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 100;
}

function getMaxConcurrency() {
  const maxConcurrency = Number(maxConcurrencyInput?.value || 5);
  return Number.isFinite(maxConcurrency) && maxConcurrency > 0 ? maxConcurrency : 5;
}

function getSelectedIndicatorTypes() {
  return indicatorTypeInputs
    .filter(input => input.checked)
    .map(input => normalizeValueType(input.value))
    .filter(type => PROCESSABLE_VALUE_TYPES.includes(type));
}

// Load environment variables if available
if (apiKeyInput && import.meta.env.VITE_GEMINI_API_KEY) {
  apiKeyInput.value = import.meta.env.VITE_GEMINI_API_KEY;
}

// File Handling Setup
function updateStartButton() {
  const hasKey = getApiKey();
  const hasModel = modelNameInput.value.trim() || "gemini-2.5-pro";
  const hasSelectedIndicatorType = getSelectedIndicatorTypes().length > 0;
  
  if (pdfFile && csvFile && hasKey && hasModel && hasSelectedIndicatorType) {
    startBtn.disabled = false;
  } else {
    startBtn.disabled = true;
  }
}

// Unified File Handler
function handleFile(file, type) {
  if (!file) return;
  console.log(`Handling ${type} file:`, file.name, file.type);

  const isPDF = type === 'pdf' && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
  const isExcel = type === 'csv' && (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls') || file.name.toLowerCase().endsWith('.csv'));

  if (isPDF) {
    pdfFile = file;
    pdfFileInfo.innerHTML = `✅ ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
    pdfFileInfo.classList.remove('hidden');
    pdfFileInfo.classList.add('success');
  } else if (isExcel) {
    csvFile = file;
    csvFileInfo.innerHTML = `✅ ${file.name}`;
    csvFileInfo.classList.remove('hidden');
    csvFileInfo.classList.add('success');
  } else {
    console.warn(`File rejected: ${file.name} is not a valid ${type}`);
    return;
  }
  updateStartButton();
}

// Event Listeners for file inputs
pdfFileInput.addEventListener('change', (e) => handleFile(e.target.files[0], 'pdf'));
csvFileInput.addEventListener('change', (e) => handleFile(e.target.files[0], 'csv'));

// Required config inputs check
apiUrlInput.addEventListener('input', updateStartButton);
modelNameInput.addEventListener('change', updateStartButton);
batchSizeInput?.addEventListener('change', updateStartButton);
maxConcurrencyInput?.addEventListener('change', updateStartButton);
indicatorTypeInputs.forEach(input => input.addEventListener('change', updateStartButton));

// Drag & Drop Logic
function setupDropZone(dropZone, fileInput, fileType) {
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, false);
  });

  let dragCounter = 0;

  dropZone.addEventListener('dragenter', (e) => {
    dragCounter++;
    dropZone.classList.add('drag-active');
  }, false);

  dropZone.addEventListener('dragleave', (e) => {
    dragCounter--;
    if (dragCounter === 0) {
      dropZone.classList.remove('drag-active');
    }
  }, false);

  dropZone.addEventListener('drop', (e) => {
    dragCounter = 0;
    dropZone.classList.remove('drag-active');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0], fileType);
      // Synchronize input element for consistency
      fileInput.files = files;
    }
  }, false);
}

setupDropZone(pdfDropZone, pdfFileInput, 'pdf');
setupDropZone(csvDropZone, csvFileInput, 'csv');

// Update Progress UI
function updateProgress(message, percentage) {
  const progressSection = document.getElementById('progressSection');
  const progressStatusText = document.getElementById('progressStatusText');
  const progressPercentage = document.getElementById('progressPercentage');
  const progressBar = document.getElementById('progressBar');
  const progressLog = document.getElementById('progressLog');

  progressSection.classList.remove('hidden');
  if (percentage >= 0) {
    progressStatusText.textContent = message;
    progressPercentage.textContent = `${percentage}%`;
    progressBar.style.width = `${percentage}%`;
  }

  const logEntry = document.createElement('p');
  logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  progressLog.appendChild(logEntry);
  progressLog.scrollTop = progressLog.scrollHeight;
}

// Process Excel file
function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', raw: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        // Force all cells as strings to preserve leading zeros
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' });
        resolve(jsonData);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

// Process PDF
async function parsePDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
  const numPages = pdf.numPages;
  const pagesText = [];

  for (let i = 1; i <= numPages; i++) {
    if (i % 10 === 0 || i === numPages) {
      updateProgress(`Extracting PDF text (Page ${i}/${numPages})...`, Math.round((i / numPages) * 15));
    }
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const strings = textContent.items.map(item => item.str);
    pagesText.push({ pageNumber: i, text: strings.join(' ') });
  }
  return pagesText;
}

// File to Base64 Utility
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
  });
}

// LLM Call Utility
async function callLLM(sysPrompt, userPrompt, apiUrl, apiKey, modelName, pdfBase64 = null) {
  const isGemini = apiUrl.includes('googleapis.com');
  let finalUrl = apiUrl;
  let requestBody = {};
  let headers = { 'Content-Type': 'application/json' };

  if (isGemini) {
    // Gemini API Request Format
    headers['x-goog-api-key'] = apiKey;
    if (!finalUrl.endsWith('generateContent')) {
        finalUrl = `${apiUrl.replace(/\/$/, '')}/models/${modelName}:generateContent`;
    }

    const contents = [
      {
        role: 'user',
        parts: [{ text: userPrompt }]
      }
    ];

    // Inject PDF if available
    if (pdfBase64) {
      contents[0].parts.unshift({
        inline_data: {
          mime_type: "application/pdf",
          data: pdfBase64
        }
      });
    }

    requestBody = {
      system_instruction: {
        parts: [{ text: sysPrompt }]
      },
      contents: contents,
      generationConfig: {
        response_mime_type: "application/json",
        temperature: 0.1
      }
    };
  } else {
    // OpenAI Compatible API Request Format
    headers['Authorization'] = `Bearer ${apiKey}`;
    requestBody = {
      model: modelName,
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    };
  }

  const response = await fetch(finalUrl, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`API Error: ${response.status} - ${errorData}`);
  }

  const data = await response.json();
  
  // Extract token usage
  let usage = { input_tokens: 0, output_tokens: 0 };
  
  if (isGemini) {
    // Gemini usageMetadata
    if (data.usageMetadata) {
      usage.input_tokens = data.usageMetadata.promptTokenCount || 0;
      usage.output_tokens = data.usageMetadata.candidatesTokenCount || 0;
    }
    // Gemini Response Parsing
    if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
        return { text: data.candidates[0].content.parts[0].text, usage };
    }
    throw new Error('Unexpected Gemini API response structure');
  } else {
    // OpenAI usage
    if (data.usage) {
      usage.input_tokens = data.usage.prompt_tokens || 0;
      usage.output_tokens = data.usage.completion_tokens || 0;
    }
    return { text: data.choices[0].message.content, usage };
  }
}

// Retry wrapper with exponential backoff
async function callLLMWithRetry(sysPrompt, userPrompt, apiUrl, apiKey, modelName, pdfBase64 = null, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await callLLM(sysPrompt, userPrompt, apiUrl, apiKey, modelName, pdfBase64);
    } catch (err) {
      lastError = err;
      const waitMs = Math.min(1000 * Math.pow(2, attempt), 16000);
      updateProgress(`API error (attempt ${attempt + 1}/${maxRetries}): ${err.message}. Retrying in ${waitMs / 1000}s...`, -1);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  throw lastError;
}

// Gemini 2.5 Pro pricing (per token)
const PRICING = {
  'gemini-2.5-pro': { input: 1.25 / 1_000_000, output: 10.0 / 1_000_000 },  // <=200k context
  'gemini-2.5-pro-large': { input: 2.50 / 1_000_000, output: 15.0 / 1_000_000 }, // >200k
  'gemini-3-pro-preview': { input: 2.00 / 1_000_000, output: 12.0 / 1_000_000 }, // <=200k context
  'gemini-3-pro-preview-large': { input: 4.00 / 1_000_000, output: 18.0 / 1_000_000 }, // >200k context
  'gemini-2.0-flash': { input: 0.10 / 1_000_000, output: 0.40 / 1_000_000 },
  'default': { input: 1.25 / 1_000_000, output: 10.0 / 1_000_000 }
};

function estimateCost(modelName, inputTokens, outputTokens) {
  const key = Object.keys(PRICING).find(k => modelName.includes(k)) || 'default';
  const p = PRICING[key];
  return inputTokens * p.input + outputTokens * p.output;
}

const ESG_EXPERT_SYSTEM_PROMPT = `# Role: ESG数据结构化提取专家

## Profile
- language: 中文
- description: 专注于从企业发布的PDF格式ESG报告、可持续发展报告及年度报告中，精准、系统化地提取超过700个结构化ESG相关指标的专业角色。所有提取内容严格保持原文不变，确保数据真实性和可追溯性。
- background: 具备企业社会责任（CSR）、环境社会治理（ESG）研究背景，熟悉国际与国内主流ESG披露框架（如GRI、SASB、TCFD、CASS-ESG、港交所ESG指引等），并掌握从非结构化文档中进行高精度信息提取的技术方法。
- personality: 严谨、细致、客观、注重合规性与数据完整性
- expertise: ESG指标体系、PDF文档解析、非结构化文本数据提取、自然语言理解、企业披露合规性分析
- target_audience: ESG评级机构、投资研究团队、企业可持续发展部门、监管机构、学术研究人员

## Skills

1. 高精度文档信息提取
   - PDF内容解析：能够处理扫描件、图文混合、表格嵌套等复杂PDF结构，准确提取文字、图表及附注内容
   - 多语言支持：支持中文简体/繁体、英文等多种语言报告的识别与提取
   - 表格与结构识别：精准识别报表、脚注、页眉页脚等非连续文本区域，保留原始格式逻辑
   - 上下文定位能力：根据用户提供的ESG指标定义，自动匹配报告中对应段落、表格或章节位置

2. 结构化数据映射与组织
   - 指标—内容映射：将用户定义的700+个ESG指标逐一对应至报告中的实际披露内容
   - 原文保留机制：所有提取数据均为原文摘录，不做任何改写、归纳或解释
   - 时间序列归集：自动识别并归类多年度数据，确保跨年信息可比对
   - 来源溯源标注：为每项提取的数据标注页码、章节标题、表格编号等来源信息，便于审计与验证

## Rules

1. 基本原则：
   - 忠于原文：所有提取内容必须与原始PDF报告中表述完全一致，禁止任何形式的改写、总结或语义转换
   - 完整覆盖：确保用户提供的每一个ESG指标均有系统的查找与响应，未找到时明确标注“未披露”
   - 可追溯性强：每条提取数据必须附带精确出处（如页码、章节名、图表编号）
   - 格式统一：输出结构遵循预定义的结构化模板（如JSON/CSV），便于后续导入数据库或分析系统

2. 行为准则：
   - 指标逐项响应：对用户提供的每个ESG指标进行独立搜索和记录，不得遗漏或合并处理
   - 上下文完整摘录：若指标相关表述存在于段落中，则摘录完整句子，避免断章取义
   - 多源信息整合：如同一指标在多处出现（如正文与附表），应全部列出并标注不同来源
   - 模糊匹配记录：当内容疑似相关但不完全匹配时，标注“疑似匹配”并附原文供人工复核

3. 限制条件：
   - 唯一结果输出：同一个指标仅输出一个结果。若报告中同一指标存在多处披露，优先选取最完整、最规范、最贴合指标定义的内容；不拆分、不罗列多条记录。
   - 不进行主观判断：不评估企业披露质量、不推断缺失数据、不对内容真实性负责
   - 不处理图像内容：若关键信息仅以图片形式呈现（如图表截图），标注“图像内容无法解析”
   - 不执行翻译任务：仅提取原始语言文本，不提供翻译服务
   - 不生成新数据：仅限于已有披露内容的提取，禁止插值、估算或补全

## Workflows
- 目标: 从PDF格式的企业报告中，系统化提取用户定义的700+项ESG指标，并以结构化、可追溯、原文保留的方式输出
- 步骤 1: 接收用户提供的ESG指标清单及其详细定义，建立标准化提取目录
- 步骤 2: 导入目标企业的PDF报告文件，执行文档解析与内容索引，构建全文可检索数据库
- 步骤 3: 针对每个指标，结合关键词匹配、上下文识别与语义定位，在报告中精准定位相关内容，执行原文摘录并标注来源
- 预期结果: 输出包含所有指标提取结果的结构化数据集，每条记录包含指标名称、原文内容、页码、报告年份等字段，缺失项标注“未披露”

## Initialization
作为ESG数据结构化提取专家，你必须遵守上述Rules，按照Workflows执行任务。`;

function buildExtractionSystemPrompt({ isGemini, batchType }) {
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

function getDefaultResultByType(valueType) {
  return {
    text_value: isTextType(valueType) ? NOT_FOUND_VALUE : '',
    num_value: isNumericType(valueType) ? NOT_FOUND_VALUE : '',
    unit: isNumericType(valueType) ? NOT_FOUND_VALUE : '',
    currency: isCurrencyType(valueType) ? NOT_FOUND_VALUE : '',
    numerator_unit: isIntensityType(valueType) ? NOT_FOUND_VALUE : '',
    denominator_unit: isIntensityType(valueType) ? NOT_FOUND_VALUE : '',
    pdf_numbers: NOT_FOUND_VALUE
  };
}

function getResultsArray(parsedData) {
  if (Array.isArray(parsedData)) {
    return parsedData;
  }
  if (parsedData.results && Array.isArray(parsedData.results)) {
    return parsedData.results;
  }
  if (parsedData.result && Array.isArray(parsedData.result)) {
    return parsedData.result;
  }
  return Object.values(parsedData).find(value => Array.isArray(value)) || [];
}

function buildMissingResult(req) {
  const valueType = getRequirementValueType(req);
  return {
    indicator_code: req.indicator_code,
    indicator_name: req.indicator_name || '',
    value_type: valueType,
    indicator_type: valueType,
    year: '',
    ...getDefaultResultByType(valueType)
  };
}

function mapBatchResults(batch, resultsArray) {
  const mappedResults = [];

  batch.forEach(req => {
    const reqCodeStr = String(req.indicator_code || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

    const matchingResults = resultsArray.filter(result => {
      const aiCodeRaw = result.indicator_code || result.indicatorCode || result.code || result.id || result.ID || result.Code || '';
      const aiCodeStr = String(aiCodeRaw).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      return aiCodeStr !== '' && (aiCodeStr === reqCodeStr || reqCodeStr.endsWith(aiCodeStr) || aiCodeStr.endsWith(reqCodeStr));
    });

    const valueType = getRequirementValueType(req);

    if (matchingResults.length === 0) {
      console.warn(`No match found for indicator ${req.indicator_code} in AI response`);
      mappedResults.push(buildMissingResult(req));
      return;
    }

    matchingResults.forEach(found => {
      const findKey = (obj, search) => {
        const key = Object.keys(obj).find(k => k.toLowerCase() === search.toLowerCase());
        return key ? obj[key] : null;
      };

      const textValue = findKey(found, 'text_value') || findKey(found, 'textValue') || findKey(found, 'text') || findKey(found, 'value') || NOT_FOUND_VALUE;
      const numValue = findKey(found, 'num_value') || findKey(found, 'numValue') || findKey(found, 'value') || findKey(found, 'number') || NOT_FOUND_VALUE;
      const year = findKey(found, 'year') || findKey(found, 'Year') || '';
      const unit = findKey(found, 'unit') || findKey(found, 'Unit') || NOT_FOUND_VALUE;
      const currency = findKey(found, 'currency') || findKey(found, 'Currency') || findKey(found, 'currency_code') || findKey(found, 'currencyCode') || NOT_FOUND_VALUE;
      const numeratorUnit = findKey(found, 'numerator_unit') || findKey(found, 'numeratorUnit') || NOT_FOUND_VALUE;
      const denominatorUnit = findKey(found, 'denominator_unit') || findKey(found, 'denominatorUnit') || NOT_FOUND_VALUE;
      const pdfNumbers = findKey(found, 'pdf_numbers') || findKey(found, 'pdfNumbers') || findKey(found, 'page_numbers') || findKey(found, 'pageNumbers') || findKey(found, 'page_number') || findKey(found, 'pageNumber') || findKey(found, 'page') || NOT_FOUND_VALUE;
      const defaultResult = getDefaultResultByType(valueType);

      mappedResults.push({
        indicator_code: req.indicator_code,
        indicator_name: req.indicator_name || '',
        value_type: valueType,
        indicator_type: valueType,
        year,
        text_value: isTextType(valueType) ? textValue : defaultResult.text_value,
        num_value: isNumericType(valueType) ? numValue : defaultResult.num_value,
        unit: isNumericType(valueType) ? unit : defaultResult.unit,
        currency: isCurrencyType(valueType) ? currency : defaultResult.currency,
        numerator_unit: isIntensityType(valueType) ? numeratorUnit : defaultResult.numerator_unit,
        denominator_unit: isIntensityType(valueType) ? denominatorUnit : defaultResult.denominator_unit,
        pdf_numbers: pdfNumbers
      });
    });
  });

  return mappedResults;
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
  docText
}) {
  const normalizedBatchType = normalizeValueType(batchType);
  const typeLabel = normalizedBatchType === '文字型' ? 'Text' : normalizedBatchType;
  updateProgress(`Starting batch ${batchIndex + 1}/${totalBatches} (${typeLabel}, ${batch.length} indicators)...`, -1);

  const sysPrompt = systemPrompts[normalizedBatchType];
  const reqText = batch.map(r =>
    `Indicator Code: ${r.indicator_code}\nIndicator Name: ${r.indicator_name || ''}\nValue Type: ${getRequirementValueType(r)}\nDefinition: ${r.definition || ''}\nGuidance: ${r.guidance || 'None'}\nPrompt: ${r.prompt || 'None'}`
  ).join('\n---\n');

  const taskPrompt = isGemini
    ? `Requirements:\n<requirements>\n${reqText}\n</requirements>\n\nPlease extract the requested info from the attached PDF. Remember: pdf_numbers = physical PDF page numbers, NOT content page numbers.`
    : `Document:\n<document>\n${docText}\n</document>\n\nRequirements:\n<requirements>\n${reqText}\n</requirements>\n\nPlease return the structured JSON. Remember: pdf_numbers = [Page X] markers.`;

  const userPrompt = `Global Instructions:\n<global_instructions>\n${ESG_EXPERT_SYSTEM_PROMPT}\n</global_instructions>\n\nTask Instructions:\n<task_instructions>\n${taskPrompt}\n</task_instructions>`;

  const result = await callLLMWithRetry(sysPrompt, userPrompt, apiUrl, apiKey, modelName, pdfBase64);
  const batchCost = estimateCost(modelName, result.usage.input_tokens, result.usage.output_tokens);

  updateProgress(`Batch ${batchIndex + 1} tokens: ${result.usage.input_tokens} in / ${result.usage.output_tokens} out | Cost: $${batchCost.toFixed(4)}`, -1);

  try {
    const cleanJson = result.text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanJson);
    const resultsArray = getResultsArray(parsedData);

    console.log(`Batch ${batchIndex + 1} parsed results count: ${resultsArray.length}`);

    return {
      batchIndex,
      batchResults: mapBatchResults(batch, resultsArray),
      usage: result.usage,
      batchCost
    };
  } catch (error) {
    console.warn(`Failed to parse batch ${batchIndex + 1} JSON`, error);
    updateProgress(`Warning: batch ${batchIndex + 1} parse failed, continuing...`, -1);

    return {
      batchIndex,
      batchResults: [],
      usage: result.usage,
      batchCost
    };
  }
}

// Render Results Table (mixed-type support)
function renderResults(results) {
  const thead = document.getElementById('resultsTableHead');
  const tbody = document.getElementById('resultsTableBody');
  
  // Unified headers for mixed-type results
  thead.innerHTML = `<tr>
    <th>Indicator Code</th>
    <th>Indicator Name</th>
    <th>Value Type</th>
    <th>Year</th>
    <th>Text Value</th>
    <th>Num Value</th>
    <th>Unit</th>
    <th>Currency</th>
    <th>Numerator Unit</th>
    <th>Denominator Unit</th>
    <th>PDF Numbers</th>
  </tr>`;
  
  tbody.innerHTML = '';
  const filtered = filterOnlyFound ? results.filter(isResultFound) : results;
  
  filtered.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.indicator_code || ''}</td>
      <td>${item.indicator_name || ''}</td>
      <td>${item.value_type || item.indicator_type || ''}</td>
      <td>${item.year || ''}</td>
      <td>${item.text_value || ''}</td>
      <td>${item.num_value || ''}</td>
      <td>${item.unit || ''}</td>
      <td>${item.currency || ''}</td>
      <td>${item.numerator_unit || ''}</td>
      <td>${item.denominator_unit || ''}</td>
      <td>${item.pdf_numbers || ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Filter toggle handler
document.getElementById('filterResultsBtn').addEventListener('change', (e) => {
  filterOnlyFound = e.target.checked;
  renderResults(extractedData);
});

// Export Excel handler
document.getElementById('exportCsvBtn').addEventListener('click', () => {
  if (extractedData.length === 0) return;
  
  const exportData = buildExportData(extractedData);
  
  if (exportData.length === 0) {
    alert('No valid results to export.');
    return;
  }
  
  // Create worksheets
  const ws = XLSX.utils.json_to_sheet(exportData, { cellDates: true });
  
  // Force indicator_code column to text format to preserve leading zeros
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let row = range.s.r + 1; row <= range.e.r; row++) {
    const cellRef = XLSX.utils.encode_cell({ r: row, c: 0 });
    if (ws[cellRef]) {
      ws[cellRef].t = 's';
      ws[cellRef].z = '@';
    }
  }
  
  // Build Summary sheet
  const summaryData = [
    ['Extraction Summary', ''],
    ['', ''],
    ['Model', extractionStats.model || 'N/A'],
    ['Selected Types', extractionStats.selectedTypes || 'N/A'],
    ['Start Time', extractionStats.startTime || 'N/A'],
    ['End Time', extractionStats.endTime || 'N/A'],
    ['Total Duration', extractionStats.duration || 'N/A'],
    ['', ''],
    ['Total Indicators (Excel)', extractionStats.totalInputIndicators || 0],
    ['Total Indicators (Processed)', extractionStats.totalIndicators || 0],
    ['  - Text Type', extractionStats.textCount || 0],
    ['  - Numeric Type', extractionStats.numericCount || 0],
    ['  - Intensity Type', extractionStats.intensityCount || 0],
    ['  - Currency Type', extractionStats.currencyCount || 0],
    ['Extracted (Found)', exportData.length],
    ['Not Found', (extractionStats.totalIndicators || 0) - exportData.length],
    ['', ''],
    ['Total Batches', extractionStats.totalBatches || 0],
    ['  - Text Batches', extractionStats.textBatches || 0],
    ['  - Numeric Batches', extractionStats.numericBatches || 0],
    ['  - Intensity Batches', extractionStats.intensityBatches || 0],
    ['  - Currency Batches', extractionStats.currencyBatches || 0],
    ['', ''],
    ['Input Tokens', extractionStats.totalInputTokens || 0],
    ['Output Tokens', extractionStats.totalOutputTokens || 0],
    ['Total Tokens', (extractionStats.totalInputTokens || 0) + (extractionStats.totalOutputTokens || 0)],
    ['Estimated Cost (USD)', `$${(extractionStats.totalCost || 0).toFixed(4)}`],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary['!cols'] = [{ wch: 28 }, { wch: 35 }];
  
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Results');
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
  XLSX.writeFile(wb, `extraction_results_${new Date().toISOString().split('T')[0]}.xlsx`);
});

// Main execution process
startBtn.addEventListener('click', async () => {
  try {
    startBtn.disabled = true;
    const progressBar = document.getElementById('progressBar');
    const resultsPanel = document.getElementById('resultsPanel');
    
    progressBar.classList.add('loading');
    progressBar.style.background = '';
    resultsPanel.classList.add('hidden');
    document.getElementById('resultsTableBody').innerHTML = '';
    extractedData = [];
    
    const startTime = new Date();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;
    
    updateProgress('Starting file processing...', 0);
    
    // 1. Parse CSV
    updateProgress('Parsing requirements Excel...', 2);
    const requirements = (await parseExcel(csvFile)).map(normalizeRequirementRow);
    parsedRequirements = requirements;
    const selectedIndicatorTypes = getSelectedIndicatorTypes();
    if (selectedIndicatorTypes.length === 0) {
      throw new Error('Please select at least one indicator type to process.');
    }

    const selectedTypeSet = new Set(selectedIndicatorTypes);
    const filteredRequirements = requirements.filter(requirement =>
      selectedTypeSet.has(getRequirementValueType(requirement))
    );

    if (filteredRequirements.length === 0) {
      throw new Error(`No requirements match selected types: ${selectedIndicatorTypes.join(', ')}`);
    }

    console.log(`Loaded ${requirements.length} requirements, processing ${filteredRequirements.length}`);
    updateProgress(`Loaded ${requirements.length} requirements, processing ${filteredRequirements.length} across ${selectedIndicatorTypes.join(', ')}`, 3);
    
    const isGemini = apiUrlInput.value.includes('googleapis.com');
    let pdfBase64 = null;
    let docText = "";

    if (isGemini) {
      updateProgress('Converting PDF for Gemini native extraction...', 5);
      pdfBase64 = await fileToBase64(pdfFile);
      updateProgress('Gemini preparation completed.', 10);
    } else {
      updateProgress('Parsing PDF document locally...', 5);
      const pdfPagesData = await parsePDF(pdfFile);
      docText = pdfPagesData.map(p => `[Page ${p.pageNumber}]\n${p.text}`).join('\n\n');
      console.log(`Loaded ${pdfPagesData.length} PDF pages`);
      updateProgress('Local parsing completed.', 10);
    }
    
    updateProgress('Preparing AI extraction...', 12);
    
    // 3. Group requirements by type
    let finalResults = [];
    
    const textReqs = filteredRequirements.filter(r => isTextType(r.value_type));
    const numericReqs = filteredRequirements.filter(r => normalizeValueType(r.value_type) === '数值型');
    const intensityReqs = filteredRequirements.filter(r => isIntensityType(r.value_type));
    const currencyReqs = filteredRequirements.filter(r => isCurrencyType(r.value_type));
    
    const configuredBatchSize = getBatchSize();
    
    // Build typed batches: [{ batch, batchType, batchSize }]
    const allBatches = [];
    for (let i = 0; i < textReqs.length; i += configuredBatchSize) {
      allBatches.push({ batch: textReqs.slice(i, i + configuredBatchSize), batchType: '文字型' });
    }
    for (let i = 0; i < numericReqs.length; i += configuredBatchSize) {
      allBatches.push({ batch: numericReqs.slice(i, i + configuredBatchSize), batchType: '数值型' });
    }
    for (let i = 0; i < intensityReqs.length; i += configuredBatchSize) {
      allBatches.push({ batch: intensityReqs.slice(i, i + configuredBatchSize), batchType: '强度型' });
    }
    for (let i = 0; i < currencyReqs.length; i += configuredBatchSize) {
      allBatches.push({ batch: currencyReqs.slice(i, i + configuredBatchSize), batchType: '货币型' });
    }
    
    const totalBatches = allBatches.length;
    const maxConcurrentBatches = getMaxConcurrency();
    const concurrentBatches = totalBatches > 0 ? Math.min(maxConcurrentBatches, totalBatches) : 0;
    updateProgress(`Split into ${totalBatches} batches with batch size ${configuredBatchSize} (${textReqs.length} text, ${numericReqs.length} numeric, ${intensityReqs.length} intensity, ${currencyReqs.length} currency)`, 13);
    if (concurrentBatches > 0) {
      updateProgress(`Running up to ${concurrentBatches} requests in parallel...`, 14);
    }
    
    // Type-specific system prompts
    const systemPrompts = {
      '文字型': buildExtractionSystemPrompt({ isGemini, batchType: '文字型' }),
      '数值型': buildExtractionSystemPrompt({ isGemini, batchType: '数值型' }),
      '强度型': buildExtractionSystemPrompt({ isGemini, batchType: '强度型' }),
      '货币型': buildExtractionSystemPrompt({ isGemini, batchType: '货币型' })
    };
    
    // Process Batches with bounded parallelism
    const batchResults = new Array(totalBatches);
    let nextBatchIndex = 0;
    let completedBatches = 0;

    async function runBatchWorker() {
      while (nextBatchIndex < totalBatches) {
        const currentBatchIndex = nextBatchIndex++;
        const { batch, batchType } = allBatches[currentBatchIndex];

        const processedBatch = await processExtractionBatch({
          batch,
          batchIndex: currentBatchIndex,
          batchType,
          totalBatches,
          isGemini,
          systemPrompts,
          apiUrl: apiUrlInput.value.trim(),
          apiKey: getApiKey(),
          modelName: modelNameInput.value.trim(),
          pdfBase64,
          docText
        });

        batchResults[processedBatch.batchIndex] = processedBatch.batchResults;
        totalInputTokens += processedBatch.usage.input_tokens;
        totalOutputTokens += processedBatch.usage.output_tokens;
        totalCost += processedBatch.batchCost;
        completedBatches += 1;

        finalResults = batchResults.flatMap(result => result || []);
        extractedData = finalResults;
        resultsPanel.classList.remove('hidden');
        renderResults(finalResults);

        updateProgress(
          `Completed ${completedBatches}/${totalBatches} batches...`,
          15 + Math.round((completedBatches / totalBatches) * 80)
        );
      }
    }

    if (concurrentBatches > 0) {
      await Promise.all(Array.from({ length: concurrentBatches }, () => runBatchWorker()));
      finalResults = batchResults.flatMap(result => result || []);
    }
    
    const endTime = new Date();
    const durationMs = endTime - startTime;
    const durationStr = `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`;
    
    // Save stats for Summary tab
    const textBatchCount = allBatches.filter(b => b.batchType === '文字型').length;
    const numericBatchCount = allBatches.filter(b => b.batchType === '数值型').length;
    const intensityBatchCount = allBatches.filter(b => b.batchType === '强度型').length;
    const currencyBatchCount = allBatches.filter(b => b.batchType === '货币型').length;
    extractionStats = {
      model: modelNameInput.value.trim(),
      selectedTypes: selectedIndicatorTypes.join(', '),
      startTime: startTime.toLocaleString(),
      endTime: endTime.toLocaleString(),
      duration: durationStr,
      totalInputIndicators: requirements.length,
      totalIndicators: filteredRequirements.length,
      textCount: textReqs.length,
      numericCount: numericReqs.length,
      intensityCount: intensityReqs.length,
      currencyCount: currencyReqs.length,
      totalBatches: totalBatches,
      textBatches: textBatchCount,
      numericBatches: numericBatchCount,
      intensityBatches: intensityBatchCount,
      currencyBatches: currencyBatchCount,
      totalInputTokens,
      totalOutputTokens,
      totalCost
    };
    
    updateProgress(`Extraction completed. Total: ${totalInputTokens + totalOutputTokens} tokens, Cost: $${totalCost.toFixed(4)}, Duration: ${durationStr}`, 100);
    progressBar.classList.remove('loading');
    startBtn.disabled = false;
    extractedData = finalResults;
    
    resultsPanel.classList.remove('hidden');
    resultsPanel.scrollIntoView({ behavior: 'smooth' });
    
  } catch (err) {
    console.error(err);
    updateProgress(`Error: ${err.message}`, 100);
    document.getElementById('progressBar').style.background = 'var(--error)';
    document.getElementById('progressBar').classList.remove('loading');
    startBtn.disabled = false;
  }
});
