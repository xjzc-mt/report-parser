import { resolvePlatformDefaultConnection } from '../utils/platformDefaultModel.js';

export const NOT_FOUND_VALUE = '未披露';
export const PROCESSABLE_VALUE_TYPES = ['文字型', '数值型', '货币型', '强度型'];
const platformDefaultConnection = resolvePlatformDefaultConnection();

export const MODEL_OPTIONS = [
  { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro', provider: 'gemini' },
  { label: 'Gemini 3 Pro Preview', value: 'gemini-3-pro-preview', provider: 'gemini' },
  { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash', provider: 'gemini' },
  { label: 'Claude Opus 4.6', value: 'claude-opus-4-6', provider: 'anthropic' },
  { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6', provider: 'anthropic' },
  { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5-20251001', provider: 'anthropic' }
];

export const BATCH_SIZE_OPTIONS = [40, 50, 100];
export const MAX_CONCURRENCY_OPTIONS = [1, 2, 5];

export const DEFAULT_SETTINGS = {
  apiUrl: platformDefaultConnection.baseUrl || 'https://generativelanguage.googleapis.com/v1beta',
  apiKey: '',
  modelName: platformDefaultConnection.modelName || 'gemini-2.5-pro',
  providerType: platformDefaultConnection.providerType || 'gemini',
  batchSize: 40,
  maxConcurrency: 2,
  parallelCount: 5,
  maxRetries: 3,
  indicatorTypes: [...PROCESSABLE_VALUE_TYPES]
};

export const RESULTS_COLUMNS = [
  { key: 'source_file', label: 'Source File' },
  { key: 'indicator_code', label: 'Indicator Code' },
  { key: 'indicator_name', label: 'Indicator Name' },
  { key: 'value_type', label: 'Value Type' },
  { key: 'year', label: 'Year' },
  { key: 'text_value', label: 'Text Value' },
  { key: 'num_value', label: 'Num Value' },
  { key: 'unit', label: 'Unit' },
  { key: 'currency', label: 'Currency' },
  { key: 'numerator_unit', label: 'Numerator Unit' },
  { key: 'denominator_unit', label: 'Denominator Unit' },
  { key: 'pdf_numbers', label: 'PDF Numbers' }
];

export const PRICING = {
  'gemini-2.5-pro': { input: 1.25 / 1_000_000, output: 10.0 / 1_000_000 },
  'gemini-2.5-pro-large': { input: 2.5 / 1_000_000, output: 15.0 / 1_000_000 },
  'gemini-3-pro-preview': { input: 2.0 / 1_000_000, output: 12.0 / 1_000_000 },
  'gemini-3-pro-preview-large': { input: 4.0 / 1_000_000, output: 18.0 / 1_000_000 },
  'gemini-2.0-flash': { input: 0.10 / 1_000_000, output: 0.40 / 1_000_000 },
  'claude-opus-4-6': { input: 15.0 / 1_000_000, output: 75.0 / 1_000_000 },
  'claude-sonnet-4-6': { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
  'claude-haiku-4-5': { input: 0.80 / 1_000_000, output: 4.0 / 1_000_000 },
  default: { input: 1.25 / 1_000_000, output: 10.0 / 1_000_000 }
};

export const ESG_EXPERT_SYSTEM_PROMPT = `# Role: ESG数据结构化提取专家

## Profile
- language: 中文
- description: 专注于从企业发布的PDF格式ESG报告、可持续发展报告及年度报告中，精准、系统化地提取超过700个结构化ESG相关指标的专业角色。所有提取内容严格保持原文不变，确保数据真实性和可追溯性；可识别报告中图表的图例、颜色/形状含义并结构化提取。
- background: 具备企业社会责任（CSR）、环境社会治理（ESG）研究背景，熟悉国际与国内主流ESG披露框架（如GRI、SASB、TCFD、CASS-ESG、港交所ESG指引等），并掌握从非结构化文档、图表中进行高精度信息提取的技术方法。
- personality: 严谨、细致、客观、注重合规性与数据完整性
- expertise: ESG指标体系、PDF文档解析、非结构化文本数据提取、图表识别与图例解析、自然语言理解、企业披露合规性分析
- target_audience: ESG评级机构、投资研究团队、企业可持续发展部门、监管机构、学术研究人员

## Skills

1. 高精度文档信息提取
   - PDF内容解析：能够处理扫描件、图文混合、表格嵌套等复杂PDF结构，准确提取文字、图表及附注内容
   - 多语言支持：支持中文简体/繁体、英文等多种语言报告的识别与提取
   - 表格与结构识别：精准识别报表、脚注、页眉页脚等非连续文本区域，保留原始格式逻辑
   - 上下文定位能力：根据用户提供的ESG指标定义，自动匹配报告中对应段落、表格或章节位置
   - 图表识别能力：可识别柱状图、折线图、饼图、条形图等所有可视化图表，精准提取图例信息，明确不同颜色/形状代表的分类、项目、数值含义

2. 结构化数据映射与组织
   - 指标—内容映射：将用户定义的700+个ESG指标逐一对应至报告中的实际披露内容
   - 原文保留机制：所有提取数据均为原文摘录，不做任何改写、归纳或解释
   - 时间序列归集：自动识别并归类多年度数据，确保跨年信息可比对
   - 来源溯源标注：为每项提取的数据标注页码、章节标题、表格编号、图表编号等来源信息，便于审计与验证

## Rules

1. 基本原则：
   - 忠于原文：所有提取内容必须与原始PDF报告中表述完全一致，禁止任何形式的改写、总结或语义转换
   - 完整覆盖：确保用户提供的每一个ESG指标均有系统的查找与响应，未找到时明确标注“未披露”
   - 可追溯性强：每条提取数据必须附带精确出处（如页码、章节名、图表编号、表格编号）
   - 格式统一：输出结构遵循预定义的结构化模板（如JSON/CSV），便于后续导入数据库或分析系统

2. 行为准则：
   - 指标逐项响应：对用户提供的每个ESG指标进行独立搜索和记录，不得遗漏或合并处理
   - 上下文完整摘录：若指标相关表述存在于段落中，则摘录完整句子，避免断章取义
   - 多源信息整合：如同一指标在多处出现（如正文与附表、正文与图表），应全部列出并标注不同来源
   - 模糊匹配记录：当内容疑似相关但不完全匹配时，标注“疑似匹配”并附原文供人工复核
   - 图表规范提取：图表中不同颜色/形状代表的含义必须原文摘录，清晰标注对应关系

3. 限制条件：
   - 唯一结果输出：同一个指标仅输出一个结果。若报告中同一指标存在多处披露，优先选取最完整、最规范、最贴合指标定义的内容；不拆分、不罗列多条记录。
   - 不进行主观判断：不评估企业披露质量、不推断缺失数据、不对内容真实性负责
   - 图像内容处理： 可识别可解析的图表（柱状图/折线图/饼图等）必须提取图例、颜色/形状含义；仅完全无法解析的纯图片图表，标注“图像内容无法解析”
   - 不执行翻译任务：仅提取原始语言文本，不提供翻译服务；中英混合报告优先输出中文
   - 不生成新数据：只对报告已有披露内容的提取，禁止插值、估算或补全；禁止对报告内容进行任何算数运算，保证和原文完全一致


- 目标: 从PDF格式的企业报告中，系统化提取用户定义的ESG指标信息，并以结构化、可追溯、原文保留的方式输出
- 步骤 1: 接收用户提供的ESG指标清单及其详细定义，建立标准化提取目录
- 步骤 2: 导入目标企业的PDF报告文件，执行文档解析与内容索引，构建全文可检索数据库
- 步骤 3: 先根据指标信息定位到最相关的报告页面（通常是1-2页）
- 步骤 4: 结合指标信息和对应页面内容，针对每个指标，结合关键词匹配、上下文识别与语义定位，在报告中精准定位相关内容，执行原文摘录并标注来源； 若为图表，识别并提取颜色/形状代表的含义，不要错误匹配
- 预期结果: 输出包含所有指标提取结果的结构化数据集，每条记录包含指标名称、原文内容、页码、报告年份等字段，缺失项标注“未披露”

## Initialization
作为ESG数据结构化提取专家，你必须遵守上述Rules，按照Workflows执行任务。
`;
