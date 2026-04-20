import { useEffect, useMemo, useState } from 'react';
import { Button } from '@mantine/core';
import { IconPlayerPlayFilled, IconRefresh, IconSettings, IconSparkles } from '@tabler/icons-react';
import { MODEL_PAGE_KEYS, PAGE_REQUIRED_CAPABILITIES } from '../constants/modelPresets.js';
import { DEFAULT_LLM1_SETTINGS } from '../constants/testBench.js';
import {
  getPromptIterationDraft,
  getPromptIterationHistory,
  restorePromptIterationDraftFiles,
  savePromptIterationDraft,
  savePromptIterationDraftFiles,
  savePromptIterationHistory
} from '../services/persistenceService.js';
import {
  runPromptIteration,
  clipPromptIterationHistory,
  normalizePromptIterationDraft,
  supportsPromptIterationPdfProvider
} from '../services/promptIterationService.js';
import { resolvePagePreset, resolveRuntimeLlmConfig } from '../services/modelPresetResolver.js';
import { loadPageModelSelection, savePageModelSelection } from '../utils/modelPresetStorage.js';
import { PagePresetSelect } from './modelPresets/PagePresetSelect.jsx';
import { PromptIterationConfigPanel } from './promptIteration/PromptIterationConfigPanel.jsx';
import { PromptIterationFileList } from './promptIteration/PromptIterationFileList.jsx';
import { PromptIterationResultsPanel } from './promptIteration/PromptIterationResultsPanel.jsx';

function hasAttachedFile(item) {
  return Boolean(item?.file && typeof item.file.arrayBuffer === 'function');
}

function createFallbackPromptIterationSettings() {
  return {
    ...DEFAULT_LLM1_SETTINGS,
    apiKey: import.meta.env.VITE_GEMINI_API_KEY || ''
  };
}

