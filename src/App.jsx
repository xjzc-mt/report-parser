import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from './components/Header.jsx';
import { OnlineValidationWorkbench } from './components/OnlineValidationWorkbench.jsx';
import { DataPreprocessingWorkbench } from './components/DataPreprocessingWorkbench.jsx';
import { MethodologyTab } from './components/MethodologyTab.jsx';
import { DEFAULT_SETTINGS } from './constants/extraction.js';
import { exportResultsToExcel } from './services/exportService.js';
import { resolveApiKey, runExtractionJob } from './services/extractionService.js';
import { LS_ACTIVE_APP_TAB, normalizeAppTabKey } from './utils/labNavigationState.js';
import { getSelectedIndicatorTypes, isResultFound } from './utils/extraction.js';

const LS_SETTINGS = 'intelliextract_settings';

function loadGlobalSettings() {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (_) { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

function saveGlobalSettings(settings) {
  try { localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); } catch (_) { /* ignore */ }
}

const TestWorkbenchTab = lazy(() => import('./components/TestWorkbenchTab.jsx').then((module) => ({
  default: module.TestWorkbenchTab
})));

function createInitialProgress() {
  return {
    visible: false,
    status: '',
    percentage: 0,
    logs: [],
    isLoading: false
  };
}

function validatePdfFile(file) {
  return file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
}

function validateRequirementsFile(file) {
  if (!file) return false;
  const name = file.name.toLowerCase();
  return name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv');
}

function getFileIdentity(file) {
  return `${file.name}__${file.size}__${file.lastModified}`;
}

function loadActiveTab() {
  try {
    return normalizeAppTabKey(localStorage.getItem(LS_ACTIVE_APP_TAB));
  } catch (_) { /* ignore */ }
  return normalizeAppTabKey(null);
}

export default function App() {
  const [activeTab, setActiveTab] = useState(loadActiveTab);
  const [hasVisitedTestbench, setHasVisitedTestbench] = useState(() => loadActiveTab() === 'test-workbench');
  const [settings, setSettings] = useState(loadGlobalSettings);
  const [pdfFiles, setPdfFiles] = useState([]);
  const [requirementsFile, setRequirementsFile] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(createInitialProgress);
  const [results, setResults] = useState([]);
  const [stats, setStats] = useState({});
  const [filterOnlyFound, setFilterOnlyFound] = useState(false);
  const resultsAnchorRef = useRef(null);

  const selectedIndicatorTypes = useMemo(
    () => getSelectedIndicatorTypes(settings.indicatorTypes),
    [settings.indicatorTypes]
  );
  const apiKey = useMemo(() => resolveApiKey(settings), [settings]);
  const displayedResults = useMemo(
    () => (filterOnlyFound ? results.filter(isResultFound) : results),
    [filterOnlyFound, results]
  );

  const canStart = Boolean(
    pdfFiles.length > 0 && requirementsFile && apiKey && settings.modelName.trim() && selectedIndicatorTypes.length > 0
  );

  useEffect(() => {
    try {
      localStorage.setItem(LS_ACTIVE_APP_TAB, activeTab);
    } catch (_) { /* ignore */ }
  }, [activeTab]);

  const appendProgress = ({ message, percentage, timestamp }) => {
    setProgress((previous) => ({
      visible: true,
      status: message || previous.status,
      percentage: percentage >= 0 ? percentage : previous.percentage,
      logs: [
        ...previous.logs,
        {
          id: `${Date.now()}-${Math.random()}`,
          time: timestamp,
          message
        }
      ],
      isLoading: percentage >= 0 ? percentage < 100 : previous.isLoading
    }));
  };

  const handleSettingChange = (key, value) => {
    setSettings((previous) => {
      const next = { ...previous, [key]: value };
      saveGlobalSettings(next);
      return next;
    });
  };

  const handleIndicatorTypeToggle = (type) => {
    setSettings((previous) => {
      const nextTypes = previous.indicatorTypes.includes(type)
        ? previous.indicatorTypes.filter((item) => item !== type)
        : [...previous.indicatorTypes, type];

      const next = {
        ...previous,
        indicatorTypes: nextTypes
      };
      saveGlobalSettings(next);
      return next;
    });
  };

  const handlePdfSelect = (files) => {
    const nextFiles = Array.isArray(files) ? files : [files].filter(Boolean);

    if (nextFiles.length === 0) {
      return;
    }

    const invalidFile = nextFiles.find((file) => !validatePdfFile(file));

    if (invalidFile) {
      window.alert(`Please upload valid PDF files only. Invalid file: ${invalidFile.name}`);
      return;
    }

    setPdfFiles((previous) => {
      const merged = [...previous];
      const seen = new Set(previous.map(getFileIdentity));

      nextFiles.forEach((file) => {
        const identity = getFileIdentity(file);
        if (!seen.has(identity)) {
          merged.push(file);
          seen.add(identity);
        }
      });

      return merged;
    });
  };

  const handlePdfRemove = (fileToRemove) => {
    const identity = getFileIdentity(fileToRemove);
    setPdfFiles((previous) => previous.filter((file) => getFileIdentity(file) !== identity));
  };

  const handleRequirementsSelect = (file) => {
    if (!validateRequirementsFile(file)) {
      window.alert('Please upload a valid Excel or CSV file.');
      return;
    }
    setRequirementsFile(file);
  };

  const handleStart = async () => {
    setActiveTab('online-validation');
    setIsRunning(true);
    setResults([]);
    setStats({});
    setFilterOnlyFound(false);
    setProgress({
      visible: true,
      status: 'Starting file processing...',
      percentage: 0,
      logs: [],
      isLoading: true
    });

    try {
      const totalFiles = pdfFiles.length;
      const startedAt = new Date();
      let aggregatedResults = [];
      let aggregatedStats = {
        model: settings.modelName.trim(),
        selectedTypes: selectedIndicatorTypes.join(', '),
        startTime: startedAt.toLocaleString(),
        endTime: '',
        duration: '',
        totalFiles,
        totalInputIndicators: 0,
        totalIndicators: 0,
        textCount: 0,
        numericCount: 0,
        intensityCount: 0,
        currencyCount: 0,
        totalBatches: 0,
        textBatches: 0,
        numericBatches: 0,
        intensityBatches: 0,
        currencyBatches: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCost: 0,
        failedFiles: 0
      };

      const enrichResultsWithFile = (items, fileName) => (
        (items || []).map((item) => ({
          source_file: fileName,
          ...item
        }))
      );

      const sumStatKeys = [
        'totalInputIndicators',
        'totalIndicators',
        'textCount',
        'numericCount',
        'intensityCount',
        'currencyCount',
        'totalBatches',
        'textBatches',
        'numericBatches',
        'intensityBatches',
        'currencyBatches',
        'totalInputTokens',
        'totalOutputTokens',
        'totalCost'
      ];

      for (let index = 0; index < pdfFiles.length; index += 1) {
        const pdfFile = pdfFiles[index];

        appendProgress({
          message: `Preparing file ${index + 1}/${totalFiles}: ${pdfFile.name}`,
          percentage: Math.round((index / totalFiles) * 100),
          timestamp: new Date().toLocaleTimeString()
        });

        try {
          const response = await runExtractionJob({
            pdfFile,
            csvFile: requirementsFile,
            settings: {
              ...settings,
              indicatorTypes: selectedIndicatorTypes,
              apiKey
            },
            onProgress: ({ message, percentage, timestamp }) => {
              const globalPercentage = percentage >= 0
                ? Math.min(100, Math.round(((index + (percentage / 100)) / totalFiles) * 100))
                : -1;

              appendProgress({
                message: `[${index + 1}/${totalFiles}] ${pdfFile.name}: ${message}`,
                percentage: globalPercentage,
                timestamp
              });
            },
            onPartialResults: (partialResults) => {
              setResults([
                ...aggregatedResults,
                ...enrichResultsWithFile(partialResults, pdfFile.name)
              ]);
            }
          });

          const fileResults = enrichResultsWithFile(response.results, pdfFile.name);
          aggregatedResults = [...aggregatedResults, ...fileResults];
          setResults(aggregatedResults);

          sumStatKeys.forEach((key) => {
            aggregatedStats[key] += Number(response.stats[key] || 0);
          });
        } catch (error) {
          aggregatedStats.failedFiles += 1;
          appendProgress({
            message: `[${index + 1}/${totalFiles}] ${pdfFile.name}: failed - ${error.message}`,
            percentage: Math.round(((index + 1) / totalFiles) * 100),
            timestamp: new Date().toLocaleTimeString()
          });
        }
      }

      const endedAt = new Date();
      const durationMs = endedAt - startedAt;

      aggregatedStats = {
        ...aggregatedStats,
        endTime: endedAt.toLocaleString(),
        duration: `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`
      };

      setResults(aggregatedResults);
      setStats(aggregatedStats);
      resultsAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      console.error(error);
      appendProgress({
        message: `Error: ${error.message}`,
        percentage: 100,
        timestamp: new Date().toLocaleTimeString()
      });
    } finally {
      setIsRunning(false);
      setProgress((previous) => ({
        ...previous,
        isLoading: false
      }));
    }
  };

  return (
    <main className="container">
      <div className="background-blob blob-1" />
      <div className="background-blob blob-2" />
      <div className="background-blob blob-3" />

      <Header
        activeTab={activeTab}
        onTabChange={(tab) => {
          const nextTab = normalizeAppTabKey(tab);
          if (nextTab === 'test-workbench') setHasVisitedTestbench(true);
          setActiveTab(nextTab);
        }}
      />

      <div ref={resultsAnchorRef} />

      {activeTab === 'online-validation' ? (
        <OnlineValidationWorkbench
          canStart={canStart}
          hasApiKey={Boolean(apiKey)}
          isRunning={isRunning}
          pdfFiles={pdfFiles}
          requirementsFile={requirementsFile}
          onSelectPdf={handlePdfSelect}
          onRemovePdf={handlePdfRemove}
          onSelectRequirements={handleRequirementsSelect}
          onStart={handleStart}
          progress={progress}
          results={results}
          displayedResults={displayedResults}
          filterOnlyFound={filterOnlyFound}
          onToggleFilter={setFilterOnlyFound}
          onExport={() => {
            void exportResultsToExcel(results, stats);
          }}
          stats={stats}
          settings={settings}
          onChangeSetting={handleSettingChange}
          onIndicatorTypeToggle={handleIndicatorTypeToggle}
        />
      ) : activeTab === 'data-prep' ? (
        <DataPreprocessingWorkbench globalSettings={settings} apiKey={apiKey} />
      ) : activeTab === 'docs' ? (
        <MethodologyTab />
      ) : null}

      {/* TestWorkbenchTab 首次访问后持续挂载，防止切换 tab 时运行状态丢失 */}
      {hasVisitedTestbench && (
        <div style={{ display: activeTab === 'test-workbench' ? 'block' : 'none' }}>
          <Suspense fallback={<section className="glass-panel main-panel"><p className="section-caption">正在加载测试集工作台...</p></section>}>
            <TestWorkbenchTab globalSettings={settings} />
          </Suspense>
        </div>
      )}
    </main>
  );
}
