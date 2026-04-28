# report-parser

一个纯浏览器端的 Vite + React 工具集，用于处理 ESG 报告相关的 4 类任务：

1. 从 PDF 报告中提取 ESG 指标
2. 使用测试集对 LLM 提取结果做验收分析
3. 基于验收结果做 Prompt 优化
4. 在浏览器内压缩 PDF

当前项目不是单页 Demo，而是一个包含多标签页、多模式工作台、统一分析页和 IndexedDB 持久化的前端应用。

## 项目概览

当前应用有 4 个主标签页：

| 标签页 | 说明 |
| --- | --- |
| 提取工作台 | 上传 PDF 和需求表，执行单轮提取并导出结果 |
| 方法论 | 查看输入输出规范、系统架构、批处理策略 |
| PDF 压缩 | 上传单个 PDF，在浏览器内压缩并下载 |
| 测试集工作台 | 围绕测试集做提取、验收分析、Prompt 优化 |

### 测试集工作台的 3 种模式

| 模式 | 说明 |
| --- | --- |
| 完整流程模式 | PDF + 测试集 + 可选定义文件 → 提取 → 分析 → 优化 |
| 快速验收模式 | 外部 LLM 结果 + 测试集 → 关联分析 → 跳转优化 |
| 快速优化模式 | 关联对比文件 + PDF → 执行 Prompt 优化 |

---

## 当前核心能力

### 1. PDF ESG 指标提取

- 支持上传多份 PDF
- 支持上传 Excel / CSV 需求表
- 按指标类型拆批调用 LLM
- 支持 Gemini / Anthropic / OpenAI 兼容接口
- 展示进度、日志、token 消耗和成本估算
- 导出提取结果 Excel

### 2. 测试集验收分析

- 将 LLM 结果与测试集做关联对比
- 在统一分析页中按多种视角下钻定位问题
- 支持阈值切换、年份筛选、幻觉开关
- 支持导出当前分析面板数据

### 3. Prompt 优化闭环

- 按 `indicator_code` 跨报告做 Prompt 优化
- 支持选择待优化指标范围
- 支持循环多轮优化
- 支持导出最终结果和优化轨迹

### 4. 本地持久化与断点恢复

- 文件写入 IndexedDB
- 缓存 PDF 切页
- 恢复阶段结果 `comparisonRows / finalRows`
- 恢复快速验收模式文件与分析结果
- 支持未完成运行的断点提示

### 5. 浏览器内 PDF 压缩

- 前端本地压缩 PDF 中图片资源
- 展示压缩进度和结果摘要
- 直接下载压缩后的文件

---

## 技术栈

- React 19
- Vite 5
- Mantine 8
- Tabler Icons
- `xlsx`
- `pdf-lib`
- `idb`
- `pako`

---

## 快速开始

## 1. 克隆项目

```bash
git clone git@github.com:fangyishu/report-parser.git
cd report-parser
```

如果你使用 HTTPS：

```bash
git clone https://github.com/fangyishu/report-parser.git
cd report-parser
```

## 2. 安装依赖

```bash
npm install
```

## 3. 配置环境变量

在项目根目录创建 `.env`：

```bash
cp .env.example .env
```

推荐直接在 `.env` 里维护整个平台默认模型：

```env
VITE_PLATFORM_DEFAULT_PRESET_NAME=平台默认模型
VITE_PLATFORM_DEFAULT_VENDOR=gemini
VITE_PLATFORM_DEFAULT_TRANSPORT=gemini_native
VITE_PLATFORM_DEFAULT_BASE_URL=https://generativelanguage.googleapis.com/v1beta
VITE_PLATFORM_DEFAULT_MODEL=gemini-2.5-pro
VITE_PLATFORM_DEFAULT_API_KEY=your_api_key_here
```

说明：

- `.env` 不会提交到 Git
- 修改环境变量后需要重启 `npm run dev`
- 页面没有单独选择模型时，会跟随这里的全局默认模型
- 旧版 `VITE_GEMINI_API_KEY` 仍兼容，但更推荐使用新的平台默认配置

## 4. 启动开发环境

```bash
npm run dev
```

默认会启动在：

```bash
http://localhost:5173
```

## 5. 生产构建

```bash
npm run build
```

## 6. 预览构建结果

```bash
npm run preview
```

## 7. 运行测试

```bash
npm test
```

当前测试主要覆盖分析数据层和统一分析页相关工具函数。

---

## 使用说明

## 提取工作台

1. 打开“提取工作台”
2. 上传一份或多份 PDF
3. 上传需求表 Excel / CSV
4. 选择模型、批大小、并发数和指标类型
5. 点击开始提取
6. 查看结果并导出 Excel

### 需求表示例字段

常见列包括：

- `indicator_code`
- `indicator_name`
- `value_type`
- `definition`
- `guidance`
- `prompt`

支持的 `value_type`：

- `文字型`
- `数值型`
- `货币型`
- `强度型`

## 测试集工作台

### 完整流程模式

适合自己上传 PDF、测试集并完成整条链路：

