# LLM Lab 未来升级迭代方案

## 1. 结论先行

如果目标是把当前这个平台做成“世界最强”的 LLM 工程实验平台，最佳路径不是继续把现有浏览器端工具做成更大的前端，而是分三步升级：

1. 把现在的“本地前端工具”升级成“平台化控制面”
2. 把各个核心功能升级成“可复用、可追踪、可评估的基础能力”
3. 把 Prompt、数据集、运行结果、评估指标、工作流都变成一等公民

一句话概括：

> 现在的平台强在“本地闭环快”，下一阶段必须转向“平台化、可复现、可扩展、可协作、可持续优化”。

如果不做这个转向，项目会越来越像一个功能很多的单机工具；  
如果做了这个转向，它会开始具备真正的 LLMOps 平台势能。

---

## 2. 分析方法

由于 GitHub 上很难找到一个与当前项目完全一一对应的产品，所以这次采用的是更合理的方式：

- 不按“整产品”硬比
- 按“功能模块 + 架构能力”拆分对比
- 每个模块寻找 GitHub 上最成熟、最接近最佳实践的开源项目

这样做的好处是：

1. 可以直接学到行业里最强的模块化设计，而不是复制某个产品表面形态
2. 可以按模块取长补短，避免被某个大产品的历史包袱带偏
3. 最终能拼出一套更适合 `LLM Lab` 自身定位的演进路线

---

## 3. 当前平台的真实位置

### 3.1 当前优势

当前平台已经有几个很强的基础：

- 有清晰的工作台结构，而不是单页 Demo
- 已经形成“提取 -> 验收 -> Prompt 优化”的闭环
- 有本地持久化、结果分析、PDF 处理、Prompt 快速试验等能力
- 模型预设已经开始从页面配置收束到统一管理
- 前端体验已经形成产品雏形，而不是单纯工程样例

### 3.2 当前短板

但如果对标真正优秀的开源 LLM 工程平台，当前短板也非常明确：

- 运行编排主要还在 React 组件和页面状态里
- 缺少真正的后端控制面和任务执行面
- Prompt、数据集、运行结果、评估指标还没有统一的数据模型
- 评估体系还偏“页面分析逻辑”，不是“标准化 eval engine”
- 观测能力还停留在页面日志，不是 trace / span / session 级别
- 文档预处理还偏工具级，没有统一文档中间表示
- Token、成本、模型能力判断还不够精确和可插拔
- 现在更像“单人高效实验台”，还不是“团队级 LLM 工程平台”

---

## 4. 模块级对比与最佳实践

## 4.1 模型管理与多 Provider 接入

### 当前现状

当前项目已经做了统一模型预设，这一步方向是对的。  
但它仍然主要是：

- 前端本地存储
- 页面侧做选择和解析
- 缺少真正的网关、路由、密钥托管、限流、审计、成本中心

### 对标项目

- LiteLLM

### GitHub 设计信号

LiteLLM 的核心设计不是“每个页面自己接模型”，而是：

- 用统一接口接入大量模型
- 既能做 SDK，也能做集中式 Gateway
- 在 Gateway 层处理认证、成本、路由、fallback、load balancing、logging

参考：

- LiteLLM README 明确强调“single, unified interface” 和集中式 AI Gateway  
  https://github.com/BerriAI/litellm

### 最佳实践

最佳实践不是“页面直接理解 provider 细节”，而是：

- 引入统一模型网关层
- UI 只理解 `model alias / preset / capability profile`
- 真正的 provider 差异在 gateway 层处理

### 推荐升级

1. 新增后端 `Model Gateway` 服务
2. 前端页面只选模型别名，不直接持有调用细节
3. 模型能力、价格、限流、fallback 规则都由后端统一维护
4. 预设从 localStorage 升级为数据库记录
5. API Key 不再放浏览器侧持有和组合

### 好处

- 安全性大幅提升：密钥不暴露在浏览器
- 新增模型更快：不用每个页面单独适配
- 运行更稳：provider 故障时可以自动 fallback
- 成本可控：可以按用户、项目、页面、实验类型做统一计费和统计
- 为团队协作做准备：预设不再是单机状态

---

## 4.2 Prompt 快速迭代 / Playground

### 当前现状

当前 `Prompt快速迭代` 已经有不错的实验雏形：

- 上传多 PDF
- 分系统 / 用户提示词
- 指定页码
- 看原始回复
- 自动解析 JSON
- 保留历史

