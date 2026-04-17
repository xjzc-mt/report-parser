import { useRef, useState } from 'react';
import { ActionIcon, Badge, Button, TextInput } from '@mantine/core';
import { IconFileTypePdf, IconTrash, IconUpload } from '@tabler/icons-react';
import { parsePromptIterationPageSpec } from '../../utils/promptIterationModel.js';

function getFileIdentity(file) {
  return `${file.name}__${file.size}__${file.lastModified}`;
}

function hasAttachedFile(item) {
  return Boolean(item?.file && typeof item.file.arrayBuffer === 'function');
}

function createDraftFileItem(file) {
  return {
    id: getFileIdentity(file),
    name: file.name,
    type: file.type || 'application/pdf',
    pageSpec: '',
    file
  };
}

function formatFileSize(size) {
  if (!size) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function isPdfFile(file) {
  return file?.type === 'application/pdf' || file?.name?.toLowerCase().endsWith('.pdf');
}

export function PromptIterationFileList({ draft, onDraftChange }) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const appendFiles = (incomingFiles) => {
    const nextFiles = Array.isArray(incomingFiles) ? incomingFiles : [];
    if (nextFiles.length === 0) {
      return;
    }

    const invalidFile = nextFiles.find((file) => !isPdfFile(file));
    if (invalidFile) {
      window.alert(`仅支持上传 PDF 文件：${invalidFile.name}`);
      return;
    }

    onDraftChange((previous) => {
      const existing = [...previous.files];
      const seen = new Set(
        existing
          .filter((item) => hasAttachedFile(item))
          .map((item) => getFileIdentity(item.file))
      );

      nextFiles.forEach((file) => {
        const identity = getFileIdentity(file);
        if (seen.has(identity)) {
          return;
        }

        const placeholderIndex = existing.findIndex(
          (item) => !hasAttachedFile(item) && item.name === file.name
        );

        if (placeholderIndex >= 0) {
          existing[placeholderIndex] = {
            ...existing[placeholderIndex],
            id: identity,
            type: file.type || 'application/pdf',
            file
          };
        } else {
          existing.push(createDraftFileItem(file));
        }

        seen.add(identity);
      });

      return {
        ...previous,
        files: existing
      };
    });
  };

  const removeFile = (fileId) => {
    onDraftChange((previous) => ({
      ...previous,
      files: previous.files.filter((item) => item.id !== fileId)
    }));
  };

  const updatePageSpec = (fileId, pageSpec) => {
    onDraftChange((previous) => ({
      ...previous,
      files: previous.files.map((item) => (
        item.id === fileId
          ? { ...item, pageSpec }
          : item
      ))
    }));
  };

  const normalizePageSpec = (item) => {
    const parsed = parsePromptIterationPageSpec(item.pageSpec);
    if (!parsed.valid || parsed.normalized === item.pageSpec) {
      return;
    }
    updatePageSpec(item.id, parsed.normalized);
  };

  return (
    <div className="panel-block prompt-iteration-files">
      <div className="prompt-iteration-section-head">
        <div>
          <h3 className="prompt-iteration-section-title">文件与页码</h3>
          <p className="section-caption">
            每份 PDF 都可以单独指定页码。留空表示全文，适合快速缩小实验上下文。
          </p>
        </div>
        <Badge variant="light" color="blue" radius="xl">
          {draft.files.length} 份 PDF
        </Badge>
      </div>

      <div
        className={`prompt-iteration-upload-zone ${isDragging ? 'drag-active' : ''}`}
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
          appendFiles(Array.from(event.dataTransfer.files || []));
        }}
      >
        <div className="prompt-iteration-upload-copy">
          <div className="prompt-iteration-upload-icon">
            <IconFileTypePdf size={22} stroke={1.8} />
          </div>
          <div>
            <strong>上传实验 PDF</strong>
            <p className="section-caption">支持多选和拖拽上传，默认会去重相同文件。</p>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="file-input"
          onChange={(event) => {
            appendFiles(Array.from(event.target.files || []));
            event.target.value = '';
          }}
        />
        <Button
          variant="default"
          leftSection={<IconUpload size={16} />}
          onClick={() => inputRef.current?.click()}
        >
          选择 PDF
        </Button>
      </div>

      {draft.files.length === 0 ? (
        <div className="prompt-iteration-empty">
          先上传一批 PDF，再为每个文件单独配置页码范围。
        </div>
      ) : (
        <div className="prompt-iteration-file-list">
          {draft.files.map((item) => {
            const pageResult = parsePromptIterationPageSpec(item.pageSpec);
            const attached = hasAttachedFile(item);

            return (
              <div key={item.id} className="prompt-iteration-file-row">
                <div className="prompt-iteration-file-main">
                  <div className="prompt-iteration-file-title">
                    <span>{item.name || '未命名 PDF'}</span>
                    <Badge
                      variant="light"
                      color={attached ? 'teal' : 'yellow'}
                      radius="xl"
                    >
                      {attached ? formatFileSize(item.file.size) : '需重新上传'}
                    </Badge>
                  </div>
                  <p className="prompt-iteration-file-meta">
                    {attached
                      ? '留空跑全文；支持 12、12-15、12,18、12-15,18 这类写法。'
                      : '已恢复页码配置，但该文件需要重新上传后才能运行。'}
                  </p>
                </div>

                <TextInput
                  value={item.pageSpec}
                  placeholder="页码范围，留空表示全文"
                  onChange={(event) => updatePageSpec(item.id, event.currentTarget.value)}
                  onBlur={() => normalizePageSpec(item)}
                  error={pageResult.valid ? undefined : pageResult.error}
                  description={
                    pageResult.valid && item.pageSpec.trim()
                      ? `解析后页码：${pageResult.normalized || '全文'}`
                      : undefined
                  }
                />

                <ActionIcon
                  variant="subtle"
                  color="red"
                  radius="xl"
                  size="lg"
                  onClick={() => removeFile(item.id)}
                  aria-label={`删除 ${item.name}`}
                >
                  <IconTrash size={16} stroke={1.8} />
                </ActionIcon>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
