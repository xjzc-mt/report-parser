import { useEffect, useMemo, useState } from 'react';
import { Tabs } from '@mantine/core';
import { MODEL_PAGE_KEYS, PAGE_REQUIRED_CAPABILITIES } from '../constants/modelPresets.js';
import {
  applyOptimizationCandidate,
  createDatasetFromComparisonRows,
  startPromptOptimizationRun
} from '../services/promptOptimizationService.js';
import { listPromptOptimizationRuns } from '../services/promptOptimizationRepository.js';
import {
  checkPdfMatching,
  exportFinalResults,
  filterRowsByPdfAvailability,
  parseComparisonFile,
  runOptimizationPhase
} from '../services/testBenchService.js';
import {
  clearPageModelSelection,
  loadPageModelSelection,
  savePageModelSelection
} from '../utils/modelPresetStorage.js';
import {
  createPromptAsset,
  createPromptVersion,
  summarizeOptimizationRun
} from '../utils/promptOptimizationModel.js';
import {
  buildPromptOptimizationRunSnapshot,
  buildPromptOptimizationTargetOptions
} from '../utils/promptOptimizationViewModel.js';
import {
  getPresetCapabilityError,
  resolvePagePreset,
  resolveRuntimeLlmConfig
} from '../services/modelPresetResolver.js';
import { PagePresetQuickSwitch } from './modelPresets/PagePresetQuickSwitch.jsx';
import { OptimizationHistoryPanel } from './promptOptimization/OptimizationHistoryPanel.jsx';
import { OptimizationReviewPanel } from './promptOptimization/OptimizationReviewPanel.jsx';
import { OptimizationSetupPanel } from './promptOptimization/OptimizationSetupPanel.jsx';

function withRunSummary(run) {
  const summary = summarizeOptimizationRun(run);
  return {
    ...run,
    bestCandidateId: run?.bestCandidateId || summary.bestCandidateId,
    bestScore: run?.bestScore ?? summary.bestScore
  };
}

function normalizeIndicatorCode(value) {
  return String(value || '').trim();
}

