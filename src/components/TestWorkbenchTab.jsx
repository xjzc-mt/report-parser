import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionIcon, Button, NumberInput, Progress, Switch, Tooltip } from '@mantine/core';
import {
  IconFileTypePdf,
  IconTableImport,
  IconPlayerPlayFilled,
  IconPlayerStop,
  IconDownload,
  IconFlask,
  IconSparkles,
  IconAlertCircle,
  IconSettings,
  IconRefresh,
  IconBook
} from '@tabler/icons-react';
import { UploadCard } from './UploadCard.jsx';
import { ProgressPanel } from './ProgressPanel.jsx';
import { PdfPageTree } from './PdfPageTree.jsx';
import { LLMSettingsDrawer } from './LLMSettingsDrawer.jsx';
import { ModeSelector } from './ModeSelector.jsx';
import { FullFlowMode } from './FullFlowMode.jsx';
import { QuickValidationMode } from './QuickValidationMode.jsx';
import { QuickOptimizationMode } from './QuickOptimizationMode.jsx';
import { AnalysisView } from './AnalysisView.jsx';
import { DEFAULT_SETTINGS } from '../constants/extraction.js';
import { DEFAULT_LLM1_SETTINGS, DEFAULT_LLM2_SETTINGS } from '../constants/testBench.js';
import {
  runExtractionPhase,
  runOptimizationPhase,
  exportComparisonRows,
  exportFinalResults,
  exportLlm1Results,
  parseComparisonFile,
  parseDefinitionFile,
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

// ── localStorage 持久化 LLM 设置 ─────────────────────────────────────────────
const LS_LLM1 = 'intelliextract_llm1';
const LS_LLM2 = 'intelliextract_llm2';

function loadSettings(key, defaults) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch (_) { /* ignore */ }
  return { ...defaults };
}

function saveSettings(key, settings) {
  try { localStorage.setItem(key, JSON.stringify(settings)); } catch (_) { /* ignore */ }
}

function createInitialProgress() {
  return { visible: false, status: '', percentage: 0, logs: [], isLoading: false };
}

// 记录从 IDB 恢复的 File 对象对应的存储 key，用于确保删除时能找到正确记录
const restoredFileIds = new WeakMap();

