import { Select, Text } from '@mantine/core';
import { buildPresetSelectOptions, formatPresetSummary } from '../../utils/modelPresetPresentation.js';
import { getPresetCapabilityError, resolveRuntimeLlmConfig } from '../../services/modelPresetResolver.js';

export function PagePresetSelect({
  label = '当前模型预设',
  presets = [],
  value = '',
  onChange,
  requiredCapabilities = {},
  disabled = false
}) {
  const options = buildPresetSelectOptions(presets, requiredCapabilities);
  const selectedOption = options.find((item) => item.value === value) || null;
  const selectedPreset = selectedOption?.preset || presets.find((item) => item.id === value) || null;
  const runtimeConfig = selectedPreset ? resolveRuntimeLlmConfig(selectedPreset) : null;
  const summary = formatPresetSummary(selectedPreset, runtimeConfig);
  const capabilityError = getPresetCapabilityError(selectedPreset, requiredCapabilities);

  return (
    <div className="page-preset-select">
      <Select
        label={label}
        data={options}
        value={value || null}
        onChange={(nextValue) => nextValue && onChange?.(nextValue)}
        allowDeselect={false}
        disabled={disabled}
        comboboxProps={{ withinPortal: false }}
      />
      <div className="page-preset-select-summary">
        <strong>{summary.title}</strong>
        <Text size="xs" c={capabilityError ? 'red.4' : 'dimmed'}>
          {capabilityError || summary.meta}
        </Text>
      </div>
    </div>
  );
}
