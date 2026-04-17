export const LAB_BRAND = {
  title: 'LLM Lab',
  subtitle: '大语言模型工程实验室'
};

export const APP_TABS = [
  { key: 'test-workbench', label: '测试集工作台' },
  { key: 'online-validation', label: '线上验证工作台' },
  { key: 'data-prep', label: '数据预处理工作台' },
  { key: 'docs', label: '说明文档' }
];

export const TEST_SET_SUBTABS = [
  {
    key: 'prompt-iteration',
    label: 'Prompt快速迭代',
    legacyLabel: '完整流程模式'
  },
  {
    key: 'model-validation',
    label: '模型结果验收',
    legacyLabel: '快速验收模式'
  },
  {
    key: 'prompt-optimization',
    label: 'Prompt自动优化',
    legacyLabel: '快速优化模式'
  }
];

export const DATA_PREP_SUBTABS = [
  { key: 'chunking', label: 'Chunking测试' },
  { key: 'pdf-compress', label: 'PDF压缩' },
  { key: 'token-estimation', label: 'Token统计' }
];
