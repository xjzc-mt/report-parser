import { Badge, Button, Select, TextInput, Textarea } from '@mantine/core';

const PROVIDER_LABELS = {
  gemini: 'Gemini',
  anthropic: 'Anthropic',
  openai: 'OpenAI 兼容'
};

export function PromptIterationConfigPanel({
  draft,
  onDraftChange,
  llmSettings,
  presetName,
  supportsPdfUpload,
  promptAssetOptions = [],
  promptVersionOptions = [],
  selectedPromptAssetId = '',
  selectedPromptVersionId = '',
  onSelectPromptAsset,
  onSelectPromptVersion,
  onOpenPromptAssetLibrary,
  onSavePromptAsset,
  canSavePromptAsset = false,
  isSavingPromptAsset = false
}) {
  const updateField = (key, value) => {
    onDraftChange((previous) => ({
      ...previous,
      [key]: value
    }));
  };

  const providerLabel = PROVIDER_LABELS[llmSettings?.providerType] || '未识别 Provider';

  return (
    <div className="panel-block prompt-iteration-config">
      <div className="prompt-iteration-section-head">
        <div>
          <h3 className="prompt-iteration-section-title">实验配置</h3>
          <p className="section-caption">
            先定义这次要验证的提取目标，再直接观察同一套 Prompt 在不同文件上的稳定性。
          </p>
        </div>
      </div>

      <div className="prompt-iteration-config-layout">
        <div className="prompt-iteration-input-stack">
          <div className="prompt-iteration-prompt-source">
            <div className="prompt-iteration-prompt-source-grid">
              <Select
                label="Prompt 资产"
                placeholder={promptAssetOptions.length ? '选择一个基线 Prompt' : '先去导入 Prompt 资产'}
                data={promptAssetOptions}
                value={selectedPromptAssetId || null}
                onChange={(value) => value && onSelectPromptAsset?.(value)}
                searchable
                clearable={false}
                nothingFoundMessage="没有可选 Prompt 资产"
                comboboxProps={{ withinPortal: false }}
              />
              <Select
                label="版本"
                placeholder={promptVersionOptions.length ? '选择一个版本' : '先选择 Prompt 资产'}
                data={promptVersionOptions}
                value={selectedPromptVersionId || null}
                onChange={(value) => value && onSelectPromptVersion?.(value)}
                searchable
                clearable={false}
                disabled={!selectedPromptAssetId || promptVersionOptions.length === 0}
                nothingFoundMessage="没有可选版本"
                comboboxProps={{ withinPortal: false }}
              />
            </div>
            <div className="prompt-iteration-prompt-source-actions">
              <p className="section-caption">
                这里读取统一维护的原始 Prompt。选中后会自动带入下方系统提示词和用户提示词。
              </p>
              {onOpenPromptAssetLibrary ? (
                <>
                  <Button variant="default" radius="xl" onClick={onOpenPromptAssetLibrary}>
                    管理 Prompt 资产
                  </Button>
                  <Button
                    radius="xl"
                    onClick={() => onSavePromptAsset?.()}
                    disabled={!canSavePromptAsset}
                    loading={isSavingPromptAsset}
                  >
                    写入 Prompt 资产库
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          <TextInput
            label="名称"
            placeholder="例如：温室气体排放总量"
            value={draft.name}
            onChange={(event) => updateField('name', event.currentTarget.value)}
          />
          <Textarea
            label="系统提示词"
            placeholder="为模型定义角色、边界和输出要求"
            autosize
            minRows={5}
            maxRows={12}
            value={draft.systemPrompt}
            onChange={(event) => updateField('systemPrompt', event.currentTarget.value)}
          />
          <Textarea
            label="用户提示词"
            placeholder="写明这次统一要抽取的内容或判断规则"
            autosize
            minRows={6}
            maxRows={14}
            value={draft.userPrompt}
            onChange={(event) => updateField('userPrompt', event.currentTarget.value)}
          />
        </div>

        <aside className="prompt-iteration-model-summary">
          <span className="prompt-iteration-model-label">当前模型摘要</span>
          <strong className="prompt-iteration-model-name">
            {presetName || llmSettings?.modelName || '未配置模型'}
          </strong>
          <div className="prompt-iteration-model-badges">
            <Badge variant="light" color="blue" radius="xl">{providerLabel}</Badge>
            <Badge
              variant="light"
              color={llmSettings?.apiKey ? 'teal' : 'yellow'}
              radius="xl"
            >
              {llmSettings?.apiKey ? 'API Key 已配置' : 'API Key 缺失'}
            </Badge>
            <Badge
              variant="light"
              color={supportsPdfUpload ? 'teal' : 'red'}
              radius="xl"
            >
              {supportsPdfUpload ? '支持 PDF 直传' : '不支持 PDF 直传'}
            </Badge>
          </div>
          {!supportsPdfUpload ? (
            <p className="section-caption">
              当前页面要求 PDF 直传能力。请切换到支持 PDF 直传的模型预设后再运行。
            </p>
          ) : null}
          <dl className="prompt-iteration-model-meta">
            <div>
              <dt>接口地址</dt>
              <dd>{llmSettings?.apiUrl || '未配置'}</dd>
            </div>
            <div>
              <dt>并行批次</dt>
              <dd>{llmSettings?.parallelCount ?? '-'}</dd>
            </div>
            <div>
              <dt>最大重试</dt>
              <dd>{llmSettings?.maxRetries ?? '-'}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
