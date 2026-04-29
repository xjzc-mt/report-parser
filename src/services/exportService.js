import { buildExportData } from '../utils/extraction.js';

export async function exportResultsToExcel(results, extractionStats) {
  const XLSX = await import('xlsx');
  const exportData = buildExportData(results);

  if (exportData.length === 0) {
    window.alert('没有可导出的有效结果。');
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
    ['提取摘要', ''],
    ['', ''],
    ['模型', extractionStats.model || 'N/A'],
    ['选择类型', extractionStats.selectedTypes || 'N/A'],
    ['PDF 文件数', extractionStats.totalFiles || 0],
    ['开始时间', extractionStats.startTime || 'N/A'],
    ['结束时间', extractionStats.endTime || 'N/A'],
    ['总耗时', extractionStats.duration || 'N/A'],
    ['', ''],
    ['Excel 指标总数', extractionStats.totalInputIndicators || 0],
    ['已处理指标数', extractionStats.totalIndicators || 0],
    ['  - 文字型', extractionStats.textCount || 0],
    ['  - 数值型', extractionStats.numericCount || 0],
    ['  - 强度型', extractionStats.intensityCount || 0],
    ['  - 货币型', extractionStats.currencyCount || 0],
    ['已提取', exportData.length],
    ['未找到', (extractionStats.totalIndicators || 0) - exportData.length],
    ['', ''],
    ['总批次数', extractionStats.totalBatches || 0],
    ['  - 文字型批次', extractionStats.textBatches || 0],
    ['  - 数值型批次', extractionStats.numericBatches || 0],
    ['  - 强度型批次', extractionStats.intensityBatches || 0],
    ['  - 货币型批次', extractionStats.currencyBatches || 0],
    ['', ''],
    ['输入 Token', extractionStats.totalInputTokens || 0],
    ['输出 Token', extractionStats.totalOutputTokens || 0],
    ['总 Token', (extractionStats.totalInputTokens || 0) + (extractionStats.totalOutputTokens || 0)],
    ['预估成本（USD）', `$${(extractionStats.totalCost || 0).toFixed(4)}`]
  ];

  const summaryWorksheet = XLSX.utils.aoa_to_sheet(summaryData);
  summaryWorksheet['!cols'] = [{ wch: 28 }, { wch: 35 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '结果');
  XLSX.utils.book_append_sheet(workbook, summaryWorksheet, '摘要');
  XLSX.writeFile(workbook, `extraction_results_${new Date().toISOString().split('T')[0]}.xlsx`);
}
