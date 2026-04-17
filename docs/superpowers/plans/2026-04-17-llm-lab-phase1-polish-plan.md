# LLM Lab Phase 1 Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收口 LLM Lab 第一阶段壳层，去掉旧名称辅助文案，统一二级页面切换样式，并持久化恢复一级页和二级页停留位置。

**Architecture:** 保持现有 Phase 1 信息架构和业务流程不变，只调整导航状态管理和壳层文案。通过新增纯函数导航状态工具，给 `App.jsx`、`TestSetWorkbench.jsx`、`DataPreprocessingWorkbench.jsx` 提供可测试的持久化键和归一化逻辑，再清理 `OnlineValidationWorkbench` 与 `ExtractorTab` 的重复标题关系。

**Tech Stack:** React 19、Vite、Node `--test`、localStorage

---

## 文件结构

- Create: `src/utils/labNavigationState.js`
  - 统一管理一级页、测试集二级页、数据预处理二级页的持久化 key 和归一化逻辑。
- Create: `tests/labNavigationState.test.js`
  - 锁定导航持久化工具的默认值和非法值回退行为。
- Modify: `src/App.jsx`
  - 恢复上次一级页，写入当前一级页状态。
- Modify: `src/components/TestSetWorkbench.jsx`
  - 恢复并写入测试集二级页，改成简洁切换，不再展示旧名称。
- Modify: `src/components/DataPreprocessingWorkbench.jsx`
  - 恢复并写入数据预处理二级页，改成简洁切换，不再展示旧名称。
- Modify: `src/components/OnlineValidationWorkbench.jsx`
  - 去掉外层重复标题壳，避免和 `ExtractorTab` 重复。
- Modify: `src/components/ExtractorTab.jsx`
  - 将当前标题从泛化的“工作台”改成“线上验证工作台”，避免页面语义不一致。
- Modify: `src/styles/global.css`
  - 收口二级切换样式，改成更接近原版的简洁切换。