但它还偏“页面型工具”，不够“实验平台型能力”。

### 对标项目

- Promptfoo
- Langfuse

### GitHub 设计信号

Promptfoo 的重点是：

- declarative config
- side-by-side model/prompt comparison
- automated eval
- CI/CD integration

Langfuse 的重点是：

- prompt versioning
- prompt playground
- prompt management 与 traces / datasets / evals 的内建联动

参考：

- Promptfoo README  
  https://github.com/promptfoo/promptfoo
- Langfuse README  
  https://github.com/langfuse/langfuse

### 最佳实践

最佳实践不是把 Playground 做成一个“单次试跑页面”，而是做成：

- Prompt 版本可追踪
- 实验输入可复现
- 运行结果可对比
- 评估结果可挂回 Prompt 版本

### 推荐升级

1. 把当前 prompt 草稿升级为 `PromptVersion`
2. 把每次运行升级为 `ExperimentRun`
3. 记录输入文件、页码、模型、参数、提示词版本、输出、解析结果、成本
4. 支持“同一实验矩阵”一次比较多个 prompt / 多个模型
5. 支持导入 / 导出实验定义
6. 支持从生产 trace 回放到 playground

### 好处

- Prompt 不再是页面输入框，而是资产
- 可以真正做 A/B 测试，而不是人工记忆比较
- 用户可以复现旧实验，而不是只看一份历史文本
- 后续自动优化才能有稳定输入输出基线

---

## 4.3 验收分析 / Evals Engine

### 当前现状

当前平台的验收分析已经很强，尤其是：

- 手动字段映射
- 严格关联校验
- 多视角分析
- 问题定位和导出

但它目前的评估能力主要是“业务页分析逻辑”，还不是统一的评测框架。

### 对标项目

- Promptfoo
- DeepEval
- Langfuse

### GitHub 设计信号

Promptfoo 强在：

- 自动化评测
- matrix 对比
- 本地运行
- 进入 CI/CD

DeepEval 强在：

- 类 Pytest 的 LLM 单测模型
- metric 抽象
- 支持 component-level 和 end-to-end eval
- 支持 synthetic dataset 和 prompt auto-optimization

Langfuse 强在：

- datasets / experiments / evals 在一个平台里闭环

参考：

- Promptfoo README  
  https://github.com/promptfoo/promptfoo
- DeepEval README  
  https://github.com/confident-ai/deepeval
- Langfuse README  
  https://github.com/langfuse/langfuse

### 最佳实践

最佳实践是把评估拆成 4 个独立对象：

- Dataset
- Run
- Evaluator
- Report

而不是“页面算完就结束”。

### 推荐升级

1. 引入统一 `EvaluationRun` 数据模型
2. 让验收分析支持“指标计算插件化”
3. 把当前页面里的统计逻辑沉到 eval engine
4. 支持业务规则指标 + LLM-as-a-judge 指标并存
5. 支持批量评估报告、历史趋势、基线对比
6. 支持把评估接入 PR / 发布前检查

### 好处

- 评估从“分析页面”升级为“平台能力”
- 新指标可以插件化扩展，不需要反复改 UI
- 可做持续回归检测，而不是仅手工点页面
- 可以把“模型更换 / Prompt 变更 / chunk 策略变化”都纳入统一 benchmark

---

## 4.4 Prompt 自动优化

### 当前现状

现在的 `Prompt自动优化` 更接近“页面上做定向优化”。

这适合早期产品，但离最佳实践还有明显距离：

- 优化策略还不是通用优化器
- Prompt 优化与评估闭环还不够结构化
- 不能把优化过程抽象成“程序编译 / 搜索”

### 对标项目

- DSPy
- DeepEval

### GitHub 设计信号

DSPy 的核心不是手动改 prompt，而是：

- 把 LM 系统写成模块化程序
- 把 prompt / few-shot / instruction optimization 当成编译问题
- 用优化器自动搜索更好的组合

MIPROv2 明确就是联合优化 instruction 和 few-shot 的优化器。

参考：

- DSPy README  
  https://github.com/stanfordnlp/dspy
- DSPy Optimizers / MIPROv2 文档  
  https://github.com/stanfordnlp/dspy

### 最佳实践

最佳实践不是“Prompt 优化页面”，而是：

- Prompt Program
- Optimizer
- Evaluation Metric
- Search Trace

