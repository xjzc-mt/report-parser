import { useState } from 'react';
import { Radio, Group } from '@mantine/core';
import { ReportAnalytics } from './ReportAnalytics.jsx';

export function AnalysisView({ comparisonRows, similarityThreshold = 70, children }) {
  const [viewMode, setViewMode] = useState('overall');

  return (
    <div>
      <Radio.Group
        value={viewMode}
        onChange={setViewMode}
        label="分析视图"
      >
        <Group mt="xs">
          <Radio value="overall" label="整体分析" />
          <Radio value="by-report" label="按报告分析" />
        </Group>
      </Radio.Group>

      <div style={{ marginTop: 20 }}>
        {viewMode === 'overall' && children}
        {viewMode === 'by-report' && (
          <ReportAnalytics
            comparisonRows={comparisonRows}
            similarityThreshold={similarityThreshold}
          />
        )}
      </div>
    </div>
  );
}
