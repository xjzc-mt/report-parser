import { Badge, Button, Checkbox } from '@mantine/core';
import { IconDownload, IconSparkles } from '@tabler/icons-react';
import { RESULTS_COLUMNS } from '../constants/extraction.js';
import { isResultFound } from '../utils/extraction.js';

function getCellValue(item, key) {
  return key === 'value_type' ? (item.value_type || item.indicator_type || '') : (item[key] || '');
}

function renderCellContent(item, key) {
  const value = getCellValue(item, key);

  if (key === 'value_type') {
    return (
      <Badge variant="light" color="blue" radius="xl" className="value-type-badge">
        {value || '未知类型'}
      </Badge>
    );
  }

  if (!value || value === '未披露') {
    return <span className="cell-empty">{value || '—'}</span>;
  }

  if (key === 'indicator_code' || key === 'year' || key === 'pdf_numbers') {
    return <span className="cell-mono">{value}</span>;
  }

  return <span>{value}</span>;
}

export function ResultsPanel({ results, displayedResults, filterOnlyFound, onToggleFilter, onExport, stats }) {
  const hasResults = results.length > 0 || Boolean(stats.totalIndicators);
  const foundCount = results.filter(isResultFound).length;
  const totalCount = stats.totalIndicators || results.length || 0;
  const hitRate = totalCount > 0 ? Math.round((foundCount / totalCount) * 100) : 0;

  if (!hasResults) {
    return null;
  }

  return (
    <section className="glass-panel results-panel">
      <div className="results-header">
        <div>
          <h2 className="section-title">
            <IconSparkles size={20} stroke={1.8} />
            <span>Extracted Data</span>
          </h2>
          <p className="section-caption">
            {displayedResults.length} / {results.length} 行正在显示
          </p>
        </div>
        <div className="results-actions">
          <Checkbox
            className="filter-toggle filter-toggle-mantine"
            label="Show only results found"
            checked={filterOnlyFound}
            onChange={(event) => onToggleFilter(event.currentTarget.checked)}
          />
          <Button
            type="button"
            variant="default"
            radius="xl"
            className="btn-secondary"
            onClick={onExport}
            leftSection={<IconDownload size={16} />}
          >
            Export to Excel
          </Button>
        </div>
      </div>

      <div className="summary-strip">
        <div className="summary-chip">
          <strong>Processed</strong>
          <span>{totalCount}</span>
        </div>
        <div className="summary-chip">
          <strong>Found</strong>
          <span>{foundCount}</span>
        </div>
        <div className="summary-chip">
          <strong>Hit Rate</strong>
          <span>{hitRate}%</span>
        </div>
        <div className="summary-chip">
          <strong>Batches</strong>
          <span>{stats.totalBatches || 0}</span>
        </div>
        <div className="summary-chip">
          <strong>Duration</strong>
          <span>{stats.duration || 'N/A'}</span>
        </div>
        <div className="summary-chip">
          <strong>Cost</strong>
          <span>${(stats.totalCost || 0).toFixed(4)}</span>
        </div>
      </div>

      {displayedResults.length === 0 ? (
        <div className="results-empty">
          <h3 className="results-empty-title">当前筛选下没有可显示的数据</h3>
          <p className="results-empty-text">可以关闭“Show only results found”来查看全部处理结果。</p>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                {RESULTS_COLUMNS.map((column) => <th key={column.key}>{column.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {displayedResults.map((item, index) => (
                <tr key={`${item.indicator_code}-${item.year || 'na'}-${index}`}>
                  {RESULTS_COLUMNS.map((column) => (
                    <td key={column.key}>{renderCellContent(item, column.key)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
