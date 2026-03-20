import { buildExportData } from '../utils/extraction.js';

export async function exportResultsToExcel(results, extractionStats) {
  const XLSX = await import('xlsx');
  const exportData = buildExportData(results);

  if (exportData.length === 0) {
    window.alert('No valid results to export.');
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(exportData, { cellDates: true });
  const range = XLSX.utils.decode_range(worksheet['!ref']);

  for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
    const cellRef = XLSX.utils.encode_cell({ r: row, c: 0 });
    if (worksheet[cellRef]) {
      worksheet[cellRef].t = 's';
      worksheet[cellRef].z = '@';
    }
  }

  const summaryData = [
    ['Extraction Summary', ''],
    ['', ''],
    ['Model', extractionStats.model || 'N/A'],
    ['Selected Types', extractionStats.selectedTypes || 'N/A'],
    ['PDF Files', extractionStats.totalFiles || 0],
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
    ['Estimated Cost (USD)', `$${(extractionStats.totalCost || 0).toFixed(4)}`]
  ];

  const summaryWorksheet = XLSX.utils.aoa_to_sheet(summaryData);
  summaryWorksheet['!cols'] = [{ wch: 28 }, { wch: 35 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');
  XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Summary');
  XLSX.writeFile(workbook, `extraction_results_${new Date().toISOString().split('T')[0]}.xlsx`);
}