- 提取
- 关联分析
- 统一分析页查看
- 指标级 Prompt 优化

### 快速验收模式

适合已有外部 LLM 结果时直接做验收：

- 上传 LLM 结果文件
- 上传测试集
- 做关联分析
- 在统一分析页查看问题分布

### 快速优化模式

适合已有“关联对比文件”时直接做优化：

- 上传关联文件
- 上传对应 PDF
- 选择或复用待优化指标范围
- 执行优化并导出结果

## PDF 压缩

1. 打开“PDF 压缩”
2. 上传一个 PDF
3. 点击开始压缩
4. 等待完成
5. 下载压缩结果

---

## 从零了解项目建议先看哪里

如果你是第一次接触这个项目，推荐按下面顺序看：

1. [README.md](/Users/michael_drj/AiProjects/report-parser/README.md)
   - 看项目全貌、模块入口和运行方式
2. [docs/superpowers/specs/2026-03-26-testbench-redesign-design.md](/Users/michael_drj/AiProjects/report-parser/docs/superpowers/specs/2026-03-26-testbench-redesign-design.md)
   - 看当前版本全景说明
3. [docs/superpowers/specs/2026-03-27-unified-analysis-view-design.md](/Users/michael_drj/AiProjects/report-parser/docs/superpowers/specs/2026-03-27-unified-analysis-view-design.md)
   - 看统一分析页设计与指标口径
4. [src/App.jsx](/Users/michael_drj/AiProjects/report-parser/src/App.jsx)
   - 看应用顶层入口和 4 个标签页
5. [src/components/TestWorkbenchTab.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/TestWorkbenchTab.jsx)
   - 看当前最核心的业务编排

如果你准备改分析页，再继续看：

- [src/components/UnifiedAnalysisMerged.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/UnifiedAnalysisMerged.jsx)
- [src/components/AnalysisDetailsTable.jsx](/Users/michael_drj/AiProjects/report-parser/src/components/AnalysisDetailsTable.jsx)
- [src/utils/analysisV2Metrics.js](/Users/michael_drj/AiProjects/report-parser/src/utils/analysisV2Metrics.js)
- [src/utils/unifiedAnalysisMergeAdapter.js](/Users/michael_drj/AiProjects/report-parser/src/utils/unifiedAnalysisMergeAdapter.js)
- [src/utils/analysisDetailsModel.js](/Users/michael_drj/AiProjects/report-parser/src/utils/analysisDetailsModel.js)

---

## 项目结构

```text
src/
  components/    界面组件
  constants/     常量与提示词
  content/       静态说明内容
  services/      PDF 解析、LLM 调用、导出、持久化
  styles/        全局样式
  utils/         纯计算逻辑与数据转换

docs/
  superpowers/   当前设计与实现文档
  interview/     面试讲项目相关文档

requirement/
  示例需求表与验证数据
```

---

## 关键文档

### 当前实现说明

- [docs/superpowers/specs/2026-03-26-testbench-redesign-design.md](/Users/michael_drj/AiProjects/report-parser/docs/superpowers/specs/2026-03-26-testbench-redesign-design.md)
- [docs/superpowers/specs/2026-03-27-unified-analysis-view-design.md](/Users/michael_drj/AiProjects/report-parser/docs/superpowers/specs/2026-03-27-unified-analysis-view-design.md)

### 当前实现清单与分析数据层说明

- [docs/superpowers/plans/2026-03-26-testbench-redesign-plan.md](/Users/michael_drj/AiProjects/report-parser/docs/superpowers/plans/2026-03-26-testbench-redesign-plan.md)
- [docs/superpowers/plans/2026-04-10-analysis-v2-plan.md](/Users/michael_drj/AiProjects/report-parser/docs/superpowers/plans/2026-04-10-analysis-v2-plan.md)
- [docs/superpowers/plans/2026-04-10-analysis-merge-plan.md](/Users/michael_drj/AiProjects/report-parser/docs/superpowers/plans/2026-04-10-analysis-merge-plan.md)

### 面试准备文档

- [docs/interview/project-intro.md](/Users/michael_drj/AiProjects/report-parser/docs/interview/project-intro.md)

---

## 常见问题

### `npm install` 失败

可以尝试：

```bash
rm -rf node_modules package-lock.json
npm install
```

### 启动了但无法提取

优先检查：

- `.env` 是否存在
- `VITE_PLATFORM_DEFAULT_API_KEY` 是否正确
- `VITE_PLATFORM_DEFAULT_MODEL` / `VITE_PLATFORM_DEFAULT_BASE_URL` 是否和厂商匹配
- 修改 `.env` 后是否重启了 `npm run dev`

### PDF 上传被拒绝

请确认文件确实是合法 `.pdf`。

### 切换模式后数据为什么还在 / 不在

当前行为分两种：

- 文件、阶段结果、验收结果会做 IndexedDB 持久化
- 分析页的选中节点、筛选状态、滚动位置不做刷新恢复

这是当前版本有意为之，优先保证分析交互性能。

---

## License

ISC
