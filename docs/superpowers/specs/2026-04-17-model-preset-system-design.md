# 统一模型预设系统设计

## 1. 背景

当前项目中的模型配置仍然是“页面直接持有底层接口参数”的方式：

- 设置页直接编辑 `apiUrl / apiKey / modelName / providerType`
- `llm1Settings`、`llm2Settings` 等配置散落在不同页面和流程里
- 页面既承担业务逻辑，又承担接口配置逻辑
- 不同页面之间无法共享“命名好的模型方案”
- 某些页面需要特定能力，例如 PDF 直传，但现在没有统一的能力约束

随着项目从单点工具演进为 `LLM Lab`，这种“每页直配接口”的方式会越来越难维护。模型和 API 的管理需要从页面里抽离出来，收束成统一的预设系统。

## 2. 目标

本次改造目标如下：

1. 将所有模型与接口配置统一收束到一个全局的“模型预设管理”体系中。
2. 页面不再直接编辑底层 API 参数，只选择“使用哪个模型预设”。
3. 支持用户维护多套模型预设，并给它们自定义名字。
4. 支持 Gemini、Claude、OpenAI、OneAPI、GLM 等来源。
5. 支持首次启动时从 `.env` 自动生成默认预设。
6. 默认预设不在 UI 中暴露真实 key，也不支持在页面里修改 env key。
7. 每个页面独立记住自己上次选择的预设，并在下次进入时恢复。
8. 页面运行前根据预设能力做校验，避免“能选但实际上跑不通”的静默错误。

## 3. 非目标

本次不做以下内容：

1. 不做多人共享预设或云端同步。
2. 不做权限、团队空间、项目级隔离。
3. 不做远程模型市场或在线模型列表拉取。
4. 不做自动 benchmark、自动推荐模型。
5. 不做复杂的预设分组、标签体系或审批流。
6. 不重写所有现有 LLM service 的调用协议，只做运行时适配。

## 4. 核心设计原则

### 4.1 统一配置，页面选用

模型配置只在一个地方维护；具体页面只选用预设，不直接编辑底层参数。

### 4.2 页面不理解接口细节

页面不应该再直接消费 `apiUrl / apiKey / modelName / providerType` 这些原始字段，而应该消费一个稳定的 `presetId`。

### 4.3 能力显式化

模型是否支持 PDF 直传、JSON 模式、Vision 等能力，必须显式记录和校验，不能依靠页面各自猜测。

### 4.4 默认预设只读

来自 `.env` 的默认预设只作为系统默认连接源，不应在 UI 中暴露真实 key，也不应允许直接修改 env key。

### 4.5 迁移优先于重写

现有调用链暂时保留，以“预设解析为运行时配置”的方式接入，避免一次性重写所有 service。

## 5. 用户心智

改造完成后，用户的使用路径会变成：

1. 在 `模型预设管理` 里配置或维护模型预设。
2. 给预设起好业务友好的名字，例如：
   - `Prompt实验-Gemini`
   - `验收分析-Claude`
   - `低成本-OneAPI`
   - `中文实验-GLM`
3. 在具体页面里只选择“当前使用哪个预设”。
4. 页面根据预设能力决定是否允许运行。

页面不再出现“手动填 API URL / API Key / 模型名”的碎片化交互。

## 6. 数据模型

本次建议落 3 类核心数据。

### 6.1 ModelPreset

统一描述一套可被页面选用的模型预设。

字段建议：

- `id`
- `name`
- `transportType`
  - `gemini_native`
  - `anthropic_native`
  - `openai_compatible`
- `vendorKey`
  - `gemini`
  - `openai`
  - `claude`
  - `oneapi`
  - `glm`
  - `custom`
- `baseUrl`
- `modelName`
- `credentialMode`
  - `env`
  - `manual`
- `credentialRef`
  - 当 `credentialMode = env` 时，记录环境变量名而不是明文 key
- `manualApiKey`
  - 仅用户自定义预设使用
- `capabilities`
  - `supportsPdfUpload`
  - `supportsJsonMode`
  - `supportsVision`
  - `supportsStreaming`
- `status`
  - `active`
  - `disabled`
- `isReadonly`
- `isDefault`
- `createdAt`
- `updatedAt`

### 6.2 PageModelSelection

记录每个页面当前选中的模型预设。

字段建议：

- `pageKey`
- `presetId`
- `updatedAt`

### 6.3 PresetTestResult

记录一次预设测试连接结果，供设置页展示最近状态。

字段建议：

- `presetId`
- `status`
  - `success`
  - `failed`
- `message`
- `checkedAt`

## 7. Provider 与传输层抽象

本次不建议把每个厂商都做成独立协议层，而是先按“传输协议”归类。

### 7.1 transportType

决定真正的调用方式：

- `gemini_native`
- `anthropic_native`
- `openai_compatible`

### 7.2 vendorKey

决定 UI 展示和来源标识：

- `gemini`
- `claude`
- `openai`
- `oneapi`
- `glm`
- `custom`

