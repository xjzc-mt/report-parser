import { useEffect, useMemo, useState } from 'react';
import { Button } from '@mantine/core';
import { IconPlayerPlayFilled, IconRefresh, IconSettings, IconSparkles } from '@tabler/icons-react';
import { DEFAULT_SETTINGS } from '../constants/extraction.js';
import { DEFAULT_LLM1_SETTINGS } from '../constants/testBench.js';
import {
  getPromptIterationDraft,
  getPromptIterationHistory,
  savePromptIterationDraft,
  savePromptIterationHistory
} from '../services/persistenceService.js';
import {
  runPromptIteration,
  clipPromptIterationHistory,
  normalizePromptIterationDraft
} from '../services/promptIterationService.js';
import { LS_LLM1, mergeLlmSettings } from '../utils/testSetWorkbenchSettings.js';
import { PromptIterationConfigPanel } from './promptIteration/PromptIterationConfigPanel.jsx';
import { PromptIterationFileList } from './promptIteration/PromptIterationFileList.jsx';
import { PromptIterationResultsPanel } from './promptIteration/PromptIterationResultsPanel.jsx';

function hasAttachedFile(item) {
  return Boolean(item?.file && typeof item.file.arrayBuffer === 'function');
}

function restorePromptIterationDraft(rawDraft) {
  const normalizedDraft = normalizePromptIterationDraft(rawDraft);

  if (!Array.isArray(rawDraft?.files)) {
    return normalizedDraft;
  }

  return {
    ...normalizedDraft,
    files: normalizedDraft.files.map((item, index) => ({
      ...item,
      file: rawDraft.files[index]?.file ?? null
    }))
  };
}

function mergePromptIterationLlmSettings(input) {
  const merged = mergeLlmSettings(input, {
    ...DEFAULT_LLM1_SETTINGS,
    apiUrl: DEFAULT_SETTINGS.apiUrl,
    apiKey: ''
  });

  return {
    ...merged,
    apiKey: merged.apiKey || import.meta.env.VITE_GEMINI_API_KEY || ''
  };
}

function loadStoredPromptIterationLlmSettings() {
  try {
    const raw = localStorage.getItem(LS_LLM1);
    if (raw) {
      return mergePromptIterationLlmSettings(JSON.parse(raw));
    }
  } catch (_) {
    // ignore localStorage parse issues and fall back to defaults
  }

  return mergePromptIterationLlmSettings(null);
}

export function FullFlowMode({ llmSettings, vm }) {
  const [draft, setDraft] = useState(() => normalizePromptIterationDraft(null));
  const [history, setHistory] = useState([]);
  const [currentRun, setCurrentRun] = useState(null);
  const [activeResultTab, setActiveResultTab] = useState('current');
  const [isRunning, setIsRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [hasHydrated, setHasHydrated] = useState(false);

  const effectiveLlmSettings = useMemo(() => (
    llmSettings ? mergePromptIterationLlmSettings(llmSettings) : loadStoredPromptIterationLlmSettings()
  ), [llmSettings, vm]);

  useEffect(() => {
    let isCancelled = false;

    (async () => {
      const savedDraft = restorePromptIterationDraft(await getPromptIterationDraft());
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
    savePromptIterationDraft(draft).catch(() => {});
  }, [draft, hasHydrated]);

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

      <PromptIterationConfigPanel
        draft={draft}
        onDraftChange={setDraft}
        llmSettings={effectiveLlmSettings}
      />

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
