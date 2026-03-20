import { useMemo, useRef, useState } from 'react';
import { Header } from './components/Header.jsx';
import { ExtractorTab } from './components/ExtractorTab.jsx';
import { MethodologyTab } from './components/MethodologyTab.jsx';
import { DEFAULT_SETTINGS } from './constants/extraction.js';
import { exportResultsToExcel } from './services/exportService.js';
import { resolveApiKey, runExtractionJob } from './services/extractionService.js';
import { getSelectedIndicatorTypes, isResultFound } from './utils/extraction.js';

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

export default function App() {
  const [activeTab, setActiveTab] = useState('extract');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [pdfFile, setPdfFile] = useState(null);
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
    pdfFile && requirementsFile && apiKey && settings.modelName.trim() && selectedIndicatorTypes.length > 0
  );

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
    setSettings((previous) => ({ ...previous, [key]: value }));
  };

  const handleIndicatorTypeToggle = (type) => {
    setSettings((previous) => {
      const nextTypes = previous.indicatorTypes.includes(type)
        ? previous.indicatorTypes.filter((item) => item !== type)
        : [...previous.indicatorTypes, type];

      return {
        ...previous,
        indicatorTypes: nextTypes
      };
    });
  };

  const handlePdfSelect = (file) => {
    if (!validatePdfFile(file)) {
      window.alert('Please upload a valid PDF file.');
      return;
    }
    setPdfFile(file);
  };

  const handleRequirementsSelect = (file) => {
    if (!validateRequirementsFile(file)) {
      window.alert('Please upload a valid Excel or CSV file.');
      return;
    }
    setRequirementsFile(file);
  };

  const handleStart = async () => {
    setActiveTab('extract');
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
      const response = await runExtractionJob({
        pdfFile,
        csvFile: requirementsFile,
        settings: {
          ...settings,
          indicatorTypes: selectedIndicatorTypes,
          apiKey
        },
        onProgress: appendProgress,
        onPartialResults: setResults
      });

      setResults(response.results);
      setStats(response.stats);
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
        onTabChange={setActiveTab}
      />

      <div ref={resultsAnchorRef} />

      {activeTab === 'extract' ? (
        <ExtractorTab
          canStart={canStart}
          hasApiKey={Boolean(apiKey)}
          isRunning={isRunning}
          pdfFile={pdfFile}
          requirementsFile={requirementsFile}
          onSelectPdf={handlePdfSelect}
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
      ) : (
        <MethodologyTab />
      )}
    </main>
  );
}
