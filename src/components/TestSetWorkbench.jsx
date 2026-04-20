import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Button, NumberInput, Progress, Switch, Tooltip, MultiSelect, Text, Badge } from '@mantine/core';
import { IconAlertCircle, IconFlask, IconRefresh, IconSettings } from '@tabler/icons-react';
import { FullFlowMode } from './FullFlowMode.jsx';
import { QuickValidationMode } from './QuickValidationMode.jsx';
import { QuickOptimizationMode } from './QuickOptimizationMode.jsx';
import { DEFAULT_SETTINGS } from '../constants/extraction.js';
import { DEFAULT_LLM1_SETTINGS, DEFAULT_LLM2_SETTINGS } from '../constants/testBench.js';
import { MODEL_PAGE_KEYS } from '../constants/modelPresets.js';
import { TEST_SET_SUBTABS } from '../constants/labNavigation.js';
import {
  DEFAULT_TEST_SET_WORKBENCH_SUBTAB_KEY,
  LS_TEST_SET_WORKBENCH_SUBTAB,
  normalizeTestSetWorkbenchSubtabKey
} from '../utils/testSetWorkbenchSettings.js';
import { resolvePagePreset, resolveRuntimeLlmConfig } from '../services/modelPresetResolver.js';
import { loadPageModelSelection } from '../utils/modelPresetStorage.js';
import { parseExcel } from '../services/fileParsers.js';
import {
  runExtractionPhase,
  runOptimizationPhase,
  exportComparisonRows,
  exportFinalResults,
  exportLlm1Results,
  parseComparisonFile,
  parseDefinitionFile,
  refreshComparisonRowsWithCurrentSimilarityRules,
  resetRunState
} from '../services/testBenchService.js';
import {
  saveFile,
  listFiles,
  deleteFile,
  listPdfPages,
  deletePdfPage,
  deletePdfPagesByReport,
  getRunState,
  saveComparisonRows,
  saveFinalRows,
  getComparisonRows,
  getFinalRows
} from '../services/persistenceService.js';
import { estimateCost } from '../services/llmClient.js';
import { initializeSimilarityAssets } from '../services/synonymService.js';

function createInitialProgress() {
  return { visible: false, status: '', percentage: 0, logs: [], isLoading: false };
}

const restoredFileIds = new WeakMap();

