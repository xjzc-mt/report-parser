import { Badge, Button } from '@mantine/core';

function formatDateTime(timestamp) {
  if (!timestamp) return '未知时间';
  return new Date(timestamp).toLocaleString('zh-CN', {
    hour12: false
  });
}

function getBestCandidate(run) {
  return (run?.candidates || []).find((item) => item.id === run.bestCandidateId) || run?.candidates?.[0] || null;
}

function getImprovement(run, candidate) {
  const bestScore = Number(candidate?.score?.overall ?? run?.bestScore ?? run?.baselineScore ?? 0);
  return bestScore - Number(run?.baselineScore ?? 0);
}

export function OptimizationReviewPanel({ run, onApply, onExport }) {
  if (!run) {
    return <div className="prompt-optimization-empty">还没有可审核的优化结果。先完成一次优化运行。</div>;
  }

  const bestCandidate = getBestCandidate(run);
  const improvement = getImprovement(run, bestCandidate);

  return (
    <div className="prompt-optimization-review">
      <div className="prompt-optimization-review-head">
        <div>
          <h3>{run.targetName || 'Prompt 优化结果'}</h3>
          <p className="section-caption">
            运行时间：{formatDateTime(run.createdAt)}，模型：{run.modelName || '未记录模型'}
          </p>
        </div>
        <div className="prompt-optimization-badge-row">
          <Badge variant="light" color="blue" radius="xl">
            {run.indicatorCode || '未记录指标'}
          </Badge>
          <Badge variant="light" color={run.appliedVersionId ? 'teal' : 'gray'} radius="xl">
            {run.appliedVersionId ? '已应用为新版本' : '待人工确认'}
          </Badge>
        </div>
      </div>

      <div className="prompt-optimization-scorecards">
        <div className="prompt-optimization-scorecard">
          <span>Baseline</span>
          <strong>{run.baselineScore ?? 0}</strong>
        </div>
        <div className="prompt-optimization-scorecard">
          <span>Best</span>
          <strong>{bestCandidate?.score?.overall ?? run.bestScore ?? run.baselineScore ?? 0}</strong>
        </div>
        <div className="prompt-optimization-scorecard">
          <span>提升</span>
          <strong>{improvement >= 0 ? `+${improvement}` : improvement}</strong>
        </div>
      </div>

      <div className="prompt-optimization-diff">
        <div className="prompt-optimization-diff-card">
          <h4>基线 Prompt</h4>
          <pre>{run.baselinePromptText || '未记录基线 Prompt'}</pre>
        </div>
        <div className="prompt-optimization-diff-card">
          <h4>候选 Prompt</h4>
          <pre>{bestCandidate?.promptText || '未生成候选 Prompt'}</pre>
        </div>
      </div>

      <div className="prompt-optimization-actions prompt-optimization-review-actions">
        <Button
          radius="xl"
          disabled={!bestCandidate || Boolean(run.appliedVersionId)}
          onClick={() => onApply?.(bestCandidate?.id)}
        >
          {run.appliedVersionId ? '已应用为新版本' : '应用为新版本'}
        </Button>
        <Button
          variant="default"
          radius="xl"
          onClick={() => onExport?.()}
          disabled={!run.resultRows?.length}
        >
          导出最终结果
        </Button>
      </div>

      <div className="prompt-optimization-samples">
        <h4>样本结果</h4>
        {bestCandidate?.sampleResults?.length ? (
          <table className="trace-table">
            <thead>
              <tr>
                <th>报告</th>
                <th>分数</th>
                <th>结果摘要</th>
              </tr>
            </thead>
            <tbody>
              {bestCandidate.sampleResults.map((item, index) => (
                <tr key={`${item.report_name}-${index}`}>
                  <td>{item.report_name || '-'}</td>
                  <td>{item.similarity ?? '-'}</td>
                  <td>{item.text || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="prompt-optimization-empty">暂无样本结果。</div>
        )}
      </div>

      <div className="optimization-trace-view">
        <div className="trace-hint">
          记录每轮原始状态和验证情况，便于回看优化过程。
        </div>
        <div className="trace-table-container">
          <table className="trace-table">
            <thead>
              <tr>
                <th>阶段</th>
                <th>说明</th>
                <th>Prompt</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {(run.traceEntries || []).map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.phase || '-'}</td>
                  <td>{entry.message || '-'}</td>
                  <td className="td-code">{entry.promptText || '-'}</td>
                  <td>{entry.accepted || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