四者分离。

### 推荐升级

1. 把当前 Prompt 模板标准化为结构化 Prompt Program
2. 把优化器抽象成接口：
   - instruction optimizer
   - few-shot optimizer
   - retrieval config optimizer
3. 让优化器始终绑定一个明确 metric
4. 把优化轨迹保存为可回放 artifact
5. 支持“人工挑选 + 自动搜索”混合模式

### 好处

- Prompt 优化从经验驱动升级为搜索驱动
- 不再只优化文本，而是可以优化整个提取程序
- 更适合大规模实验和回归
- 会成为平台的核心技术壁垒之一

---

## 4.5 在线验证 / 工作流编排

### 当前现状

当前线上验证工作台和测试集工作台的运行编排，主要依赖：

- React 状态
- 本地持久化
- 页面流程控制

这在单机实验阶段够用，但一旦要做：

- 长任务
- 大批量文件
- 失败恢复
- 人工审批
- 多人协作

就会很快碰到上限。

### 对标项目

- LangGraph
- Temporal
- Dify

### GitHub 设计信号

LangGraph 强调：

- durable execution
- human-in-the-loop
- stateful workflow
- memory

Temporal 强调：

- durable workflows
- 自动处理失败与 retry
- 可靠的 workflow execution

Dify 强调：

- workflow canvas
- model support
- observability
- Backend-as-a-Service

参考：

- LangGraph README  
  https://github.com/langchain-ai/langgraph
- Temporal README  
  https://github.com/temporalio/temporal
- Dify README  
  https://github.com/langgenius/dify

### 最佳实践

最佳实践不是“页面驱动流程”，而是：

- 后端工作流引擎驱动流程
- 前端只做配置、启动、观察、干预

### 推荐升级

1. 把提取、评估、优化拆成后端 job / workflow
2. 每个 workflow 都有：
   - 输入
   - 状态
   - checkpoint
   - artifact
   - retry policy
3. 支持人工介入节点
4. 支持长任务恢复
5. 支持并发任务队列和优先级

### 好处

- 从“页面跑任务”变成“平台调度任务”
- 浏览器关闭后任务仍可运行
- 故障恢复和大批量处理能力大幅提升
- 更容易做服务化、多人协作和 API 化

---

## 4.6 文档预处理 / Chunking / PDF 解析

### 当前现状

当前平台有：

- PDF 页面切割
- 简单压缩
- Token 统计

但它还没有统一的“文档中间表示层”。

也就是说，目前更多是：

- 面向页面功能
- 不是面向文档理解系统

### 对标项目

- Docling
- LlamaIndex

### GitHub 设计信号

Docling 强调：

- advanced PDF understanding
- reading order / table structure / layout
- unified document representation
- local execution

LlamaIndex 强调：

- data framework
- ingestion / indexing / retrieval / query 的模块化
- 高层 API + 低层可定制

参考：

- Docling README  
  https://github.com/docling-project/docling
- LlamaIndex README  
  https://github.com/run-llama/llama_index

### 最佳实践

最佳实践不是“每个页面各自处理 PDF”，而是先构建统一文档 IR：

- Document
- Page
- Block
- Table
- Figure
- Chunk
- Metadata

### 推荐升级

1. 新建统一 `Document IR` 层
2. PDF、DOCX、HTML、Excel 等全部先转 IR
3. chunking 不再只看字数，而是支持：
   - layout-aware
   - section-aware
   - table-aware
   - heading-aware
4. OCR 和视觉解析作为可插拔 pipeline
5. extraction / evaluation / optimization 全部复用同一文档 IR

### 好处

- 抽取效果更稳，尤其是复杂 PDF 和表格
- Chunking 测试会从工具页变成核心底层能力
- 后续做多模态提取、结构化抽取、表格理解会容易很多
- 数据预处理会成为平台护城河，而不是附属小工具

---

## 4.7 Token 统计与成本口径

### 当前现状

当前平台已经有 Token 统计页，也补了 PDF Base64 的粗估逻辑。  
但本质上仍以粗估为主。

### 对标项目

- tiktoken
- LiteLLM

### GitHub 设计信号

tiktoken 的最佳实践是：

- 按具体模型获取 tokenizer
- 不是用统一经验公式替代所有模型

LiteLLM 的设计则说明：

- 模型调用与成本、日志、网关可以统一管理

参考：

- tiktoken README  
  https://github.com/openai/tiktoken
