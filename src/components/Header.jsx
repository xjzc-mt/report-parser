import { IconBooks, IconFileTypePdf, IconFlask, IconLayoutDashboard } from '@tabler/icons-react';

export function Header({ activeTab, onTabChange }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <div className="brand-block">
            <div className="brand-copy">
              <h1>ESG报告摘录大师</h1>
            </div>
          </div>

          <nav className="tab-nav" aria-label="Main tabs">
            <button
              type="button"
              className={`tab-button ${activeTab === 'extract' ? 'active' : ''}`}
              onClick={() => onTabChange('extract')}
            >
              <IconLayoutDashboard size={18} stroke={1.8} />
              <span>摘录工作台</span>
            </button>
            <button
              type="button"
              className={`tab-button ${activeTab === 'testbench' ? 'active' : ''}`}
              onClick={() => onTabChange('testbench')}
            >
              <IconFlask size={18} stroke={1.8} />
              <span>测试集工作台</span>
            </button>
            <button
              type="button"
              className={`tab-button ${activeTab === 'compress' ? 'active' : ''}`}
              onClick={() => onTabChange('compress')}
            >
              <IconFileTypePdf size={18} stroke={1.8} />
              <span>PDF压缩</span>
            </button>
            <button
              type="button"
              className={`tab-button ${activeTab === 'methodology' ? 'active' : ''}`}
              onClick={() => onTabChange('methodology')}
            >
              <IconBooks size={18} stroke={1.8} />
              <span>方法论</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}
