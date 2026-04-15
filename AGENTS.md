# Repository Guidelines

## 项目结构与模块组织
本仓库是一个纯浏览器端的 Vite + React 应用，无后端服务。核心代码位于 `src/`：`components/` 存放界面组件，`services/` 负责 PDF 解析、LLM 调用、导出与持久化，`utils/` 与 `constants/` 放通用逻辑和常量，`content/` 保存静态说明内容，`styles/global.css` 管理全局样式。静态资源放在 `public/`，示例需求表位于 `requirement/`，设计与计划文档放在 `docs/superpowers/`。

## 构建、测试与开发命令
先执行 `npm install` 安装依赖。开发时使用 `npm run dev` 启动本地服务；`npm run build` 生成生产构建；`npm run preview` 预览构建结果。当前仓库未提供 `test`、`lint` 或 `format` 脚本，提交前至少应手动跑一次 `npm run build` 确认代码可构建。

## 编码风格与命名约定
沿用现有 React 组件文件命名，组件使用 PascalCase，例如 `TestWorkbenchTab.jsx`；工具与服务模块使用 camelCase，例如 `extractionService.js`。优先保持单一职责：页面编排放在 `App.jsx` 或标签页组件，业务流程进入 `services/`，纯计算逻辑放 `utils/`。现有代码以 `.js/.jsx` 为主，保持一致；新增注释、文档和用户可见文本统一使用中文。

## 测试与验证要求
仓库暂无自动化测试框架，因此变更验证以手工回归为主。涉及提取流程时，至少验证 PDF 上传、需求表解析、结果导出；涉及压缩功能时，验证上传、压缩和下载链路。若新增复杂逻辑，建议补充可复用的验证数据到 `requirement/`，并在 PR 描述中写明验证步骤。

## 提交与 Pull Request 规范
历史提交同时存在中文摘要和 `feat:` 风格，建议统一为“类型 + 简短中文描述”，例如 `feat: 增加统一分析视图`、`fix: 修复提取结果导出异常`。PR 应包含变更目的、影响范围、验证命令或手工验证步骤；若改动 UI，请附截图；若调整提示词、提取规则或核心分析逻辑，先给出方案与影响说明，再提交实现。

## 配置与安全提示
本地运行依赖 `.env` 中的 `VITE_GEMINI_API_KEY`；不要提交真实密钥。修改环境变量后需重启 `npm run dev`。处理真实报告文件时，避免将敏感 PDF 或导出结果提交到仓库。
