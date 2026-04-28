import { Button, Group, Popover, Select, Stack, Text } from '@mantine/core';
import { IconAdjustmentsHorizontal } from '@tabler/icons-react';
import { buildPresetSelectOptions, formatPresetSummary } from '../../utils/modelPresetPresentation.js';
import { getPresetCapabilityError, resolveRuntimeLlmConfig } from '../../services/modelPresetResolver.js';

export function PagePresetQuickSwitch({
  presets = [],
  preset = null,
  value = '',
  requiredCapabilities = {},
  usesGlobalDefault = false,
  onChange,
  onResetToGlobalDefault,
  onOpenModelPresetManager,
  disabled = false
}) {
  const options = buildPresetSelectOptions(presets, requiredCapabilities);
  const runtimeConfig = preset ? resolveRuntimeLlmConfig(preset) : null;
  const summary = formatPresetSummary(preset, runtimeConfig);
  const capabilityError = getPresetCapabilityError(preset, requiredCapabilities);

  return (
    <Popover width={320} position="bottom-end" withArrow shadow="md" withinPortal={false}>
      <Popover.Target>
        <Button
          variant="subtle"
          size="compact-sm"
          radius="xl"
          className="page-preset-quick-trigger"
          leftSection={<IconAdjustmentsHorizontal size={14} stroke={1.8} />}
          disabled={disabled}
        >
          <span className="page-preset-quick-trigger-label">{summary.title}</span>
        </Button>
      </Popover.Target>

      <Popover.Dropdown className="page-preset-quick-popover">
        <Stack gap="sm">
          <div>
            <Text size="sm" fw={700}>当前模型</Text>
            <Text size="xs" c="dimmed">
              {usesGlobalDefault ? '当前页面跟随全局默认。' : '当前页面已单独设置模型。'}
            </Text>
          </div>

          <div className="page-preset-quick-current">
            <strong>{summary.title}</strong>
            <Text size="xs" c={capabilityError ? 'red.4' : 'dimmed'}>
              {capabilityError || summary.meta}
            </Text>
          </div>

          <Select
            label="切换本页模型"
            data={options}
            value={value || null}
            onChange={(nextValue) => nextValue && onChange?.(nextValue)}
            allowDeselect={false}
            disabled={disabled}
            comboboxProps={{ withinPortal: false }}
          />

          <Group gap="xs" justify="space-between">
            <Button
              size="xs"
              radius="xl"
              variant="default"
              onClick={onResetToGlobalDefault}
              disabled={disabled || usesGlobalDefault}
            >
              跟随全局默认
            </Button>
            {onOpenModelPresetManager ? (
              <Button
                size="xs"
                radius="xl"
                variant="light"
                onClick={onOpenModelPresetManager}
                disabled={disabled}
              >
                管理模型
              </Button>
            ) : null}
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