### 7.3 归类规则

- Gemini → `gemini_native`
- Claude → `anthropic_native`
- OpenAI → `openai_compatible`
- OneAPI → `openai_compatible`
- GLM → 优先按 `openai_compatible` 处理

原因：

- OneAPI、GLM、很多代理平台本质上都兼容 OpenAI 风格接口
- 真正影响代码实现的是传输协议，而不是厂商品牌名
- 先统一到 `transportType` 可以最小化现有 service 改动

## 8. 能力标签设计

能力标签必须成为预设的一部分，而不是页面临时猜测。

建议至少包含：

- `supportsPdfUpload`
- `supportsJsonMode`
- `supportsVision`
- `supportsStreaming`

这些能力将直接影响页面可用性：

- `Prompt快速迭代` 需要 `supportsPdfUpload`
- `Prompt自动优化` 需要 `supportsJsonMode`
- 未来若某页需要图像能力，则要求 `supportsVision`

## 9. 默认预设生成

### 9.1 触发时机

首次打开应用时：

1. 读取本地是否已有任何模型预设
2. 如果没有
3. 读取 `.env`
4. 根据存在的环境变量自动生成默认预设
5. 同时为各个页面写入初始默认选择

### 9.2 默认预设规则

默认预设：

- 出现在预设列表中
- 允许修改显示名称
- 允许启用/禁用
- 不显示真实 key
- 不允许在页面里修改 env key
- 默认视为 `isReadonly = true`

### 9.3 只在首次生成

默认预设只在“本地尚无任何预设”时生成，后续不覆盖用户已有配置。

### 9.4 推荐环境变量方向

建议环境变量采用“按来源分组”的形式，例如：

- `VITE_DEFAULT_GEMINI_API_KEY`
- `VITE_DEFAULT_GEMINI_BASE_URL`
- `VITE_DEFAULT_GEMINI_MODEL`
- `VITE_DEFAULT_ANTHROPIC_API_KEY`
- `VITE_DEFAULT_ANTHROPIC_MODEL`
- `VITE_DEFAULT_OPENAI_API_KEY`
- `VITE_DEFAULT_OPENAI_BASE_URL`
- `VITE_DEFAULT_OPENAI_MODEL`
- `VITE_DEFAULT_ONEAPI_API_KEY`
- `VITE_DEFAULT_ONEAPI_BASE_URL`
- `VITE_DEFAULT_ONEAPI_MODEL`
- `VITE_DEFAULT_GLM_API_KEY`
- `VITE_DEFAULT_GLM_BASE_URL`
- `VITE_DEFAULT_GLM_MODEL`

不是每类都必须配置；有哪个就生成哪个默认预设。

## 10. 模型预设管理页

### 10.1 入口位置

统一放在当前全局设置入口里，替代现在仅有的 `LLM 配置` 抽屉。

### 10.2 页面结构

建议采用“左侧列表 + 右侧编辑区”的管理面板：

左侧显示预设列表：

- 自定义名字
- provider/vendor
- modelName
- 能力标签
- 来源标签：`默认` / `自定义`
- 状态标签：`可用` / `禁用`

右侧显示编辑表单：

- 名称
- provider/vendor
- base URL
- model name
- API key
- 能力标签

### 10.3 支持操作

支持：

- 新增预设
- 编辑预设
- 删除预设
- 复制预设
- 测试连接
- 启用 / 禁用预设

### 10.4 默认预设与自定义预设差异

#### 默认预设

- 可改显示名称
- 可启用 / 禁用
- 不显示真实 key
- 不允许直接修改 env key
- 原则上不建议直接改 base URL

#### 自定义预设

- 可完整编辑
- 可保存 manual key
- 可复制自默认预设快速生成新配置

## 11. 页面内选择器

### 11.1 页面只选预设

各页面顶部增加统一的 `当前模型预设` 选择器，替代直接显示底层 API 参数。

### 11.2 选项展示

每个选项显示：

- 预设显示名
- provider/vendor
- modelName
- 能力标签

### 11.3 选择持久化

每个页面独立记忆自己的选择：

- `Prompt快速迭代`
- `Prompt自动优化`
- `线上验证工作台`
- `Chunking测试`
- 未来其他需要模型的页

页面刷新或下次进入时自动恢复。

### 11.4 不需要模型的页面

不需要 LLM 的页面不显示选择器，例如：

- `模型结果验收`
- `PDF压缩`
- `Token统计`

## 12. 页面与能力校验

### 12.1 页面声明能力需求

每个页面声明自己的能力要求。

例如：

- `prompt-iteration`
  - `supportsPdfUpload = true`
  - `supportsJsonMode = true`
- `prompt-optimization`
  - `supportsJsonMode = true`
- `online-validation`
  - 视实际能力要求而定

### 12.2 页面行为

页面下拉展示全部预设，但对不满足能力要求的项进行：

- 置灰
- 原因提示

例如：

