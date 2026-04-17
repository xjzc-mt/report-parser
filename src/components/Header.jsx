import { ActionIcon, Tooltip } from '@mantine/core';
import { IconBooks, IconFileTypePdf, IconFlask, IconLayoutDashboard, IconSettings } from '@tabler/icons-react';
import { APP_TABS, LAB_BRAND } from '../constants/labNavigation.js';

export function Header({ activeTab, onTabChange, onOpenModelPresetManager }) {
  const renderTabIcon = (tabKey) => {
    switch (tabKey) {
      case 'test-workbench':
        return <IconFlask size={18} stroke={1.8} />;
      case 'online-validation':
        return <IconLayoutDashboard size={18} stroke={1.8} />;
      case 'data-prep':
        return <IconFileTypePdf size={18} stroke={1.8} />;
      case 'docs':
      default:
        return <IconBooks size={18} stroke={1.8} />;
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <div className="brand-block">
            <div className="brand-copy">
              <h1>{LAB_BRAND.title}</h1>
              <p>{LAB_BRAND.subtitle}</p>
            </div>
          </div>

          <nav className="tab-nav" aria-label="Main tabs">
            {APP_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`tab-button ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => onTabChange(tab.key)}
              >
                {renderTabIcon(tab.key)}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="topbar-right">
          <Tooltip label="模型预设管理">
            <ActionIcon
              variant="default"
              size="lg"
              radius="xl"
              onClick={onOpenModelPresetManager}
              aria-label="打开模型预设管理"
            >
              <IconSettings size={18} stroke={1.8} />
            </ActionIcon>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
