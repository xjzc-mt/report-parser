import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Drawer, ScrollArea, Text } from '@mantine/core';
import { IconDownload, IconFileImport, IconRefresh, IconRotateClockwise2, IconTrash } from '@tabler/icons-react';
import {
  buildPromptAssetExportSheets,
  deletePromptAssetVersion,
  rollbackPromptAssetToVersion
} from '../../services/promptAssetLibraryService.js';

function formatDateTime(timestamp) {
  if (!timestamp) return '未知时间';
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function summarizeImportResult(summary) {
  if (!summary) {
    return '';
  }

  return `新增 ${summary.createdCount || 0} 条，更新 ${summary.updatedCount || 0} 条，跳过 ${summary.skippedCount || 0} 条，无效 ${summary.invalidCount || 0} 条。`;
}

export function PromptAssetLibraryDrawer({
  opened,
  onClose,
  entries = [],
  isImporting = false,
  importSummary = null,
  onImportFile,
  onRefresh
}) {
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [busyVersionId, setBusyVersionId] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!entries.length) {
      setSelectedAssetId('');
      return;
    }

    setSelectedAssetId((previous) => (
      entries.some((entry) => entry.asset.id === previous)
        ? previous
        : entries[0].asset.id
    ));
  }, [entries]);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.asset.id === selectedAssetId) || entries[0] || null,
    [entries, selectedAssetId]
  );

  const handleExport = async (entry = null) => {
    const targetEntries = entry ? [entry] : entries;
    if (!targetEntries.length) {
      return;
    }

    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    const sheets = buildPromptAssetExportSheets(targetEntries);
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

    Object.entries(sheets).forEach(([sheetName, rows]) => {
      const worksheet = XLSX.utils.json_to_sheet(Array.isArray(rows) ? rows : []);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
    });

    const scope = entry?.asset?.indicatorCode || 'all';
    XLSX.writeFile(workbook, `prompt_assets_${scope}_${timestamp}.xlsx`);
  };

  const handleRollback = async (assetId, versionId) => {
    try {
      setBusyVersionId(versionId);
      await rollbackPromptAssetToVersion({ assetId, versionId });
      await onRefresh?.();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyVersionId('');
    }
  };

  const handleDeleteVersion = async (assetId, versionId) => {
    try {
      setBusyVersionId(versionId);
      await deletePromptAssetVersion({ assetId, versionId });
      await onRefresh?.();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyVersionId('');
    }
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="Prompt 资产库"
      position="right"
      size="xl"
      padding="lg"
    >
      <div className="prompt-asset-library-shell">
        <section className="prompt-asset-library-import">
          <div>
            <Text size="sm" fw={700}>批量导入原始 Prompt</Text>
            <Text size="xs" c="dimmed">
              支持 `indicator_code / indicator_name / system_prompt / user_prompt`，其中 `prompt` 也会兼容为用户提示词。
            </Text>
          </div>
          <div className="prompt-asset-library-import-actions">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="file-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onImportFile?.(file);
                }
                event.target.value = '';
              }}
            />
            <Button
              radius="xl"
              leftSection={<IconFileImport size={16} />}
              loading={isImporting}
              onClick={() => inputRef.current?.click()}
            >
              导入 Prompt 文件
            </Button>
            <Button
              variant="default"
              radius="xl"
              leftSection={<IconRefresh size={16} />}
              onClick={() => onRefresh?.()}
              disabled={isImporting}
            >
              刷新
            </Button>
            <Button
              variant="default"
              radius="xl"
              leftSection={<IconDownload size={16} />}
              onClick={() => handleExport()}
              disabled={isImporting || entries.length === 0}
            >
              导出资产库
            </Button>
          </div>
          {importSummary ? (
            <div className="prompt-asset-library-summary">
              <Badge variant="light" color="blue" radius="xl">最近导入</Badge>
              <span>{summarizeImportResult(importSummary)}</span>
            </div>
          ) : null}
        </section>

        <div className="prompt-asset-library-layout">
          <aside className="prompt-asset-library-list">
            <div className="prompt-asset-library-list-head">
              <Text size="sm" fw={700}>Prompt 资产</Text>
              <Badge variant="light" color="gray" radius="xl">{entries.length} 条</Badge>
            </div>
            {entries.length === 0 ? (
              <div className="prompt-asset-library-empty">
                还没有导入任何 Prompt。先上传一份维护文件。
              </div>
            ) : (
              <ScrollArea.Autosize mah={520}>
                <div className="prompt-asset-library-list-items">
                  {entries.map((entry) => (
                    <button
                      key={entry.asset.id}
                      type="button"
                      className={`prompt-asset-library-item ${entry.asset.id === selectedEntry?.asset.id ? 'active' : ''}`}
                      onClick={() => setSelectedAssetId(entry.asset.id)}
                    >
                      <strong>{entry.asset.indicatorCode || '未编码指标'}</strong>
                      <span>{entry.asset.indicatorName || entry.asset.name || '未命名 Prompt'}</span>
                      <small>{entry.latestVersion?.label || '暂无版本'}</small>
                    </button>
                  ))}
                </div>
              </ScrollArea.Autosize>
            )}
          </aside>

          <section className="prompt-asset-library-detail">
            {!selectedEntry ? (
              <div className="prompt-asset-library-empty">
                选择左侧一条 Prompt 资产，查看当前基线和版本历史。
              </div>
            ) : (
              <>
                <div className="prompt-asset-library-detail-head">
                  <div>
                    <h3>{selectedEntry.asset.indicatorName || selectedEntry.asset.name || '未命名 Prompt'}</h3>
                    <p className="section-caption">
                      指标编码：{selectedEntry.asset.indicatorCode || '-'} · 最新更新：{formatDateTime(selectedEntry.asset.updatedAt)}
                    </p>
                  </div>
                  <div className="prompt-asset-library-detail-actions">
                    <div className="prompt-optimization-badge-row">
                      <Badge variant="light" color="blue" radius="xl">
                        最新版本 {selectedEntry.latestVersion?.label || '-'}
                      </Badge>
                      <Badge variant="light" color="gray" radius="xl">
                        历史 {selectedEntry.versions.length} 条
                      </Badge>
                    </div>
                    <Button
                      variant="default"
                      radius="xl"
                      size="xs"
                      leftSection={<IconDownload size={14} />}
                      onClick={() => handleExport(selectedEntry)}
                    >
                      导出当前资产
                    </Button>
                  </div>
                </div>

                <div className="prompt-asset-library-prompt-blocks">
                  <div className="prompt-asset-library-prompt-card">
                    <h4>系统提示词</h4>
                    <pre>{selectedEntry.latestVersion?.systemPrompt || '未配置系统提示词'}</pre>
                  </div>
                  <div className="prompt-asset-library-prompt-card">
                    <h4>用户提示词</h4>
                    <pre>{selectedEntry.latestVersion?.userPromptTemplate || '未配置用户提示词'}</pre>
                  </div>
                </div>

                <div className="prompt-asset-library-versions">
                  <h4>版本历史</h4>
                  <div className="prompt-asset-library-version-list">
                    {selectedEntry.versions.map((version) => (
                      <article key={version.id} className="prompt-asset-library-version-card">
                        <div className="prompt-asset-library-version-head">
                          <strong>{version.label || '未命名版本'}</strong>
                          <span>{formatDateTime(version.createdAt)}</span>
                        </div>
                        <div className="prompt-optimization-badge-row">
                          <Badge variant="light" color="blue" radius="xl">{version.sourceType || 'manual'}</Badge>
                          {selectedEntry.asset.latestVersionId === version.id ? (
                            <Badge variant="light" color="teal" radius="xl">当前基线</Badge>
                          ) : null}
                        </div>
                        <p className="section-caption">{version.notes || '无附加说明'}</p>
                        <div className="prompt-asset-library-version-actions">
                          {selectedEntry.asset.latestVersionId !== version.id ? (
                            <Button
                              variant="default"
                              radius="xl"
                              size="xs"
                              leftSection={<IconRotateClockwise2 size={14} />}
                              loading={busyVersionId === version.id}
                              onClick={() => handleRollback(selectedEntry.asset.id, version.id)}
                            >
                              设为当前基线
                            </Button>
                          ) : null}
                          {selectedEntry.asset.latestVersionId !== version.id ? (
                            <Button
                              variant="subtle"
                              color="red"
                              radius="xl"
                              size="xs"
                              leftSection={<IconTrash size={14} />}
                              loading={busyVersionId === version.id}
                              onClick={() => handleDeleteVersion(selectedEntry.asset.id, version.id)}
                            >
                              删除历史版本
                            </Button>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </Drawer>
  );
}
