import { useState } from 'react';
import { ActionIcon } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconTrash, IconFile, IconDownload } from '@tabler/icons-react';
import { getPdfPage } from '../services/persistenceService.js';

/**
 * 按报告折叠展示已缓存切分页，支持单条删除和整报告删除
 * @param {Array} pages - [{ id, reportName, pageRange }]
 * @param {Function} onDelete - (id) => void
 * @param {Function} onDeleteReport - (reportName) => void
 */
export function PdfPageTree({ pages, onDelete, onDeleteReport }) {
  const [collapsed, setCollapsed] = useState({});

  if (!pages || pages.length === 0) return null;

  async function handleDownload(id) {
    try {
      const page = await getPdfPage(id);
      if (!page?.pdfData) return;
      const blob = new Blob([page.pdfData], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (_) { /* ignore */ }
  }

  // 按报告名分组
  const byReport = {};
  for (const p of pages) {
    const rn = p.reportName || '未知报告';
    if (!byReport[rn]) byReport[rn] = [];
    byReport[rn].push(p);
  }

  const toggleReport = (rn) =>
    setCollapsed((prev) => ({ ...prev, [rn]: !prev[rn] }));

  return (
    <div className="pdf-page-tree">
      {Object.entries(byReport).map(([reportName, items]) => (
        <div key={reportName} className="pdf-page-tree-report">
          <button
            type="button"
            className="pdf-page-tree-header"
            onClick={() => toggleReport(reportName)}
          >
            {collapsed[reportName]
              ? <IconChevronRight size={14} stroke={1.8} />
              : <IconChevronDown size={14} stroke={1.8} />}
            <span className="pdf-page-tree-report-name">{reportName}</span>
            <span className="pdf-page-tree-count">({items.length})</span>
          </button>
          {onDeleteReport && (
            <ActionIcon
              type="button"
              variant="subtle"
              color="red"
              size="xs"
              radius="xl"
              onClick={(e) => { e.stopPropagation(); onDeleteReport(reportName); }}
              aria-label={`删除 ${reportName} 全部缓存`}
              title="删除该 PDF 所有缓存页"
              style={{ marginLeft: 4 }}
            >
              <IconTrash size={12} stroke={1.8} />
            </ActionIcon>
          )}
          {!collapsed[reportName] && (
            <ul className="pdf-page-tree-list">
              {items.map((item) => (
                <li key={item.id} className="pdf-page-tree-item">
                  <IconFile size={12} stroke={1.5} style={{ flexShrink: 0, opacity: 0.5 }} />
                  <span className="pdf-page-tree-item-label" title={item.id}>{item.id}</span>
                  <ActionIcon
                    type="button"
                    variant="subtle"
                    size="xs"
                    radius="xl"
                    onClick={() => handleDownload(item.id)}
                    aria-label={`下载 ${item.id}`}
                  >
                    <IconDownload size={11} stroke={1.8} />
                  </ActionIcon>
                  <ActionIcon
                    type="button"
                    variant="subtle"
                    color="red"
                    size="xs"
                    radius="xl"
                    onClick={() => onDelete(item.id)}
                    aria-label={`删除 ${item.id}`}
                  >
                    <IconTrash size={11} stroke={1.8} />
                  </ActionIcon>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
