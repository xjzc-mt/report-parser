export function FullFlowMode({
  globalSettings,
  llm1Settings,
  llm2Settings,
  onChangeLlm1,
  onChangeLlm2
}) {
  return (
    <div className="full-flow-mode">
      <h3>完整流程模式</h3>
      <p>PDF + 测试集 → LLM1 提取 → 关联分析 → Prompt 优化</p>
      {/* 将在阶段 5 实现完整逻辑 */}
    </div>
  );
}
