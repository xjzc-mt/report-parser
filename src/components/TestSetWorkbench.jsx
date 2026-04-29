import { useEffect, useState } from 'react';
import { ActionIcon, Button, Tooltip } from '@mantine/core';
import { IconFileText, IconFlask } from '@tabler/icons-react';
import { FullFlowMode } from './FullFlowMode.jsx';
import { QuickValidationMode } from './QuickValidationMode.jsx';
import { QuickOptimizationMode } from './QuickOptimizationMode.jsx';
import { PromptAssetLibraryDrawer } from './promptAssets/PromptAssetLibraryDrawer.jsx';
import { DEFAULT_SETTINGS } from '../constants/extraction.js';
import { DEFAULT_LLM2_SETTINGS } from '../constants/testBench.js';
import { TEST_SET_SUBTABS } from '../constants/labNavigation.js';
import {
  DEFAULT_TEST_SET_WORKBENCH_SUBTAB_KEY,
  LS_TEST_SET_WORKBENCH_SUBTAB,
  normalizeTestSetWorkbenchSubtabKey
} from '../utils/testSetWorkbenchSettings.js';
import { createComparisonRowsWorkbookFile } from '../services/testBenchService.js';
import { importPromptAssetFile, listPromptAssetLibraryEntries } from '../services/promptAssetLibraryService.js';

export function TestSetWorkbench({
  globalSettings = DEFAULT_SETTINGS,
  modelPresets = [],
  globalDefaultPresetId = '',
  onOpenModelPresetManager
}) {
  const [activeSubtab, setActiveSubtab] = useState(() => {
    try {
      return normalizeTestSetWorkbenchSubtabKey(localStorage.getItem(LS_TEST_SET_WORKBENCH_SUBTAB));
    } catch (_) { /* ignore */ }
    return DEFAULT_TEST_SET_WORKBENCH_SUBTAB_KEY;
  });
  const [promptAssetEntries, setPromptAssetEntries] = useState([]);
  const [promptAssetLibraryOpened, setPromptAssetLibraryOpened] = useState(false);
  const [promptAssetImporting, setPromptAssetImporting] = useState(false);
  const [promptAssetImportSummary, setPromptAssetImportSummary] = useState(null);
  const [promptIterationSeed, setPromptIterationSeed] = useState(null);
  const [incomingOptimizationContext, setIncomingOptimizationContext] = useState(null);

  const currentSubtab = normalizeTestSetWorkbenchSubtabKey(activeSubtab);
  const llm2Settings = DEFAULT_LLM2_SETTINGS;

  const reloadPromptAssets = async () => {
    try {
      setPromptAssetEntries(await listPromptAssetLibraryEntries());
    } catch (_) { /* ignore */ }
  };

  useEffect(() => {
    void reloadPromptAssets();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_TEST_SET_WORKBENCH_SUBTAB, currentSubtab);
    } catch (_) { /* ignore */ }
  }, [currentSubtab]);

  const handleImportPromptAssets = async (file) => {
    if (!file) {
      return;
    }
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      window.alert('请上传 Excel 或 CSV 文件');
      return;
    }

    setPromptAssetImporting(true);
    try {
      const summary = await importPromptAssetFile(file);
      setPromptAssetImportSummary(summary);
      await reloadPromptAssets();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setPromptAssetImporting(false);
    }
  };

  const handleSwitchToOptimization = async (rows, selectedCodes = []) => {
    let comparisonWorkbookFile = null;
    try {
      comparisonWorkbookFile = await createComparisonRowsWorkbookFile(rows, {
        fileName: 'validation_to_optimization.xlsx'
      });
    } catch (_) { /* ignore */ }

    setIncomingOptimizationContext({
      id: `${Date.now()}_${Math.random()}`,
      comparisonRows: rows,
      comparisonFile: comparisonWorkbookFile,
      selectedCodes
    });
    setActiveSubtab('prompt-optimization');
  };

  const promptIterationVm = {
    promptAssetEntries,
    onPromptAssetsChanged: reloadPromptAssets,
    onOpenPromptAssetLibrary: () => setPromptAssetLibraryOpened(true),
    incomingPromptIterationSeed: promptIterationSeed,
    onConsumePromptIterationSeed: () => setPromptIterationSeed(null),
    onOpenSettings: onOpenModelPresetManager
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
          </div>
          <div className="testbench-header-actions">
            <Tooltip label="Prompt 资产库">
              <ActionIcon variant="default" size="lg" radius="xl" onClick={() => setPromptAssetLibraryOpened(true)}>
                <IconFileText size={16} stroke={1.8} />
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
            onClick={() => setActiveSubtab(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {currentSubtab === 'prompt-iteration' && (
        <FullFlowMode modelPresets={modelPresets} globalDefaultPresetId={globalDefaultPresetId} vm={promptIterationVm} />
      )}

      {currentSubtab === 'model-validation' && (
        <QuickValidationMode
          globalSettings={globalSettings}
          llm2Settings={llm2Settings}
          onSwitchToOptimization={handleSwitchToOptimization}
        />
      )}

      {currentSubtab === 'prompt-optimization' && (
        <QuickOptimizationMode
          llm2Settings={llm2Settings}
          modelPresets={modelPresets}
          globalDefaultPresetId={globalDefaultPresetId}
          onOpenModelPresetManager={onOpenModelPresetManager}
          promptAssetEntries={promptAssetEntries}
          onOpenPromptAssetLibrary={() => setPromptAssetLibraryOpened(true)}
          onPromptAssetsChanged={reloadPromptAssets}
          incomingContext={incomingOptimizationContext}
          onConsumeIncomingContext={() => setIncomingOptimizationContext(null)}
          onSendToPromptIteration={(seed) => {
            setPromptIterationSeed(seed);
            setActiveSubtab('prompt-iteration');
          }}
        />
      )}

      <PromptAssetLibraryDrawer
        opened={promptAssetLibraryOpened}
        onClose={() => setPromptAssetLibraryOpened(false)}
        entries={promptAssetEntries}
        isImporting={promptAssetImporting}
        importSummary={promptAssetImportSummary}
        onImportFile={handleImportPromptAssets}
        onRefresh={reloadPromptAssets}
      />
    </section>
  );
}
