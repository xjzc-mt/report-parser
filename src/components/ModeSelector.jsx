import { Radio, Group } from '@mantine/core';

export function ModeSelector({ currentMode, onModeChange, disabled = false }) {
  const handleChange = (value) => {
    console.log('ModeSelector onChange:', value);
    onModeChange(value);
  };

  return (
    <div style={{ marginBottom: '20px' }}>
      <Radio.Group
        value={currentMode}
        onChange={handleChange}
        label="工作模式"
      >
        <Group mt="xs">
          <Radio value="full" label="完整流程模式" disabled={disabled} />
          <Radio value="validation" label="快速验收模式" disabled={disabled} />
          <Radio value="optimization" label="快速优化 Prompt" disabled={disabled} />
        </Group>
      </Radio.Group>
    </div>
  );
}