- LiteLLM README  
  https://github.com/BerriAI/litellm

### 最佳实践

最佳实践是：

- exact where possible
- estimated where necessary

也就是：

- 能精确 tokenizer 的模型，用精确 tokenizer
- 不能精确的模型，明确标记为估算口径

### 推荐升级

1. 建 `Tokenizer Registry`
2. OpenAI 系列先接 `tiktoken`
3. 其他模型接 provider-specific 计数器或保守估算器
4. 页面区分：
   - 文本 token
   - Base64 token
   - API 计费 token
5. 运行结果保存真实 usage 与预测 usage，对比误差

### 好处

- 成本预测更可信
- 用户不会混淆“字符 / token / Base64 / API usage”
- 为预算控制、限额、压缩建议提供可靠依据

---

## 4.8 观测、追踪、实验资产

### 当前现状

现在平台有运行日志、进度、部分历史记录，但没有真正的 trace system。

### 对标项目

- Langfuse
- LangGraph

### GitHub 设计信号

Langfuse 强调：

- traces
- prompts
- evals
- datasets
- integrated workflow

LangGraph 则强调：

- state transitions
- memory
- runtime visibility

参考：

- Langfuse README  
  https://github.com/langfuse/langfuse
- LangGraph README  
  https://github.com/langchain-ai/langgraph

### 最佳实践

最佳实践不是“日志列表”，而是：

- trace
- span
- session
- artifact
- feedback

五者统一。

### 推荐升级

1. 为每次运行生成 `trace_id / session_id / run_id`
2. 每个阶段生成 span：
   - parse
   - chunk
   - retrieve
   - prompt build
   - llm call
   - join
   - eval
   - optimize
3. 把输入、输出、耗时、token、模型、错误都挂到 span
4. 支持用户反馈标注
5. 支持从 trace 直接重放某一轮实验

### 好处

- Debug 成本大幅下降
- 生产问题能快速定位
- 优化平台会有真实数据闭环
- 观测系统会成为平台级基础设施

---

## 5. 最佳实践总原则

如果只总结成几条架构纪律，最佳实践应该是下面这些。

### 5.1 配置要数据化，不要页面化

不要让页面状态承担平台配置的职责。  
模型、Prompt、评估器、数据集、工作流，都应该有自己的数据模型和版本。

### 5.2 运行要可复现

任何一次结果，都应该能回答：

- 用了哪个模型
- 哪个 Prompt 版本
- 哪份数据集
- 哪个 chunk 策略
- 哪个 evaluator
- 哪个工作流版本

### 5.3 任务要耐久化

只要任务会跑超过几秒、会失败、会中断、会重试，就不应该由 React 页面直接承担编排。

### 5.4 文档处理要统一抽象

不要让 PDF、OCR、chunking、结构化抽取散在多个页面逻辑里。  
统一 IR 是后续所有能力的基础。

### 5.5 评估要平台化

评估不能只是图表和统计面板，必须成为：

- 标准数据结构
- 标准运行方式
- 标准报告方式
- 标准回归检查方式

### 5.6 观测要默认开启

世界级平台不会把 trace 当“高级可选项”。  
它应该默认存在，只是可控采样和可控存储。

---

## 6. 建议的未来升级顺序

## 第一阶段：平台化底座

### 要做什么

- 引入后端控制面
- 数据库存储模型预设、Prompt、数据集、运行结果
- 引入对象存储保存 PDF 和 artifacts
- 模型接入统一迁移到 gateway
- 定义统一领域模型：
  - Model
  - PromptVersion
  - Dataset
  - ExperimentRun
  - EvaluationRun
  - Artifact

### 为什么先做

因为这是后面所有能力的平台底座。  
没有这层，后面的观测、自动优化、工作流、团队协作都会变成补丁式开发。

### 做了之后的收益

- 平台第一次拥有“长期记忆”
- 从单机工具升级为可协作系统
- 为商业化、团队化、API 化打基础

---

## 第二阶段：统一观测与评估

### 要做什么

- traces / spans / sessions
- datasets / benchmarks
- evaluator 插件体系
- Prompt / 模型 / chunk 策略对比实验
- PR / 发布前回归评测

### 为什么第二阶段做

只有先把平台行为记录下来，后面的优化和自动化才不会盲飞。

### 做了之后的收益

- 任何改动都可量化比较
- Prompt / 模型切换不再靠感觉
- 团队会形成工程化的质量文化