export function QuickOptimizationMode({
  llm2Settings,
  modelPresets = [],
  globalDefaultPresetId = '',
  onOpenModelPresetManager,
  preselectedCodes = []
}) {
  const [selectedPresetId, setSelectedPresetId] = useState(() => loadPageModelSelection(MODEL_PAGE_KEYS.PROMPT_OPTIMIZATION));
  const [comparisonFile, setComparisonFile] = useState(null);
  const [pdfFiles, setPdfFiles] = useState([]);
  const [comparisonRows, setComparisonRows] = useState([]);
  const [selectedTargetCode, setSelectedTargetCode] = useState('');
  const [targetName, setTargetName] = useState('');
  const [maxIterations, setMaxIterations] = useState(2);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [error, setError] = useState('');
  const [runs, setRuns] = useState([]);
  const [currentRun, setCurrentRun] = useState(null);
  const [activeTab, setActiveTab] = useState('setup');

  const selectedPreset = useMemo(
    () => resolvePagePreset(
      MODEL_PAGE_KEYS.PROMPT_OPTIMIZATION,
      modelPresets,
      { [MODEL_PAGE_KEYS.PROMPT_OPTIMIZATION]: selectedPresetId },
      globalDefaultPresetId
    ),
    [globalDefaultPresetId, modelPresets, selectedPresetId]
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

  const targetOptions = useMemo(
    () => buildPromptOptimizationTargetOptions(comparisonRows, preselectedCodes),
    [comparisonRows, preselectedCodes]
  );

  const selectedTargetRows = useMemo(
    () => comparisonRows.filter((row) => normalizeIndicatorCode(row?.indicator_code) === selectedTargetCode),
    [comparisonRows, selectedTargetCode]
  );

  const requiredReports = useMemo(
    () => Array.from(new Set(selectedTargetRows.map((row) => String(row.report_name || '').trim()).filter(Boolean))),
    [selectedTargetRows]
  );

  const canOptimize = Boolean(
    selectedTargetRows.length > 0 &&
    pdfFiles.length > 0 &&
    targetName.trim() &&
    runtimeConfig?.apiKey &&
    !capabilityError &&
    !isOptimizing
  );

  useEffect(() => {
    let cancelled = false;

    listPromptOptimizationRuns()
      .then((historyRuns) => {
        if (cancelled) {
          return;
        }
        setRuns(historyRuns.map(withRunSummary));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!targetOptions.length) {
      setSelectedTargetCode('');
      return;
    }

    setSelectedTargetCode((previous) => (
      targetOptions.some((option) => option.value === previous)
        ? previous
        : targetOptions[0].value
    ));
  }, [targetOptions]);

  useEffect(() => {
    const option = targetOptions.find((item) => item.value === selectedTargetCode);
    if (option) {
      setTargetName(option.name);
    }
  }, [selectedTargetCode, targetOptions]);

  const handleComparisonFileSelect = async (file) => {
    setComparisonFile(file);
    setError('');
    try {
      const rows = await parseComparisonFile(file);
      setComparisonRows(rows);
    } catch (err) {
      setComparisonRows([]);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleComparisonFileRemove = () => {
    setComparisonFile(null);
    setComparisonRows([]);
    setSelectedTargetCode('');
    setTargetName('');
    setError('');
  };

  const handlePdfSelect = (files) => {
    setPdfFiles(Array.isArray(files) ? files : [files]);
  };

  const handlePdfRemove = (file) => {
    setPdfFiles((previous) => previous.filter((item) => item !== file));
  };

  const handleStartOptimization = async () => {
    if (!canOptimize) {
      return;
    }

    setIsOptimizing(true);
    setError('');

    try {
      const baselinePrompt = String(
        selectedTargetRows.find((row) => String(row.prompt || '').trim())?.prompt || ''
      ).trim();

      if (!baselinePrompt) {
        throw new Error('当前目标缺少基线 Prompt，无法开始优化。');
      }

      const matchResult = checkPdfMatching(requiredReports, pdfFiles);
      const { optimizableRows } = filterRowsByPdfAvailability(selectedTargetRows, matchResult.matched);

      if (!optimizableRows.length) {
        throw new Error('当前目标没有可优化的行，请检查 PDF 是否完整上传。');
      }

      const llmSettings = {
        ...llm2Settings,
        apiUrl: runtimeConfig.apiUrl,
        apiKey: runtimeConfig.apiKey,
        modelName: runtimeConfig.modelName,
        providerType: runtimeConfig.providerType,
        capabilities: runtimeConfig.capabilities,
        maxOptIterations: maxIterations
      };

      const asset = createPromptAsset({
        name: targetName.trim(),
        targetName: targetName.trim()
      });
      const baselineVersion = createPromptVersion({
        assetId: asset.id,
        label: '基线版本',
        userPromptTemplate: baselinePrompt
      });
      const dataset = createDatasetFromComparisonRows({
        name: `${targetName.trim()} 数据集`,
        targetName: targetName.trim(),
        comparisonRows: optimizableRows,
        pdfFileIds: pdfFiles.map((file) => file.name)
      });

      const result = await startPromptOptimizationRun({
        asset,
        baselineVersion,
        dataset,
        pdfFiles,
        llmSettings
      }, {
        engine: async (engineInput) => {
          const tokenStats = {
            optInput: 0,
            optOutput: 0,
            extractInput: 0,
            extractOutput: 0
          };
          const legacyResult = await runOptimizationPhase({
            pdfFiles: engineInput.pdfFiles,
            comparisonRows: engineInput.comparisonRows,
            llm2Settings: engineInput.llmSettings,
            onProgress: () => {},
            onOptLog: () => {},
            tokenStats
          });
          const snapshot = buildPromptOptimizationRunSnapshot({
            assetId: engineInput.assetId,
            baselineVersionId: engineInput.baselineVersion.id,
            baselinePromptText: engineInput.baselineVersion.userPromptTemplate,
            targetName: targetName.trim(),
            rows: engineInput.comparisonRows,
            updatedRows: legacyResult.rows,
            iterationDetails: legacyResult.iterationDetails,
            llmSettings: engineInput.llmSettings,
            now: () => Date.now()
          });

          return {
            run: {
              ...snapshot.run,
              datasetId: engineInput.datasetId,
              tokenStats
            },
            resultRows: snapshot.resultRows
          };
        }
      });

      const nextRun = withRunSummary(result.run);
      setCurrentRun(nextRun);
      setRuns((previous) => [nextRun, ...previous.filter((item) => item.id !== nextRun.id)]);
      setActiveTab('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleSelectRun = (run) => {
    setCurrentRun(withRunSummary(run));
    setActiveTab('review');
  };

  const handleApplyCandidate = async (candidateId) => {
    if (!currentRun) {
      return;
    }

    try {
      const nextRun = withRunSummary(await applyOptimizationCandidate({
        asset: { id: currentRun.assetId },
        run: currentRun,
        candidateId
      }));
      setCurrentRun(nextRun);
      setRuns((previous) => previous.map((item) => (item.id === nextRun.id ? nextRun : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setActiveTab('setup');
    }
  };

  const handleExportCurrent = () => {
    if (!currentRun?.resultRows?.length) {
      return;
    }
    exportFinalResults(currentRun.resultRows, currentRun.tokenStats || {}, currentRun.iterationDetails || []);
  };

  return (
    <section className="quick-optimization-mode">
      <div className="panel-header prompt-optimization-shell-head">
        <div>
          <h3>Prompt 自动优化</h3>
          <p>当前先针对单个提取目标做 Prompt 文本优化，历史运行会保留在本地。</p>
        </div>
        <PagePresetQuickSwitch
          presets={modelPresets}
          preset={selectedPreset}
          value={selectedPreset?.id || selectedPresetId}
          requiredCapabilities={PAGE_REQUIRED_CAPABILITIES[MODEL_PAGE_KEYS.PROMPT_OPTIMIZATION]}
          usesGlobalDefault={!selectedPresetId}
          onChange={(presetId) => {
            setSelectedPresetId(presetId);
            savePageModelSelection(MODEL_PAGE_KEYS.PROMPT_OPTIMIZATION, presetId);
          }}
          onResetToGlobalDefault={() => {
            setSelectedPresetId('');
            clearPageModelSelection(MODEL_PAGE_KEYS.PROMPT_OPTIMIZATION);
          }}
          onOpenModelPresetManager={onOpenModelPresetManager}
          disabled={isOptimizing}
        />
      </div>

      {capabilityError ? (
        <div className="testbench-error-block prompt-optimization-error">
          <span>{capabilityError}</span>
        </div>
      ) : null}

      <Tabs
        value={activeTab}
        onChange={(value) => setActiveTab(value || 'setup')}
        className="prompt-optimization-tabs"
      >
        <Tabs.List>
          <Tabs.Tab value="setup">优化配置</Tabs.Tab>
          <Tabs.Tab value="history">历史运行</Tabs.Tab>
          <Tabs.Tab value="review" disabled={!currentRun}>结果审核</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="setup" pt="md">
          <OptimizationSetupPanel
            comparisonFile={comparisonFile}
            pdfFiles={pdfFiles}
            onComparisonFileSelect={handleComparisonFileSelect}
            onComparisonFileRemove={handleComparisonFileRemove}
            onPdfSelect={handlePdfSelect}
            onPdfRemove={handlePdfRemove}
            requiredReports={requiredReports}
            targetOptions={targetOptions}
            selectedTargetCode={selectedTargetCode}
            onSelectedTargetCodeChange={setSelectedTargetCode}
            targetName={targetName}
            onTargetNameChange={setTargetName}
            maxIterations={maxIterations}
            onMaxIterationsChange={setMaxIterations}
            selectedRowCount={selectedTargetRows.length}
            totalRowCount={comparisonRows.length}
            preselectedCodes={preselectedCodes}
            canOptimize={canOptimize}
            isOptimizing={isOptimizing}
            onStartOptimization={handleStartOptimization}
            error={error}
          />
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <OptimizationHistoryPanel
            runs={runs}
            onSelectRun={handleSelectRun}
          />
        </Tabs.Panel>

        <Tabs.Panel value="review" pt="md">
          <OptimizationReviewPanel
            run={currentRun}
            onApply={handleApplyCandidate}
            onExport={handleExportCurrent}
          />
        </Tabs.Panel>
      </Tabs>
    </section>
  );
}
