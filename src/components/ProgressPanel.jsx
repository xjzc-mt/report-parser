import { Badge, Progress } from '@mantine/core';

export function ProgressPanel({ progress }) {
  if (!progress.visible) {
    return null;
  }

  return (
    <section className="progress-section glass-subpanel">
      <div className="progress-title-row">
        <div>
          <span className="eyebrow">Run Status</span>
          <h3 className="progress-kicker">提取进度</h3>
        </div>
        <Badge
          variant="light"
          color={progress.isLoading ? 'blue' : 'teal'}
          radius="xl"
          className={`progress-badge ${progress.isLoading ? 'running' : 'done'}`}
        >
          {progress.isLoading ? '进行中' : '已完成'}
        </Badge>
      </div>

      <div className="progress-header">
        <span className="status-text">{progress.status || 'Waiting...'}</span>
        <span className="percentage-text">{progress.percentage}%</span>
      </div>
      <Progress.Root size={12} radius="xl" className="progress-bar-container">
        <Progress.Section
          value={progress.percentage}
          className={`progress-bar ${progress.isLoading ? 'loading' : ''}`}
        />
      </Progress.Root>
      <div className="progress-meta">共记录 {progress.logs.length} 条日志</div>
      <div className="progress-log">
        {progress.logs.map((entry) => (
          <p key={entry.id} className="progress-log-entry">
            <span className="progress-log-time">[{entry.time}]</span>
            <span className="progress-log-message">{entry.message}</span>
          </p>
        ))}
      </div>
    </section>
  );
}