---

## 第三阶段：文档 intelligence 底层升级

### 要做什么

- 统一文档 IR
- OCR / layout / table / chart parsing
- chunking engine
- retrieval-ready document pipeline

### 为什么第三阶段做

因为你这个平台的核心入口之一就是文档。  
文档理解如果不升级，后面的提取、评估、优化上限都会受限。

### 做了之后的收益

- 提取效果和稳定性显著提升
- 复杂 PDF 的竞争力会明显增强
- 平台会出现真正的技术壁垒

---

## 第四阶段：自动优化与 durable workflow

### 要做什么

- Prompt / few-shot / chunk 策略联合优化
- 多轮搜索与优化轨迹
- durable execution
- human-in-the-loop 审批
- 多任务队列、断点恢复、并发运行

### 为什么第四阶段做

因为这是把平台从“好用工具”推到“世界级实验平台”的关键一步。

### 做了之后的收益

- 平台可以跑长实验，不怕中断
- 自动优化能力会成为产品亮点
- 用户会从“手动调模型”升级为“用平台发现最优配置”

---

## 第五阶段：平台化产品能力

### 要做什么

- 用户 / 团队 / 项目空间
- 权限、审计、配额、预算
- API / SDK / Webhook
- 插件体系
- 第三方工具接入

### 做了之后的收益

- 从个人实验平台走向组织级平台
- 形成生态能力
- 能支撑“世界最强”目标，而不是停留在单一工具层

---

## 7. 最值得优先投入的 10 件事

如果只挑最关键的 10 件事，建议按下面顺序投资源：

1. 后端控制面 + 数据库存储
2. 模型调用统一迁移到 LiteLLM 类 Gateway
3. Prompt / Dataset / Run / Artifact 统一数据模型
4. trace / span / session 级观测
5. eval engine 插件化
6. Prompt playground 升级为实验系统
7. 文档 IR + Docling 类解析能力
8. 精确 tokenizer registry
9. durable workflow engine
10. 自动优化器体系

---

## 8. 不建议做的事情

### 8.1 不要继续把所有编排逻辑堆在前端页面

短期看改得快，长期一定会成为上限。

### 8.2 不要把“评估页”误当成“评估系统”

看板不是系统，系统必须能复现、对比、回归、自动化。

### 8.3 不要用更多页面切换替代统一数据模型

页面变多并不等于平台变强。  
真正让平台变强的是：统一对象模型、统一运行模型、统一观测模型。

### 8.4 不要太早追求大而全 Agent 平台外观

先把：

- 模型网关
- 评估体系
- 文档底层
- durable workflow

这四层做扎实，比先上复杂画布更重要。

---

## 9. 最终建议

如果只给一个最高优先级建议，那就是：

> 下一阶段最正确的方向，不是继续做更多页面，而是把 `LLM Lab` 从“浏览器里的多功能工具箱”升级成“有控制面、有执行面、有评估面、有观测面”的平台。

从 GitHub 上最成熟的相关项目看，真正的最佳实践已经很清楚：

- 模型接入学习 LiteLLM
- Prompt / eval / dataset / trace 一体化学习 Langfuse
- 自动评测学习 Promptfoo + DeepEval
- 自动优化学习 DSPy
- 文档底层学习 Docling
- 工作流耐久化学习 LangGraph + Temporal
- 产品级封装学习 Dify
- 精确 token 口径学习 tiktoken

如果这条路线做对，平台会获得 5 个决定性收益：

1. 更强的工程可复现性
2. 更高的运行稳定性
3. 更快的模型 / Prompt 迭代速度
4. 更强的团队协作能力
5. 真正的平台级护城河

---

## 10. 参考项目

- Promptfoo  
  https://github.com/promptfoo/promptfoo
- LiteLLM  
  https://github.com/BerriAI/litellm
- Langfuse  
  https://github.com/langfuse/langfuse
- DSPy  
  https://github.com/stanfordnlp/dspy
- DeepEval  
  https://github.com/confident-ai/deepeval
- Docling  
  https://github.com/docling-project/docling
- LlamaIndex  
  https://github.com/run-llama/llama_index
- tiktoken  
  https://github.com/openai/tiktoken
- LangGraph  
  https://github.com/langchain-ai/langgraph
- Temporal  
  https://github.com/temporalio/temporal
- Dify  
  https://github.com/langgenius/dify
