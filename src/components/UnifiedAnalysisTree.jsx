import { useState, useMemo, useCallback, useEffect } from 'react';
import { Badge, Tooltip, NumberInput, Text, Button, Select, MultiSelect, useCombobox, Checkbox, Popover } from '@mantine/core';
import { IconChevronRight, IconChevronDown, IconArrowRight, IconDownload } from '@tabler/icons-react';
import { buildTreeData, calculateOverallMetrics } from '../utils/reportAnalytics.js';
import { ErrorTypeBar } from './ErrorTypeBar.jsx';
import { OptimizationScopeConfirm } from './OptimizationScopeConfirm.jsx';
import { calculateFieldSimilarity } from '../services/synonymService.js';
import * as XLSX from 'xlsx';

// ── 颜色工具 ──────────────────────────────────────────────────────────────────

function metricColor(value) {
  if (value === null || value === undefined) return 'gray';
  if (value >= 0.9) return 'green';
  if (value >= 0.7) return 'yellow';
  return 'red';
}

function pct(v) {
  return v !== null && v !== undefined ? `${Math.round(v * 100)}%` : '—';
}

function simColor(v) {
  if (v >= 90) return '#16a34a';
  if (v >= 70) return '#d97706';
  return '#dc2626';
}

function normalizeValueType(vt) {
  const s = String(vt || '').trim().toUpperCase();
  if (s.includes('TEXT') || s.includes('文字') || s.includes('文本')) return '文字型';
  if (s.includes('NUMERIC') || s.includes('数值') || s.includes('数字')) return '数值型';
  if (s.includes('CURRENCY') || s.includes('货币') || s.includes('金额')) return '货币型';
  if (s.includes('INTENSITY') || s.includes('强度')) return '强度型';
  return '文字型';
}

function FieldWithSim({ label, val1, val2, fieldType = 'text', showHighlight = false, useLlmBased = false, llmSim = null }) {
  const sim = calculateFieldSimilarity(val1, val2, fieldType, useLlmBased, llmSim);
  const v1 = String(val1 || '').trim();
  const v2 = String(val2 || '').trim();

  let display = v1 || '—';

  // 文本型字段且有相似内容时高亮
  if (showHighlight && v1 && v2 && v1 !== '未披露' && v2 !== '未披露') {
    const chars1 = v1.split('');
    const chars2 = new Set(v2.split(''));
    const parts = [];
    for (let i = 0; i < chars1.length; i++) {
      const char = chars1[i];
      if (chars2.has(char)) {
        parts.push(<span key={i} style={{ color: '#2563eb', fontWeight: 700 }}>{char}</span>);
      } else {
        parts.push(<span key={i}>{char}</span>);
      }
    }
    display = <>{parts}</>;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
      <span style={{ color: '#64748b', fontSize: 10, minWidth: 60 }}>{label}：</span>
      <span style={{ color: '#374151', flex: 1, fontSize: 11 }}>{display}</span>
      <span style={{
        color: sim >= 90 ? '#16a34a' : sim >= 70 ? '#d97706' : '#dc2626',
        fontSize: 10,
        fontWeight: 600,
        minWidth: 32,
        textAlign: 'right'
      }}>
        {sim}%
      </span>
    </div>
  );
}

// ── 跨报告稳定性色块 ──────────────────────────────────────────────────────────

function ConsistencyDots({ dots = [], score = null }) {
  if (!dots.length) return null;
  const scoreColor = score >= 0.9 ? '#16a34a' : score >= 0.5 ? '#d97706' : '#dc2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ display: 'flex', gap: 2 }}>
        {dots.map((d, i) => (
          <Tooltip key={i} label={d === 'pass' ? '达标' : '未达标'} withArrow>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: d === 'pass' ? '#86efac' : '#f87171',
                flexShrink: 0,
                cursor: 'default'
              }}
            />
          </Tooltip>
        ))}
      </div>
      {score !== null && (
        <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor }}>
          {Math.round(score * 100)}%
        </span>
      )}
    </div>
  );
}

// ── 置顶汇总行 ────────────────────────────────────────────────────────────────

function PinnedSummary({ node, threshold }) {
  if (!node) return null;
  const { metrics, label } = node;
  return (
    <div
      style={{
        padding: '8px 14px',
        background: '#eff6ff',
        borderBottom: '2px solid #bfdbfe',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        flexShrink: 0
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 12, color: '#1d4ed8' }}>
        📌 {label}（{metrics.totalCount} 条）
      </span>
      <Badge color={metricColor(metrics.accuracy)} size="sm">
        准确率 {pct(metrics.accuracy)}
      </Badge>
      <Badge color={metricColor(metrics.recall)} size="sm">
        召回率 {pct(metrics.recall)}
      </Badge>
      <Badge color={metricColor(metrics.f1)} size="sm">
        F1 {pct(metrics.f1)}
      </Badge>
      <Badge color="indigo" size="sm">
        完全匹配率 {pct(metrics.exactMatchRate)}
      </Badge>
      <Badge color="cyan" size="sm" variant="outline">
        相似度 {metrics.avgSimilarity}%
      </Badge>
    </div>
  );
}

// ── 面包屑 ────────────────────────────────────────────────────────────────────

