import { IconChartHistogram } from '@tabler/icons-react';

export function TokenEstimationPage() {
  return (
    <section className="glass-panel main-panel">
      <div className="section-heading workspace-heading">
        <h2 className="section-title">
          <IconChartHistogram size={20} stroke={1.8} />
          <span>Token统计</span>
        </h2>
        <p className="section-caption">当前仅保留为占位页，用来承接后续的统一统计能力。</p>
      </div>

      <div className="panel-block">
        <p>下一阶段会补齐这些能力：</p>
        <ul className="token-estimation-list">
          <li>支持纯文本输入</li>
          <li>支持多文件类型</li>
          <li>支持不同模型口径的统计与成本估算</li>
        </ul>
      </div>
    </section>
  );
}
