import { Drawer, TextInput, PasswordInput, Select, NumberInput, Divider, Text } from '@mantine/core';
import { MODEL_OPTIONS } from '../constants/extraction.js';

const PROVIDER_OPTIONS = [
  { label: 'Gemini (Google)', value: 'gemini' },
  { label: 'Anthropic (Claude)', value: 'anthropic' },
  { label: 'OpenAI 兼容', value: 'openai' }
];

function LLMForm({ title, settings, onChange, isLlm2 = false }) {
  const isAnthropic = settings.providerType === 'anthropic';

  return (
    <div className="llm-drawer-section">
      <Text fw={600} size="sm" mb={8}>{title}</Text>
      <Select
        label="模型提供商"
        data={PROVIDER_OPTIONS}
        value={settings.providerType || 'gemini'}
        onChange={(val) => onChange('providerType', val || 'gemini')}
        mb={8}
        allowDeselect={false}
      />
      {!isAnthropic && (
        <TextInput
          label="API URL"
          placeholder="https://generativelanguage.googleapis.com/v1beta"
          value={settings.apiUrl || ''}
          onChange={(e) => onChange('apiUrl', e.target.value)}
          mb={8}
        />
      )}
      <PasswordInput
        label={isAnthropic ? 'Anthropic API Key' : 'API Key'}
        placeholder="留空则使用环境变量"
        value={settings.apiKey || ''}
        onChange={(e) => onChange('apiKey', e.target.value)}
        mb={8}
      />
      <TextInput
        label="模型名称"
        placeholder={isAnthropic ? 'claude-sonnet-4-6' : 'gemini-2.5-pro'}
        value={settings.modelName || ''}
        onChange={(e) => onChange('modelName', e.target.value)}
        mb={8}
      />
      <NumberInput
        label="并行批次数"
        min={1}
        max={20}
        value={settings.parallelCount || 5}
        onChange={(val) => onChange('parallelCount', Number(val) || 5)}
        mb={8}
      />
      <NumberInput
        label="最大重试次数"
        min={1}
        max={10}
        value={settings.maxRetries || 3}
        onChange={(val) => onChange('maxRetries', Number(val) || 3)}
        mb={8}
      />
      {isLlm2 && (
        <>
          <NumberInput
            label="循环优化最大轮数"
            min={1}
            max={20}
            value={settings.maxOptIterations || 5}
            onChange={(val) => onChange('maxOptIterations', Number(val) || 5)}
            mb={8}
          />
          <NumberInput
            label="相似度停止阈值（%）"
            min={0}
            max={100}
            value={settings.similarityThreshold ?? 70}
            onChange={(val) => onChange('similarityThreshold', Number(val) ?? 70)}
            mb={8}
          />
        </>
      )}
    </div>
  );
}

export function LLMSettingsDrawer({ opened, onClose, llm1Settings, llm2Settings, onChangeLlm1, onChangeLlm2 }) {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="LLM 配置"
      position="right"
      size="sm"
      padding="lg"
    >
      <LLMForm
        title="LLM 1（指标提取）"
        settings={llm1Settings}
        onChange={onChangeLlm1}
      />
      <Divider my={16} />
      <LLMForm
        title="LLM 2（Prompt 优化）"
        settings={llm2Settings}
        onChange={onChangeLlm2}
        isLlm2
      />
    </Drawer>
  );
}
