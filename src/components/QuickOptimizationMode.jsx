import { useMemo, useState } from 'react';
import { Button, Badge, Text } from '@mantine/core';
import { IconTableImport, IconFileTypePdf, IconSparkles } from '@tabler/icons-react';
import { UploadCard } from './UploadCard.jsx';
import { PdfMatchChecker } from './PdfMatchChecker.jsx';
import { parseComparisonFile, checkPdfMatching, filterRowsByPdfAvailability, runOptimizationPhase, exportFinalResults } from '../services/testBenchService.js';
import { MODEL_PAGE_KEYS, PAGE_REQUIRED_CAPABILITIES } from '../constants/modelPresets.js';
import { resolvePagePreset, resolveRuntimeLlmConfig, getPresetCapabilityError } from '../services/modelPresetResolver.js';
import { loadPageModelSelection, savePageModelSelection } from '../utils/modelPresetStorage.js';
import { PagePresetSelect } from './modelPresets/PagePresetSelect.jsx';

function formatExcelFile(file) {
  if (!file) return '';
  return `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
}

function formatPdfFiles(files) {
  if (!files || files.length === 0) return '';
  return `${files.length} 个文件`;
}

export function QuickOptimizationMode({ llm2Settings, modelPresets = [], onOpenModelPresetManager, preselectedCodes = [] }) {
  const [selectedPresetId, setSelectedPresetId] = useState(() => loadPageModelSelection(MODEL_PAGE_KEYS.PROMPT_OPTIMIZATION));
  const [comparisonFile, setComparisonFile] = useState(null);
  const [pdfFiles, setPdfFiles] = useState([]);
  const [comparisonRows, setComparisonRows] = useState([]);
  const [requiredReports, setRequiredReports] = useState([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [finalRows, setFinalRows] = useState([]);
  const [error, setError] = useState('');
  const selectedPreset = useMemo(
    () => resolvePagePreset(
      MODEL_PAGE_KEYS.PROMPT_OPTIMIZATION,
      modelPresets,
      { [MODEL_PAGE_KEYS.PROMPT_OPTIMIZATION]: selectedPresetId }
    ),
    [modelPresets, selectedPresetId]
  );
  const runtimeConfig = useMemo(
    () => resolveRuntimeLlmConfig(selectedPreset),
    [selectedPreset]
  );
  const capabilityError = useMemo(
    () => getPresetCapabilityError(
      selectedPreset,
      PAGE_REQUIRED_CAPABILITIES[MODEL_PAGE_KEYS.PROMPT_OPTIMIZATION]
    ),
    [selectedPreset]
  );

  const handleComparisonFileSelect = async (file) => {
    setComparisonFile(file);
    setError('');
    try {
      const rows = await parseComparisonFile(file);
      setComparisonRows(rows);
      const reports = [...new Set(rows.map(r => r.report_name))];
      setRequiredReports(reports);
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePdfSelect = (files) => {
    setPdfFiles(Array.isArray(files) ? files : [files]);
  };

  const handlePdfRemove = (file) => {
    setPdfFiles(prev => prev.filter(f => f !== file));
  };

  // 如果有预选指标，过滤出对应的行；否则使用全部
  const effectiveRows = preselectedCodes.length > 0
    ? comparisonRows.filter((r) => preselectedCodes.includes(String(r.indicator_code || '').trim()))
    : comparisonRows;

  const canOptimize = effectiveRows.length > 0 && pdfFiles.length > 0 && !isOptimizing && Boolean(runtimeConfig?.apiKey) && !capabilityError;

  const handleStartOptimization = async () => {
    setIsOptimizing(true);
    setError('');
    try {
      const matchResult = checkPdfMatching(requiredReports, pdfFiles);
      const { optimizableRows } = filterRowsByPdfAvailability(effectiveRows, matchResult.matched);

      if (optimizableRows.length === 0) {
        throw new Error('没有可优化的行（所有报告都缺失 PDF）');
      }

      const tokenStats = { optInput: 0, optOutput: 0, extractInput: 0, extractOutput: 0 };

      await runOptimizationPhase({
        pdfFiles,
        comparisonRows: optimizableRows,
        llm2Settings: {
          ...llm2Settings,
          apiUrl: runtimeConfig.apiUrl,
          apiKey: runtimeConfig.apiKey,
          modelName: runtimeConfig.modelName,
          providerType: runtimeConfig.providerType,
          capabilities: runtimeConfig.capabilities
        },
        onProgress: () => {},
        onOptLog: () => {},
        tokenStats
      });

      setFinalRows(optimizableRows);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleExport = () => {
    exportFinalResults(finalRows, {});
  };

  return (
    <div className="quick-optimization-mode">
      <div className="panel-block" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div>
            <h3>当前模型预设</h3>
            <p>Prompt 自动优化只从统一预设里选模型，不再在页面内直配 API。</p>
          </div>
          {onOpenModelPresetManager ? (
            <Button size="xs" radius="xl" variant="default" onClick={onOpenModelPresetManager}>
              管理模型预设
            </Button>
          ) : null}
        </div>
        <PagePresetSelect
          presets={modelPresets}
          value={selectedPreset?.id || selectedPresetId}
          onChange={(presetId) => {
            setSelectedPresetId(presetId);
            savePageModelSelection(MODEL_PAGE_KEYS.PROMPT_OPTIMIZATION, presetId);
          }}
          requiredCapabilities={PAGE_REQUIRED_CAPABILITIES[MODEL_PAGE_KEYS.PROMPT_OPTIMIZATION]}
        />
        {capabilityError ? (
          <div style={{ marginTop: 8, color: '#fca5a5' }}>{capabilityError}</div>
        ) : null}
      </div>
      <div className="testbench-upload-grid">
        <UploadCard
          icon={<IconTableImport size={26} stroke={1.8} />}
          tag="EXCEL"
          title="关联对比文件"
          hint="上传关联对比文件"
          acceptHint="必须包含 report_name, pdf_numbers 等字段"
          buttonLabel="选择 Excel 文件"
          accept=".xlsx,.xls,.csv"
          file={comparisonFile}
          onFileSelect={handleComparisonFileSelect}
          onRemoveFile={() => setComparisonFile(null)}
          formatFileInfo={formatExcelFile}
        />
        <UploadCard
          icon={<IconFileTypePdf size={26} stroke={1.8} />}
          tag="PDF"
          title="PDF 文件"
          hint="上传对应的 PDF 报告"
          buttonLabel="选择 PDF 文件"
          accept="application/pdf"
          file={pdfFiles}
          multiple
          onFileSelect={handlePdfSelect}
          onRemoveFile={handlePdfRemove}
          formatFileInfo={formatPdfFiles}
        />
      </div>

      {requiredReports.length > 0 && (
        <PdfMatchChecker
          requiredReports={requiredReports}
          uploadedPdfFiles={pdfFiles}
        />
      )}

      {/* 预选范围提示 */}
      {preselectedCodes.length > 0 && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
          <Text size="xs" fw={600} c="blue.7" mb={4}>
            📋 来自验收模式的优化范围
          </Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {preselectedCodes.map((code) => (
              <Badge key={code} size="xs" color="indigo" variant="light">{code}</Badge>
            ))}
          </div>
          {comparisonRows.length > 0 && (
            <Text size="xs" c="dimmed" mt={4}>
              已从上传文件中过滤出 {effectiveRows.length} 条对应行（共 {comparisonRows.length} 条）
            </Text>
          )}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <Button
          size="md"
          radius="xl"
          disabled={!canOptimize}
          onClick={handleStartOptimization}
          leftSection={<IconSparkles size={15} />}
        >
          {isOptimizing ? '优化中...' : '开始优化'}
        </Button>
      </div>

      {error && (
        <div style={{ marginTop: 10, color: 'red' }}>
          错误: {error}
        </div>
      )}

      {finalRows.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <p>优化完成！</p>
          <Button size="sm" radius="xl" onClick={handleExport}>
            导出最终结果
          </Button>
        </div>
      )}
    </div>
  );
}