- `当前页面要求 PDF 直传，该预设不支持`

### 12.3 运行前拦截

即使页面层已经置灰，service 层仍要有兜底校验，避免未来别的入口直接误调用。

## 13. 页面默认选择与恢复

### 13.1 首次选择

首次生成默认预设时，为每个页面写入一个初始默认 `presetId`。

### 13.2 后续恢复

页面启动时：

1. 读取自己的 `pageKey`
2. 找到对应 `presetId`
3. 若存在则恢复
4. 若不存在则回退系统默认预设
5. 若系统默认也不存在，则提示用户去“模型预设管理”补配置

## 14. 运行时适配层

本次不直接重写所有 service，而是新增统一的解析层。

建议提供：

- `resolvePresetById(presetId)`
- `resolvePagePreset(pageKey)`
- `resolveRuntimeLlmConfig(preset)`

最终解析出的运行时结构仍兼容现有 service：

- `apiUrl`
- `apiKey`
- `modelName`
- `providerType`
- `capabilities`

这样可以在页面层完成新旧桥接，降低改造风险。

## 15. 迁移策略

这是本次最关键的高风险环节。

### 15.1 现状

项目中已经存在：

- `globalSettings`
- `llm1Settings`
- `llm2Settings`
- 若干 localStorage key

### 15.2 当前清理步骤

首次升级到新系统时：

1. 检查是否已有新预设库
2. 清理旧 `intelliextract_llm1 / intelliextract_llm2` localStorage key
3. 从 `.env` 生成默认模型预设
4. 为各页面写入初始 `presetId`

### 15.3 清理后原则

- 新 UI 只读新预设系统
- 旧 `llm1/llm2` key 不再读写
- 测试集工作台运行时仍可使用 `llm1Settings / llm2Settings` 作为 service 参数名，但它们只表示运行参数，不再表示 localStorage 配置来源

## 16. 代码边界

建议拆成 5 个清晰单元。

### 16.1 modelPresetStorage

负责：

- 预设持久化
- 页面选择持久化
- 旧配置迁移

### 16.2 modelPresetService

负责：

- 默认预设生成
- 预设 CRUD
- 测试连接
- 能力状态维护

### 16.3 modelPresetResolver

负责：

- `presetId -> runtime config`
- `pageKey -> preset`
- 能力匹配判断

### 16.4 ModelPresetManager

新的统一配置面板。

### 16.5 PagePresetSelect

页面通用预设选择器。

## 17. 对现有页面的影响

### 17.1 立即接入的页面

建议优先改造：

- `Prompt快速迭代`
- `Prompt自动优化`
- `线上验证工作台`
- `Chunking测试`

### 17.2 暂不接入的页面

- `模型结果验收`
- `PDF压缩`
- `Token统计`

### 17.3 现有设置页

当前 `LLMSettingsDrawer` 需要被新的 `模型预设管理` 取代。

## 18. 风险

### 18.1 迁移错误

旧 `llm1/llm2` 与新预设系统并存期间，最容易出现“页面显示选 A，实际运行用 B”的错误。

### 18.2 能力误判

某些 `oneapi/GLM/custom` 接口并不能稳定推断能力，因此能力标签需要允许显式配置，而不是完全依赖自动推断。

### 18.3 默认预设泄露风险

默认预设来自 `.env`，绝不能在 UI 里直接暴露真实 key。

### 18.4 页面偷读旧配置

若某些 service 或组件继续偷偷读取旧 localStorage，会导致新预设体系失效。

## 19. 验证要求

至少需要验证：

1. 首次启动可从 `.env` 自动生成默认预设。
2. 默认预设不显示真实 key，也不能在 UI 修改 env key。
3. 用户可新增自定义预设并命名。
4. 用户可复制预设。
5. 页面能独立选择自己的预设。
6. 页面刷新后能恢复上次选择。
7. 不满足页面能力要求的预设会被禁用并提示原因。
8. 旧 `llm1/llm2` 能迁移成新预设。
9. 现有调用链不回归。
10. `npm test` 通过。
11. `npm run build` 通过。

## 20. 实施顺序

建议按以下顺序执行：

1. 先做数据模型、storage、resolver、旧配置迁移
2. 再做 `模型预设管理` 面板
3. 优先把 `Prompt快速迭代` 接入
4. 再逐页替换 `线上验证 / Prompt自动优化 / Chunking测试`
5. 最后删除旧的 `llm1/llm2` UI 和兼容逻辑

## 21. 完成标准

当满足以下条件时，可认为这次改造完成：

- 模型配置已从页面中抽离到统一预设系统
- 页面只选择预设，不再编辑底层 API 参数
- `.env` 只负责首次生成默认预设，不泄露 key
- 各页面独立记住自己的模型选择
- 能力不匹配时页面和 service 都会明确拦截
- 现有 LLM 功能可在新体系下继续运行

这时项目的模型管理方式才真正从“零散页面配置”进化成可扩展、可维护的统一系统。
