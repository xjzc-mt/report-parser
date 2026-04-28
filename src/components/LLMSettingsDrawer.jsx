import { Drawer, Stack, Text } from '@mantine/core';
import { ModelPresetManager } from './modelPresets/ModelPresetManager.jsx';
import { PagePresetSelect } from './modelPresets/PagePresetSelect.jsx';

export function LLMSettingsDrawer({
  opened,
  onClose,
  presets,
  globalDefaultPresetId,
  onChangeGlobalDefaultPresetId,
  onChangePresets
}) {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="模型预设管理"
      position="right"
      size="xl"
      padding="lg"
    >
      <Stack gap="md">
        <div className="preset-global-default-panel">
          <Text size="sm" fw={700}>全局默认模型</Text>
          <Text size="xs" c="dimmed" mb="sm">
            页面没有单独设置模型时，默认跟随这里。
          </Text>
          <PagePresetSelect
            label="全局默认"
            presets={presets}
            value={globalDefaultPresetId}
            onChange={onChangeGlobalDefaultPresetId}
            requiredCapabilities={{}}
          />
        </div>

        <ModelPresetManager presets={presets} onChangePresets={onChangePresets} />
      </Stack>
    </Drawer>
  );
}
