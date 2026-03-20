export const methodologyContent = {
  architecture: {
    intro: '纯客户端架构 — 所有文件解析均在浏览器本地完成，数据仅通过加密链路直达 AI 官方接口。',
    rows: [
      ['构建工具', 'Vite + React', '组件化界面、模块化逻辑与环境变量支持'],
      ['PDF 解析', 'pdf.js', 'OpenAI 模式下执行本地文本解析'],
      ['Excel 读写', 'SheetJS', '保留 leading zero 并支持导出摘要'],
      ['AI 接口', 'Gemini / OpenAI', '自动识别接口类型并统一提取流程']
    ]
  },
  inputSpec: {
    pdf: [
      '支持一次上传多篇 PDF，系统会按顺序逐篇运行并在结果中标记来源文件名',
      'Gemini 模式：PDF 转 Base64 后直接发送（原生文档理解）',
      'OpenAI 模式：pdf.js 本地逐页提取文本，附带 [Page X] 标记'
    ],
    excelRows: [
      ['indicator_code', '字符串', '指标代码（支持 leading zero）'],
      ['indicator_name', '字符串', '指标名称'],
      ['value_type', '字符串', '文字型 / 数值型 / 强度型 / 货币型'],
      ['definition', '字符串', '指标定义'],
      ['guidance', '可选', '补充指引'],
      ['prompt', '可选', '每个指标的额外提取说明']
    ]
  },
  outputSpec: {
    rows: [
      ['source_file', '全部', '来源 PDF 文件名'],
      ['indicator_code', '全部', '指标代码'],
      ['indicator_name', '全部', '指标名称'],
      ['value_type', '全部', '文字型 / 数值型 / 强度型 / 货币型'],
      ['year', '全部', '年份（多年份数据自动拆分为多行）'],
      ['text_value', '文字型', '提取的文本结果'],
      ['num_value', '数值 / 强度 / 货币', '提取的数值'],
      ['unit', '数值 / 强度 / 货币', '数值的单位或组合单位'],
      ['currency', '货币型', '币种代码或符号'],
      ['numerator_unit', '强度型', '分子单位'],
      ['denominator_unit', '强度型', '分母单位'],
      ['pdf_numbers', '全部', 'PDF 物理页码（非内容页码，可为多个页码）']
    ],
    note: '导出规则：未找到结果的指标不包含在输出文件中。'
  },
  batching: {
    rows: [
      ['文字组', '文字型', '可配置（40 / 50 / 100）', '文本返回较长'],
      ['数值组', '数值型', '可配置（40 / 50 / 100）', '数值返回简短'],
      ['强度组', '强度型', '可配置（40 / 50 / 100）', '需要拆分分子/分母单位'],
      ['货币组', '货币型', '可配置（40 / 50 / 100）', '需要额外提取币种']
    ],
    bullets: [
      '每个批次仅含同一类型的指标',
      '可按文字型 / 数值型 / 强度型 / 货币型多选需要处理的指标类型',
      '并发数可配置为 1 / 2 / 5',
      '多年份数据自动拆分为独立行',
      '失败批次最多重试 3 次（指数退避：1s → 2s → 4s）'
    ]
  },
  apiIntegration: {
    rows: [
      ['Gemini', 'URL 含 googleapis.com', 'x-goog-api-key Header', '原生 Base64'],
      ['OpenAI', '其他 URL', 'Authorization: Bearer', '本地文本解析']
    ]
  },
  security: [
    'API Key 可在 header 的 Settings 中维护，也可从 .env 读取',
    'Key 不出现在 URL 参数中，仅通过 HTTP Header 传输',
    'API 配置收纳在 header settings 面板中，主工作区保持简洁'
  ]
};
