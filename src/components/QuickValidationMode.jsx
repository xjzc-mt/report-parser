import { useState, useEffect, useRef } from 'react';
import { Button, Text } from '@mantine/core';
import { IconTableImport, IconPlayerPlayFilled, IconDownload, IconRefresh } from '@tabler/icons-react';
import { UploadCard } from './UploadCard.jsx';
import { UnifiedAnalysisMerged } from './UnifiedAnalysisMerged.jsx';
import { parseExcel } from '../services/fileParsers.js';
import {
  parseLlmResultsFile,
  joinLlmResultsWithTestSet,
  exportComparisonRows,
  refreshComparisonRowsWithCurrentSimilarityRules,
  validateQuickValidationAnalysisInput
} from '../services/testBenchService.js';
import { initializeSimilarityAssets } from '../services/synonymService.js';
import {
  saveFile,
  listFiles,
  deleteFile,
  saveValidationResults,
  getValidationResults,
  clearValidationResults,
  saveValidationFieldMappings,
  getValidationFieldMappings
} from '../services/persistenceService.js';
import {
  DEFAULT_VALIDATION_FIELD_MAPPINGS,
  extractFieldOptionsFromRows
} from '../utils/validationFieldMappings.js';

const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function formatExcelFile(file) {
  if (!file) return '';
  return `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
}

function cloneDefaultFieldMappings() {
  return DEFAULT_VALIDATION_FIELD_MAPPINGS.map((item) => ({
    llmField: item.llmField,
    testField: item.testField
  }));
}

function normalizeSavedMappings(mappings) {
  if (!Array.isArray(mappings)) return cloneDefaultFieldMappings();
  return mappings.map((item) => ({
    llmField: String(item?.llmField || '').trim(),
    testField: String(item?.testField || '').trim()
  }));
}

function getSelectOptions(options, currentValue) {
  const values = Array.isArray(options) ? [...options] : [];
  if (currentValue && !values.includes(currentValue)) {
    values.unshift(currentValue);
  }
  return values;
}

export function QuickValidationMode({ onSwitchToOptimization, llm2Settings }) {
  const analysisPanelRef = useRef(null);
  const hasRestoredMappingsRef = useRef(false);
  const [llmResultFile, setLlmResultFile] = useState(null);
  const [testSetFile, setTestSetFile] = useState(null);
  const [comparisonRows, setComparisonRows] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [mappingExpanded, setMappingExpanded] = useState(false);
  const [fieldMappings, setFieldMappings] = useState(() => cloneDefaultFieldMappings());
  const [llmFieldOptions, setLlmFieldOptions] = useState([]);
  const [testFieldOptions, setTestFieldOptions] = useState([]);
  const [threshold, setThreshold] = useState(
    () => llm2Settings?.similarityThreshold ?? 70
  );

  const loadLlmFieldOptions = async (file) => {
    const rows = await parseLlmResultsFile(file);
    setLlmFieldOptions(extractFieldOptionsFromRows(rows));
    return rows;
  };

  const loadTestFieldOptions = async (file) => {
    const rows = await parseExcel(file);
    setTestFieldOptions(extractFieldOptionsFromRows(rows));
    return rows;
  };

  // 进入时：恢复文件和分析结果 + 加载同义词
  useEffect(() => {
    const restore = async () => {
      try {
        await initializeSimilarityAssets(parseExcel);

        const savedMappings = await getValidationFieldMappings().catch(() => null);
        setFieldMappings(savedMappings === null ? cloneDefaultFieldMappings() : normalizeSavedMappings(savedMappings));

        const [llmRecords, testRecords] = await Promise.all([
          listFiles('validation_llm'),
          listFiles('validation_test')
        ]);
        if (llmRecords.length > 0) {
          const r = llmRecords[llmRecords.length - 1];
          const file = new File([r.data], r.name, { type: EXCEL_MIME });
          setLlmResultFile(file);
          await loadLlmFieldOptions(file).catch(() => setLlmFieldOptions([]));
        }
        if (testRecords.length > 0) {
          const r = testRecords[testRecords.length - 1];
          const file = new File([r.data], r.name, { type: EXCEL_MIME });
          setTestSetFile(file);
          await loadTestFieldOptions(file).catch(() => setTestFieldOptions([]));
        }

        const savedRows = await getValidationResults();
        if (savedRows && savedRows.length > 0) {
          const refreshedRows = refreshComparisonRowsWithCurrentSimilarityRules(savedRows);
          setComparisonRows(refreshedRows);
          await saveValidationResults(refreshedRows).catch(() => {});
        }
      } catch (_) { /* ignore */ }
      hasRestoredMappingsRef.current = true;
    };
    restore();
  }, []);

  useEffect(() => {
    if (!hasRestoredMappingsRef.current) return;
    void saveValidationFieldMappings(fieldMappings).catch(() => {});
  }, [fieldMappings]);

  const handleLlmFileSelect = async (file) => {
    setError('');
    setLlmResultFile(file);
    // 文件变更时清除旧结果
    await clearValidationResults().catch(() => {});
    setComparisonRows([]);
    try {
      await loadLlmFieldOptions(file);
      const oldRecords = await listFiles('validation_llm');
      await Promise.all(oldRecords.map((r) => deleteFile(r.id)));
      const ab = await file.arrayBuffer();
      await saveFile('validation_llm__current', file.name, 'validation_llm', ab, file.lastModified);
    } catch (err) {
      setLlmFieldOptions([]);
      setError(`LLM 结果文件解析失败：${err.message}`);
    }
  };

  const handleTestFileSelect = async (file) => {
    setError('');
    setTestSetFile(file);
    await clearValidationResults().catch(() => {});
    setComparisonRows([]);
    try {
      await loadTestFieldOptions(file);
      const oldRecords = await listFiles('validation_test');
      await Promise.all(oldRecords.map((r) => deleteFile(r.id)));
      const ab = await file.arrayBuffer();
      await saveFile('validation_test__current', file.name, 'validation_test', ab, file.lastModified);
    } catch (err) {
      setTestFieldOptions([]);
      setError(`测试集文件解析失败：${err.message}`);
    }
  };

  const handleRemoveLlmFile = async () => {
    setLlmResultFile(null);
    setLlmFieldOptions([]);
    await clearValidationResults().catch(() => {});
    setComparisonRows([]);
    try {
      const records = await listFiles('validation_llm');
      await Promise.all(records.map((r) => deleteFile(r.id)));
    } catch (_) { /* ignore */ }
  };

  const handleRemoveTestFile = async () => {
    setTestSetFile(null);
    setTestFieldOptions([]);
    await clearValidationResults().catch(() => {});
    setComparisonRows([]);
    try {
      const records = await listFiles('validation_test');
      await Promise.all(records.map((r) => deleteFile(r.id)));
    } catch (_) { /* ignore */ }
  };

  const canStart = llmResultFile && testSetFile && !isProcessing;
  const hasResults = comparisonRows.length > 0;
  const visibleJoinCount = Math.min(
    fieldMappings.length > 0 ? fieldMappings.length : DEFAULT_VALIDATION_FIELD_MAPPINGS.length,
    5
  );

  const updateMapping = (index, key, value) => {
    setError('');
    setFieldMappings((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [key]: value } : item
    )));
  };

  const appendMapping = () => {
    setError('');
    setFieldMappings((current) => [...current, { llmField: '', testField: '' }]);
  };

  const removeMapping = (index) => {
    setError('');
    setFieldMappings((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleStartAnalysis = async () => {
    setIsProcessing(true);
    setError('');
    try {
      const llmResults = await parseLlmResultsFile(llmResultFile);
      const testSetRows = await parseExcel(testSetFile);
      const validation = validateQuickValidationAnalysisInput({
        llmResults,
        testSetRows,
        fieldMappings
      });

      if (!validation.ok) {
        throw new Error(validation.error);
      }

      const { validRows, matchCount } = joinLlmResultsWithTestSet(llmResults, testSetRows, {
        fieldMappings
      });

      if (matchCount === 0) {
        throw new Error('当前关联字段配置无有效匹配，请检查两侧字段是否一一对应。');
      }

      setComparisonRows(validRows);
      // 持久化分析结果
      await saveValidationResults(validRows).catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = () => {
    exportComparisonRows(comparisonRows);
  };

  const handleExportAnalysisData = () => {
    void analysisPanelRef.current?.exportPanelData?.();
  };

  return (
    <div className="quick-validation-mode">
      {/* 上传区 */}
      <div className="quick-validation-upload-layout">
        <UploadCard
          icon={<IconTableImport size={26} stroke={1.8} />}
          tag="EXCEL"
          title="LLM 结果文件"
          hint="上传 LLM 解析结果"
          acceptHint="默认按 report_name / indicator_code / year 关联，也支持手动映射上传列名"
          buttonLabel="选择 Excel 文件"
          accept=".xlsx,.xls,.csv"
          file={llmResultFile}
          onFileSelect={handleLlmFileSelect}
          onRemoveFile={handleRemoveLlmFile}
          formatFileInfo={formatExcelFile}
        />
        <div className="quick-validation-join-bridge">
          <button
            type="button"
            className={`quick-validation-join-trigger ${mappingExpanded ? 'expanded' : ''}`}
            onClick={() => setMappingExpanded((current) => !current)}
            aria-expanded={mappingExpanded}
            aria-label="切换关联字段配置"
          >
            {Array.from({ length: visibleJoinCount }).map((_, index) => (
              <span className="quick-validation-join-symbol" key={`join-symbol-${index}`}>
                <span className="quick-validation-join-line quick-validation-join-line-left" />
                <span className="quick-validation-join-core" />
                <span className="quick-validation-join-line quick-validation-join-line-right" />
              </span>
            ))}
          </button>
        </div>
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

      {mappingExpanded && (
        <div className="quick-validation-mapping-panel">
          <div className="quick-validation-mapping-header">
            <span>关联字段配置</span>
            <span>删除放在每行末尾，清空后分析时使用默认规则</span>
          </div>

          {fieldMappings.length > 0 ? (
            <>
              <div className="quick-validation-mapping-columns">
                <span>LLM 结果字段</span>
                <span />
                <span>测试集字段</span>
                <span />
              </div>
              <div className="quick-validation-mapping-list">
                {fieldMappings.map((mapping, index) => {
                  const llmOptions = getSelectOptions(llmFieldOptions, mapping.llmField);
                  const testOptions = getSelectOptions(testFieldOptions, mapping.testField);
                  return (
                    <div className="quick-validation-mapping-row" key={`mapping-${index}`}>
                      <select
                        className="quick-validation-mapping-select"
                        value={mapping.llmField}
                        onChange={(event) => updateMapping(index, 'llmField', event.target.value)}
                        disabled={llmFieldOptions.length === 0}
                      >
                        <option value="" disabled hidden>
                          选择 LLM 字段
                        </option>
                        <optgroup label="选择 LLM 字段">
                          {llmOptions.map((field) => (
                            <option key={`llm-${index}-${field}`} value={field}>
                              {field}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                      <span className="quick-validation-mapping-equals">=</span>
                      <select
                        className="quick-validation-mapping-select"
                        value={mapping.testField}
                        onChange={(event) => updateMapping(index, 'testField', event.target.value)}
                        disabled={testFieldOptions.length === 0}
                      >
                        <option value="" disabled hidden>
                          选择测试集字段
                        </option>
                        <optgroup label="选择测试集字段">
                          {testOptions.map((field) => (
                            <option key={`test-${index}-${field}`} value={field}>
                              {field}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                      <button
                        type="button"
                        className="quick-validation-mapping-delete"
                        onClick={() => removeMapping(index)}
                      >
                        删除
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="quick-validation-mapping-empty">
              当前未保留手动关联字段。点击“开始关联分析”时会回退到默认规则：
              <span> `report_name = report_name`、`indicator_code = indicator_code`、`year = data_year` </span>
            </div>
          )}

          <div className="quick-validation-mapping-actions">
            <button
              type="button"
              className="quick-validation-mapping-add"
              onClick={appendMapping}
            >
              新增一组关联字段
            </button>
          </div>
        </div>
      )}

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
        {hasResults && (
          <Button
            size="sm"
            radius="xl"
            variant="default"
            onClick={handleExportAnalysisData}
            leftSection={<IconDownload size={15} />}
          >
            导出分析数据
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
          <UnifiedAnalysisMerged
            ref={analysisPanelRef}
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