function Breadcrumb({ path, onNavigate }) {
  return (
    <div
      style={{
        padding: '6px 14px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        flexWrap: 'wrap',
        fontSize: 11,
        color: '#64748b',
        flexShrink: 0
      }}
    >
      {path.map((item, i) => (
        <span key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {i < path.length - 1 ? (
            <>
              <span
                style={{ color: '#2563eb', cursor: 'pointer' }}
                onClick={() => onNavigate(item.id)}
              >
                {item.label}
              </span>
              <span style={{ color: '#cbd5e1' }}> ›</span>
            </>
          ) : (
            <span style={{ fontWeight: 600, color: '#1e293b' }}>{item.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

// ── 右侧内容面板 ──────────────────────────────────────────────────────────────

const COL_STYLES = {
  typeList: '24px 1fr 60px 72px 72px 72px 72px 60px',
  indList: '1fr 72px 72px 72px 72px 60px 80px 52px',
  indListNoConsist: '1fr 72px 72px 72px 72px 60px',
  reportList: '1fr 60px 72px 72px 72px 72px 60px',
  rawRows: '1fr 1fr 1fr 70px'
};

const ELLIPSIS_STYLE = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0
};

function SortableHeader({ label, field, sortConfig, onSort }) {
  const isActive = sortConfig.field === field;
  const nextOrder = !isActive ? 'desc' : sortConfig.order === 'desc' ? 'asc' : null;

  return (
    <span
      style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 2 }}
      onClick={() => onSort(nextOrder ? field : null, nextOrder || 'asc')}
    >
      {label}
      {isActive && <span style={{ fontSize: 9 }}>{sortConfig.order === 'asc' ? '↑' : '↓'}</span>}
    </span>
  );
}

function TableHead({ cols, children }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: cols,
        padding: '6px 14px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        fontWeight: 600,
        color: '#64748b',
        fontSize: 11,
        position: 'sticky',
        top: 0,
        zIndex: 1
      }}
    >
      {children}
    </div>
  );
}

function TableRow({ cols, onClick, children }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: cols,
        padding: '7px 14px',
        borderBottom: '1px solid #f1f5f9',
        alignItems: 'center',
        cursor: onClick ? 'pointer' : 'default',
        fontSize: 11.5
      }}
      onClick={onClick}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.background = '#f8fafc')}
      onMouseLeave={(e) => onClick && (e.currentTarget.style.background = '')}
    >
      {children}
    </div>
  );
}

function DotIndicator({ type }) {
  const colors = {
    '文字型': '#6366f1',
    '数值型': '#f59e0b',
    '货币型': '#10b981',
    '强度型': '#ef4444'
  };
  return (
    <div
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: colors[type] || '#94a3b8',
        flexShrink: 0
      }}
    />
  );
}

function MetricsBadge({ value, isRaw }) {
  if (isRaw) {
    return <span style={{ color: '#475569' }}>{value ?? '—'}</span>;
  }
  return <Badge color={metricColor(value)} size="sm">{pct(value)}</Badge>;
}

/**
 * 右侧列表渲染，根据当前节点 level 显示不同列
 */