export function FullFlowMode({ vm, modelPresets = [] }) {
  const [draft, setDraft] = useState(() => normalizePromptIterationDraft(null));
  const [selectedPresetId, setSelectedPresetId] = useState(() => loadPageModelSelection(MODEL_PAGE_KEYS.PROMPT_ITERATION));
  const [history, setHistory] = useState([]);
  const [currentRun, setCurrentRun] = useState(null);
  const [activeResultTab, setActiveResultTab] = useState('current');
  const [isRunning, setIsRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [hasHydrated, setHasHydrated] = useState(false);

  const selectedPreset = useMemo(
    () => resolvePagePreset(
      MODEL_PAGE_KEYS.PROMPT_ITERATION,
      modelPresets,
      { [MODEL_PAGE_KEYS.PROMPT_ITERATION]: selectedPresetId }
    ),
    [modelPresets, selectedPresetId]
  );
  const runtimePresetSettings = useMemo(
    () => resolveRuntimeLlmConfig(selectedPreset),
    [selectedPreset]
  );
  const effectiveLlmSettings = useMemo(() => {
    const fallback = createFallbackPromptIterationSettings();
    return runtimePresetSettings
      ? {
          ...fallback,
          ...runtimePresetSettings
        }
      : fallback;
  }, [runtimePresetSettings, vm]);

  const persistedDraft = useMemo(
    () => normalizePromptIterationDraft(draft),
    [draft]
  );
  const supportsPdfUpload = useMemo(
    () => supportsPromptIterationPdfProvider(effectiveLlmSettings),
    [effectiveLlmSettings]
  );

  useEffect(() => {
    let isCancelled = false;

    (async () => {
      const savedDraft = await restorePromptIterationDraftFiles(await getPromptIterationDraft());
      const savedHistory = clipPromptIterationHistory(await getPromptIterationHistory());

      if (isCancelled) {
        return;
      }

      setDraft(savedDraft);
      setHistory(savedHistory);
      setHasHydrated(true);
    })();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }
    savePromptIterationDraft(persistedDraft).catch(() => {});
  }, [persistedDraft, hasHydrated]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }
    savePromptIterationDraftFiles(draft.files).catch(() => {});
  }, [draft.files, hasHydrated]);

  const runnableFiles = useMemo(
    () => draft.files.filter((item) => hasAttachedFile(item)),
    [draft.files]
  );

  const missingFileCount = useMemo(
    () => draft.files.filter((item) => !hasAttachedFile(item)).length,
    [draft.files]
  );

  const canRun = Boolean(
    runnableFiles.length > 0 &&
    draft.name.trim() &&
    (draft.systemPrompt.trim() || draft.userPrompt.trim()) &&
    effectiveLlmSettings.apiKey &&
    effectiveLlmSettings.modelName &&
    effectiveLlmSettings.apiUrl &&
    supportsPdfUpload &&
    !isRunning
  );

  const handleRun = async () => {
    if (!canRun) {
      return;
    }

    setIsRunning(true);
    setErrorMsg('');

    try {
      const run = await runPromptIteration({
        ...draft,
        files: runnableFiles.map((item) => ({ ...item, file: item.file })),
        llmSettings: effectiveLlmSettings
      });

      const nextHistory = clipPromptIterationHistory([run, ...history]);
      setCurrentRun(run);
      setHistory(nextHistory);
      setActiveResultTab('current');
      await savePromptIterationHistory(nextHistory);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <section className="prompt-iteration-panel">
      <div className="section-heading workspace-heading prompt-iteration-heading">
        <div className="prompt-iteration-heading-row">
          <div>
            <h2 className="section-title">
              <IconSparkles size={20} stroke={1.8} />
              <span>Prompt 快速迭代</span>
            </h2>
            <p className="section-caption prompt-iteration-caption">
              快速修改同一套 Prompt，在多份 PDF 上试跑并横向比较结构化表现与原始返回。
            </p>
          </div>
          {vm?.onOpenSettings ? (
            <Button
              variant="default"
              leftSection={<IconSettings size={16} />}
              onClick={vm.onOpenSettings}
              disabled={isRunning}
            >
              模型配置
            </Button>
          ) : null}
        </div>
      </div>

      {missingFileCount > 0 ? (
        <div className="prompt-iteration-hint-banner">
          已恢复 {missingFileCount} 条文件配置，但浏览器未保留对应 PDF 句柄。重新上传后才能继续运行。
        </div>
      ) : null}

      {!effectiveLlmSettings.apiKey ? (
        <div className="prompt-iteration-hint-banner warning">
          未检测到可用的 API Key。请先补全模型配置，再运行本页实验。
        </div>
      ) : null}

      {!supportsPdfUpload ? (
        <div className="prompt-iteration-hint-banner warning">
          当前 Prompt 快速迭代要求 PDF 直传能力。请切换到支持该能力的模型预设后再运行。
        </div>
      ) : null}

      <PromptIterationConfigPanel
        draft={draft}
        onDraftChange={setDraft}
        llmSettings={effectiveLlmSettings}
        presetName={selectedPreset?.name}
        supportsPdfUpload={supportsPdfUpload}
      />

      <div className="panel-block" style={{ marginTop: 14 }}>
        <PagePresetSelect
          presets={modelPresets}
          value={selectedPreset?.id || selectedPresetId}
          onChange={(presetId) => {
            setSelectedPresetId(presetId);
            savePageModelSelection(MODEL_PAGE_KEYS.PROMPT_ITERATION, presetId);
          }}
          requiredCapabilities={PAGE_REQUIRED_CAPABILITIES[MODEL_PAGE_KEYS.PROMPT_ITERATION]}
        />
      </div>

      <PromptIterationFileList
        draft={draft}
        onDraftChange={setDraft}
      />

      <div className="prompt-iteration-actions">
        <Button
          leftSection={<IconPlayerPlayFilled size={16} />}
          disabled={!canRun}
          onClick={handleRun}
        >
          {isRunning ? '运行中...' : '开始验证'}
        </Button>
        <Button
          variant="default"
          leftSection={<IconRefresh size={16} />}
          onClick={() => {
            setCurrentRun(null);
            setErrorMsg('');
          }}
          disabled={isRunning}
        >
          清空当前结果
        </Button>
      </div>

      <PromptIterationResultsPanel
        activeTab={activeResultTab}
        onTabChange={setActiveResultTab}
        currentRun={currentRun}
        history={history}
        errorMsg={errorMsg}
      />
    </section>
  );
}