function getFileIdentity(file) {
  return `${file.name}__${file.size}__${file.lastModified}`;
}
function getPdfFileId(file) {
  // 优先使用 IDB 实际存储的 key（恢复的文件），否则用计算值（新上传的文件）
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

function SummaryStrip({ rows, showOptimized = false }) {
  if (!rows || rows.length === 0) return null;
  const total = rows.length;
  const matched = rows.filter((r) => r.match_status !== '未匹配').length;
  const unmatched = total - matched;
  const matchedRows = rows.filter((r) => r.match_status !== '未匹配');
  const validSims = matchedRows.map((r) => r.similarity).filter((s) => s !== null && s !== undefined);
  const avgSim = validSims.length > 0
    ? Math.round(validSims.reduce((s, v) => s + v, 0) / validSims.length)
    : 0;
  return (
    <div className="summary-strip testbench-summary-strip">
      <div className="summary-chip"><strong>总数</strong><span>{total}</span></div>
      <div className="summary-chip"><strong>已匹配</strong><span>{matched}</span></div>
      <div className="summary-chip"><strong>未匹配</strong><span>{unmatched}</span></div>
      <div className="summary-chip"><strong>平均相似度</strong><span>{avgSim}%</span></div>
      {showOptimized && (
        <div className="summary-chip">
          <strong>已优化 Prompt</strong>
          <span>{rows.filter((r) => r.improved_prompt).length}</span>
        </div>
      )}
    </div>
  );
}

const NOT_FOUND = '未披露';

function hasLlmOutput(row) {
  const t = String(row.llm_text_value ?? '').trim();
  const n = String(row.llm_num_value ?? '').trim();
  return (t && t !== NOT_FOUND) || (n && n !== NOT_FOUND && n !== '');
}

function hasGroundTruth(row) {
  const t = String(row.text_value ?? '').trim();
  const n = String(row.num_value ?? '').trim();
  return (t && t !== NOT_FOUND) || (n && n !== NOT_FOUND && n !== '');
}

function ResultsAnalytics({ rows, similarityThreshold = 70 }) {
  if (!rows || rows.length === 0) return null;
  const total = rows.length;
  const th = similarityThreshold;

  // LLM总输出 = match_status !== '未匹配' 的行（LLM有提取出来，不论相似度）
  const totalLlmOutput = rows.filter((r) => r.match_status !== '未匹配').length;
  // TP: LLM有提取 且 相似度达标（用于精确率/准确率）
  const TP = rows.filter((r) => r.match_status !== '未匹配' && (r.similarity ?? 0) >= th).length;
  // FP: LLM有实质输出 但 标准答案为空/未披露（过摘录）
  const FP = rows.filter((r) => hasLlmOutput(r) && !hasGroundTruth(r)).length;
  // TN: 标准答案为空 且 LLM也无实质输出
  const TN = rows.filter((r) => !hasGroundTruth(r) && !hasLlmOutput(r)).length;

  const accuracy = total > 0 ? (TP + TN) / total : null;
  // 精确率 = TP / LLM总输出（分母是LLM总输出，不只是有效输出）
  const precision = totalLlmOutput > 0 ? TP / totalLlmOutput : null;
  // 召回率 = LLM匹配上的数量 / 测试集数量（分母是有标准答案的总数，不受阈值影响）
  const testSetCount = rows.filter((r) => hasGroundTruth(r)).length;
  const recall = testSetCount > 0 ? totalLlmOutput / testSetCount : null;
  // 过摘录率 = FP / LLM总输出
  const overExtractionRate = totalLlmOutput > 0 ? FP / totalLlmOutput : null;
  const f1 = (precision !== null && recall !== null && (precision + recall) > 0)
    ? 2 * precision * recall / (precision + recall)
    : null;

  const pct = (v) => v !== null ? `${Math.round(v * 100)}%` : '—';
  const cls = (v, invert = false) => {
    if (v === null) return 'mid';
    if (invert) return v < 0.1 ? 'good' : v < 0.3 ? 'mid' : 'bad';
    return v >= 0.8 ? 'good' : v >= 0.6 ? 'mid' : 'bad';
  };

  return (
    <div className="results-analytics">
      <Tooltip
        label={`(TP+TN)/总样本。TP=${TP} 相似度≥${th}%，TN=${TN} 正确识别未披露，总=${total}。≥80% 良好，60-80% 一般，<60% 需关注。`}
        multiline w={320} withArrow
      >
        <div className={`analytics-chip analytics-chip-${cls(accuracy)}`}>
          <span className="analytics-chip-label">准确率</span>
          <span className="analytics-chip-value">{pct(accuracy)}</span>
          <span className="analytics-chip-sub">{TP + TN}/{total}</span>
        </div>
      </Tooltip>
      <Tooltip
        label={`达标提取/LLM总输出。分母=${totalLlmOutput}（match_status≠未匹配的全部行），分子=${TP}（相似度≥${th}%）。精确率低说明提取质量不达标。≥80% 良好，<60% 需优化。`}
        multiline w={340} withArrow
      >
        <div className={`analytics-chip analytics-chip-${cls(precision)}`}>
          <span className="analytics-chip-label">精确率</span>
          <span className="analytics-chip-value">{pct(precision)}</span>
          <span className="analytics-chip-sub">{TP}/{totalLlmOutput}</span>
        </div>
      </Tooltip>
      <Tooltip
        label={`LLM成功关联条数/总样本。分母=${total}（全部样本），分子=${totalLlmOutput}（match_status≠未匹配，不论相似度高低）。召回率低说明漏提取多。≥80% 良好，<60% 漏提取严重。`}
        multiline w={340} withArrow
      >
        <div className={`analytics-chip analytics-chip-${cls(recall)}`}>
          <span className="analytics-chip-label">召回率</span>
          <span className="analytics-chip-value">{pct(recall)}</span>
          <span className="analytics-chip-sub">{totalLlmOutput}/{total}</span>
        </div>
      </Tooltip>
      <Tooltip
        label={`FP/LLM总输出。FP=${FP}（LLM有输出但标准答案为空/未披露）。过摘录率高说明LLM虚报了不存在的数据。<10% 良好，10-30% 一般，>30% 需关注。`}
        multiline w={340} withArrow
      >
        <div className={`analytics-chip analytics-chip-${cls(overExtractionRate, true)}`}>
          <span className="analytics-chip-label">过摘录率</span>
          <span className="analytics-chip-value">{pct(overExtractionRate)}</span>
          <span className="analytics-chip-sub">FP={FP}</span>
        </div>
      </Tooltip>
      <Tooltip
        label={`2×精确率×召回率/(精确率+召回率)。精确率和召回率的调和平均，综合衡量提取质量。≥80% 良好，<60% 需大幅优化。`}
        multiline w={320} withArrow
      >
        <div className={`analytics-chip analytics-chip-${cls(f1)}`}>
          <span className="analytics-chip-label">F1</span>
          <span className="analytics-chip-value">{pct(f1)}</span>
        </div>
      </Tooltip>
    </div>
  );
}

function OptimizationAnalytics({ finalRows, similarityThreshold = 70 }) {
  if (!finalRows || finalRows.length === 0) return null;
  const th = similarityThreshold;
  const total = finalRows.length;

  // 待优化：优化前 similarity < th
  const pendingCount = finalRows.filter((r) => (r.similarity ?? 0) < th).length;
  // 已优化：LLM 2 生成了 improved_prompt
  const optimizedCount = finalRows.filter((r) => r.improved_prompt).length;
  // 优化成功：improved_prompt 非空 且 post_similarity >= th
  const successCount = finalRows.filter((r) => r.improved_prompt && (r.post_similarity ?? 0) >= th).length;
  const successRate = optimizedCount > 0 ? successCount / optimizedCount : null;
  const rateClass = successRate === null ? 'mid' : successRate >= 0.8 ? 'good' : successRate >= 0.5 ? 'mid' : 'bad';

  // 优化后平均相似度（有 post_similarity 的行）
  const postRows = finalRows.filter((r) => r.post_similarity !== null && r.post_similarity !== undefined);
  const avgPostSim = postRows.length > 0
    ? Math.round(postRows.reduce((s, r) => s + r.post_similarity, 0) / postRows.length)
    : null;

  return (
    <div className="results-analytics" style={{ marginTop: 8 }}>
      <Tooltip label={`finalRows 总行数。`} withArrow>
        <div className="analytics-chip analytics-chip-mid">
          <span className="analytics-chip-label">总数</span>
          <span className="analytics-chip-value">{total}</span>
          <span className="analytics-chip-sub">条</span>
        </div>
      </Tooltip>
      <Tooltip label={`优化前 similarity < ${th}% 的行数，即需要提升的样本数。`} withArrow>
        <div className="analytics-chip analytics-chip-mid">
          <span className="analytics-chip-label">待优化</span>
          <span className="analytics-chip-value">{pendingCount}</span>
          <span className="analytics-chip-sub">条</span>
        </div>
      </Tooltip>
      <Tooltip label={`LLM 2 生成了 improved_prompt 的行数（实际执行了优化的样本数）。`} withArrow>
        <div className={`analytics-chip analytics-chip-${optimizedCount >= pendingCount ? 'good' : optimizedCount > 0 ? 'mid' : 'bad'}`}>
          <span className="analytics-chip-label">已优化</span>
          <span className="analytics-chip-value">{optimizedCount}</span>
          <span className="analytics-chip-sub">条</span>
        </div>
      </Tooltip>
      <Tooltip label={`优化成功 = improved_prompt 非空 且验证后 post_similarity ≥ ${th}%。优化成功率 = 成功条数 / 已优化条数。`} multiline w={300} withArrow>
        <div className={`analytics-chip analytics-chip-${rateClass}`}>
          <span className="analytics-chip-label">优化成功率</span>
          <span className="analytics-chip-value">{successRate !== null ? `${Math.round(successRate * 100)}%` : '—'}</span>
          <span className="analytics-chip-sub">({successCount}/{optimizedCount})</span>
        </div>
      </Tooltip>
      <Tooltip label={`有循环验证结果的 ${postRows.length} 行的 post_similarity 平均值。`} withArrow>
        <div className={`analytics-chip analytics-chip-${avgPostSim === null ? 'mid' : avgPostSim >= th ? 'good' : avgPostSim >= th * 0.8 ? 'mid' : 'bad'}`}>
          <span className="analytics-chip-label">优化后相似度</span>
          <span className="analytics-chip-value">{avgPostSim !== null ? `${avgPostSim}%` : '—'}</span>
          <span className="analytics-chip-sub">{postRows.length > 0 ? `(${postRows.length}行)` : ''}</span>
        </div>
      </Tooltip>
    </div>
  );
}

function LogPanel({ title, logs, emptyHint = '暂无日志' }) {
  const bodyRef = useRef(null);
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [logs]);
  return (
    <div className="log-panel">
      <div className="log-panel-header">{title}</div>
      <div className="log-panel-body" ref={bodyRef}>
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

export function TestWorkbenchTab({ globalSettings = DEFAULT_SETTINGS }) {
  // ── 工作模式状态 ─────────────────────────────────────────────────────────────
  const [mode, setMode] = useState('full');

  // ── LLM 设置（从 localStorage 恢复）────────────────────────────────────────
  const [llm1Settings, setLlm1Settings] = useState(() => loadSettings(LS_LLM1, {
    ...DEFAULT_LLM1_SETTINGS,
    apiUrl: globalSettings.apiUrl,
    apiKey: ''
  }));
  const [llm2Settings, setLlm2Settings] = useState(() => loadSettings(LS_LLM2, {
    ...DEFAULT_LLM2_SETTINGS,
    apiUrl: globalSettings.apiUrl,
    apiKey: ''
  }));
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleChangeLlm1 = useCallback((key, val) => {
    setLlm1Settings((prev) => {
      const next = { ...prev, [key]: val };
      saveSettings(LS_LLM1, next);
      return next;
    });
  }, []);
  const handleChangeLlm2 = useCallback((key, val) => {
    setLlm2Settings((prev) => {
      const next = { ...prev, [key]: val };
      saveSettings(LS_LLM2, next);
      return next;
    });
  }, []);

  // ── 文件状态（IndexedDB 持久化）─────────────────────────────────────────────
  const [pdfFiles, setPdfFiles] = useState([]);
  const [testSetFile, setTestSetFile] = useState(null);
  const [comparisonFile, setComparisonFile] = useState(null);
  const [definitionFile, setDefinitionFile] = useState(null);

  // ── 缓存页面树 ──────────────────────────────────────────────────────────────
  const [cachedPages, setCachedPages] = useState([]);

  // ── 运行状态 ───────────────────────────────────────────────────────────────
  const [isRunning, setIsRunning] = useState(false);
  const [isInterrupting, setIsInterrupting] = useState(false);
  const interruptRef = useRef({ interrupted: false });
  const [exProgress, setExProgress] = useState(createInitialProgress);
  const [optProgress, setOptProgress] = useState(createInitialProgress);
  const [exLogs, setExLogs] = useState([]);
  const [optLogs, setOptLogs] = useState([]);

  // ── 进度百分比（实时）─────────────────────────────────────────────────────
  const [phase1Progress, setPhase1Progress] = useState({ completed: 0, total: 0 });
  const [phase2Progress, setPhase2Progress] = useState({ completed: 0, total: 0 });

  // ── Token 统计 ─────────────────────────────────────────────────────────────
  const [tokenStats, setTokenStats] = useState({ extractInput: 0, extractOutput: 0, optInput: 0, optOutput: 0 });
  const tokenStatsRef = useRef(tokenStats);

  // ── 阶段结果 ───────────────────────────────────────────────────────────────
  const [llm1Rows, setLlm1Rows] = useState(null);
  const [comparisonRows, setComparisonRows] = useState(null);
  // 从验收模式跳转时传入的预选优化指标
  const [preselectedOptCodes, setPreselectedOptCodes] = useState([]);
  const [finalRows, setFinalRows] = useState(null);
  const [iterationDetails, setIterationDetails] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // ── 断点恢复提示 ───────────────────────────────────────────────────────────
  const [pendingRunState, setPendingRunState] = useState(null);

  // ── 模式切换处理 ───────────────────────────────────────────────────────────
  const handleModeChange = (newMode) => {
    console.log('handleModeChange called:', newMode, 'isRunning:', isRunning);
    if (isRunning) return;
    if ((comparisonRows && comparisonRows.length > 0) || finalRows) {
      if (!window.confirm('切换模式将清空当前结果，是否继续？')) {
        return;
      }
    }
    console.log('Setting mode to:', newMode);
    setMode(newMode);
    setComparisonRows([]);
    setFinalRows(null);
  };

  // ── 初始化：恢复持久化文件列表、结果和缓存页面 ──────────────────────────────
  useEffect(() => {
    (async () => {
      // 生成或复用 session ID（sessionStorage 跨刷新持久，新导航或关闭标签后清空）
      let sessionId = sessionStorage.getItem('wb_session_id');
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        sessionStorage.setItem('wb_session_id', sessionId);
      }

      // 检查未完成 runState，仅当 sessionId 匹配时才显示恢复横幅
      try {
        const state = await getRunState();
        if (state) {
          if (state.sessionId === sessionId) {
            setPendingRunState(state);
          } else {
            // session 不匹配（服务重启后重新导航、关闭标签等）→ 静默清除旧状态
            resetRunState(RUN_ID).catch(() => {});
          }
        }
      } catch (_) { /* ignore */ }

      // 恢复 PDF 文件列表
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

      // 恢复测试集文件
      try {
        const testsetRecords = await listFiles('testset');
        if (testsetRecords.length > 0) {
          const r = testsetRecords[testsetRecords.length - 1];
          setTestSetFile(new File([r.data], r.name, { type: r.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        }
      } catch (_) { /* ignore */ }

      // 恢复阶段一关联结果
      try {
        const rows = await getComparisonRows(RUN_ID);
        if (rows && rows.length > 0) setComparisonRows(rows);
      } catch (_) { /* ignore */ }

      // 恢复阶段二最终结果
      try {
        const rows = await getFinalRows(RUN_ID);
        if (rows && rows.length > 0) setFinalRows(rows);
      } catch (_) { /* ignore */ }

      // 恢复指标定义文件
      try {
        const defRecords = await listFiles('definition');
        if (defRecords.length > 0) {
          const r = defRecords[defRecords.length - 1];
          setDefinitionFile(new File([r.data], r.name, { type: r.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        }
      } catch (_) { /* ignore */ }

      // 恢复缓存页面
      try {
        const pages = await listPdfPages();
        setCachedPages(pages);
      } catch (_) { /* ignore */ }
    })();
  }, []);

  // token 统计 ref 同步
  useEffect(() => { tokenStatsRef.current = tokenStats; }, [tokenStats]);

  // ── 文件处理 ───────────────────────────────────────────────────────────────
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
    // 持久化到 IndexedDB
    for (const f of next) {
      try {
        const ab = await f.arrayBuffer();
        await saveFile(getFileIdentity(f), f.name, 'pdf', ab, f.lastModified);
      } catch (_) { /* 写入失败不阻断 */ }
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

  // ── 优化开关（Feature 1）──────────────────────────────────────────────────
  const [loopOptEnabled, setLoopOptEnabled] = useState(false);

  // ── API Key 解析 ───────────────────────────────────────────────────────────
  const apiKey1 = llm1Settings.apiKey || globalSettings.apiKey || import.meta.env.VITE_GEMINI_API_KEY || '';
  const apiKey2 = llm2Settings.apiKey || globalSettings.apiKey || import.meta.env.VITE_GEMINI_API_KEY || '';

  // ── 按钮可用性 ─────────────────────────────────────────────────────────────
  const canStartExtraction = Boolean(pdfFiles.length > 0 && testSetFile && apiKey1 && !isRunning);
  const canStartOptimization = Boolean(comparisonRows && apiKey2 && !isRunning);
  const canStandaloneOptimize = Boolean(comparisonFile && apiKey2 && !isRunning);

  // ── 进度辅助 ───────────────────────────────────────────────────────────────
  const mkLogId = () => `${Date.now()}-${Math.random()}`;

  const appendExLog = (entry) => {
    setExLogs((prev) => [...prev, { id: mkLogId(), ...entry }]);
    setExProgress((prev) => ({
      visible: true,
      status: entry.message || prev.status,
      percentage: entry.percentage >= 0 ? entry.percentage : prev.percentage,
      logs: [...prev.logs, { id: mkLogId(), time: entry.timestamp, message: entry.message }],
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
    setOptLogs((prev) => [...prev, { id: mkLogId(), ...entry }]);
    setOptProgress((prev) => ({
      visible: true,
      status: entry.message || prev.status,
      percentage: entry.percentage >= 0 ? entry.percentage : prev.percentage,
      logs: [...prev.logs, { id: mkLogId(), time: entry.timestamp, message: entry.message }],
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

  // ── 阶段一：提取 ──────────────────────────────────────────────────────────
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
      // 解析指标定义文件（可选）
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
        llm1Settings: { ...llm1Settings, apiKey: apiKey1 },
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
      // 持久化阶段一关联结果
      try { await saveComparisonRows(RUN_ID, result.comparisonRows); } catch (_) { /* ignore */ }
      // 自动下载关联文件
      await exportComparisonRows(result.comparisonRows);

      if (result.interrupted) {
        appendExLog({ message: '⚠️ 运行已中断，当前批次已完成。可继续运行或直接进行 Prompt 优化。', percentage: 100, timestamp: new Date().toLocaleTimeString() });
        const state = await getRunState();
        if (state) setPendingRunState(state);
      } else {
        appendExLog({ message: '✅ 提取完成！关联文件已自动下载，可继续 Prompt 优化。', percentage: 100, timestamp: new Date().toLocaleTimeString() });
      }

      // 刷新缓存页面树
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

  // ── 阶段二：优化 ──────────────────────────────────────────────────────────
  const runOptimization = async (rows, effectiveMaxIter, defMap = null) => {
    interruptRef.current = { interrupted: false };
    setIsInterrupting(false);
    setIsRunning(true);
    setErrorMsg('');
    resetOptProgress('开始 Prompt 优化...');

    // 若未传入 defMap，尝试从当前状态解析定义文件
    let definitionMap = defMap;
    if (!definitionMap && definitionFile) {
      try {
        definitionMap = await parseDefinitionFile(definitionFile);
      } catch (_) { /* 失败不阻断优化 */ }
    }

    try {
      const { rows: updated, iterationDetails } = await runOptimizationPhase({
        pdfFiles,
        comparisonRows: rows,
        llm2Settings: {
          ...llm2Settings,
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
      setIterationDetails(iterationDetails);
      // 持久化阶段二最终结果
      try { await saveFinalRows(RUN_ID, updated); } catch (_) { /* ignore */ }
      // 自动下载最终结果
      await exportFinalResults(updated, tokenStatsRef.current, iterationDetails);
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

  // ── 独立优化 ───────────────────────────────────────────────────────────────
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

  // ── 中断运行 ───────────────────────────────────────────────────────────────
  const handleInterrupt = () => {
    interruptRef.current.interrupted = true;
    setIsInterrupting(true);
  };

  // ── 下载当前结果 ───────────────────────────────────────────────────────────
  const handleDownloadCurrent = async () => {
    if (comparisonRows) await exportComparisonRows(comparisonRows);
    if (finalRows) await exportFinalResults(finalRows, tokenStatsRef.current, iterationDetails);
  };

  // ── 断点续跑 ───────────────────────────────────────────────────────────────
  const handleResumeRun = async () => {
    setPendingRunState(null);
    await runExtraction();
  };

  // ── 重置运行 ───────────────────────────────────────────────────────────────
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

  const noApiKey = !apiKey1 && !apiKey2;

  const phase1Pct = phase1Progress.total > 0
    ? Math.round((phase1Progress.completed / phase1Progress.total) * 100)
    : (exProgress.percentage || 0);
  const phase2Pct = phase2Progress.total > 0
    ? Math.round((phase2Progress.completed / phase2Progress.total) * 100)
    : (optProgress.percentage || 0);

  return (
    <section className="glass-panel main-panel testbench-panel">
      {/* ── 头部 + 齿轮 ── */}
      <div className="section-heading workspace-heading">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div>
            <h2 className="section-title">
              <IconFlask size={20} stroke={1.8} />
              <span>测试集工作台</span>
            </h2>
            <p className="section-caption">上传 PDF 与测试集，AI 提取 ESG 指标并与标准答案对比，再跨报告优化 Prompt。</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {isRunning && (
              <Tooltip label={isInterrupting ? '正在等待当前批次完成...' : '中断：当前批次完成后停止，可继续恢复'}>
                <ActionIcon
                  variant="light"
                  color="orange"
                  size="lg"
                  radius="xl"
                  onClick={handleInterrupt}
                  disabled={isInterrupting}
                >
                  <IconPlayerStop size={16} stroke={1.8} />
                </ActionIcon>
              </Tooltip>
            )}
            {(comparisonRows || finalRows) && !isRunning && (
              <Tooltip label="下载当前结果">
                <ActionIcon variant="default" size="lg" radius="xl" onClick={handleDownloadCurrent}>
                  <IconDownload size={16} stroke={1.8} />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label="重置运行状态">
              <ActionIcon variant="default" size="lg" radius="xl" onClick={handleReset} disabled={isRunning}>
                <IconRefresh size={16} stroke={1.8} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="LLM 配置">
              <ActionIcon variant="default" size="lg" radius="xl" onClick={() => setSettingsOpen(true)} disabled={isRunning}>
                <IconSettings size={16} stroke={1.8} />
              </ActionIcon>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* ── 模式选择器 ── */}
      <ModeSelector
        currentMode={mode}
        onModeChange={handleModeChange}
        disabled={isRunning}
      />

      {/* ── 完整流程模式（当前现有功能） ── */}
      {mode === 'full' && (
        <>
      {/* ── 未完成运行提示 ── */}
      {pendingRunState && !isRunning && (
        <div className="testbench-resume-banner">
          <IconAlertCircle size={16} />
          <span>检测到未完成的运行（已完成 {pendingRunState.completedGroups?.length || 0} 个分组），是否从断点继续？</span>
          <Button size="xs" radius="xl" variant="filled" onClick={handleResumeRun}>继续</Button>
          <Button size="xs" radius="xl" variant="default" onClick={() => setPendingRunState(null)}>忽略</Button>
        </div>
      )}

      {/* ── 上传区 ── */}
      <div className="testbench-upload-grid">
        <UploadCard
          icon={<IconFileTypePdf size={26} stroke={1.8} />}
          tag="PDF"
          title="待解析报告"
          hint="上传完整 PDF 报告（可多选）"
          acceptHint="文件名去掉扩展名需与测试集 report_name 列一致"
          buttonLabel="选择 PDF 文件"
          accept="application/pdf"
          file={pdfFiles}
          multiple
          onFileSelect={handlePdfSelect}
          onRemoveFile={handlePdfRemove}
          formatFileInfo={formatPdfFiles}
        />
        <UploadCard
          icon={<IconTableImport size={26} stroke={1.8} />}
          tag="EXCEL"
          title="测试集文件"
          hint="包含标准答案的测试集 Excel"
          acceptHint="必传列：report_name, indicator_code, pdf_numbers, text_value, prompt (若未传定义文件)"
          buttonLabel="选择测试集"
          accept=".xlsx,.xls,.csv"
          file={testSetFile}
          onFileSelect={handleTestSetSelect}
          onRemoveFile={() => setTestSetFile(null)}
          formatFileInfo={formatExcelFile}
        />
      </div>

      {/* ── 定义文件上传区（可选，独行）── */}
      <div className="testbench-definition-row">
        <UploadCard
          icon={<IconBook size={22} stroke={1.8} />}
          tag="EXCEL（可选）"
          title="指标摘录定义文件"
          hint="核心包含每个指标的特定提取 Prompt（支持仅有 indicator_code 和 prompt 列）"
          acceptHint="必传列：indicator_code, prompt。若无 prompt 则组合使用 definition, guidance 列"
          buttonLabel="选择定义文件"
          accept=".xlsx,.xls,.csv"
          file={definitionFile}
          onFileSelect={handleDefinitionFileSelect}
          onRemoveFile={() => setDefinitionFile(null)}
          formatFileInfo={formatExcelFile}
        />
      </div>

      {noApiKey && (
        <p className="testbench-warn">⚠️ 未检测到 API Key，请点击右上角齿轮配置 LLM</p>
      )}

      {/* ── 缓存页面树 ── */}
      {cachedPages.length > 0 && (
        <div className="testbench-cache-section">
          <div className="testbench-cache-header">
            <span className="testbench-phase-label">已缓存切分页面</span>
          </div>
          <PdfPageTree pages={cachedPages} onDelete={handleDeleteCachedPage} onDeleteReport={handleDeleteReportPages} />
        </div>
      )}

      {/* ── Token 统计 ── */}
      <TokenStatsBar
        tokenStats={tokenStats}
        llm1ModelName={llm1Settings.modelName}
        llm2ModelName={llm2Settings.modelName}
      />

      {/* ── 阶段一操作区 ── */}
      <div className="testbench-action">
        <Button
          size="lg"
          radius="xl"
          className="btn-primary btn-primary-mantine"
          disabled={!canStartExtraction}
          onClick={runExtraction}
          leftSection={<IconPlayerPlayFilled size={16} />}
        >
          {isRunning ? '提取中...' : '开始提取'}
        </Button>
      </div>

      {/* ── 错误提示 ── */}
      {errorMsg && (
        <div className="testbench-error-block">
          <IconAlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ── 提取日志 + 进度 ── */}
      {exProgress.visible && (
        <>
          {phase1Progress.total > 0 && (
            <div className="testbench-progress-row">
              <span className="testbench-progress-label">提取进度 {phase1Progress.completed}/{phase1Progress.total}</span>
              <Progress value={phase1Pct} size="sm" radius="xl" style={{ flex: 1 }} />
              <span className="testbench-progress-pct">{phase1Pct}%</span>
            </div>
          )}
          <LogPanel title="提取日志" logs={exLogs} emptyHint="提取运行后在此显示日志" />
        </>
      )}

      {/* ── 阶段一结果 ── */}
      {comparisonRows && (
        <div className="testbench-result-block">
          <div className="testbench-result-header">
            <span className="testbench-phase-label">阶段一结果</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {llm1Rows && llm1Rows.length > 0 && (
                <Button
                  size="sm"
                  radius="xl"
                  variant="default"
                  className="btn-outline"
                  leftSection={<IconDownload size={14} />}
                  onClick={() => exportLlm1Results(llm1Rows)}
                >
                  下载提取结果（{llm1Rows.length} 条）
                </Button>
              )}
              <Button
                size="sm"
                radius="xl"
                variant="default"
                className="btn-outline"
                leftSection={<IconDownload size={14} />}
                onClick={() => exportComparisonRows(comparisonRows)}
              >
                下载关联文件（{comparisonRows.length} 条）
              </Button>
            </div>
          </div>
          <AnalysisView comparisonRows={comparisonRows} similarityThreshold={llm2Settings.similarityThreshold ?? 70}>
            <div>
              <SummaryStrip rows={comparisonRows} />
              <ResultsAnalytics rows={comparisonRows} similarityThreshold={llm2Settings.similarityThreshold ?? 70} />
            </div>
          </AnalysisView>

          {/* 阶段二入口 + 循环优化开关 */}
          <div className="testbench-action testbench-opt-action" style={{ marginTop: 8 }}>
            <Button
              size="md"
              radius="xl"
              className="btn-primary btn-primary-mantine"
              disabled={!canStartOptimization}
              onClick={() => runOptimization(comparisonRows, loopOptEnabled ? llm2Settings.maxOptIterations : 1)}
              leftSection={<IconSparkles size={15} />}
            >
              {isRunning ? '优化中...' : '开始 Prompt 优化'}
            </Button>
            <Switch
              label="循环优化"
              checked={loopOptEnabled}
              onChange={(e) => setLoopOptEnabled(e.currentTarget.checked)}
              disabled={isRunning}
              size="sm"
            />
            <div className="opt-params">
              <NumberInput
                label="循环轮数"
                min={1}
                max={20}
                size="xs"
                style={{ width: 90 }}
                value={llm2Settings.maxOptIterations || 1}
                onChange={(val) => handleChangeLlm2('maxOptIterations', Number(val) || 1)}
                disabled={!loopOptEnabled || isRunning}
              />
              <NumberInput
                label="相似度阈值%"
                min={0}
                max={100}
                size="xs"
                style={{ width: 100 }}
                value={llm2Settings.similarityThreshold ?? 70}
                onChange={(val) => handleChangeLlm2('similarityThreshold', Number(val) ?? 70)}
                disabled={isRunning}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── 优化日志（阶段一结果下方）── */}
      {optProgress.visible && (
        <>
          {phase2Progress.total > 0 && (
            <div className="testbench-progress-row">
              <span className="testbench-progress-label">优化进度 {phase2Progress.completed}/{phase2Progress.total}</span>
              <Progress value={phase2Pct} size="sm" radius="xl" color="violet" style={{ flex: 1 }} />
              <span className="testbench-progress-pct">{phase2Pct}%</span>
            </div>
          )}
          <LogPanel title="优化日志" logs={optLogs} emptyHint="Prompt 优化运行后在此显示日志" />
        </>
      )}

      {/* ── 阶段二结果 ── */}
      {finalRows && (
        <div className="testbench-result-block testbench-result-final">
          <div className="testbench-result-header">
            <span className="testbench-phase-label">优化结果</span>
            <Button
              size="sm"
              radius="xl"
              className="btn-primary btn-primary-mantine"
              leftSection={<IconDownload size={14} />}
              onClick={() => exportFinalResults(finalRows, tokenStats, iterationDetails)}
            >
              下载优化文件（{finalRows.length} 条）
            </Button>
          </div>
          <OptimizationAnalytics
            finalRows={finalRows}
            similarityThreshold={llm2Settings.similarityThreshold ?? 70}
          />
        </div>
      )}

      {/* ── 独立优化入口 ── */}
      <div className="testbench-standalone">
        <div className="testbench-standalone-header">
          <span className="testbench-phase-label">独立 Prompt 优化</span>
          <span className="testbench-standalone-hint">已有关联文件？跳过提取直接优化</span>
        </div>
        <div className="testbench-standalone-row">
          <div className="testbench-standalone-upload">
            <UploadCard
              icon={<IconTableImport size={22} stroke={1.8} />}
              tag="EXCEL"
              title="关联对比文件"
              hint="上传阶段一导出的关联文件"
              acceptHint="需含 report_name、indicator_code、pdf_numbers、llm_text_value 列"
              buttonLabel="选择关联文件"
              accept=".xlsx,.xls,.csv"
              file={comparisonFile}
              onFileSelect={handleComparisonFileSelect}
              onRemoveFile={() => setComparisonFile(null)}
              formatFileInfo={formatExcelFile}
            />
          </div>
          <div className="testbench-standalone-action">
            <Button
              size="md"
              radius="xl"
              className="btn-primary btn-primary-mantine"
              disabled={!canStandaloneOptimize}
              onClick={handleStandaloneOptimize}
              leftSection={<IconSparkles size={15} />}
            >
              {isRunning ? '优化中...' : '开始独立优化'}
            </Button>
            <Switch
              label="循环优化"
              checked={loopOptEnabled}
              onChange={(e) => setLoopOptEnabled(e.currentTarget.checked)}
              disabled={isRunning}
              size="sm"
            />
            <div className="opt-params">
              <NumberInput
                label="循环轮数"
                min={1}
                max={20}
                size="xs"
                style={{ width: 90 }}
                value={llm2Settings.maxOptIterations || 1}
                onChange={(val) => handleChangeLlm2('maxOptIterations', Number(val) || 1)}
                disabled={!loopOptEnabled || isRunning}
              />
            </div>
          </div>
        </div>
      </div>
        </>
      )}

      {/* ── 快速验收模式 ── */}
      {mode === 'validation' && (
        <QuickValidationMode
          globalSettings={globalSettings}
          llm1Settings={llm1Settings}
          llm2Settings={llm2Settings}
          onChangeLlm1={handleChangeLlm1}
          onChangeLlm2={handleChangeLlm2}
          onSwitchToOptimization={(rows, preselectedCodes) => {
            setComparisonRows(rows);
            setPreselectedOptCodes(preselectedCodes || []);
            setMode('optimization');
          }}
        />
      )}

      {/* ── 快速优化模式 ── */}
      {mode === 'optimization' && (
        <QuickOptimizationMode
          globalSettings={globalSettings}
          llm1Settings={llm1Settings}
          llm2Settings={llm2Settings}
          onChangeLlm1={handleChangeLlm1}
          onChangeLlm2={handleChangeLlm2}
          preselectedCodes={preselectedOptCodes}
        />
      )}

      {/* ── LLM 配置抽屉 ── */}
      <LLMSettingsDrawer
        opened={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        llm1Settings={llm1Settings}
        llm2Settings={llm2Settings}
        onChangeLlm1={handleChangeLlm1}
        onChangeLlm2={handleChangeLlm2}
      />
    </section>
  );
}
