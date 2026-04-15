import { useState, useMemo, useEffect } from 'react';
import { Button, Checkbox, Text, Badge, Divider, ScrollArea } from '@mantine/core';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';

/**
 * 跳转快速优化前的范围确认面板
 *
 * Props:
 *   sourceLabel     当前选中节点的标签（用于显示来源）
 *   rows            当前节点覆盖的所有 comparison rows
 *   threshold       相似度阈值
 *   onConfirm(codes) 用户确认后回调，传入选定的 indicator_code 数组
 *   onCancel()       取消回调
 */
export function OptimizationScopeConfirm({ sourceLabel, rows = [], threshold = 70, onConfirm, onCancel }) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // 收集 similarity < threshold 的不达标指标
  const allWeakIndicators = useMemo(() => {
    const map = new Map(); // code → { name, count, totalRows, matchedRows }
    for (const row of rows) {
      const code = String(row.indicator_code || '').trim();
      if (!code) continue;
      const sim = row.similarity ?? 0;
      // 只统计有标准答案且未达标的行
      const hasGt =
        (String(row.text_value ?? '').trim() && String(row.text_value ?? '').trim() !== '未披露') ||
        (String(row.num_value ?? '').trim() && String(row.num_value ?? '').trim() !== '未披露');
      if (!hasGt) continue;

      if (!map.has(code)) {
        map.set(code, { name: String(row.indicator_name || '').trim(), count: 0, totalRows: 0, matchedRows: 0 });
      }
      const entry = map.get(code);
      entry.totalRows++;
      if (row.match_status !== '未匹配') entry.matchedRows++;
      if (sim < threshold) entry.count++;
    }

    const indicators = Array.from(map.entries())
      .filter(([, { count }]) => count > 0)
      .map(([code, { name, count, totalRows, matchedRows }]) => ({
        code,
        name,
        count,
        precision: matchedRows > 0 ? matchedRows / totalRows : 0,
        accuracy: totalRows > 0 ? (totalRows - count) / totalRows : 0
      }));

    // 按精确率升序、准确率升序排序
    indicators.sort((a, b) => {
      if (a.precision !== b.precision) return a.precision - b.precision;
      return a.accuracy - b.accuracy;
    });

    return indicators;
  }, [rows, threshold]);

  const [checkedCodes, setCheckedCodes] = useState(
    () => new Set(allWeakIndicators.map((i) => i.code))
  );

  // 当 allWeakIndicators 变化时同步 checkedCodes
  const indicatorCodes = useMemo(() => allWeakIndicators.map((i) => i.code), [allWeakIndicators]);
  const allChecked = indicatorCodes.every((c) => checkedCodes.has(c));
  const someChecked = indicatorCodes.some((c) => checkedCodes.has(c));

  const toggleCode = (code) => {
    setCheckedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleAll = () => {
    if (allChecked) {
      setCheckedCodes(new Set());
    } else {
      setCheckedCodes(new Set(indicatorCodes));
    }
  };

  const selectedCodes = indicatorCodes.filter((c) => checkedCodes.has(c));
  // 估算 API 调用次数（每个指标跨所有报告，约 2 次）
  const reportCount = new Set(rows.map((r) => r.report_name)).size || 1;
  const estimatedCalls = selectedCodes.length * Math.ceil(reportCount / 5) * 2;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 300,
        overflow: 'hidden'
      }}
      onClick={(e) => e.target === e.currentTarget && onCancel?.()}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          width: 520,
          maxWidth: '90vw',
          maxHeight: '85vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* 头部 */}
        <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
          <Text fw={700} size="md" mb={4}>
            📋 本次优化范围确认
          </Text>
          <Text size="xs" c="dimmed">
            来源：{sourceLabel}
          </Text>
        </div>

        {/* 内容区 */}
        <div style={{ padding: '14px 20px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <Badge color="red" size="md" variant="light">
              待优化指标：{selectedCodes.length} 个（similarity &lt; {threshold}%）
            </Badge>
            <Badge color="blue" size="md" variant="light">
              预计 API 调用：约 {estimatedCalls} 次
            </Badge>
          </div>

          {allWeakIndicators.length === 0 ? (
            <div
              style={{
                padding: '12px 14px',
                background: '#f0fdf4',
                borderRadius: 8,
                fontSize: 12,
                color: '#16a34a'
              }}
            >
              ✅ 当前选中范围内所有指标均已达标，无需优化！
            </div>
          ) : (
            <>
              {/* 展开指标清单 */}
              <button
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#2563eb',
                  fontSize: 12,
                  fontWeight: 600,
                  padding: 0,
                  marginBottom: expanded ? 10 : 0
                }}
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                {expanded ? '收起指标清单' : `修改范围（展开 ${allWeakIndicators.length} 个指标清单）`}
              </button>

              {expanded && (
                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    overflow: 'hidden'
                  }}
                >
                  {/* 全选 */}
                  <div
                    style={{
                      padding: '8px 12px',
                      background: '#f8fafc',
                      borderBottom: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    <Checkbox
                      checked={allChecked}
                      indeterminate={someChecked && !allChecked}
                      onChange={toggleAll}
                      label={
                        <Text size="xs" fw={600}>
                          全选 / 全不选
                        </Text>
                      }
                    />
                  </div>

                  <div>
                    {allWeakIndicators.map(({ code, name, count, precision, accuracy }) => (
                      <div
                        key={code}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '32px 80px 1fr 60px 60px 60px',
                          alignItems: 'center',
                          gap: 8,
                          padding: '7px 12px',
                          borderBottom: '1px solid #f1f5f9',
                          cursor: 'pointer'
                        }}
                        onClick={() => toggleCode(code)}
                      >
                        <Checkbox
                          checked={checkedCodes.has(code)}
                          onChange={() => toggleCode(code)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#6366f1' }}>
                          {code}
                        </span>
                        <span style={{ fontSize: 11.5, color: '#374151', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {name}
                        </span>
                        <Badge size="xs" color="orange" variant="light">
                          精{Math.round(precision * 100)}%
                        </Badge>
                        <Badge size="xs" color="blue" variant="light">
                          准{Math.round(accuracy * 100)}%
                        </Badge>
                        <Badge size="xs" color="red" variant="light">
                          {count}条
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <Divider />

        {/* 操作按钮 */}
        <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
          <Button variant="default" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button
            size="sm"
            disabled={selectedCodes.length === 0}
            onClick={() => onConfirm?.(selectedCodes)}
          >
            确认，开始优化 →
          </Button>
        </div>
      </div>
    </div>
  );
}