function RightPanel({ selectedNode, treeData, threshold, onSelectNode, sortConfig, onSortChange, useLlmBased }) {
  if (!selectedNode) {
    return (
      <div style={{ padding: 20, color: '#64748b', fontSize: 12 }}>
        请在左侧树中选择一个节点查看详情
      </div>
    );
  }

  const { level, section } = selectedNode;

  // ── 跨报告：根节点（全部报告）→ 显示 4 种类型 ──────────────────────────────
  if (section === 'cross-report' && level === 'root') {
    const sortedChildren = sortConfig.field ? [...selectedNode.children].sort((a, b) => {
      const aVal = a.metrics[sortConfig.field] ?? -Infinity;
      const bVal = b.metrics[sortConfig.field] ?? -Infinity;
      return sortConfig.order === 'asc' ? aVal - bVal : bVal - aVal;
    }) : selectedNode.children;

    return (
      <div>
        <TableHead cols={COL_STYLES.typeList}>
          <span></span>
          <span>指标类型</span>
          <SortableHeader label="条数" field="totalCount" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="准确率" field="accuracy" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="召回率" field="recall" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="精确率" field="precision" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="F1" field="f1" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="相似度" field="avgSimilarity" sortConfig={sortConfig} onSort={onSortChange} />
        </TableHead>
        {sortedChildren.map((child) => (
          <TableRow key={child.id} cols={COL_STYLES.typeList} onClick={() => onSelectNode(child)}>
            <DotIndicator type={child.label} />
            <span style={{ fontWeight: 600, color: '#1e40af' }}>{child.label} ›</span>
            <span style={{ color: '#64748b' }}>{child.metrics.totalCount}</span>
            <MetricsBadge value={child.metrics.accuracy} />
            <MetricsBadge value={child.metrics.recall} />
            <MetricsBadge value={child.metrics.precision} />
            <MetricsBadge value={child.metrics.f1} />
            <span style={{ color: simColor(child.metrics.avgSimilarity) }}>
              {child.metrics.avgSimilarity}%
            </span>
          </TableRow>
        ))}
      </div>
    );
  }

  // ── 跨报告：类型节点 → 显示各指标（含稳定性）─────────────────────────────
  if (section === 'cross-report' && level === 'valueType') {
    const sortedChildren = sortConfig.field ? [...selectedNode.children].sort((a, b) => {
      const aVal = a.metrics[sortConfig.field] ?? -Infinity;
      const bVal = b.metrics[sortConfig.field] ?? -Infinity;
      return sortConfig.order === 'asc' ? aVal - bVal : bVal - aVal;
    }) : selectedNode.children;

    return (
      <div>
        <TableHead cols={COL_STYLES.indList}>
          <span>指标</span>
          <SortableHeader label="准确率" field="accuracy" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="召回率" field="recall" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="精确率" field="precision" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="F1" field="f1" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="相似度" field="avgSimilarity" sortConfig={sortConfig} onSort={onSortChange} />
          <Tooltip label="该指标在多少份报告中达标" withArrow>
            <span style={{ cursor: 'help' }}>跨报告稳定性</span>
          </Tooltip>
          <span>条数</span>
        </TableHead>
        {sortedChildren.map((child) => {
          const { metrics } = child;
          const [code, ...nameParts] = child.label.split(' ');
          return (
            <TableRow key={child.id} cols={COL_STYLES.indList} onClick={() => onSelectNode(child)}>
              <Tooltip label={child.label} withArrow>
                <span style={ELLIPSIS_STYLE}>
                  <span style={{ color: '#6366f1', fontSize: 10, fontWeight: 700, marginRight: 4 }}>
                    {code}
                  </span>
                  <span style={{ color: '#1e40af', fontWeight: 500 }}>
                    {nameParts.join(' ')} ›
                  </span>
                </span>
              </Tooltip>
              <MetricsBadge value={metrics.accuracy} />
              <MetricsBadge value={metrics.recall} />
              <MetricsBadge value={metrics.precision} />
              <MetricsBadge value={metrics.f1} />
              <span style={{ color: simColor(metrics.avgSimilarity) }}>
                {metrics.avgSimilarity}%
              </span>
              <ConsistencyDots
                dots={metrics.consistencyDots}
                score={metrics.consistencyScore}
              />
              <span style={{ color: '#64748b' }}>{metrics.totalCount}</span>
            </TableRow>
          );
        })}
      </div>
    );
  }

  // ── 跨报告：指标节点 → 显示各报告中该指标的表现 ─────────────────────────
  if (section === 'cross-report' && level === 'indicator') {
    // 按 report_name 聚合
    const reportMap = new Map();
    for (const row of selectedNode.rows) {
      const rpt = String(row.report_name || '').trim();
      if (!reportMap.has(rpt)) reportMap.set(rpt, []);
      reportMap.get(rpt).push(row);
    }

    const reportEntries = Array.from(reportMap.entries()).map(([rpt, rows]) => {
      const m = calculateOverallMetrics(rows, threshold);
      return { rpt, rows, m };
    });

    const sortedReports = sortConfig.field ? [...reportEntries].sort((a, b) => {
      const aVal = a.m[sortConfig.field] ?? -Infinity;
      const bVal = b.m[sortConfig.field] ?? -Infinity;
      return sortConfig.order === 'asc' ? aVal - bVal : bVal - aVal;
    }) : reportEntries;

    return (
      <div>
        <TableHead cols={COL_STYLES.reportList}>
          <span>报告</span>
          <SortableHeader label="条数" field="totalCount" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="准确率" field="accuracy" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="召回率" field="recall" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="精确率" field="precision" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="F1" field="f1" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="相似度" field="avgSimilarity" sortConfig={sortConfig} onSort={onSortChange} />
        </TableHead>
        {sortedReports.map(({ rpt, rows, m }) => {
          const rptNode = treeData?.perReportRoot?.children?.find((n) => n.label === rpt);
          const currentIndicatorLabel = selectedNode.label;
          const rawType = selectedNode.rows[0]?.value_type_1 || selectedNode.rows[0]?.value_type || '';
          const normalizedType = normalizeValueType(rawType);
          const typeNode = rptNode?.children?.find((n) => n.label === normalizedType);
          const indicatorNode = typeNode?.children?.find((n) => n.label === currentIndicatorLabel);
          const targetNode = indicatorNode || typeNode || rptNode;

          return (
            <TableRow
              key={rpt}
              cols={COL_STYLES.reportList}
              onClick={targetNode ? () => onSelectNode(targetNode) : null}
            >
              <span style={{ fontWeight: 600, color: '#1e40af' }}>{rpt}{targetNode ? ' ›' : ''}</span>
              <span style={{ color: '#64748b' }}>{rows.length}</span>
              <MetricsBadge value={m.accuracy} />
              <MetricsBadge value={m.recall} />
              <MetricsBadge value={m.precision} />
              <MetricsBadge value={m.f1} />
              <span style={{ color: simColor(m.avgSimilarity) }}>{m.avgSimilarity}%</span>
            </TableRow>
          );
        })}
        <div style={{ padding: '8px 14px', fontSize: 11, color: '#64748b' }}>
          💡 点击报告名可跳转到按报告视角查看详情
        </div>
      </div>
    );
  }

  // ── 按报告：根节点 → 显示所有报告 ──────────────────────────────────────────
  if (section === 'per-report' && level === 'perReportRoot') {
    const sortedChildren = sortConfig.field ? [...selectedNode.children].sort((a, b) => {
      const aVal = a.metrics[sortConfig.field] ?? -Infinity;
      const bVal = b.metrics[sortConfig.field] ?? -Infinity;
      return sortConfig.order === 'asc' ? aVal - bVal : bVal - aVal;
    }) : selectedNode.children;

    return (
      <div>
        <TableHead cols="1fr 60px 72px 72px 72px 72px 60px">
          <span>报告</span>
          <SortableHeader label="条数" field="totalCount" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="准确率" field="accuracy" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="召回率" field="recall" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="精确率" field="precision" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="F1" field="f1" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="相似度" field="avgSimilarity" sortConfig={sortConfig} onSort={onSortChange} />
        </TableHead>
        {sortedChildren.map((child) => (
          <TableRow key={child.id} cols="1fr 60px 72px 72px 72px 72px 60px" onClick={() => onSelectNode(child)}>
            <Tooltip label={child.label} withArrow>
              <span style={{ ...ELLIPSIS_STYLE, fontWeight: 600, color: '#1e40af' }}>{child.label} ›</span>
            </Tooltip>
            <span style={{ color: '#64748b' }}>{child.metrics.totalCount}</span>
            <MetricsBadge value={child.metrics.accuracy} />
            <MetricsBadge value={child.metrics.recall} />
            <MetricsBadge value={child.metrics.precision} />
            <MetricsBadge value={child.metrics.f1} />
            <span style={{ color: simColor(child.metrics.avgSimilarity) }}>
              {child.metrics.avgSimilarity}%
            </span>
          </TableRow>
        ))}
      </div>
    );
  }

  // ── 按报告：报告节点 → 显示类型 ──────────────────────────────────────────
  if (section === 'per-report' && level === 'report') {
    const sortedChildren = sortConfig.field ? [...selectedNode.children].sort((a, b) => {
      const aVal = a.metrics[sortConfig.field] ?? -Infinity;
      const bVal = b.metrics[sortConfig.field] ?? -Infinity;
      return sortConfig.order === 'asc' ? aVal - bVal : bVal - aVal;
    }) : selectedNode.children;

    return (
      <div>
        <TableHead cols={COL_STYLES.typeList}>
          <span></span>
          <span>指标类型</span>
          <SortableHeader label="条数" field="totalCount" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="准确率" field="accuracy" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="召回率" field="recall" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="精确率" field="precision" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="F1" field="f1" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="相似度" field="avgSimilarity" sortConfig={sortConfig} onSort={onSortChange} />
        </TableHead>
        {sortedChildren.map((child) => (
          <TableRow key={child.id} cols={COL_STYLES.typeList} onClick={() => onSelectNode(child)}>
            <DotIndicator type={child.label} />
            <span style={{ fontWeight: 600, color: '#1e40af' }}>{child.label} ›</span>
            <span style={{ color: '#64748b' }}>{child.metrics.totalCount}</span>
            <MetricsBadge value={child.metrics.accuracy} />
            <MetricsBadge value={child.metrics.recall} />
            <MetricsBadge value={child.metrics.precision} />
            <MetricsBadge value={child.metrics.f1} />
            <span style={{ color: simColor(child.metrics.avgSimilarity) }}>
              {child.metrics.avgSimilarity}%
            </span>
          </TableRow>
        ))}
      </div>
    );
  }

  // ── 按报告：类型节点 → 显示指标 ──────────────────────────────────────────
  if (section === 'per-report' && level === 'reportType') {
    const sortedChildren = sortConfig.field ? [...selectedNode.children].sort((a, b) => {
      const aVal = a.metrics[sortConfig.field] ?? -Infinity;
      const bVal = b.metrics[sortConfig.field] ?? -Infinity;
      return sortConfig.order === 'asc' ? aVal - bVal : bVal - aVal;
    }) : selectedNode.children;

    return (
      <div>
        <TableHead cols={COL_STYLES.indListNoConsist}>
          <span>指标</span>
          <SortableHeader label="准确率" field="accuracy" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="召回率" field="recall" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="精确率" field="precision" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="F1" field="f1" sortConfig={sortConfig} onSort={onSortChange} />
          <SortableHeader label="相似度" field="avgSimilarity" sortConfig={sortConfig} onSort={onSortChange} />
        </TableHead>
        {sortedChildren.map((child) => {
          const { metrics } = child;
          const [code, ...nameParts] = child.label.split(' ');
          return (
            <TableRow key={child.id} cols={COL_STYLES.indListNoConsist} onClick={() => onSelectNode(child)}>
              <Tooltip label={child.label} withArrow>
                <span style={ELLIPSIS_STYLE}>
                  <span style={{ color: '#6366f1', fontSize: 10, fontWeight: 700, marginRight: 4 }}>
                    {code}
                  </span>
                  <span style={{ color: '#1e40af', fontWeight: 500 }}>
                    {nameParts.join(' ')} ›
                  </span>
                </span>
              </Tooltip>
              <MetricsBadge value={metrics.accuracy} />
              <MetricsBadge value={metrics.recall} />
              <MetricsBadge value={metrics.precision} />
              <MetricsBadge value={metrics.f1} />
              <span style={{ color: simColor(metrics.avgSimilarity) }}>
                {metrics.avgSimilarity}%
              </span>
            </TableRow>
          );
        })}
      </div>
    );
  }

  // ── 按报告：指标叶节点 → 显示原始数据行 ─────────────────────────────────
  if (section === 'per-report' && level === 'reportIndicator') {
    const yearMap = new Map();
    for (const row of selectedNode.rows) {
      const year = String(row.data_year || '').trim() || '未知年份';
      if (!yearMap.has(year)) yearMap.set(year, []);
      yearMap.get(year).push(row);
    }
    const yearEntries = Array.from(yearMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));
    const vt = normalizeValueType(selectedNode.rows[0]?.value_type_1 || selectedNode.rows[0]?.value_type);

    return (
      <div>
        {yearEntries.map(([year, rows]) => (
          <div key={year} style={{ marginBottom: 16 }}>
            <div style={{ padding: '6px 12px', background: '#f1f5f9', fontSize: 12, fontWeight: 600, color: '#1e40af', marginBottom: 8 }}>
              {year}
            </div>
            {rows.map((row, i) => {
              const hasCurrency = (row.currency || '').trim();
              const sims = {};

              sims.pdf = calculateFieldSimilarity(row.pdf_numbers, row.llm_pdf_numbers, 'exact');

              let avgSim = 0;
              if (vt === '文字型') {
                const llmSim = useLlmBased ? (row.llm_based_similarity ?? 0) : null;
                sims.text = calculateFieldSimilarity(row.text_value, row.llm_text_value, 'text', useLlmBased, llmSim);
                avgSim = Math.round(sims.pdf * 0.1 + sims.text * 0.9);
              } else if (vt === '数值型') {
                sims.num = calculateFieldSimilarity(row.num_value, row.llm_num_value, 'numeric');
                sims.unit = calculateFieldSimilarity(row.unit, row.llm_unit, 'exact');
                if (hasCurrency) {
                  sims.currency = calculateFieldSimilarity(row.currency, row.llm_currency, 'exact');
                  avgSim = Math.round(sims.pdf * 0.1 + sims.num * 0.6 + sims.unit * 0.15 + sims.currency * 0.15);
                } else {
                  avgSim = Math.round(sims.pdf * 0.1 + sims.num * 0.6 + sims.unit * 0.3);
                }
              } else if (vt === '强度型') {
                sims.num = calculateFieldSimilarity(row.num_value, row.llm_num_value, 'numeric');
                sims.unit = calculateFieldSimilarity(row.unit, row.llm_unit, 'exact');
                sims.numUnit = calculateFieldSimilarity(row.numerator_unit, row.llm_numerator_unit, 'exact');
                sims.denUnit = calculateFieldSimilarity(row.denominator_unit, row.llm_denominator_unit, 'exact');
                avgSim = Math.round(sims.pdf * 0.1 + sims.num * 0.6 + sims.unit * 0.2 + sims.numUnit * 0.05 + sims.denUnit * 0.05);
              } else if (vt === '货币型') {
                sims.num = calculateFieldSimilarity(row.num_value, row.llm_num_value, 'numeric');
                sims.unit = calculateFieldSimilarity(row.unit, row.llm_unit, 'exact');
                avgSim = Math.round(sims.pdf * 0.1 + sims.num * 0.6 + sims.unit * 0.3);
              }

              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 12, padding: '10px 12px', borderBottom: '1px solid #e2e8f0', fontSize: 11, alignItems: 'start' }}>
                  <div>
                    <div style={{ color: '#64748b', fontSize: 10, marginBottom: 6, fontWeight: 600 }}>测试集</div>
                    <FieldWithSim label="页码" val1={row.pdf_numbers} val2={row.llm_pdf_numbers} fieldType="exact" />
                    {vt === '文字型' && (
                      <FieldWithSim
                        label="值"
                        val1={row.text_value}
                        val2={row.llm_text_value}
                        fieldType="text"
                        showHighlight={true}
                        useLlmBased={useLlmBased}
                        llmSim={row.llm_based_similarity ?? 0}
                      />
                    )}
                    {vt === '数值型' && (
                      <>
                        <FieldWithSim label="值" val1={row.num_value} val2={row.llm_num_value} fieldType="numeric" />
                        <FieldWithSim label="单位" val1={row.unit} val2={row.llm_unit} fieldType="exact" />
                        {hasCurrency && <FieldWithSim label="货币" val1={row.currency} val2={row.llm_currency} fieldType="exact" />}
                      </>
                    )}
                    {vt === '强度型' && (
                      <>
                        <FieldWithSim label="值" val1={row.num_value} val2={row.llm_num_value} fieldType="numeric" />
                        <FieldWithSim label="单位" val1={row.unit} val2={row.llm_unit} fieldType="exact" />
                        <FieldWithSim label="分子单位" val1={row.numerator_unit} val2={row.llm_numerator_unit} fieldType="exact" />
                        <FieldWithSim label="分母单位" val1={row.denominator_unit} val2={row.llm_denominator_unit} fieldType="exact" />
                      </>
                    )}
                    {vt === '货币型' && (
                      <>
                        <FieldWithSim label="值" val1={row.num_value} val2={row.llm_num_value} fieldType="numeric" />
                        <FieldWithSim label="单位" val1={row.unit} val2={row.llm_unit} fieldType="exact" />
                      </>
                    )}
                  </div>

                  <div>
                    <div style={{ color: '#64748b', fontSize: 10, marginBottom: 6, fontWeight: 600 }}>LLM</div>
                    <FieldWithSim label="页码" val1={row.llm_pdf_numbers} val2={row.pdf_numbers} fieldType="exact" />
                    {vt === '文字型' && (
                      <FieldWithSim
                        label="值"
                        val1={row.llm_text_value}
                        val2={row.text_value}
                        fieldType="text"
                        showHighlight={true}
                        useLlmBased={useLlmBased}
                        llmSim={row.llm_based_similarity ?? 0}
                      />
                    )}
                    {vt === '数值型' && (
                      <>
                        <FieldWithSim label="值" val1={row.llm_num_value} val2={row.num_value} fieldType="numeric" />
                        <FieldWithSim label="单位" val1={row.llm_unit} val2={row.unit} fieldType="exact" />
                        {hasCurrency && <FieldWithSim label="货币" val1={row.llm_currency} val2={row.currency} fieldType="exact" />}
                      </>
                    )}
                    {vt === '强度型' && (
                      <>
                        <FieldWithSim label="值" val1={row.llm_num_value} val2={row.num_value} fieldType="numeric" />
                        <FieldWithSim label="单位" val1={row.llm_unit} val2={row.unit} fieldType="exact" />
                        <FieldWithSim label="分子单位" val1={row.llm_numerator_unit} val2={row.numerator_unit} fieldType="exact" />
                        <FieldWithSim label="分母单位" val1={row.llm_denominator_unit} val2={row.denominator_unit} fieldType="exact" />
                      </>
                    )}
                    {vt === '货币型' && (
                      <>
                        <FieldWithSim label="值" val1={row.llm_num_value} val2={row.num_value} fieldType="numeric" />
                        <FieldWithSim label="单位" val1={row.llm_unit} val2={row.unit} fieldType="exact" />
                      </>
                    )}
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <Badge size="xs" color={row.match_status === '未匹配' ? 'red' : avgSim >= 70 ? 'green' : 'yellow'} style={{ marginBottom: 6 }}>
                      {row.match_status}
                    </Badge>
                    <div style={{ color: simColor(avgSim), fontWeight: 600, fontSize: 13 }}>平均</div>
                    <div style={{ color: simColor(avgSim), fontWeight: 700, fontSize: 16 }}>{avgSim}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  return null;
}

// ── 左侧树节点 ────────────────────────────────────────────────────────────────

function TreeItem({ node, depth = 0, selectedId, onSelect, expandedIds, onToggle }) {
  const isSelected = selectedId === node.id;
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = node.children && node.children.length > 0;

  const indent = depth * 14;
  const bgColor = isSelected ? '#dbeafe' : 'transparent';
  const borderColor = isSelected ? '#2563eb' : 'transparent';
  const labelColor = isSelected ? '#1d4ed8' : '#374151';

  const VT_COLORS = { '文字型': '#6366f1', '数值型': '#f59e0b', '货币型': '#10b981', '强度型': '#ef4444' };
  const vtColor = VT_COLORS[node.label];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: `5px 10px 5px ${10 + indent}px`,
          cursor: 'pointer',
          userSelect: 'none',
          background: bgColor,
          borderLeft: `3px solid ${borderColor}`,
          transition: 'background 0.1s'
        }}
        onClick={() => {
          onSelect(node);
        }}
        onMouseEnter={(e) => !isSelected && (e.currentTarget.style.background = '#eff6ff')}
        onMouseLeave={(e) => !isSelected && (e.currentTarget.style.background = bgColor)}
      >
        {/* 展开箭头 */}
        <span
          style={{ width: 12, flexShrink: 0, color: '#64748b', fontSize: 10 }}
          onClick={(e) => {
            if (hasChildren) {
              e.stopPropagation();
              onToggle(node.id);
            }
          }}
        >
          {hasChildren ? (
            isExpanded ? <IconChevronDown size={11} /> : <IconChevronRight size={11} />
          ) : null}
        </span>

        {/* 图标/色点 */}
        {node.level === 'root' && <span style={{ fontSize: 13 }}>🌐</span>}
        {node.level === 'report' && <span style={{ fontSize: 13 }}>📄</span>}
        {(node.level === 'valueType' || node.level === 'reportType') && vtColor && (
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: vtColor, flexShrink: 0 }} />
        )}

        {/* 标签 */}
        <span
          style={{
            flex: 1,
            color: labelColor,
            fontWeight: isSelected || node.level === 'root' ? 600 : 400,
            fontSize: 11.5,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {node.label}
        </span>

        {/* 数量角标 */}
        <span
          style={{
            fontSize: 10,
            background: isSelected ? '#bfdbfe' : '#e2e8f0',
            borderRadius: 8,
            padding: '1px 6px',
            color: isSelected ? '#1d4ed8' : '#64748b',
            flexShrink: 0
          }}
        >
          {node.metrics.totalCount}
        </span>
      </div>

      {/* 子节点 */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              expandedIds={expandedIds}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── 面包屑路径计算 ─────────────────────────────────────────────────────────────

function findPath(root, targetId, path = []) {
  const current = [...path, { id: root.id, label: root.label }];
  if (root.id === targetId) return current;
  for (const child of root.children || []) {
    const found = findPath(child, targetId, current);
    if (found) return found;
  }
  return null;
}

function findNode(root, targetId) {
  if (root.id === targetId) return root;
  for (const child of root.children || []) {
    const found = findNode(child, targetId);
    if (found) return found;
  }
  return null;
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

export function UnifiedAnalysisTree({
  comparisonRows = [],
  threshold = 70,
  onThresholdChange,
  onJumpToOptimization
}) {
  const [selectedId, setSelectedId] = useState('all');
  const [expandedIds, setExpandedIds] = useState(new Set(['all']));
  const [optimizeModalOpen, setOptimizeModalOpen] = useState(false);
  const [useLlmBased, setUseLlmBased] = useState(false);
  const [inputValue, setInputValue] = useState(threshold);
  const [sortConfig, setSortConfig] = useState({ field: null, order: 'asc' });
  const [selectedYears, setSelectedYears] = useState([]);
  const [yearPopoverOpen, setYearPopoverOpen] = useState(false);
  const [tempSelectedYears, setTempSelectedYears] = useState([]);

  // 提取所有年份
  const allYears = useMemo(() => {
    const years = new Set();
    for (const row of comparisonRows) {
      const year = String(row.data_year || '').trim();
      if (year) years.add(year);
    }
    return Array.from(years).sort();
  }, [comparisonRows]);

  // 初始化选中所有年份
  useEffect(() => {
    if (allYears.length > 0 && selectedYears.length === 0) {
      setSelectedYears(allYears);
    }
  }, [allYears]);

  useEffect(() => {
    setInputValue(threshold);
  }, [threshold]);

  // 根据选中年份筛选数据
  const filteredRows = useMemo(() => {
    if (selectedYears.length === 0) return comparisonRows;
    return comparisonRows.filter((row) => {
      const year = String(row.data_year || '').trim();
      return selectedYears.includes(year) || !year;
    });
  }, [comparisonRows, selectedYears]);

  // 构建树数据（threshold 或 useLlmBased 变化时重算）
  const treeData = useMemo(
    () => buildTreeData(filteredRows, threshold, useLlmBased),
    [filteredRows, threshold, useLlmBased]
  );

  // 所有树节点的平铺查找
  const findNodeAnywhere = useCallback((id) => {
    const fromCross = findNode(treeData.crossReportRoot, id);
    if (fromCross) return fromCross;
    const fromPerReport = findNode(treeData.perReportRoot, id);
    if (fromPerReport) return fromPerReport;
    return null;
  }, [treeData]);

  const selectedNode = useMemo(() => findNodeAnywhere(selectedId), [selectedId, findNodeAnywhere]);

  // 面包屑路径
  const breadcrumbPath = useMemo(() => {
    if (!selectedNode) return [];
    const fromCross = findPath(treeData.crossReportRoot, selectedId);
    if (fromCross) return fromCross;
    const fromPerReport = findPath(treeData.perReportRoot, selectedId);
    if (fromPerReport) return fromPerReport;
    return [];
  }, [selectedId, treeData]);

  const handleSelect = useCallback((node) => {
    setSelectedId(node.id);
  }, []);

  const handleToggle = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleNavigate = useCallback((id) => {
    setSelectedId(id);
  }, []);

  // 跳转优化：收集 selectedNode 覆盖的不达标指标
  const handleJumpToOptimization = useCallback(() => {
    setOptimizeModalOpen(true);
  }, []);

  // 导出当前分析结果
  const handleExport = useCallback(() => {
    const simType = useLlmBased ? '基于LLM' : '基于测试集';
    const fileName = `分析结果_阈值${threshold}_${simType}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    // Sheet 1: 明细数据
    const exportData = filteredRows.map((row) => {
      const metrics = calculateOverallMetrics([row], threshold);
      return {
        报告名称: row.report_name || '',
        指标代码: row.indicator_code || '',
        指标名称: row.indicator_name || '',
        数据年份: row.data_year || '',
        指标类型: row.value_type_1 || row.value_type || '',
        页码: row.pdf_numbers || '',
        测试集文本值: row.text_value || '',
        测试集数值: row.num_value || '',
        测试集单位: row.unit || '',
        测试集货币: row.currency || '',
        测试集分子单位: row.numerator_unit || '',
        测试集分母单位: row.denominator_unit || '',
        LLM页码: row.llm_pdf_numbers || '',
        LLM文本值: row.llm_text_value || '',
        LLM数值: row.llm_num_value || '',
        LLM单位: row.llm_unit || '',
        LLM货币: row.llm_currency || '',
        LLM分子单位: row.llm_numerator_unit || '',
        LLM分母单位: row.llm_denominator_unit || '',
        匹配状态: row.match_status || '',
        相似度: useLlmBased ? (row.llm_based_similarity ?? '') : (row.similarity ?? ''),
        准确率: metrics.accuracy !== null ? Math.round(metrics.accuracy * 100) + '%' : '',
        召回率: metrics.recall !== null ? Math.round(metrics.recall * 100) + '%' : '',
        精确率: metrics.precision !== null ? Math.round(metrics.precision * 100) + '%' : '',
        F1分数: metrics.f1 !== null ? Math.round(metrics.f1 * 100) + '%' : ''
      };
    });

    // Sheet 2: 指标维度统计
    const indicatorMap = new Map();
    for (const row of filteredRows) {
      const key = `${row.indicator_code}_${row.indicator_name}`;
      if (!indicatorMap.has(key)) indicatorMap.set(key, []);
      indicatorMap.get(key).push(row);
    }
    const indicatorStats = Array.from(indicatorMap.entries()).map(([key, rows]) => {
      const [code, name] = key.split('_');
      const metrics = calculateOverallMetrics(rows, threshold);
      return {
        指标代码: code,
        指标名称: name,
        数据条数: rows.length,
        准确率: metrics.accuracy !== null ? Math.round(metrics.accuracy * 100) + '%' : '',
        召回率: metrics.recall !== null ? Math.round(metrics.recall * 100) + '%' : '',
        精确率: metrics.precision !== null ? Math.round(metrics.precision * 100) + '%' : '',
        F1分数: metrics.f1 !== null ? Math.round(metrics.f1 * 100) + '%' : '',
        平均相似度: metrics.avgSimilarity + '%'
      };
    });

    // Sheet 3: 报告维度统计
    const reportMap = new Map();
    for (const row of filteredRows) {
      const rpt = row.report_name || '';
      if (!reportMap.has(rpt)) reportMap.set(rpt, []);
      reportMap.get(rpt).push(row);
    }
    const reportStats = Array.from(reportMap.entries()).map(([rpt, rows]) => {
      const metrics = calculateOverallMetrics(rows, threshold);
      return {
        报告名称: rpt,
        数据条数: rows.length,
        准确率: metrics.accuracy !== null ? Math.round(metrics.accuracy * 100) + '%' : '',
        召回率: metrics.recall !== null ? Math.round(metrics.recall * 100) + '%' : '',
        精确率: metrics.precision !== null ? Math.round(metrics.precision * 100) + '%' : '',
        F1分数: metrics.f1 !== null ? Math.round(metrics.f1 * 100) + '%' : '',
        平均相似度: metrics.avgSimilarity + '%'
      };
    });

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(exportData);
    const ws2 = XLSX.utils.json_to_sheet(indicatorStats);
    const ws3 = XLSX.utils.json_to_sheet(reportStats);
    XLSX.utils.book_append_sheet(wb, ws1, '明细数据');
    XLSX.utils.book_append_sheet(wb, ws2, '指标维度统计');
    XLSX.utils.book_append_sheet(wb, ws3, '报告维度统计');
    XLSX.writeFile(wb, fileName);
  }, [filteredRows, threshold, useLlmBased]);

  const sortNodes = useCallback((nodes, field, order) => {
    if (!field) return nodes;
    return [...nodes].sort((a, b) => {
      const aVal = a.metrics[field] ?? -Infinity;
      const bVal = b.metrics[field] ?? -Infinity;
      return order === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, []);

  if (!comparisonRows.length) {
    return (
      <div style={{ padding: 24, color: '#64748b', fontSize: 13, textAlign: 'center' }}>
        暂无分析数据，请先上传文件并运行关联分析
      </div>
    );
  }

  return (
    <div>
      {/* 阈值设置栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 16,
          padding: '12px 16px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          marginBottom: 12
        }}
      >
        <NumberInput
          label="相似度阈值"
          description="达标判定线（影响所有指标实时重算）"
          value={inputValue}
          onChange={(val) => setInputValue(val === undefined ? '' : val)}
          onBlur={() => onThresholdChange?.(inputValue || 70)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onThresholdChange?.(inputValue || 70);
              e.currentTarget.blur();
            }
          }}
          min={0}
          max={100}
          step={5}
          style={{ width: 160 }}
          size="sm"
        />

        <Select
          label="相似度计算方式"
          value={useLlmBased ? 'llm' : 'test'}
          onChange={(val) => setUseLlmBased(val === 'llm')}
          data={[
            { value: 'test', label: '基于测试集' },
            { value: 'llm', label: '基于LLM' }
          ]}
          style={{ width: 160 }}
          size="sm"
        />

        <Popover
          opened={yearPopoverOpen}
          onChange={setYearPopoverOpen}
          position="bottom-start"
          width={200}
        >
          <Popover.Target>
            <Button
              size="sm"
              variant="default"
              onClick={() => {
                setTempSelectedYears(selectedYears);
                setYearPopoverOpen(true);
              }}
            >
              选择年份
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {allYears.map((year) => (
                <Checkbox
                  key={year}
                  label={year}
                  checked={tempSelectedYears.includes(year)}
                  onChange={(e) => {
                    if (e.currentTarget.checked) {
                      setTempSelectedYears([...tempSelectedYears, year]);
                    } else {
                      setTempSelectedYears(tempSelectedYears.filter((y) => y !== year));
                    }
                  }}
                />
              ))}
              <Button
                size="xs"
                onClick={() => {
                  setSelectedYears(tempSelectedYears);
                  setYearPopoverOpen(false);
                }}
                disabled={tempSelectedYears.length === 0}
              >
                应用
              </Button>
            </div>
          </Popover.Dropdown>
        </Popover>

        <Button
          size="sm"
          variant="light"
          leftSection={<IconDownload size={14} />}
          onClick={handleExport}
        >
          下载分析结果
        </Button>

        {onJumpToOptimization && (
          <Button
            size="sm"
            variant="gradient"
            gradient={{ from: 'blue', to: 'cyan' }}
            rightSection={<IconArrowRight size={14} />}
            onClick={handleJumpToOptimization}
            style={{ marginBottom: 2 }}
          >
            跳转到快速优化
          </Button>
        )}
      </div>

      {/* 错误类型分布（当前节点） */}
      {selectedNode && (
        <div
          style={{
            padding: '10px 16px',
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            marginBottom: 12
          }}
        >
          <Text size="xs" fw={600} c="dimmed" mb={6}>
            错误类型分布 — {selectedNode.label}（{selectedNode.metrics.totalCount} 条）
          </Text>
          <ErrorTypeBar
            breakdown={selectedNode.metrics.errorBreakdown}
            total={selectedNode.metrics.totalCount}
          />
        </div>
      )}

      {/* 主体：左树 + 右面板 */}
      <div
        style={{
          display: 'flex',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          overflow: 'hidden',
          background: '#fff',
          minHeight: 440
        }}
      >
        {/* 左树 */}
        <div
          style={{
            width: 220,
            flexShrink: 0,
            borderRight: '1px solid #e2e8f0',
            background: '#f8fafc',
            overflowY: 'auto'
          }}
        >
          {/* 跨报告段 */}
          <div style={{ padding: '6px 10px 2px', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            跨报告视角
          </div>
          <TreeItem
            node={treeData.crossReportRoot}
            depth={0}
            selectedId={selectedId}
            onSelect={handleSelect}
            expandedIds={expandedIds}
            onToggle={handleToggle}
          />

          {/* 分隔线 */}
          <div style={{ height: 1, background: '#e2e8f0', margin: '6px 0' }} />

          {/* 按报告段 */}
          <div style={{ padding: '6px 10px 2px', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            按报告视角
          </div>
          <TreeItem
            node={treeData.perReportRoot}
            depth={0}
            selectedId={selectedId}
            onSelect={handleSelect}
            expandedIds={expandedIds}
            onToggle={handleToggle}
          />
        </div>

        {/* 右侧 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <Breadcrumb path={breadcrumbPath} onNavigate={handleNavigate} />
          <PinnedSummary node={selectedNode} threshold={threshold} />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <RightPanel
              selectedNode={selectedNode}
              treeData={treeData}
              threshold={threshold}
              sortConfig={sortConfig}
              onSortChange={(field, order) => setSortConfig({ field, order })}
              useLlmBased={useLlmBased}
              onSelectNode={(node) => {
                setSelectedId(node.id);
                setExpandedIds((prev) => new Set([...prev, node.id]));
              }}
            />
          </div>
        </div>
      </div>

      {/* 跳转优化确认面板 */}
      {optimizeModalOpen && (
        <OptimizationScopeConfirm
          sourceLabel={selectedNode?.label || '全部'}
          rows={selectedNode?.rows || comparisonRows}
          threshold={threshold}
          onConfirm={(selectedCodes) => {
            setOptimizeModalOpen(false);
            onJumpToOptimization?.(comparisonRows, selectedCodes);
          }}
          onCancel={() => setOptimizeModalOpen(false)}
        />
      )}
    </div>
  );
}
