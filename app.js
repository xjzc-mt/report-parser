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

// State
let pdfFile = null;
let csvFile = null;
let parsedRequirements = []; // Will hold objects { indicator_code, definition, guidance }
let extractedData = []; // Final output array
let filterOnlyFound = false; // Filter state
let extractionStats = {};    // Stats for Summary tab

// Helper to check if a text/num is valid (not N/A or empty)
function isValidValue(val) {
  if (!val) return false;
  const v = String(val).trim().toLowerCase();
  return v !== 'n/a' && v !== 'na' && v !== '-' && v !== '无' && v !== '未提及' && v !== '未找到';
}

// Normalize indicator type (Excel may use 文字型 or 文本型)
function isTextType(type) {
  const t = (type || '').trim();
  return t === '文本型' || t === '文字型' || t === '';
}
function isNumericType(type) {
  const t = (type || '').trim();
  return t === '数值型' || t === '强度型';
}

// Load environment variables if available
if (import.meta.env.VITE_GEMINI_API_KEY) {
  apiKeyInput.value = import.meta.env.VITE_GEMINI_API_KEY;
}

// File Handling Setup
function updateStartButton() {
  const hasKey = apiKeyInput.value.trim() || import.meta.env.VITE_GEMINI_API_KEY;
  const hasModel = modelNameInput.value.trim() || "gemini-2.5-pro";
  
  if (pdfFile && csvFile && hasKey && hasModel) {
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

// Required text inputs check 
[apiKeyInput, modelNameInput, apiUrlInput].forEach(input => {
  input.addEventListener('input', updateStartButton);
});

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
        parts: { text: sysPrompt }
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
  'gemini-2.0-flash': { input: 0.10 / 1_000_000, output: 0.40 / 1_000_000 },
  'default': { input: 1.25 / 1_000_000, output: 10.0 / 1_000_000 }
};

function estimateCost(modelName, inputTokens, outputTokens) {
  const key = Object.keys(PRICING).find(k => modelName.includes(k)) || 'default';
  const p = PRICING[key];
  return inputTokens * p.input + outputTokens * p.output;
}

// Render Results Table (mixed-type support)
function renderResults(results) {
  const thead = document.getElementById('resultsTableHead');
  const tbody = document.getElementById('resultsTableBody');
  
  // Unified headers for mixed-type results
  thead.innerHTML = `<tr>
    <th>Indicator Code</th>
    <th>Indicator Name</th>
    <th>Type</th>
    <th>Year</th>
    <th>Text Value</th>
    <th>Num Value</th>
    <th>Unit</th>
    <th>Page(s)</th>
  </tr>`;
  
  tbody.innerHTML = '';
  const filtered = filterOnlyFound
    ? results.filter(item => {
        if (isTextType(item.indicator_type)) {
          return isValidValue(item.text_value);
        }
        return isValidValue(item.num_value);
      })
    : results;
  
  filtered.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.indicator_code || ''}</td>
      <td>${item.indicator_name || ''}</td>
      <td>${item.indicator_type || ''}</td>
      <td>${item.year || ''}</td>
      <td>${item.text_value || ''}</td>
      <td>${item.num_value || ''}</td>
      <td>${item.unit || ''}</td>
      <td>${item.page_number || ''}</td>
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
  
  const exportData = extractedData.filter(item => {
    if (isTextType(item.indicator_type)) {
      return isValidValue(item.text_value);
    }
    return isValidValue(item.num_value);
  });
  
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
    ['Start Time', extractionStats.startTime || 'N/A'],
    ['End Time', extractionStats.endTime || 'N/A'],
    ['Total Duration', extractionStats.duration || 'N/A'],
    ['', ''],
    ['Total Indicators (Input)', extractionStats.totalIndicators || 0],
    ['  - Text Type', extractionStats.textCount || 0],
    ['  - Numeric/Intensity Type', extractionStats.numCount || 0],
    ['Extracted (Found)', exportData.length],
    ['Not Found', (extractionStats.totalIndicators || 0) - exportData.length],
    ['', ''],
    ['Total Batches', extractionStats.totalBatches || 0],
    ['  - Text Batches', extractionStats.textBatches || 0],
    ['  - Numeric Batches', extractionStats.numBatches || 0],
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
    const requirements = await parseExcel(csvFile);
    console.log(`Loaded ${requirements.length} requirements`);
    
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
    
    const textReqs = requirements.filter(r => isTextType(r.indicator_type));
    const numReqs = requirements.filter(r => isNumericType(r.indicator_type));
    
    const TEXT_BATCH = 100;
    const NUM_BATCH = 200;
    
    // Build typed batches: [{ batch, batchType, batchSize }]
    const allBatches = [];
    for (let i = 0; i < textReqs.length; i += TEXT_BATCH) {
      allBatches.push({ batch: textReqs.slice(i, i + TEXT_BATCH), batchType: '文本型' });
    }
    for (let i = 0; i < numReqs.length; i += NUM_BATCH) {
      allBatches.push({ batch: numReqs.slice(i, i + NUM_BATCH), batchType: '数值型' });
    }
    
    const totalBatches = allBatches.length;
    updateProgress(`Split into ${totalBatches} batches (${textReqs.length} text, ${numReqs.length} numeric/intensity)`, 13);
    
    // Type-specific system prompts
    const textSysPrompt = isGemini
      ? `You are an expert data extraction assistant. I have provided a PDF document and a list of TEXT extraction requirements.

IMPORTANT RULES:
- "page_number" MUST be the physical PDF page number (the page index in the PDF file), NOT any page number printed in the document content.
- If an indicator has values for MULTIPLE YEARS, return SEPARATE entries for each year with the "year" field filled.
- Extract the text and put it in "text_value".

Output STRICTLY in JSON format:
{
  "results": [
    {
      "indicator_code": "code matching requirement",
      "year": "2024",
      "text_value": "extracted text. Output 'N/A' if not found.",
      "page_number": "physical PDF page number. Output 'N/A' if not found."
    }
  ]
}
If an indicator is not found, output a single entry with text_value as 'N/A'.`
      : `You are an expert data extraction assistant. I will provide a document with page markers [Page X], and a list of TEXT extraction requirements.

IMPORTANT RULES:
- "page_number" refers to the [Page X] markers in the document, NOT any page number printed in the content.
- If an indicator has values for MULTIPLE YEARS, return SEPARATE entries for each year with the "year" field filled.
- Extract the text and put it in "text_value".

Output STRICTLY in JSON format:
{
  "results": [
    {
      "indicator_code": "code matching requirement",
      "year": "2024",
      "text_value": "extracted text. Output 'N/A' if not found.",
      "page_number": "page number from [Page X] markers. Output 'N/A' if not found."
    }
  ]
}
If an indicator is not found, output a single entry with text_value as 'N/A'.`;

    const numSysPrompt = isGemini
      ? `You are an expert data extraction assistant. I have provided a PDF document and a list of NUMERIC/INTENSITY extraction requirements.

IMPORTANT RULES:
- "page_number" MUST be the physical PDF page number (the page index in the PDF file), NOT any page number printed in the document content.
- If an indicator has values for MULTIPLE YEARS, return SEPARATE entries for each year with the "year" field filled.
- Extract the number in "num_value" and the unit in "unit".

Output STRICTLY in JSON format:
{
  "results": [
    {
      "indicator_code": "code matching requirement",
      "year": "2024",
      "num_value": "extracted number. Output 'N/A' if not found.",
      "unit": "unit of the value (e.g. %, USD, tonnes, MWh). Output 'N/A' if not found.",
      "page_number": "physical PDF page number. Output 'N/A' if not found."
    }
  ]
}
If an indicator is not found, output a single entry with num_value as 'N/A'.`
      : `You are an expert data extraction assistant. I will provide a document with page markers [Page X], and a list of NUMERIC/INTENSITY extraction requirements.

IMPORTANT RULES:
- "page_number" refers to the [Page X] markers in the document, NOT any page number printed in the content.
- If an indicator has values for MULTIPLE YEARS, return SEPARATE entries for each year with the "year" field filled.
- Extract the number in "num_value" and the unit in "unit".

Output STRICTLY in JSON format:
{
  "results": [
    {
      "indicator_code": "code matching requirement",
      "year": "2024",
      "num_value": "extracted number. Output 'N/A' if not found.",
      "unit": "unit of the value (e.g. %, USD, tonnes, MWh). Output 'N/A' if not found.",
      "page_number": "page number from [Page X] markers. Output 'N/A' if not found."
    }
  ]
}
If an indicator is not found, output a single entry with num_value as 'N/A'.`;
    
    // Process Batches
    for (let i = 0; i < totalBatches; i++) {
      const { batch, batchType } = allBatches[i];
      const typeLabel = batchType === '文本型' ? 'Text' : 'Numeric/Intensity';
      updateProgress(`Extracting batch ${i + 1}/${totalBatches} (${typeLabel}, ${batch.length} indicators)...`, 15 + Math.round((i / totalBatches) * 80));
      
      const sysPrompt = batchType === '文本型' ? textSysPrompt : numSysPrompt;
      
      const reqText = batch.map(r => 
        `Indicator Code: ${r.indicator_code}\nIndicator Name: ${r.indicator_name || ''}\nIndicator Type: ${r.indicator_type || '文本型'}\nDefinition: ${r.definition || ''}\nGuidance: ${r.guidance || 'None'}`
      ).join('\n---\n');
      
      const userPrompt = isGemini
        ? `Requirements:\n<requirements>\n${reqText}\n</requirements>\n\nPlease extract the requested info from the attached PDF. Remember: page_number = physical PDF page, NOT content page numbers.`
        : `Document:\n<document>\n${docText}\n</document>\n\nRequirements:\n<requirements>\n${reqText}\n</requirements>\n\nPlease return the structured JSON. Remember: page_number = [Page X] markers.`;
      
      const result = await callLLMWithRetry(sysPrompt, userPrompt, apiUrlInput.value.trim(), apiKeyInput.value.trim(), modelNameInput.value.trim(), pdfBase64);
      
      // Accumulate token stats
      totalInputTokens += result.usage.input_tokens;
      totalOutputTokens += result.usage.output_tokens;
      const batchCost = estimateCost(modelNameInput.value.trim(), result.usage.input_tokens, result.usage.output_tokens);
      totalCost += batchCost;
      updateProgress(`Batch ${i + 1} tokens: ${result.usage.input_tokens} in / ${result.usage.output_tokens} out | Cost: $${batchCost.toFixed(4)}`, -1);
      
      try {
        const cleanJson = result.text.replace(/```json/gi, '').replace(/```/g, '').trim();
        let parsedData = JSON.parse(cleanJson);
        
        // Robustly get the results array
        let resultsArray = [];
        if (Array.isArray(parsedData)) {
          resultsArray = parsedData;
        } else if (parsedData.results && Array.isArray(parsedData.results)) {
          resultsArray = parsedData.results;
        } else if (parsedData.result && Array.isArray(parsedData.result)) {
          resultsArray = parsedData.result;
        } else {
          // Try to find any array property
          const arrayProp = Object.values(parsedData).find(v => Array.isArray(v));
          if (arrayProp) resultsArray = arrayProp;
        }

        console.log(`Batch ${i+1} parsed results count: ${resultsArray.length}`);
        
        // Map results back - one indicator may produce multiple rows (multi-year)
        batch.forEach(req => {
          const reqCodeStr = String(req.indicator_code || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          
          const matchingResults = resultsArray.filter(r => {
            // Find indicator_code in AI result (case-insensitive keys)
            const aiCodeRaw = r.indicator_code || r.indicatorCode || r.code || r.id || r.ID || r.Code || "";
            const aiCodeStr = String(aiCodeRaw).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            return aiCodeStr !== '' && (aiCodeStr === reqCodeStr || reqCodeStr.endsWith(aiCodeStr) || aiCodeStr.endsWith(reqCodeStr));
          });
          
          const indicatorType = req.indicator_type || '文本型';
          
          if (matchingResults.length === 0) {
            console.warn(`No match found for indicator ${req.indicator_code} in AI response`);
            finalResults.push({
              indicator_code: req.indicator_code,
              indicator_name: req.indicator_name || '',
              indicator_type: indicatorType,
              year: '',
              text_value: isTextType(indicatorType) ? 'N/A' : '',
              num_value: isNumericType(indicatorType) ? 'N/A' : '',
              unit: isNumericType(indicatorType) ? 'N/A' : '',
              page_number: 'N/A'
            });
          } else {
            matchingResults.forEach(found => {
              // Robust value extraction with many fallbacks and case-insensitive check
              const findKey = (obj, search) => {
                const key = Object.keys(obj).find(k => k.toLowerCase() === search.toLowerCase());
                return key ? obj[key] : null;
              };

              const tv = findKey(found, 'text_value') || findKey(found, 'textValue') || findKey(found, 'text') || findKey(found, 'value') || 'N/A';
              const nv = findKey(found, 'num_value') || findKey(found, 'numValue') || findKey(found, 'value') || findKey(found, 'number') || 'N/A';
              const yr = findKey(found, 'year') || findKey(found, 'Year') || '';
              const unit = findKey(found, 'unit') || findKey(found, 'Unit') || 'N/A';
              const pg = findKey(found, 'page_number') || findKey(found, 'pageNumber') || findKey(found, 'page') || 'N/A';
              
              finalResults.push({
                indicator_code: req.indicator_code,
                indicator_name: req.indicator_name || '',
                indicator_type: indicatorType,
                year: yr,
                text_value: isTextType(indicatorType) ? tv : '',
                num_value: isNumericType(indicatorType) ? nv : '',
                unit: isNumericType(indicatorType) ? unit : '',
                page_number: pg
              });
            });
          }
        });
        
        extractedData = finalResults;
        resultsPanel.classList.remove('hidden');
        renderResults(finalResults);
      } catch (e) {
        console.warn(`Failed to parse batch ${i+1} JSON`, e);
        updateProgress(`Warning: batch ${i+1} parse failed, continuing...`, -1);
      }
    }
    
    const endTime = new Date();
    const durationMs = endTime - startTime;
    const durationStr = `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`;
    
    // Save stats for Summary tab
    const textBatchCount = allBatches.filter(b => b.batchType === '文本型').length;
    extractionStats = {
      model: modelNameInput.value.trim(),
      startTime: startTime.toLocaleString(),
      endTime: endTime.toLocaleString(),
      duration: durationStr,
      totalIndicators: requirements.length,
      textCount: textReqs.length,
      numCount: numReqs.length,
      totalBatches: totalBatches,
      textBatches: textBatchCount,
      numBatches: totalBatches - textBatchCount,
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
