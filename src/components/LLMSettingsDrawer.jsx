import { Drawer } from '@mantine/core';
import { ModelPresetManager } from './modelPresets/ModelPresetManager.jsx';

export function LLMSettingsDrawer({ opened, onClose, presets, onChangePresets }) {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="模型预设管理"
      position="right"
      size="xl"
      padding="lg"
    >
      <ModelPresetManager presets={presets} onChangePresets={onChangePresets} />
    </Drawer>
  );
}
