import { useState, useEffect } from 'react';
import { Button, Text } from '@mantine/core';
import { IconTableImport, IconPlayerPlayFilled, IconDownload, IconRefresh } from '@tabler/icons-react';
import { UploadCard } from './UploadCard.jsx';
import { UnifiedAnalysisTree } from './UnifiedAnalysisTree.jsx';
import { parseExcel } from '../services/fileParsers.js';
import { parseLlmResultsFile, joinLlmResultsWithTestSet, exportComparisonRows } from '../services/testBenchService.js';
import { loadSynonyms } from '../services/synonymService.js';
import {
  saveFile,
  listFiles,
  deleteFile,
  saveValidationResults,
  getValidationResults,
  clearValidationResults
} from '../services/persistenceService.js';

const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function formatExcelFile(file) {
  if (!file) return '';
  return `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
}

export function QuickValidationMode({ onSwitchToOptimization, llm2Settings }) {
  const [llmResultFile, setLlmResultFile] = useState(null);
  const [testSetFile, setTestSetFile] = useState(null);
  const [comparisonRows, setComparisonRows] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [threshold, setThreshold] = useState(
    () => llm2Settings?.similarityThreshold ?? 70
  );

  // 进入时：恢复文件和分析结果 + 加载同义词
  useEffect(() => {
    const restore = async () => {
      try {
        // 加载同义词映射表
        const response = await fetch('/synonyms.xlsx');
        const arrayBuffer = await response.arrayBuffer();
        const synonymRows = await parseExcel(new File([arrayBuffer], 'synonyms.xlsx'));
        loadSynonyms(synonymRows);

        const [llmRecords, testRecords] = await Promise.all([
          listFiles('validation_llm'),
          listFiles('validation_test')
        ]);
        if (llmRecords.length > 0) {
          const r = llmRecords[llmRecords.length - 1];
          setLlmResultFile(new File([r.data], r.name, { type: EXCEL_MIME }));
        }
        if (testRecords.length > 0) {
          const r = testRecords[testRecords.length - 1];
          setTestSetFile(new File([r.data], r.name, { type: EXCEL_MIME }));
        }

        const savedRows = await getValidationResults();
        if (savedRows && savedRows.length > 0) {
          setComparisonRows(savedRows);
        }
      } catch (_) { /* ignore */ }
    };
    restore();
  }, []);

  const handleLlmFileSelect = async (file) => {
    setLlmResultFile(file);
    // 文件变更时清除旧结果
    await clearValidationResults().catch(() => {});
    setComparisonRows([]);
    try {
      const oldRecords = await listFiles('validation_llm');
      await Promise.all(oldRecords.map((r) => deleteFile(r.id)));
      const ab = await file.arrayBuffer();
      await saveFile('validation_llm__current', file.name, 'validation_llm', ab, file.lastModified);
    } catch (_) { /* ignore */ }
  };

  const handleTestFileSelect = async (file) => {
    setTestSetFile(file);
    await clearValidationResults().catch(() => {});
    setComparisonRows([]);
    try {
      const oldRecords = await listFiles('validation_test');
      await Promise.all(oldRecords.map((r) => deleteFile(r.id)));
      const ab = await file.arrayBuffer();
      await saveFile('validation_test__current', file.name, 'validation_test', ab, file.lastModified);
    } catch (_) { /* ignore */ }
  };

  const handleRemoveLlmFile = async () => {
    setLlmResultFile(null);
    await clearValidationResults().catch(() => {});
    setComparisonRows([]);
    try {
      const records = await listFiles('validation_llm');
      await Promise.all(records.map((r) => deleteFile(r.id)));
    } catch (_) { /* ignore */ }
  };

  const handleRemoveTestFile = async () => {
    setTestSetFile(null);
    await clearValidationResults().catch(() => {});
    setComparisonRows([]);
    try {
      const records = await listFiles('validation_test');
      await Promise.all(records.map((r) => deleteFile(r.id)));
    } catch (_) { /* ignore */ }
  };

  const canStart = llmResultFile && testSetFile && !isProcessing;
  const hasResults = comparisonRows.length > 0;

  const handleStartAnalysis = async () => {
    setIsProcessing(true);
    setError('');
    try {
      const llmResults = await parseLlmResultsFile(llmResultFile);
      const testSetRows = await parseExcel(testSetFile);
      const rows = joinLlmResultsWithTestSet(llmResults, testSetRows);
      setComparisonRows(rows);
      // 持久化分析结果
      await saveValidationResults(rows).catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = () => {
    exportComparisonRows(comparisonRows);
  };

  return (
    <div className="quick-validation-mode">
      {/* 上传区 */}
      <div className="testbench-upload-grid">
        <UploadCard
          icon={<IconTableImport size={26} stroke={1.8} />}
          tag="EXCEL"
          title="LLM 结果文件"
          hint="上传 LLM 解析结果"
          acceptHint="必须包含 report_name, indicator_code 字段"
          buttonLabel="选择 Excel 文件"
          accept=".xlsx,.xls,.csv"
          file={llmResultFile}
          onFileSelect={handleLlmFileSelect}
          onRemoveFile={handleRemoveLlmFile}
          formatFileInfo={formatExcelFile}
        />
        <UploadCard
          icon={<IconTableImport size={26} stroke={1.8} />}
          tag="EXCEL"
          title="测试集文件"
          hint="上传测试集（含标准答案）"
          buttonLabel="选择 Excel 文件"
          accept=".xlsx,.xls,.csv"
          file={testSetFile}
          onFileSelect={handleTestFileSelect}
          onRemoveFile={handleRemoveTestFile}
          formatFileInfo={formatExcelFile}
        />
      </div>

      {/* 操作按钮 */}
      <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button
          size="md"
          radius="xl"
          disabled={!canStart}
          onClick={handleStartAnalysis}
          leftSection={
            hasResults
              ? <IconRefresh size={15} />
              : <IconPlayerPlayFilled size={15} />
          }
        >
          {isProcessing ? '关联中...' : hasResults ? '重新分析' : '开始关联分析'}
        </Button>

        {hasResults && (
          <Button
            size="sm"
            radius="xl"
            variant="default"
            onClick={handleExport}
            leftSection={<IconDownload size={15} />}
          >
            导出关联对比文件
          </Button>
        )}
      </div>

      {error && (
        <div style={{ marginTop: 10, color: '#dc2626', fontSize: 13 }}>
          错误：{error}
        </div>
      )}

      {/* 恢复提示 */}
      {hasResults && !isProcessing && (
        <Text size="xs" c="dimmed" mt={6}>
          已自动恢复上次分析结果（{comparisonRows.length} 条），切换工作模式不会丢失数据
        </Text>
      )}

      {/* 统一分析树 */}
      {hasResults && (
        <div style={{ marginTop: 20 }}>
          <UnifiedAnalysisTree
            comparisonRows={comparisonRows}
            threshold={threshold}
            onThresholdChange={setThreshold}
            onJumpToOptimization={onSwitchToOptimization}
          />
        </div>
      )}
    </div>
  );
}
