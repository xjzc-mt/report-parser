import { useMemo, useState } from 'react';
import { Button, FileInput, Textarea } from '@mantine/core';
import { IconChartHistogram, IconFileAnalytics, IconRefresh } from '@tabler/icons-react';
import { MODEL_PAGE_KEYS } from '../constants/modelPresets.js';
import { parseExcel, parsePDF } from '../services/fileParsers.js';
import { resolvePagePreset, resolveRuntimeLlmConfig } from '../services/modelPresetResolver.js';
import { loadPageModelSelection, savePageModelSelection } from '../utils/modelPresetStorage.js';
import { estimateTokenCost, summarizeTokenEstimationItems } from '../utils/tokenEstimation.js';
import { PagePresetSelect } from './modelPresets/PagePresetSelect.jsx';

const SUPPORTED_FILE_EXTENSIONS = ['txt', 'md', 'json', 'csv', 'xlsx', 'xls', 'pdf'];

function getFileExtension(fileName) {
  return String(fileName || '').split('.').pop()?.toLowerCase() || '';
}

function stringifyRows(rows) {
  return (rows || [])
    .map((row) => Object.values(row).join('\t'))
    .join('\n');
}

async function readTokenFile(file) {
  const ext = getFileExtension(file.name);

  if (!SUPPORTED_FILE_EXTENSIONS.includes(ext)) {
    throw new Error(`暂不支持 ${file.name}，请上传 ${SUPPORTED_FILE_EXTENSIONS.join(' / ')} 文件。`);
  }

  if (ext === 'pdf') {
    const pages = await parsePDF(file);
    return pages.map((page) => `第 ${page.pageNumber} 页\n${page.text}`).join('\n\n');
  }

  if (ext === 'xlsx' || ext === 'xls') {
    return stringifyRows(await parseExcel(file));
  }

  return file.text();
}

function formatNumber(value) {
  return new Intl.NumberFormat('zh-CN').format(value || 0);
}

export function TokenEstimationPage({ modelPresets = [], onOpenModelPresetManager }) {
  const [textInput, setTextInput] = useState('');
  const [files, setFiles] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState(() => loadPageModelSelection(MODEL_PAGE_KEYS.TOKEN_ESTIMATION));
  const [summary, setSummary] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState('');

  const selectedPreset = useMemo(
    () => resolvePagePreset(
      MODEL_PAGE_KEYS.TOKEN_ESTIMATION,
      modelPresets,
      { [MODEL_PAGE_KEYS.TOKEN_ESTIMATION]: selectedPresetId }
    ),
    [modelPresets, selectedPresetId]
  );
  const runtimeConfig = useMemo(
    () => resolveRuntimeLlmConfig(selectedPreset),
    [selectedPreset]
  );

  const estimatedCost = useMemo(
    () => estimateTokenCost(runtimeConfig?.modelName, summary?.totalTokens || 0),
    [runtimeConfig?.modelName, summary?.totalTokens]
  );

  const canRun = Boolean(textInput.trim() || files.length > 0);

  const handleRun = async () => {
    if (!canRun || isRunning) return;

    setIsRunning(true);
    setError('');

    try {
      const items = [];
      if (textInput.trim()) {
        items.push({
          name: '手动输入文本',
          sourceType: 'text',
          text: textInput
        });
      }

      for (const file of files) {
        items.push({
          name: file.name,
          sourceType: getFileExtension(file.name),
          text: await readTokenFile(file)
        });
      }

      setSummary(summarizeTokenEstimationItems(items));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <section className="glass-panel main-panel token-estimation-page">
      <div className="section-heading workspace-heading">
        <h2 className="section-title">
          <IconChartHistogram size={20} stroke={1.8} />
          <span>Token统计</span>
        </h2>
        <p className="section-caption">估算文本或文件的输入 token 量，辅助判断上下文长度和输入成本。</p>
      </div>

      <div className="panel-block token-estimation-config">
        <div className="panel-header">
          <div>
            <h3>统计口径</h3>
            <p>Token 数为本地粗略估算，不调用模型 API；成本按所选模型预设的模型名估算。</p>
          </div>
          {onOpenModelPresetManager ? (
            <Button size="xs" radius="xl" variant="default" onClick={onOpenModelPresetManager}>
              管理模型预设
            </Button>
          ) : null}
        </div>
        <PagePresetSelect
          presets={modelPresets}
          value={selectedPreset?.id || selectedPresetId}
          onChange={(presetId) => {
            setSelectedPresetId(presetId);
            savePageModelSelection(MODEL_PAGE_KEYS.TOKEN_ESTIMATION, presetId);
          }}
          requiredCapabilities={{}}
        />
      </div>

      <div className="panel-block token-estimation-inputs">
        <div className="settings-grid workbench-grid">
          <Textarea
            label="直接输入文本"
            placeholder="粘贴一段要估算 token 的文本"
            autosize
            minRows={8}
            maxRows={18}
            value={textInput}
            onChange={(event) => setTextInput(event.currentTarget.value)}
          />
          <FileInput
            label="上传文件"
            placeholder="支持 txt / md / json / csv / xlsx / xls / pdf"
            multiple
            clearable
            value={files}
            onChange={(value) => setFiles(Array.isArray(value) ? value : [])}
            accept=".txt,.md,.json,.csv,.xlsx,.xls,.pdf,application/pdf"
          />
        </div>

        <div className="prompt-iteration-actions">
          <Button
            leftSection={<IconFileAnalytics size={16} />}
            disabled={!canRun || isRunning}
            onClick={handleRun}
          >
            {isRunning ? '统计中...' : '开始统计'}
          </Button>
          <Button
            variant="default"
            leftSection={<IconRefresh size={16} />}
            disabled={isRunning}
            onClick={() => {
              setTextInput('');
              setFiles([]);
              setSummary(null);
              setError('');
            }}
          >
            清空
          </Button>
        </div>

        {error ? <div className="prompt-iteration-hint-banner warning">{error}</div> : null}
      </div>

      {summary ? (
        <div className="panel-block token-estimation-results">
          <div className="token-estimation-summary">
            <div>
              <span>输入项</span>
              <strong>{formatNumber(summary.totalFiles)}</strong>
            </div>
            <div>
              <span>总字符数</span>
              <strong>{formatNumber(summary.totalCharacters)}</strong>
            </div>
            <div>
              <span>估算 Token</span>
              <strong>{formatNumber(summary.totalTokens)}</strong>
            </div>
            <div>
              <span>估算输入成本</span>
              <strong>${estimatedCost.toFixed(6)}</strong>
            </div>
          </div>

          <div className="token-estimation-table">
            <div className="token-estimation-row token-estimation-row--head">
              <span>来源</span>
              <span>类型</span>
              <span>字符数</span>
              <span>估算 Token</span>
            </div>
            {summary.rows.map((row) => (
              <div key={`${row.name}-${row.sourceType}`} className="token-estimation-row">
                <span>{row.name}</span>
                <span>{row.sourceType}</span>
                <span>{formatNumber(row.characters)}</span>
                <span>{formatNumber(row.estimatedTokens)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
