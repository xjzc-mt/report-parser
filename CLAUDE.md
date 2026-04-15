# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

本文件为 Claude Code 在此代码库中工作时提供指引。

## 常用命令

```bash
npm run dev       # 启动 Vite 开发服务器，地址 http://localhost:5173
npm run build     # 生产环境构建
npm run preview   # 预览生产构建结果
```

暂无测试或代码检查命令。

环境配置：将 `.env.example` 复制为 `.env`，填入 `VITE_GEMINI_API_KEY`。修改 `.env` 后需重启 `npm run dev`。

## 架构概览

**IntelliExtract** 是一个纯浏览器端 React 应用（无后端），用于从 PDF 报告中 AI 驱动地提取 ESG 指标数据。所有文件处理均在客户端完成。

### 四个功能标签页

1. **提取器（Extractor）** — 上传 PDF + Excel 需求文件 → AI 提取 700+ ESG 指标 → 导出到 Excel
2. **压缩器（Compressor）** — 基于 `pdf-lib` 的浏览器内 PDF 压缩
3. **测试工作台（TestWorkbench）** — 双 LLM 对比测试：LLM 1 提取 + LLM 2 优化 Prompt，输出对比报告
4. **方法论（Methodology）** — 静态说明文档

### 提取数据流

```
PDF 文件 + 需求 Excel
  → fileParsers.js       （parsePDF 通过 pdf.js CDN，parseExcel 通过 xlsx，fileToBase64）
  → extraction.js 工具函数  （normalizeRequirementRow，按指标类型 splitRequirementsIntoBatches）
  → extractionService.js （worker 池，并发批处理，runExtractionJob）
  → llmClient.js         （callLLMWithRetry，buildExtractionSystemPrompt，成本估算）
  → exportService.js     （exportResultsToExcel，含汇总统计）
```

**Gemini vs 其他 LLM：** Gemini 接收原始 PDF 二进制（原生提取）；其他 LLM 端点接收提取后的文本。

### 关键文件

| 路径 | 职责 |
|------|------|
| `src/App.jsx` | 全局状态管理、标签页路由、提取流程编排 |
| `src/services/extractionService.js` | Worker 池、批次并发、`runExtractionJob()` |
| `src/services/llmClient.js` | API 调用、重试逻辑、系统提示词构建、成本追踪 |
| `src/services/fileParsers.js` | PDF 文本提取、Excel 解析、base64 转换 |
| `src/services/exportService.js` | Excel 导出及汇总统计 |
| `src/services/testBenchService.js` | 测试工作台主流程：LLM 1 提取 + LLM 2 Prompt 优化、结果对比导出 |
| `src/services/pdfPageExtractor.js` | 按页码范围提取 PDF 子集（`parsePdfNumbers`、`extractPdfPages`、`uint8ArrayToBase64`） |
| `src/services/pdfCompressorService.js` | 基于 `pdf-lib` 的浏览器内 PDF 压缩逻辑（压缩器标签页使用） |
| `src/utils/extraction.js` | 数据规范化、批次拆分、结果映射 |
| `src/constants/extraction.js` | `DEFAULT_SETTINGS`、`MODEL_OPTIONS`、`PRICING`、`ESG_EXPERT_SYSTEM_PROMPT` |
| `src/constants/testBench.js` | `DEFAULT_LLM1/LLM2_SETTINGS`、`VALUE_TYPE_EN_TO_ZH`、`PROMPT_OPTIMIZER_SYSTEM_PROMPT` |

### 测试工作台数据流

```
PDF 文件列表 + 测试集 Excel（含标准答案和 pdf_numbers 页码）
  → testBenchService.js
      阶段一（runExtractionPhase）：
        1. 按 report_name + pdf_numbers 分组
        2. pdfPageExtractor.js（extractPdfPages 提取指定页为子 PDF）
        3. LLM 1（callLLMWithRetry 提取 ESG 指标，固定5秒重试，最多3次）
        4. joinTestSetWithLlm1（右关联 + calculateSimilarity 关键词相似度）
        → 返回 comparisonRows（含 similarity 字段），自动下载关联对比文件
      [用户手动确认后]
      阶段二（runOptimizationPhase）：
        5. 按 indicator_code 跨报告分组
        6. 为每份报告提取页面文本上下文
        7. LLM 2（PROMPT_OPTIMIZER_SYSTEM_PROMPT，跨报告优化，输出 improved_prompt）
  → exportComparisonRows / exportFinalResults（导出两份 Excel）
```

**支持恢复运行**：任意阶段失败后抛出携带 `resumeState` 的 Error，UI 层存储并在用户点击"继续运行"时传回服务函数。

**独立优化入口**：用户可上传已有的关联对比文件（`parseComparisonFile`），直接跳过阶段一运行 LLM 2 优化。

**测试集 Excel 必须包含列 (Mandatory Columns)：**
*   `report_name`: PDF 文件名（不含扩展名），用于定位 PDF。
*   `pdf_numbers`: 指标所在页码（如 `12` 或 `12,13`），用于截取文本。
*   `indicator_code`: 指标唯一编码。
*   `indicator_name`: 指标名称。
*   `data_year`: 数据年份。
*   `text_value`: **标准答案**（文字型，用于相似度对比）。
*   `value_type_1` (或 `value_type`): 指标类型 (文字型/数值型/强度型/货币型)。
*   `prompt`: **提取提示词** (若上传了定义文件，则定义文件中的 prompt 优先；两者皆无则报错)。

**指标定义文件支持列 (Supported Columns)：**
*   `indicator_code`: **必填**，必须与测试集一致。
*   `prompt`: **最核心字段**。若仅有此列与 `indicator_code`，系统将直接使用其作为最高优先级的提取指令。
*   `definition` / `guidance`: 可选字段。仅在 `prompt` 缺失时，系统会组合这两列作为备选提取指令。

### 指标值类型

四种 ESG 指标类型驱动批次拆分和独立系统提示词：**文本型（text）**、**数值型（numeric）**、**货币型（currency）**、**强度型（intensity）**。

### 技术栈

- React 19 + Vite 5 + Mantine 8（UI 框架）
- `xlsx` — Excel 读写
- `pdf-lib` + `pako` — PDF 压缩
- `pdf.js` 3.11.174 — PDF 文本提取（通过 `index.html` 中的 CDN 加载）
- 默认模型：Gemini 2.5 Pro / Gemini 3 Pro Preview；支持任何 OpenAI 兼容端点
