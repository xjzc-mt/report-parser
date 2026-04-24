import { Badge, Button, NumberInput, Select, Text, TextInput } from '@mantine/core';
import { IconFileTypePdf, IconSparkles, IconTableImport } from '@tabler/icons-react';
import { UploadCard } from '../UploadCard.jsx';
import { PdfMatchChecker } from '../PdfMatchChecker.jsx';

function formatExcelFile(file) {
  if (!file) return '';
  return `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
}

function formatPdfFiles(files) {
  if (!files || files.length === 0) return '';
  return `${files.length} 个文件`;
}

export function OptimizationSetupPanel({
  comparisonFile,
  pdfFiles,
  onComparisonFileSelect,
  onComparisonFileRemove,
  onPdfSelect,
  onPdfRemove,
  requiredReports,
  targetOptions,
  selectedTargetCode,
  onSelectedTargetCodeChange,
  targetName,
  onTargetNameChange,
  maxIterations,
  onMaxIterationsChange,
  selectedRowCount,
  totalRowCount,
  preselectedCodes,
  canOptimize,
  isOptimizing,
  onStartOptimization,
  error
}) {
  return (
    <div className="prompt-optimization-setup">
      <div className="panel-block prompt-optimization-intro">
        <div className="panel-header">
          <div>
            <h3>优化配置</h3>
            <p>先选一个要优化的提取目标，再用现有对比结果和 PDF 进行定向优化。</p>
          </div>
        </div>
      </div>

      <div className="testbench-upload-grid">
        <UploadCard
          icon={<IconTableImport size={26} stroke={1.8} />}
          tag="EXCEL"
          title="关联对比文件"
          hint="上传模型结果与测试集关联后的对比文件"
          acceptHint="必须包含 indicator_code、report_name、prompt、pdf_numbers 等字段"
          buttonLabel="选择对比文件"
          accept=".xlsx,.xls,.csv"
          file={comparisonFile}
          onFileSelect={onComparisonFileSelect}
          onRemoveFile={onComparisonFileRemove}
          formatFileInfo={formatExcelFile}
        />
        <UploadCard
          icon={<IconFileTypePdf size={26} stroke={1.8} />}
          tag="PDF"
          title="PDF 文件"
          hint="上传该目标对应报告的 PDF"
          buttonLabel="选择 PDF 文件"
          accept="application/pdf"
          file={pdfFiles}
          multiple
          onFileSelect={onPdfSelect}
          onRemoveFile={onPdfRemove}
          formatFileInfo={formatPdfFiles}
        />
      </div>

      {requiredReports.length > 0 ? (
        <PdfMatchChecker
          requiredReports={requiredReports}
          uploadedPdfFiles={pdfFiles}
        />
      ) : null}

      {preselectedCodes.length > 0 ? (
        <div className="prompt-optimization-banner">
          <Text size="xs" fw={600} c="blue.7" mb={4}>
            来自验收模式的预选范围
          </Text>
          <div className="prompt-optimization-badge-row">
            {preselectedCodes.map((code) => (
              <Badge key={code} size="xs" color="indigo" variant="light">
                {code}
              </Badge>
            ))}
          </div>
          {totalRowCount > 0 ? (
            <Text size="xs" c="dimmed" mt={4}>
              当前可优化 {selectedRowCount} 条，上传文件总计 {totalRowCount} 条。
            </Text>
          ) : null}
        </div>
      ) : null}

      <div className="prompt-optimization-control-grid">
        <Select
          label="优化目标"
          placeholder={targetOptions.length ? '选择一个指标目标' : '先上传对比文件'}
          data={targetOptions}
          value={selectedTargetCode}
          onChange={(value) => onSelectedTargetCodeChange?.(value || '')}
          nothingFoundMessage="没有可选目标"
          searchable
        />
        <TextInput
          label="目标名称"
          placeholder="例如：排放总量"
          value={targetName}
          onChange={(event) => onTargetNameChange?.(event.currentTarget.value)}
        />
        <NumberInput
          label="最大优化轮次"
          min={1}
          max={5}
          value={maxIterations}
          onChange={(value) => onMaxIterationsChange?.(Number(value || 1))}
        />
      </div>

      <div className="prompt-optimization-summary">
        <Badge variant="light" color="blue" radius="xl">
          目标行数 {selectedRowCount}
        </Badge>
        <Badge variant="light" color="grape" radius="xl">
          PDF 数 {pdfFiles.length}
        </Badge>
        <Badge variant="light" color="gray" radius="xl">
          最多 {maxIterations} 轮
        </Badge>
      </div>

      <div className="prompt-optimization-actions">
        <Button
          size="md"
          radius="xl"
          disabled={!canOptimize}
          onClick={onStartOptimization}
          leftSection={<IconSparkles size={15} />}
        >
          {isOptimizing ? '优化中...' : '开始优化'}
        </Button>
      </div>

      {error ? (
        <div className="testbench-error-block prompt-optimization-error">
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
