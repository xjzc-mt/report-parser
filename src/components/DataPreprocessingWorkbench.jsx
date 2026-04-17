import { useEffect, useState, Suspense, lazy } from 'react';
import { Button } from '@mantine/core';
import { IconFileZip } from '@tabler/icons-react';
import { DATA_PREP_SUBTABS } from '../constants/labNavigation.js';
import {
  DEFAULT_DATA_PREP_SUBTAB_KEY,
  LS_DATA_PREP_SUBTAB,
  normalizeDataPrepSubtabKey
} from '../utils/labNavigationState.js';
import { TokenEstimationPage } from './TokenEstimationPage.jsx';

const CompressorTab = lazy(() => import('./CompressorTab.jsx').then((module) => ({
  default: module.CompressorTab
})));

const PdfSplitterTab = lazy(() => import('./PdfSplitterTab.jsx').then((module) => ({
  default: module.PdfSplitterTab
})));

export function DataPreprocessingWorkbench({ globalSettings, apiKey }) {
  const [activeSubtab, setActiveSubtab] = useState(() => {
    try {
      return normalizeDataPrepSubtabKey(localStorage.getItem(LS_DATA_PREP_SUBTAB));
    } catch (_) { /* ignore */ }
    return DEFAULT_DATA_PREP_SUBTAB_KEY;
  });
  const currentSubtab = normalizeDataPrepSubtabKey(activeSubtab);

  useEffect(() => {
    try {
      localStorage.setItem(LS_DATA_PREP_SUBTAB, currentSubtab);
    } catch (_) { /* ignore */ }
  }, [currentSubtab]);

  return (
    <section className="glass-panel main-panel">
      <div className="section-heading workspace-heading">
        <h2 className="section-title">
          <IconFileZip size={20} stroke={1.8} />
          <span>数据预处理工作台</span>
        </h2>
        <p className="section-caption">在 Chunking测试、PDF压缩和 Token统计之间切换。</p>
      </div>

      <div className="workbench-subtab-nav workbench-subtab-nav--dataprep">
        {DATA_PREP_SUBTABS.map((tab) => (
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

      {currentSubtab === 'chunking' && (
        <Suspense fallback={<section className="glass-panel main-panel"><p className="section-caption">正在加载 PDF 拆分器...</p></section>}>
          <PdfSplitterTab globalSettings={globalSettings} apiKey={apiKey} />
        </Suspense>
      )}

      {currentSubtab === 'pdf-compress' && (
        <Suspense fallback={<section className="glass-panel main-panel"><p className="section-caption">正在加载 PDF 压缩器...</p></section>}>
          <CompressorTab />
        </Suspense>
      )}

      {currentSubtab === 'token-estimation' && <TokenEstimationPage />}
    </section>
  );
}