function getFileIdentity(file) {
  return `${file.name}__${file.size}__${file.lastModified}`;
}
function getPdfFileId(file) {
  return restoredFileIds.get(file) ?? getFileIdentity(file);
}
function formatPdfFiles(files) {
  if (!files || files.length === 0) return '';
  return `${files.length} 个文件`;
}
function formatExcelFile(file) {
  if (!file) return '';
  return `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
}

function TokenStatsBar({ tokenStats, llm1ModelName, llm2ModelName }) {
  if (!tokenStats || (tokenStats.extractInput === 0 && tokenStats.optInput === 0)) return null;
  const extractCost = estimateCost(llm1ModelName || 'default', tokenStats.extractInput, tokenStats.extractOutput);
  const optCost = estimateCost(llm2ModelName || 'default', tokenStats.optInput, tokenStats.optOutput);
  const totalCost = extractCost + optCost;
  const fmt = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  return (
    <div className="token-stats-bar">
      <span className="token-stats-label">Token 消耗：</span>
      <span className="token-stats-chip">提取 输入 {fmt(tokenStats.extractInput)} / 输出 {fmt(tokenStats.extractOutput)} / ${extractCost.toFixed(3)}</span>
      <span className="token-stats-chip">优化 输入 {fmt(tokenStats.optInput)} / 输出 {fmt(tokenStats.optOutput)} / ${optCost.toFixed(3)}</span>
      <span className="token-stats-chip total">合计 ${totalCost.toFixed(3)}</span>
    </div>
  );
}

function LogPanel({ title, logs, emptyHint = '暂无日志' }) {
  return (
    <div className="log-panel">
      <div className="log-panel-header">{title}</div>
      <div className="log-panel-body">
        {logs.length === 0
          ? <p className="log-panel-empty">{emptyHint}</p>
          : logs.map((entry) => (
            <div key={entry.id || `${entry.timestamp}-${Math.random()}`} className="log-entry">
              <span className="log-time">{entry.timestamp}</span>
              <span className="log-msg">{entry.message}</span>
            </div>
          ))
        }
      </div>
    </div>
  );
}

const RUN_ID = 'testbench_run';

export function TestSetWorkbench({ globalSettings = DEFAULT_SETTINGS, modelPresets = [], onOpenModelPresetManager }) {
  const stage1AnalysisRef = useRef(null);
  const [activeSubtab, setActiveSubtab] = useState(() => {
    try {
      return normalizeTestSetWorkbenchSubtabKey(localStorage.getItem(LS_TEST_SET_WORKBENCH_SUBTAB));
    } catch (_) { /* ignore */ }
    return DEFAULT_TEST_SET_WORKBENCH_SUBTAB_KEY;
  });
  const [llm1Settings] = useState(() => ({ ...DEFAULT_LLM1_SETTINGS }));
  const [llm2Settings] = useState(() => ({ ...DEFAULT_LLM2_SETTINGS }));

  const [pdfFiles, setPdfFiles] = useState([]);
  const [testSetFile, setTestSetFile] = useState(null);
  const [comparisonFile, setComparisonFile] = useState(null);
  const [definitionFile, setDefinitionFile] = useState(null);
  const [cachedPages, setCachedPages] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isInterrupting, setIsInterrupting] = useState(false);
  const interruptRef = useRef({ interrupted: false });
  const [exProgress, setExProgress] = useState(createInitialProgress);
  const [optProgress, setOptProgress] = useState(createInitialProgress);
  const [exLogs, setExLogs] = useState([]);
  const [optLogs, setOptLogs] = useState([]);
  const [phase1Progress, setPhase1Progress] = useState({ completed: 0, total: 0 });
  const [phase2Progress, setPhase2Progress] = useState({ completed: 0, total: 0 });
  const [tokenStats, setTokenStats] = useState({ extractInput: 0, extractOutput: 0, optInput: 0, optOutput: 0 });
  const tokenStatsRef = useRef(tokenStats);
  const [llm1Rows, setLlm1Rows] = useState(null);
  const [comparisonRows, setComparisonRows] = useState(null);
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [preselectedOptCodes, setPreselectedOptCodes] = useState([]);
  const [finalRows, setFinalRows] = useState(null);
  const [iterationDetails, setIterationDetails] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [pendingRunState, setPendingRunState] = useState(null);
  const [loopOptEnabled, setLoopOptEnabled] = useState(false);

  useEffect(() => {
    if (comparisonRows && comparisonRows.length > 0) {
      const th = llm2Settings.similarityThreshold ?? 70;
      const codesToOpt = Array.from(new Set(
        comparisonRows
          .filter((r) => (r.similarity ?? 0) < th)
          .map((r) => r.indicator_code)
      ));
      setSelectedCodes(codesToOpt);
    }
  }, [comparisonRows, llm2Settings.similarityThreshold]);

  useEffect(() => { tokenStatsRef.current = tokenStats; }, [tokenStats]);

  useEffect(() => {
    (async () => {
      try {
        await initializeSimilarityAssets(parseExcel);
      } catch (_) { /* ignore */ }

      let sessionId = sessionStorage.getItem('wb_session_id');
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        sessionStorage.setItem('wb_session_id', sessionId);
      }

      try {
        const state = await getRunState();
        if (state) {
          if (state.sessionId === sessionId) {
            setPendingRunState(state);
          } else {
            resetRunState(RUN_ID).catch(() => {});
          }
        }
      } catch (_) { /* ignore */ }

      try {
        const fileRecords = await listFiles('pdf');
        if (fileRecords.length > 0) {
          const restored = fileRecords.map((r) => {
            const f = new File([r.data], r.name, { type: 'application/pdf', lastModified: r.lastModified ?? Date.now() });
            restoredFileIds.set(f, r.id);
            return f;
          });
          setPdfFiles(restored);
        }
      } catch (_) { /* ignore */ }

      try {
        const testsetRecords = await listFiles('testset');
        if (testsetRecords.length > 0) {
          const r = testsetRecords[testsetRecords.length - 1];
          setTestSetFile(new File([r.data], r.name, { type: r.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        }
      } catch (_) { /* ignore */ }

      try {
        const rows = await getComparisonRows(RUN_ID);
        if (rows && rows.length > 0) {
          const refreshedRows = refreshComparisonRowsWithCurrentSimilarityRules(rows);
          setComparisonRows(refreshedRows);
          try { await saveComparisonRows(RUN_ID, refreshedRows); } catch (_) { /* ignore */ }
        }
      } catch (_) { /* ignore */ }

      try {
        const rows = await getFinalRows(RUN_ID);
        if (rows && rows.length > 0) setFinalRows(rows);
      } catch (_) { /* ignore */ }

      try {
        const defRecords = await listFiles('definition');
        if (defRecords.length > 0) {
          const r = defRecords[defRecords.length - 1];
          setDefinitionFile(new File([r.data], r.name, { type: r.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        }
      } catch (_) { /* ignore */ }

      try {
        const pages = await listPdfPages();
        setCachedPages(pages);
      } catch (_) { /* ignore */ }
    })();
  }, []);

  const handlePdfSelect = async (files) => {
    const next = Array.isArray(files) ? files : [files].filter(Boolean);
    const bad = next.find((f) => !(f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')));
    if (bad) { window.alert(`请上传 PDF 文件。无效：${bad.name}`); return; }
    setPdfFiles((prev) => {
      const merged = [...prev];
      const seen = new Set(prev.map(getFileIdentity));
      next.forEach((f) => { const id = getFileIdentity(f); if (!seen.has(id)) { merged.push(f); seen.add(id); } });
      return merged;
    });
    for (const f of next) {
      try {
        const ab = await f.arrayBuffer();
        await saveFile(getFileIdentity(f), f.name, 'pdf', ab, f.lastModified);
      } catch (_) { /* ignore */ }
    }
  };

  const handlePdfRemove = async (f) => {
    const idbId = getPdfFileId(f);
    const uiId = getFileIdentity(f);
    setPdfFiles((prev) => prev.filter((x) => getFileIdentity(x) !== uiId));
    try { await deleteFile(idbId); } catch (_) { /* ignore */ }
  };

  const handleTestSetSelect = async (file) => {
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { window.alert('请上传 Excel 文件'); return; }
    setTestSetFile(file);
    try {
      const ab = await file.arrayBuffer();
      await saveFile('testset__current', file.name, 'testset', ab);
    } catch (_) { /* ignore */ }
  };

  const handleComparisonFileSelect = async (file) => {
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { window.alert('请上传 Excel 文件'); return; }
    setComparisonFile(file);
    try {
      const ab = await file.arrayBuffer();
      await saveFile('comparison__current', file.name, 'comparison', ab);
    } catch (_) { /* ignore */ }
  };

  const handleDefinitionFileSelect = async (file) => {
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { window.alert('请上传 Excel 文件'); return; }
    setDefinitionFile(file);
    try {
      const ab = await file.arrayBuffer();
      await saveFile('definition__current', file.name, 'definition', ab);
    } catch (_) { /* ignore */ }
  };

  const handleDeleteCachedPage = async (id) => {
    try {
      await deletePdfPage(id);
      setCachedPages((prev) => prev.filter((p) => p.id !== id));
    } catch (_) { /* ignore */ }
  };

  const handleDeleteReportPages = async (reportName) => {
    try {
      await deletePdfPagesByReport(reportName);
      setCachedPages((prev) => prev.filter((p) => p.reportName !== reportName));
    } catch (_) { /* ignore */ }
  };

  const extractionRuntimeConfig = resolveRuntimeLlmConfig(resolvePagePreset(
    MODEL_PAGE_KEYS.PROMPT_ITERATION,
    modelPresets,
    { [MODEL_PAGE_KEYS.PROMPT_ITERATION]: loadPageModelSelection(MODEL_PAGE_KEYS.PROMPT_ITERATION) }
  ));
  const optimizationRuntimeConfig = resolveRuntimeLlmConfig(resolvePagePreset(
    MODEL_PAGE_KEYS.PROMPT_OPTIMIZATION,
    modelPresets,
    { [MODEL_PAGE_KEYS.PROMPT_OPTIMIZATION]: loadPageModelSelection(MODEL_PAGE_KEYS.PROMPT_OPTIMIZATION) }
  ));
  const apiKey1 = extractionRuntimeConfig?.apiKey || '';
  const apiKey2 = optimizationRuntimeConfig?.apiKey || '';
  const canStartExtraction = Boolean(pdfFiles.length > 0 && testSetFile && apiKey1 && !isRunning);
  const canStartOptimization = Boolean(comparisonRows && apiKey2 && !isRunning);
  const canStandaloneOptimize = Boolean(comparisonFile && apiKey2 && !isRunning);
  const noApiKey = !apiKey1 && !apiKey2;

  const appendExLog = (entry) => {
    const id = `${Date.now()}-${Math.random()}`;
    setExLogs((prev) => [...prev, { id, ...entry }]);
    setExProgress((prev) => ({
      visible: true,
      status: entry.message || prev.status,
      percentage: entry.percentage >= 0 ? entry.percentage : prev.percentage,
      logs: [...prev.logs, { id, time: entry.timestamp, message: entry.message }],
      isLoading: entry.percentage >= 0 ? entry.percentage < 100 : prev.isLoading
    }));
    if (entry.completed !== undefined && entry.total !== undefined) {
      setPhase1Progress({ completed: entry.completed, total: entry.total });
    }
    if (entry.tokenStats) {
      setTokenStats({ ...tokenStatsRef.current, ...entry.tokenStats });
    }
  };

  const appendOptLog = (entry) => {
    const id = `${Date.now()}-${Math.random()}`;
    setOptLogs((prev) => [...prev, { id, ...entry }]);
    setOptProgress((prev) => ({
      visible: true,
      status: entry.message || prev.status,
      percentage: entry.percentage >= 0 ? entry.percentage : prev.percentage,
      logs: [...prev.logs, { id, time: entry.timestamp, message: entry.message }],
      isLoading: entry.percentage >= 0 ? entry.percentage < 100 : prev.isLoading
    }));
    if (entry.completed !== undefined && entry.total !== undefined) {
      setPhase2Progress({ completed: entry.completed, total: entry.total });
    }
  };

  const resetExProgress = (msg = '准备中...') => {
    setExLogs([]);
    setPhase1Progress({ completed: 0, total: 0 });
    setExProgress({ visible: true, status: msg, percentage: 0, logs: [], isLoading: true });
  };

  const resetOptProgress = (msg = '准备中...') => {
    setOptLogs([]);
    setPhase2Progress({ completed: 0, total: 0 });
    setOptProgress({ visible: true, status: msg, percentage: 0, logs: [], isLoading: true });
  };

  const runExtraction = async () => {
    interruptRef.current = { interrupted: false };
    setIsInterrupting(false);
    setIsRunning(true);
    setErrorMsg('');
    setComparisonRows(null);
    setFinalRows(null);
    setLlm1Rows(null);
    setPendingRunState(null);
    const stats = { extractInput: 0, extractOutput: 0, optInput: 0, optOutput: 0 };
    setTokenStats(stats);
    tokenStatsRef.current = stats;
    resetExProgress('准备中...');

    try {
      let definitionMap = null;
      if (definitionFile) {
        try {
          definitionMap = await parseDefinitionFile(definitionFile);
          appendExLog({ message: `定义文件解析完成，共 ${definitionMap.size} 个指标定义`, percentage: 1, timestamp: new Date().toLocaleTimeString() });
        } catch (defErr) {
          appendExLog({ message: `⚠️ 定义文件解析失败，将使用测试集 prompt 列：${defErr.message}`, percentage: 1, timestamp: new Date().toLocaleTimeString() });
        }
      }

      const result = await runExtractionPhase({
        pdfFiles,
        testSetFile,
        llm1Settings: {
          ...llm1Settings,
          ...extractionRuntimeConfig,
          apiKey: apiKey1
        },
        onProgress: (e) => appendExLog({ ...e, percentage: e.percentage ?? -1 }),
        runId: RUN_ID,
        tokenStats: tokenStatsRef.current,
        interruptSignal: interruptRef.current,
        definitionMap,
        sessionId: sessionStorage.getItem('wb_session_id')
      });
      setTokenStats({ ...tokenStatsRef.current });
      setLlm1Rows(result.llm1Results);
      setComparisonRows(result.comparisonRows);
      try { await saveComparisonRows(RUN_ID, result.comparisonRows); } catch (_) { /* ignore */ }
      await exportComparisonRows(result.comparisonRows);

      if (result.interrupted) {
        appendExLog({ message: '⚠️ 运行已中断，当前批次已完成。可继续运行或直接进行 Prompt 优化。', percentage: 100, timestamp: new Date().toLocaleTimeString() });
        const state = await getRunState();
        if (state) setPendingRunState(state);
      } else {
        appendExLog({ message: '✅ 提取完成！关联文件已自动下载，可继续 Prompt 优化。', percentage: 100, timestamp: new Date().toLocaleTimeString() });
      }

      const pages = await listPdfPages();
      setCachedPages(pages);
    } catch (err) {
      setErrorMsg(`提取失败：${err.message}`);
      appendExLog({ message: `❌ 提取失败：${err.message}`, percentage: 100, timestamp: new Date().toLocaleTimeString() });
    } finally {
      setIsRunning(false);
      setIsInterrupting(false);
      interruptRef.current = { interrupted: false };
      setExProgress((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const runOptimization = async (rows, effectiveMaxIter, defMap = null) => {
    interruptRef.current = { interrupted: false };
    setIsInterrupting(false);
    setIsRunning(true);
    setErrorMsg('');
    resetOptProgress('开始 Prompt 优化...');

    let definitionMap = defMap;
    if (!definitionMap && definitionFile) {
      try {
        definitionMap = await parseDefinitionFile(definitionFile);
      } catch (_) { /* ignore */ }
    }

    try {
      const { rows: updated, iterationDetails: nextIterationDetails } = await runOptimizationPhase({
        pdfFiles,
        comparisonRows: rows,
        llm2Settings: {
          ...llm2Settings,
          ...optimizationRuntimeConfig,
          apiKey: apiKey2,
          maxOptIterations: effectiveMaxIter ?? llm2Settings.maxOptIterations
        },
        onProgress: (e) => appendOptLog({ ...e, percentage: e.percentage ?? -1 }),
        runId: RUN_ID,
        tokenStats: tokenStatsRef.current,
        interruptSignal: interruptRef.current,
        onPartialResults: (partialRows) => setFinalRows([...partialRows]),
        definitionMap,
        sessionId: sessionStorage.getItem('wb_session_id')
      });
      setTokenStats({ ...tokenStatsRef.current });
      setFinalRows(updated);
      setIterationDetails(nextIterationDetails);
      try { await saveFinalRows(RUN_ID, updated); } catch (_) { /* ignore */ }
      await exportFinalResults(updated, tokenStatsRef.current, nextIterationDetails);
      appendOptLog({ message: '✅ Prompt 优化完成！最终结果已自动下载。', percentage: 100, timestamp: new Date().toLocaleTimeString() });
    } catch (err) {
      setErrorMsg(`优化失败：${err.message}`);
      appendOptLog({ message: `❌ 优化失败：${err.message}`, percentage: 100, timestamp: new Date().toLocaleTimeString() });
    } finally {
      setIsRunning(false);
      setIsInterrupting(false);
      interruptRef.current = { interrupted: false };
      setOptProgress((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const handleStandaloneOptimize = async () => {
    interruptRef.current = { interrupted: false };
    setIsInterrupting(false);
    setIsRunning(true);
    setErrorMsg('');
    setFinalRows(null);
    resetOptProgress('解析关联文件...');
    let rows;
    try {
      rows = await parseComparisonFile(comparisonFile);
      appendOptLog({ message: `关联文件解析完成，共 ${rows.length} 条`, percentage: 5, timestamp: new Date().toLocaleTimeString() });
    } catch (err) {
      setErrorMsg(`文件解析失败：${err.message}`);
      appendOptLog({ message: `❌ 文件解析失败：${err.message}`, percentage: 100, timestamp: new Date().toLocaleTimeString() });
      setIsRunning(false);
      setOptProgress((prev) => ({ ...prev, isLoading: false }));
      return;
    }
    setIsRunning(false);
    await runOptimization(rows, loopOptEnabled ? llm2Settings.maxOptIterations : 1);
  };

  const handleInterrupt = () => {
    interruptRef.current.interrupted = true;
    setIsInterrupting(true);
  };

  const handleDownloadCurrent = async () => {
    if (comparisonRows) await exportComparisonRows(comparisonRows);
    if (finalRows) await exportFinalResults(finalRows, tokenStatsRef.current, iterationDetails);
  };

  const handleResumeRun = async () => {
    setPendingRunState(null);
    await runExtraction();
  };

  const handleReset = async () => {
    if (!window.confirm('确定要重置当前运行状态？已保存的断点数据将清除。')) return;
    try { await resetRunState(RUN_ID); } catch (_) { /* ignore */ }
    setPendingRunState(null);
    setComparisonRows(null);
    setFinalRows(null);
    setLlm1Rows(null);
    setTokenStats({ extractInput: 0, extractOutput: 0, optInput: 0, optOutput: 0 });
    setExProgress(createInitialProgress());
    setOptProgress(createInitialProgress());
    setPhase1Progress({ completed: 0, total: 0 });
    setPhase2Progress({ completed: 0, total: 0 });
    setExLogs([]);
    setOptLogs([]);
    setErrorMsg('');
  };

  const handleIgnorePendingRun = () => setPendingRunState(null);

  const phase1Pct = phase1Progress.total > 0
    ? Math.round((phase1Progress.completed / phase1Progress.total) * 100)
    : (exProgress.percentage || 0);
  const phase2Pct = phase2Progress.total > 0
    ? Math.round((phase2Progress.completed / phase2Progress.total) * 100)
    : (optProgress.percentage || 0);

  const currentSubtab = normalizeTestSetWorkbenchSubtabKey(activeSubtab);

  useEffect(() => {
    try {
      localStorage.setItem(LS_TEST_SET_WORKBENCH_SUBTAB, currentSubtab);
    } catch (_) { /* ignore */ }
  }, [currentSubtab]);

  const vm = {
    pendingRunState,
    isRunning,
    isInterrupting,
    onInterrupt: handleInterrupt,
    onDownloadCurrent: handleDownloadCurrent,
    onReset: handleReset,
    onOpenSettings: onOpenModelPresetManager,
    noApiKey,
    cachedPages,
    onDeleteCachedPage: handleDeleteCachedPage,
    onDeleteReportPages: handleDeleteReportPages,
    canStartExtraction,
    pdfFiles,
    testSetFile,
    definitionFile,
    onSelectPdf: handlePdfSelect,
    onRemovePdf: handlePdfRemove,
    onSelectTestSet: handleTestSetSelect,
    onRemoveTestSet: () => setTestSetFile(null),
    onSelectDefinition: handleDefinitionFileSelect,
    onRemoveDefinition: () => setDefinitionFile(null),
    comparisonFile,
    onSelectComparisonFile: handleComparisonFileSelect,
    onRemoveComparisonFile: () => setComparisonFile(null),
    canStandaloneOptimize,
    onStartStandaloneOptimize: handleStandaloneOptimize,
    onStartExtraction: runExtraction,
    errorMsg,
    exProgress,
    phase1Progress,
    phase1Pct,
    exLogs,
    llm1Rows,
    comparisonRows,
    llm2Settings,
    stage1AnalysisRef,
    selectedCodes,
    onSelectedCodesChange: setSelectedCodes,
    loopOptEnabled,
    onLoopOptChange: setLoopOptEnabled,
    canStartOptimization,
    onStartOptimization: (codes, loopEnabled) => {
      const filteredRows = comparisonRows.filter((row) => codes.includes(row.indicator_code));
      runOptimization(filteredRows, loopEnabled ? llm2Settings.maxOptIterations : 1);
    },
    optProgress,
    phase2Progress,
    phase2Pct,
    optLogs,
    finalRows,
    tokenStats,
    iterationDetails,
    onExportLlm1Results: exportLlm1Results,
    onExportComparisonRows: exportComparisonRows,
    onExportFinalResults: exportFinalResults,
    llm1ModelName: extractionRuntimeConfig?.modelName || llm1Settings.modelName,
    llm2ModelName: optimizationRuntimeConfig?.modelName || llm2Settings.modelName,
    formatPdfFiles,
    formatExcelFile,
    onResumeRun: handleResumeRun,
    onIgnorePendingRun: handleIgnorePendingRun
  };

  return (
    <section className="glass-panel main-panel testbench-panel">
      <div className="section-heading workspace-heading">
        <div className="testbench-header-shell">
          <div className="testbench-header-copy">
            <h2 className="section-title">
              <IconFlask size={20} stroke={1.8} />
              <span>测试集工作台</span>
            </h2>
            <p className="section-caption">在完整流程、模型结果验收和 Prompt自动优化之间切换。</p>
          </div>
          <div className="testbench-header-actions">
            <Tooltip label="模型预设管理">
              <ActionIcon variant="default" size="lg" radius="xl" onClick={onOpenModelPresetManager} disabled={isRunning}>
                <IconSettings size={16} stroke={1.8} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="重置运行状态">
              <ActionIcon variant="default" size="lg" radius="xl" onClick={handleReset} disabled={isRunning}>
                <IconRefresh size={16} stroke={1.8} />
              </ActionIcon>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="workbench-subtab-nav workbench-subtab-nav--testset">
        {TEST_SET_SUBTABS.map((tab) => (
          <Button
            key={tab.key}
            variant={currentSubtab === tab.key ? 'filled' : 'default'}
            radius="xl"
            className="workbench-subtab-button"
            size="sm"
            onClick={() => {
              if (!isRunning) {
                setActiveSubtab(tab.key);
              }
            }}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {currentSubtab === 'prompt-iteration' && (
        <FullFlowMode modelPresets={modelPresets} />
      )}

      {currentSubtab === 'model-validation' && (
        <QuickValidationMode
          globalSettings={globalSettings}
          llm1Settings={llm1Settings}
          llm2Settings={llm2Settings}
          onSwitchToOptimization={(rows, preselectedCodes) => {
            setComparisonRows(rows);
            setPreselectedOptCodes(preselectedCodes || []);
            setSelectedCodes(preselectedCodes || []);
            setActiveSubtab('prompt-optimization');
          }}
        />
      )}

      {currentSubtab === 'prompt-optimization' && (
        <QuickOptimizationMode
          llm2Settings={llm2Settings}
          modelPresets={modelPresets}
          onOpenModelPresetManager={onOpenModelPresetManager}
          preselectedCodes={preselectedOptCodes}
        />
      )}
    </section>
  );
}
