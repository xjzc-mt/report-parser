import { IconBooks } from '@tabler/icons-react';
import { methodologyContent } from '../content/methodologyContent.js';

function SimpleTable({ headers, rows }) {
  return (
    <table>
      <thead>
        <tr>
          {headers.map((header) => <th key={header}>{header}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.join('-')}>
            {row.map((cell) => <td key={cell}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MethodologyTab() {
  return (
    <section className="glass-panel methodology-tab">
      <div className="section-heading">
        <h2 className="section-title">
          <IconBooks size={20} stroke={1.8} />
          <span>说明文档</span>
        </h2>
        <p className="section-caption">汇总平台结构、输入输出、模型接入和安全边界。</p>
      </div>

      <div className="methodology-content">
        <h3>1. 系统架构</h3>
        <p>{methodologyContent.architecture.intro}</p>
        <SimpleTable headers={['层级', '技术', '说明']} rows={methodologyContent.architecture.rows} />

        <h3>2. 输入规范</h3>
        <h4>PDF 文件</h4>
        <ul>
          {methodologyContent.inputSpec.pdf.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <h4>Excel 需求清单 (.xlsx)</h4>
        <SimpleTable headers={['列名', '类型', '说明']} rows={methodologyContent.inputSpec.excelRows} />

        <h3>3. 输出规范</h3>
        <SimpleTable headers={['列名', '适用类型', '说明']} rows={methodologyContent.outputSpec.rows} />
        <p><strong>{methodologyContent.outputSpec.note}</strong></p>

        <h3>4. 批处理策略</h3>
        <SimpleTable headers={['组别', '包含类型', '每批上限', '原因']} rows={methodologyContent.batching.rows} />
        <ul>
          {methodologyContent.batching.bullets.map((item) => <li key={item}>{item}</li>)}
        </ul>

        <h3>5. API 集成</h3>
        <SimpleTable headers={['模式', '检测方式', '认证', 'PDF 处理']} rows={methodologyContent.apiIntegration.rows} />

        <h3>6. 安全措施</h3>
        <ul>
          {methodologyContent.security.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </div>
    </section>
  );
}
