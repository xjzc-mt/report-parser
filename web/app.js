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

// File Handling Setup
function updateStartButton() {
  if (pdfFile && csvFile && apiKeyInput.value.trim() && modelNameInput.value.trim()) {
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
  const isCSV = type === 'csv' && (file.type === 'text/csv' || file.type === 'application/vnd.ms-excel' || file.name.toLowerCase().endsWith('.csv'));

  if (isPDF) {
    pdfFile = file;
    pdfFileInfo.innerHTML = `✅ ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
    pdfFileInfo.classList.remove('hidden');
    pdfFileInfo.classList.add('success');
  } else if (isCSV) {
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
  progressStatusText.textContent = message;
  progressPercentage.textContent = `${percentage}%`;
  progressBar.style.width = `${percentage}%`;

  const logEntry = document.createElement('p');
  logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  progressLog.appendChild(logEntry);
  progressLog.scrollTop = progressLog.scrollHeight;
}

// Process CSV
function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (error) => reject(error)
    });
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

// LLM Call Utility
async function callLLM(sysPrompt, userPrompt, apiUrl, apiKey, modelName) {
  const requestBody = {
    model: modelName,
    messages: [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.1,
    response_format: { type: "json_object" }
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`API Error: ${response.status} - ${errorData}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Render Results Table
function renderResults(results) {
  const tbody = document.getElementById('resultsTableBody');
  tbody.innerHTML = '';
  results.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.indicator_code}</td>
      <td>${item.definition}</td>
      <td>${item.extracted_text}</td>
      <td>${item.page_number}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Export CSV handler
document.getElementById('exportCsvBtn').addEventListener('click', () => {
  if (extractedData.length === 0) return;
  
  const csvStr = Papa.unparse(extractedData);
  const blob = new Blob(["\ufeff" + csvStr], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `extraction_results_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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
    
    updateProgress('Starting file processing...', 0);
    
    // 1. Parse CSV
    updateProgress('Parsing requirements CSV...', 2);
    const requirements = await parseCSV(csvFile);
    console.log(`Loaded ${requirements.length} requirements`);
    
    // 2. Parse PDF
    updateProgress('Parsing PDF document...', 5);
    const pdfPagesData = await parsePDF(pdfFile);
    console.log(`Loaded ${pdfPagesData.length} PDF pages`);
    
    updateProgress('Parsing completed. Preparing AI extraction...', 10);
    
    // 3. Prepare Batch Request
    const docText = pdfPagesData.map(p => `[Page ${p.pageNumber}]\n${p.text}`).join('\n\n');
    let finalResults = [];
    const batchSize = 10;
    const totalBatches = Math.ceil(requirements.length / batchSize);
    
    const sysPrompt = `You are an expert data extraction assistant. I will provide a document with page numbers denoted as [Page X], and a list of extraction requirements.
For each requirement, find the relevant information in the document.
Output STRICTLY in JSON format with this structure:
{
  "results": [
    {
      "indicator_code": "code matching requirement",
      "extracted_text": "The exact text or summarized result. Output 'N/A' if not found.",
      "page_number": "1, 2" // Output 'N/A' if not found.
    }
  ]
}`;

    // Process Batches
    for (let i = 0; i < totalBatches; i++) {
      const batch = requirements.slice(i * batchSize, (i + 1) * batchSize);
      updateProgress(`Extracting batch ${i + 1} of ${totalBatches}...`, 10 + Math.round((i / totalBatches) * 85));
      
      const reqText = batch.map(r => `Indicator Code: ${r.indicator_code}\nDefinition: ${r.definition}\nGuidance: ${r.guidance || 'None'}\n`).join('\n---\n');
      const userPrompt = `Document:\n<document>\n${docText}\n</document>\n\nRequirements:\n<requirements>\n${reqText}\n</requirements>\n\nPlease return the structured JSON.`;
      
      const resText = await callLLM(sysPrompt, userPrompt, apiUrlInput.value.trim(), apiKeyInput.value.trim(), modelNameInput.value.trim());
      
      try {
        const cleanJson = resText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsedData = JSON.parse(cleanJson);
        const resultsArray = parsedData.results || [];
        
        batch.forEach(req => {
            const foundResult = resultsArray.find(r => String(r.indicator_code) === String(req.indicator_code));
            finalResults.push({
               indicator_code: req.indicator_code,
               definition: req.definition,
               extracted_text: foundResult ? foundResult.extracted_text : 'N/A',
               page_number: foundResult ? foundResult.page_number : 'N/A'
            });
        });
        
        renderResults(finalResults);
      } catch (e) {
        console.warn(`Failed to parse batch ${i+1} JSON`, e);
      }
    }
    
    updateProgress('Extraction completed successfully.', 100);
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
