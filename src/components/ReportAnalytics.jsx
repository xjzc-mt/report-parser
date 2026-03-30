import { useState } from 'react';
import { Card, Badge, Text, Table } from '@mantine/core';
import { groupRowsByReport, groupRowsByYear } from '../utils/reportAnalytics.js';

export function ReportAnalytics({ comparisonRows, similarityThreshold = 70 }) {
  const [selectedReport, setSelectedReport] = useState(null);
  const reports = groupRowsByReport(comparisonRows);

  const getPerformanceClass = (value) => {
    if (value === null) return 'gray';
    return value >= 0.8 ? 'green' : value >= 0.6 ? 'yellow' : 'red';
  };

  const pct = (v) => v !== null ? `${Math.round(v * 100)}%` : '—';

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, maxHeight: '70vh', overflowY: 'auto' }}>
        <Text size="lg" fw={600} mb="md">报告列表</Text>
        {reports.map((report) => (
          <Card
            key={report.reportName}
            shadow="sm"
            padding="md"
            radius="md"
            withBorder
            mb="sm"
            style={{
              cursor: 'pointer',
              backgroundColor: selectedReport?.reportName === report.reportName ? '#f0f7ff' : 'white'
            }}
            onClick={() => setSelectedReport(report)}
          >
            <Text fw={600} size="sm" mb={8}>{report.reportName}</Text>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Badge color={getPerformanceClass(report.accuracy)} size="sm">
                准确率: {pct(report.accuracy)}
              </Badge>
              <Badge color="blue" size="sm" variant="light">
                {report.totalCount} 条
              </Badge>
            </div>
          </Card>
        ))}
      </div>

      {selectedReport && (
        <div style={{ flex: 2, position: 'sticky', top: 20, maxHeight: '70vh', overflowY: 'auto' }}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Text size="xl" fw={700} mb="md">{selectedReport.reportName}</Text>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              <Badge color="blue" size="lg">共 {selectedReport.totalCount} 条</Badge>
              <Badge color={getPerformanceClass(selectedReport.accuracy)} size="lg">准确率: {pct(selectedReport.accuracy)}</Badge>
              <Badge color={getPerformanceClass(selectedReport.recall)} size="lg">召回率: {pct(selectedReport.recall)}</Badge>
              <Badge color={getPerformanceClass(selectedReport.precision)} size="lg">精确率: {pct(selectedReport.precision)}</Badge>
              <Badge color={getPerformanceClass(selectedReport.f1)} size="lg">F1: {pct(selectedReport.f1)}</Badge>
            </div>

            <Text size="md" fw={600} mb="xs">相似度</Text>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <Badge color="cyan" size="md">基于测试集: {selectedReport.avgSimilarity}%</Badge>
              <Badge color="teal" size="md">基于LLM: {selectedReport.avgLlmBasedSimilarity}%</Badge>
            </div>

            <Text size="md" fw={600} mb="xs">按年度分析</Text>
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>年份</Table.Th>
                  <Table.Th>指标数</Table.Th>
                  <Table.Th>准确率</Table.Th>
                  <Table.Th>召回率</Table.Th>
                  <Table.Th>F1</Table.Th>
                  <Table.Th>平均相似度</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {groupRowsByYear(selectedReport.rows, similarityThreshold).map((yearData) => (
                  <Table.Tr key={yearData.year}>
                    <Table.Td><Text fw={600}>{yearData.year}</Text></Table.Td>
                    <Table.Td>{yearData.totalCount}</Table.Td>
                    <Table.Td>
                      <Badge color={getPerformanceClass(yearData.accuracy)} size="sm">
                        {pct(yearData.accuracy)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={getPerformanceClass(yearData.recall)} size="sm">
                        {pct(yearData.recall)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={getPerformanceClass(yearData.f1)} size="sm">
                        {pct(yearData.f1)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{yearData.avgSimilarity}%</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  );
}
