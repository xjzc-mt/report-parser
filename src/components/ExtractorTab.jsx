import { Badge, Button, Checkbox, Select } from '@mantine/core';
import {
  IconLayoutDashboard,
  IconFileSpreadsheet,
  IconFileTypePdf,
  IconPlayerPlayFilled
} from '@tabler/icons-react';
import { UploadCard } from './UploadCard.jsx';
import { ProgressPanel } from './ProgressPanel.jsx';
import { ResultsPanel } from './ResultsPanel.jsx';
import {
  BATCH_SIZE_OPTIONS,
  MAX_CONCURRENCY_OPTIONS,
  MODEL_OPTIONS,
  PROCESSABLE_VALUE_TYPES
} from '../constants/extraction.js';

function formatPdfInfo(file) {
  if (Array.isArray(file)) {
    const totalSizeMb = file.reduce((sum, item) => sum + item.size, 0) / 1024 / 1024;
    return `${file.length} PDFs selected (${totalSizeMb.toFixed(2)} MB)`;
  }
  return `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
}

function formatRequirementInfo(file) {
  return file.name;
}

function IndicatorTypeCheckbox({ type, checked, onChange }) {
  return (
    <Checkbox
      className="checkbox-chip checkbox-chip-mantine"
      label={type}
      checked={checked}
      onChange={() => onChange(type)}
      radius="xl"
      iconColor="#ffffff"
      styles={{
        root: { margin: 0 },
        body: { alignItems: 'center' },
        label: { color: 'var(--text-primary)', fontSize: '0.92rem', paddingLeft: 10 },
        input: {
          backgroundColor: 'rgba(7,16,30,0.82)',
          borderColor: 'rgba(255,255,255,0.18)'
        }
      }}
    />
  );
}

function toSelectData(values) {
  return values.map((value) => ({ value: String(value), label: String(value) }));
}

export function ExtractorTab({
  title = '工作台',
  caption = '先配置提取策略，再拖入文件开始运行。你可以在同一页面里查看进度、过滤结果并导出 Excel。',
  canStart,
  hasApiKey,
  isRunning,
  pdfFiles,
  requirementsFile,
  onSelectPdf,
  onRemovePdf,
  onSelectRequirements,
  onStart,
  progress,
  results,
  displayedResults,
  filterOnlyFound,
  onToggleFilter,
  onExport,
  stats,
  settings,
  onChangeSetting,
  onIndicatorTypeToggle
}) {
  const readinessItems = [
    { label: 'PDF 报告', ready: pdfFiles.length > 0 },
    { label: '需求清单', ready: Boolean(requirementsFile) },
    { label: '.env API Key', ready: hasApiKey },
    { label: '指标类型', ready: settings.indicatorTypes.length > 0 }
  ];

  return (
    <>
      <section className="glass-panel main-panel">
        <div className="section-heading workspace-heading">
          <h2 className="section-title">
            <IconLayoutDashboard size={20} stroke={1.8} />
            <span>{title}</span>
          </h2>
          <p className="section-caption">{caption}</p>
        </div>

        <section className="panel-block workbench-settings">
          <div className="panel-header">
            <div>
              <h3>提取参数</h3>
              <p>把常用参数前置，减少来回打开设置面板的次数。</p>
            </div>
          </div>
          <div className="settings-grid workbench-grid">
            <div className="input-group">
              <Select
                label="Model Name"
                value={settings.modelName}
                onChange={(value) => value && onChangeSetting('modelName', value)}
                data={MODEL_OPTIONS}
                className="mantine-field"
                comboboxProps={{ withinPortal: false }}
              />
            </div>

            <div className="input-group">
              <Select
                label="Batch Size"
                value={String(settings.batchSize)}
                onChange={(value) => value && onChangeSetting('batchSize', Number(value))}
                data={toSelectData(BATCH_SIZE_OPTIONS)}
                className="mantine-field"
                comboboxProps={{ withinPortal: false }}
              />
            </div>

            <div className="input-group">
              <Select
                label="Max Concurrency"
                value={String(settings.maxConcurrency)}
                onChange={(value) => value && onChangeSetting('maxConcurrency', Number(value))}
                data={toSelectData(MAX_CONCURRENCY_OPTIONS)}
                className="mantine-field"
                comboboxProps={{ withinPortal: false }}
              />
            </div>

            <div className="input-group input-group-wide">
              <label>Indicator Types To Process</label>
              <div className="checkbox-group">
                {PROCESSABLE_VALUE_TYPES.map((type) => (
                  <IndicatorTypeCheckbox
                    key={type}
                    type={type}
                    checked={settings.indicatorTypes.includes(type)}
                    onChange={onIndicatorTypeToggle}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="panel-block">
          <div className="panel-header">
            <div>
              <h3>文件上传</h3>
              <p>支持拖拽上传，文件选中后会在卡片中显示状态。</p>
            </div>
          </div>

          <div className="upload-section">
            <UploadCard
              icon={<IconFileTypePdf size={26} stroke={1.8} />}
              tag="PDF"
              title="Upload PDFs"
              hint="Upload one or more source reports to process sequentially"
              acceptHint="支持多篇 PDF，系统会按顺序逐篇提取"
              buttonLabel="Browse PDFs"
              accept="application/pdf"
              file={pdfFiles}
              multiple
              onFileSelect={onSelectPdf}
              onRemoveFile={onRemovePdf}
              formatFileInfo={formatPdfInfo}
            />
            <UploadCard
              icon={<IconFileSpreadsheet size={26} stroke={1.8} />}
              tag="Excel / CSV"
              title="Upload Requirements Excel"
              hint="Contains: value_type, indicator_code, indicator_name, definition, guidance, prompt"
              acceptHint="支持 .xlsx / .xls / .csv"
              buttonLabel="Browse Excel"
              accept=".xlsx,.xls,.csv"
              file={requirementsFile}
              onFileSelect={onSelectRequirements}
              formatFileInfo={formatRequirementInfo}
            />
          </div>
        </section>

        <section className="action-card">
          <div className="action-copy">
            <span className="eyebrow">Ready Check</span>
            <h3>{canStart ? '可以开始提取了' : '还差几步就能开始运行'}</h3>
            <div className="readiness-list">
              {readinessItems.map((item) => (
                <Badge
                  key={item.label}
                  variant={item.ready ? 'light' : 'outline'}
                  color={item.ready ? 'teal' : 'gray'}
                  radius="xl"
                  size="lg"
                  className={`readiness-item ${item.ready ? 'ready' : ''}`}
                >
                  {item.ready ? '✓' : '•'} {item.label}
                </Badge>
              ))}
            </div>
          </div>

          <Button
            size="md"
            radius="xl"
            className="btn-primary btn-primary-mantine"
            disabled={!canStart || isRunning}
            onClick={onStart}
            leftSection={<IconPlayerPlayFilled size={16} />}
          >
            {isRunning ? 'Extraction Running...' : 'Start Extraction'}
          </Button>
        </section>

        <ProgressPanel progress={progress} />
      </section>

      <ResultsPanel
        results={results}
        displayedResults={displayedResults}
        filterOnlyFound={filterOnlyFound}
        onToggleFilter={onToggleFilter}
        onExport={onExport}
        stats={stats}
      />
    </>
  );
}
