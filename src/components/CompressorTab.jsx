import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button } from '@mantine/core';
import { IconDownload, IconFileTypePdf, IconPlayerPlayFilled } from '@tabler/icons-react';
import { UploadCard } from './UploadCard.jsx';
import { ProgressPanel } from './ProgressPanel.jsx';

function createInitialProgress() {
  return {
    visible: false,
    status: '',
    percentage: 0,
    logs: [],
    isLoading: false
  };
}

function formatPdfInfo(file) {
  return `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatReduction(ratio) {
  return `${Math.max(0, Math.round((1 - ratio) * 100))}%`;
}

function simplifyPhase(phase) {
  if (phase.includes('解析')) return '解析 PDF';
  if (phase.includes('找到')) return '扫描图片';
  if (phase.includes('压缩图片')) return '压缩图片';
  if (phase.includes('重建')) return '重建文件';
  return phase;
}

export function CompressorTab() {
  const [pdfFile, setPdfFile] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(createInitialProgress);
  const [result, setResult] = useState(null);
  const resultRef = useRef(null);
  const lastPhaseRef = useRef('');

  const canStart = Boolean(pdfFile) && !isRunning;

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => () => {
    if (resultRef.current?.downloadUrl) {
      URL.revokeObjectURL(resultRef.current.downloadUrl);
    }
  }, []);

  const summary = useMemo(() => {
    if (!result) {
      return null;
    }

    return {
      originalSize: formatBytes(result.originalSize),
      compressedSize: formatBytes(result.compressedSize),
      savedBytes: formatBytes(Math.max(0, result.originalSize - result.compressedSize)),
      reduction: formatReduction(result.ratio)
    };
  }, [result]);

  const appendProgress = ({ message, percentage, timestamp }) => {
    setProgress((previous) => ({
      visible: true,
      status: message || previous.status,
      percentage: percentage >= 0 ? percentage : previous.percentage,
      logs: [
        ...previous.logs,
        { id: `${Date.now()}-${Math.random()}`, time: timestamp, message }
      ],
      isLoading: percentage >= 0 ? percentage < 100 : previous.isLoading
    }));
  };

  const handlePdfSelect = (file) => {
    if (!file) return;

    if (!(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
      window.alert(`Please upload a valid PDF file. Invalid file: ${file.name}`);
      return;
    }

    setPdfFile(file);
  };

  const handleCompress = async () => {
    if (!pdfFile) return;

    setIsRunning(true);
    if (result?.downloadUrl) {
      URL.revokeObjectURL(result.downloadUrl);
    }
    setResult(null);
    lastPhaseRef.current = '';
    setProgress({
      visible: true,
      status: 'Starting PDF compression...',
      percentage: 0,
      logs: [],
      isLoading: true
    });

    try {
      const { compressPdf } = await import('../services/pdfCompressorService.js');

      const compressionResult = await compressPdf(pdfFile, undefined, (fileProgress) => {
        let localProgress = 10;

        if (fileProgress.total > 0) {
          localProgress = Math.round((fileProgress.current / Math.max(fileProgress.total, 1)) * 90);
        }

        if (String(fileProgress.phase).includes('重建')) {
          localProgress = 95;
        }

        const shortPhase = simplifyPhase(String(fileProgress.phase));

        if (lastPhaseRef.current !== shortPhase) {
          lastPhaseRef.current = shortPhase;
          appendProgress({
            message: shortPhase,
            percentage: localProgress,
            timestamp: new Date().toLocaleTimeString()
          });
          return;
        }

        setProgress((previous) => ({
          ...previous,
          visible: true,
          status: shortPhase,
          percentage: localProgress,
          isLoading: localProgress < 100
        }));
      });

      const downloadUrl = URL.createObjectURL(compressionResult.blob);
      setResult({
        fileName: pdfFile.name,
        originalSize: compressionResult.originalSize,
        compressedSize: compressionResult.compressedSize,
        ratio: compressionResult.ratio,
        downloadUrl
      });

      appendProgress({
        message: '压缩完成',
        percentage: 100,
        timestamp: new Date().toLocaleTimeString()
      });
    } catch (error) {
      console.error(error);
      appendProgress({
        message: `Compression failed: ${error.message}`,
        percentage: 100,
        timestamp: new Date().toLocaleTimeString()
      });
    } finally {
      setIsRunning(false);
      setProgress((previous) => ({ ...previous, isLoading: false }));
    }
  };

  return (
    <section className="glass-panel main-panel compressor-simple">
      <div className="section-heading workspace-heading">
        <h2 className="section-title">
          <IconFileTypePdf size={20} stroke={1.8} />
          <span>PDF压缩</span>
        </h2>
        <p className="section-caption">上传一个 PDF，压缩完成后直接下载。</p>
      </div>

      <UploadCard
        icon={<IconFileTypePdf size={26} stroke={1.8} />}
        tag="PDF"
        title="Upload PDF"
        hint="Upload one PDF to compress"
        acceptHint="当前仅支持单文件压缩"
        buttonLabel="Browse PDF"
        accept="application/pdf"
        file={pdfFile}
        onFileSelect={handlePdfSelect}
        formatFileInfo={formatPdfInfo}
      />

      <div className="compressor-simple-action">
        <Button
          size="lg"
          radius="xl"
          className="btn-primary btn-primary-mantine compressor-start-btn"
          disabled={!canStart}
          onClick={handleCompress}
          leftSection={<IconPlayerPlayFilled size={16} />}
        >
          {isRunning ? 'Compressing...' : 'Start Compression'}
        </Button>
      </div>

      <ProgressPanel progress={progress} eyebrow="Compression" title="压缩进度" maxLogs={3} />

      {result && summary ? (
        <section className="panel-block compressor-result-card">
          <div className="compressor-result-header">
            <Badge variant="light" color="teal" radius="xl" size="lg">压缩完成</Badge>
            <h3 className="compressor-result-title">{result.fileName}</h3>
          </div>

          <div className="summary-strip compressor-summary-strip">
            <div className="summary-chip">
              <strong>Original</strong>
              <span>{summary.originalSize}</span>
            </div>
            <div className="summary-chip">
              <strong>Compressed</strong>
              <span>{summary.compressedSize}</span>
            </div>
            <div className="summary-chip">
              <strong>Saved</strong>
              <span>{summary.savedBytes}</span>
            </div>
            <div className="summary-chip">
              <strong>Reduction</strong>
              <span>{summary.reduction}</span>
            </div>
          </div>

          <Button
            component="a"
            href={result.downloadUrl}
            download={`${result.fileName.replace(/\.pdf$/i, '')}_compressed.pdf`}
            size="xl"
            radius="xl"
            className="btn-primary btn-primary-mantine compressor-download-large"
            leftSection={<IconDownload size={18} />}
          >
            下载压缩后的 PDF
          </Button>
        </section>
      ) : null}
    </section>
  );
}
