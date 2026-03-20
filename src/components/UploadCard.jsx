import { useRef, useState } from 'react';
import { Badge, Button } from '@mantine/core';
import { IconUpload } from '@tabler/icons-react';

export function UploadCard({
  icon,
  tag,
  title,
  hint,
  acceptHint,
  buttonLabel,
  accept,
  file,
  onFileSelect,
  formatFileInfo
}) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (nextFile) => {
    if (!nextFile) return;
    onFileSelect(nextFile);
  };

  return (
    <div
      className={`upload-card ${isDragging ? 'drag-active' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
        handleFile(event.dataTransfer.files?.[0] || null);
      }}
    >
      <div className="upload-card-head">
        <Badge variant="light" color="blue" radius="xl" className="upload-tag">
          {tag}
        </Badge>
        <div className="upload-icon">{icon}</div>
      </div>
      <div className="upload-copy">
        <h3>{title}</h3>
        <p className="upload-hint">{hint}</p>
        <p className="upload-accept-hint">{acceptHint}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="file-input"
        onChange={(event) => handleFile(event.target.files?.[0] || null)}
      />
      <Button
        type="button"
        variant="default"
        radius="xl"
        className="btn-outline"
        onClick={() => inputRef.current?.click()}
        leftSection={<IconUpload size={16} />}
      >
        {buttonLabel}
      </Button>
      <p className="upload-subhint">拖拽文件到这里，或点击按钮手动选择</p>
      {file ? <div className="file-info success">✅ {formatFileInfo(file)}</div> : null}
    </div>
  );
}
