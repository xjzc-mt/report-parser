export function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const XLSX = await import('xlsx');
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array', raw: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' });
        resolve(jsonData);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
}

export async function parsePDF(file, onProgress) {
  if (!window.pdfjsLib) {
    throw new Error('PDF.js is not loaded.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument(arrayBuffer).promise;
  const pages = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    if (pageIndex % 10 === 0 || pageIndex === pdf.numPages) {
      onProgress?.(`Extracting PDF text (Page ${pageIndex}/${pdf.numPages})...`, Math.round((pageIndex / pdf.numPages) * 15));
    }
    const page = await pdf.getPage(pageIndex);
    const textContent = await page.getTextContent();
    const strings = textContent.items.map((item) => item.str);
    pages.push({ pageNumber: pageIndex, text: strings.join(' ') });
  }

  return pages;
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = (error) => reject(error);
  });
}
