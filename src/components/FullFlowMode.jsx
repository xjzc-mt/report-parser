import { Badge, Button, MultiSelect, NumberInput, Progress, Switch, Text, Tooltip, ActionIcon } from '@mantine/core';
import {
  IconAlertCircle,
  IconBook,
  IconDownload,
  IconFileTypePdf,
  IconFlask,
  IconPlayerPlayFilled,
  IconPlayerStop,
  IconRefresh,
  IconSettings,
  IconSparkles,
  IconTableImport
} from '@tabler/icons-react';
import { estimateCost } from '../services/llmClient.js';
import { UploadCard } from './UploadCard.jsx';
import { PdfPageTree } from './PdfPageTree.jsx';
import { UnifiedAnalysisMerged } from './UnifiedAnalysisMerged.jsx';

function LogPanel({ title, logs, emptyHint = '暂无日志' }) {
  return (
    <div className="log-panel">
      <div className="log-panel-header">{title}</div>
      <div className="log-panel-body">
        {logs.length === 0
          ? <p className="log-panel-empty">{emptyHint}</p>
          : logs.map((entry) => (
            <div key={entry.id || `${entry.timestamp}-${Math.random()}`} className="log-entry">
              <span className="log-time">{entry.timestamp}</span>
              <span className="log-msg">{entry.message}</span>
            </div>
          ))
        }
      </div>
    </div>
  );
}

function TokenStatsBar({ tokenStats, llm1ModelName, llm2ModelName }) {
  if (!tokenStats || (tokenStats.extractInput === 0 && tokenStats.optInput === 0)) return null;
  const extractCost = estimateCost(llm1ModelName || 'default', tokenStats.extractInput, tokenStats.extractOutput);
  const optCost = estimateCost(llm2ModelName || 'default', tokenStats.optInput, tokenStats.optOutput);
  const totalCost = extractCost + optCost;
  const fmt = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  return (
    <div className="token-stats-bar">
      <span className="token-stats-label">Token 消耗：</span>
      <span className="token-stats-chip">提取 输入 {fmt(tokenStats.extractInput)} / 输出 {fmt(tokenStats.extractOutput)} / ${extractCost.toFixed(3)}</span>
      <span className="token-stats-chip">优化 输入 {fmt(tokenStats.optInput)} / 输出 {fmt(tokenStats.optOutput)} / ${optCost.toFixed(3)}</span>
      <span className="token-stats-chip total">合计 ${totalCost.toFixed(3)}</span>
    </div>
  );
}

export function FullFlowMode({
  vm
}) {
  const {
    pendingRunState,
    isRunning,
    isInterrupting,
    onInterrupt,
    onDownloadCurrent,
    onReset,
    onOpenSettings,
    noApiKey,
    cachedPages,
    onDeleteCachedPage,
    onDeleteReportPages,
    canStartExtraction,
    pdfFiles,
    testSetFile,
    definitionFile,
    onSelectPdf,
    onRemovePdf,
    onSelectTestSet,
    onRemoveTestSet,
    onSelectDefinition,
    onRemoveDefinition,
    onStartExtraction,
    comparisonFile,
    onSelectComparisonFile,
    onRemoveComparisonFile,
    canStandaloneOptimize,
    onStartStandaloneOptimize,
    errorMsg,
    exProgress,
    phase1Progress,
    phase1Pct,
    exLogs,
    llm1Rows,
    comparisonRows,
    llm2Settings,
    onChangeLlm2,
    stage1AnalysisRef,
    selectedCodes,
    onSelectedCodesChange,
    loopOptEnabled,
    onLoopOptChange,
    canStartOptimization,
    onStartOptimization,
    optProgress,
    phase2Progress,
    phase2Pct,
    optLogs,
    finalRows,
    tokenStats,
    iterationDetails,
    onExportLlm1Results,
    onExportComparisonRows,
    onExportFinalResults,
    llm1ModelName,
    llm2ModelName
  } = vm;

  return (
    <section className="glass-panel main-panel testbench-panel">
      <div className="section-heading workspace-heading">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div>
            <h2 className="section-title">
              <IconFlask size={20} stroke={1.8} />
              <span>完整流程模式</span>
            </h2>
            <p className="section-caption">上传 PDF 与测试集，AI 提取 ESG 指标并与标准答案对比，再跨报告优化 Prompt。</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {isRunning && (
              <Tooltip label={isInterrupting ? '正在等待当前批次完成...' : '中断：当前批次完成后停止，可继续恢复'}>
                <ActionIcon
                  variant="light"
                  color="orange"
                  size="lg"
                  radius="xl"
                  onClick={onInterrupt}
                  disabled={isInterrupting}
                >
                  <IconPlayerStop size={16} stroke={1.8} />
                </ActionIcon>
              </Tooltip>
            )}
            {(comparisonRows || finalRows) && !isRunning && (
              <Tooltip label="下载当前结果">
                <ActionIcon variant="default" size="lg" radius="xl" onClick={onDownloadCurrent}>
                  <IconDownload size={16} stroke={1.8} />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label="重置运行状态">
              <ActionIcon variant="default" size="lg" radius="xl" onClick={onReset} disabled={isRunning}>
                <IconRefresh size={16} stroke={1.8} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="LLM 配置">
              <ActionIcon variant="default" size="lg" radius="xl" onClick={onOpenSettings} disabled={isRunning}>
                <IconSettings size={16} stroke={1.8} />
              </ActionIcon>
            </Tooltip>
          </div>
        </div>
      </div>

      {pendingRunState && !isRunning && (
        <div className="testbench-resume-banner">
          <IconAlertCircle size={16} />
          <span>检测到未完成的运行（已完成 {pendingRunState.completedGroups?.length || 0} 个分组），是否从断点继续？</span>
          <Button size="xs" radius="xl" variant="filled" onClick={vm.onResumeRun}>继续</Button>
          <Button size="xs" radius="xl" variant="default" onClick={vm.onIgnorePendingRun}>忽略</Button>
        </div>
      )}

      <div className="testbench-upload-grid">
        <UploadCard
          icon={<IconFileTypePdf size={26} stroke={1.8} />}
          tag="PDF"
          title="待解析报告"
          hint="上传完整 PDF 报告（可多选）"
          acceptHint="文件名去掉扩展名需与测试集 report_name 列一致"
          buttonLabel="选择 PDF 文件"
          accept="application/pdf"
          file={pdfFiles}
          multiple
          onFileSelect={onSelectPdf}
          onRemoveFile={onRemovePdf}
          formatFileInfo={vm.formatPdfFiles}
        />
        <UploadCard
          icon={<IconTableImport size={26} stroke={1.8} />}
          tag="EXCEL"
          title="测试集文件"
          hint="包含标准答案的测试集 Excel"
          acceptHint="必传列：report_name, indicator_code, pdf_numbers, text_value, prompt (若未传定义文件)"
          buttonLabel="选择测试集"
          accept=".xlsx,.xls,.csv"
          file={testSetFile}
          onFileSelect={onSelectTestSet}
          onRemoveFile={onRemoveTestSet}
          formatFileInfo={vm.formatExcelFile}
        />
      </div>

      <div className="testbench-definition-row">
        <UploadCard
          icon={<IconBook size={22} stroke={1.8} />}
          tag="EXCEL（可选）"
          title="指标摘录定义文件"
          hint="核心包含每个指标的特定提取 Prompt（支持仅有 indicator_code 和 prompt 列）"
          acceptHint="必传列：indicator_code, prompt。若无 prompt 则组合使用 definition, guidance 列"
          buttonLabel="选择定义文件"
          accept=".xlsx,.xls,.csv"
          file={definitionFile}
          onFileSelect={onSelectDefinition}
          onRemoveFile={onRemoveDefinition}
          formatFileInfo={vm.formatExcelFile}
        />
      </div>

      {noApiKey && (
        <p className="testbench-warn">⚠️ 未检测到 API Key，请点击右上角齿轮配置 LLM</p>
      )}

      {cachedPages.length > 0 && (
        <div className="testbench-cache-section">
          <div className="testbench-cache-header">
            <span className="testbench-phase-label">已缓存切分页面</span>
          </div>
          <PdfPageTree pages={cachedPages} onDelete={onDeleteCachedPage} onDeleteReport={onDeleteReportPages} />
        </div>
      )}

      <TokenStatsBar
        tokenStats={tokenStats}
        llm1ModelName={llm1ModelName}
        llm2ModelName={llm2ModelName}
      />

      <div className="testbench-action">
        <Button
          size="lg"
          radius="xl"
          className="btn-primary btn-primary-mantine"
          disabled={!canStartExtraction}
          onClick={onStartExtraction}
          leftSection={<IconPlayerPlayFilled size={16} />}
        >
          {isRunning ? '提取中...' : '开始提取'}
        </Button>
      </div>

      {errorMsg && (
        <div className="testbench-error-block">
          <IconAlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {exProgress.visible && (
        <>
          {phase1Progress.total > 0 && (
            <div className="testbench-progress-row">
              <span className="testbench-progress-label">提取进度 {phase1Progress.completed}/{phase1Progress.total}</span>
              <Progress value={phase1Pct} size="sm" radius="xl" style={{ flex: 1 }} />
              <span className="testbench-progress-pct">{phase1Pct}%</span>
            </div>
          )}
          <LogPanel title="提取日志" logs={exLogs} emptyHint="提取运行后在此显示日志" />
        </>
      )}

      {comparisonRows && (
        <div className="testbench-result-block">
          <div className="testbench-result-header">
            <span className="testbench-phase-label">阶段一结果</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {llm1Rows && llm1Rows.length > 0 && (
                <Button
                  size="sm"
                  radius="xl"
                  variant="default"
                  className="btn-outline"
                  leftSection={<IconDownload size={14} />}
                  onClick={() => onExportLlm1Results(llm1Rows)}
                >
                  下载提取结果（{llm1Rows.length} 条）
                </Button>
              )}
              <Button
                size="sm"
                radius="xl"
                variant="default"
                className="btn-outline"
                leftSection={<IconDownload size={14} />}
                onClick={() => onExportComparisonRows(comparisonRows)}
              >
                下载关联文件（{comparisonRows.length} 条）
              </Button>
              <Button
                size="sm"
                radius="xl"
                variant="default"
                className="btn-outline"
                leftSection={<IconDownload size={14} />}
                onClick={() => void stage1AnalysisRef.current?.exportPanelData?.()}
              >
                导出分析数据
              </Button>
            </div>
          </div>

          <UnifiedAnalysisMerged
            ref={stage1AnalysisRef}
            comparisonRows={comparisonRows}
            threshold={llm2Settings.similarityThreshold ?? 70}
            onThresholdChange={(val) => onChangeLlm2('similarityThreshold', val)}
          />

          <div className="testbench-optimization-config">
            <div className="config-header">
              <IconSparkles size={20} color="#6366f1" />
              <span className="config-title">阶段二：针对性指标优化</span>
            </div>

            <div className="config-body">
              <div className="config-row">
                <div className="config-label">待优化指标范围</div>
                <div className="config-input-full">
                  <MultiSelect
                    placeholder="选择需要优化的指标代码（默认已选中不达标项）"
                    data={Array.from(new Set(comparisonRows.map((r) => r.indicator_code))).map((code) => ({
                      value: code,
                      label: `${code} (${comparisonRows.find((r) => r.indicator_code === code)?.indicator_name || '未知'})`
                    }))}
                    value={selectedCodes}
                    onChange={onSelectedCodesChange}
                    searchable
                    clearable
                    hidePickedOptions
                    maxValues={50}
                    size="sm"
                    styles={{ input: { borderRadius: '8px' } }}
                  />
                </div>
              </div>

              <div className="config-grid">
                <div className="config-item">
                  <Switch
                    label="循环迭代优化"
                    description="对新 Prompt 进行多轮重测与进化"
                    checked={loopOptEnabled}
                    onChange={(e) => onLoopOptChange(e.currentTarget.checked)}
                    disabled={isRunning}
                  />
                </div>
                {loopOptEnabled && (
                  <div className="config-item">
                    <NumberInput
                      label="最大循环轮数"
                      min={1}
                      max={20}
                      size="xs"
                      value={llm2Settings.maxOptIterations || 1}
                      onChange={(val) => onChangeLlm2('maxOptIterations', Number(val) || 1)}
                      disabled={isRunning}
                    />
                  </div>
                )}
                <div className="config-item">
                  <NumberInput
                    label="目标相似度阈值%"
                    description="达到此分数将提前停止优化"
                    min={0}
                    max={100}
                    size="xs"
                    value={llm2Settings.similarityThreshold ?? 70}
                    onChange={(val) => onChangeLlm2('similarityThreshold', Number(val) ?? 70)}
                    disabled={isRunning}
                  />
                </div>
              </div>

              <div className="config-actions">
                <Button
                  size="md"
                  radius="xl"
                  fullWidth
                  className="btn-primary btn-primary-mantine"
                  disabled={!canStartOptimization || selectedCodes.length === 0}
                  onClick={() => onStartOptimization(selectedCodes, loopOptEnabled)}
                  leftSection={isRunning ? null : <IconPlayerPlayFilled size={16} />}
                >
                  {isRunning ? '正在执行爬坡优化循环...' : `开始优化选中的 ${selectedCodes.length} 个指标`}
                </Button>
                {selectedCodes.length === 0 && (
                  <Text size="xs" c="dimmed" ta="center" mt={4}>请至少选择一个指标进行优化</Text>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {optProgress.visible && (
        <>
          {phase2Progress.total > 0 && (
            <div className="testbench-progress-row">
              <span className="testbench-progress-label">优化进度 {phase2Progress.completed}/{phase2Progress.total}</span>
              <Progress value={phase2Pct} size="sm" radius="xl" color="violet" style={{ flex: 1 }} />
              <span className="testbench-progress-pct">{phase2Pct}%</span>
            </div>
          )}
          <LogPanel title="优化日志" logs={optLogs} emptyHint="Prompt 优化运行后在此显示日志" />
        </>
      )}

      {finalRows && (
        <div className="testbench-result-block testbench-result-final">
          <div className="testbench-result-header">
            <span className="testbench-phase-label">优化全过程追踪</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                size="sm"
                radius="xl"
                className="btn-primary btn-primary-mantine"
                leftSection={<IconDownload size={14} />}
                onClick={() => onExportFinalResults(finalRows, tokenStats, iterationDetails)}
              >
                下载全量优化文件（多 Sheet）
              </Button>
            </div>
          </div>

          <div className="optimization-trace-view">
            <p className="trace-hint">展示每个指标在各轮迭代中的表现。只有当新 Prompt 性能优于当前最佳时，系统才会在 Final Result 中采用它。</p>
            {iterationDetails && iterationDetails.length > 0 ? (
              <div className="trace-table-container">
                <table className="trace-table">
                  <thead>
                    <tr>
                      <th>指标代码</th>
                      <th>轮次</th>
                      <th>平均相似度</th>
                      <th>样本表现 (部分)</th>
                      <th>状态</th>
                      <th>使用的 Prompt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(
                      iterationDetails.reduce((acc, detail) => {
                        const key = detail.indicator_code;
                        if (!acc[key]) acc[key] = {};
                        if (!acc[key][detail.iter]) {
                          acc[key][detail.iter] = {
                            code: detail.indicator_code,
                            name: detail.indicator_name,
                            iter: detail.iter,
                            avg: detail.avg_similarity,
                            accepted: detail.is_accepted,
                            prompt: detail.prompt,
                            samples: []
                          };
                        }
                        acc[key][detail.iter].samples.push(`${detail.report_name}: ${detail.similarity}%`);
                        return acc;
                      }, {})
                    ).map(([code, iters]) => (
                      Object.values(iters).map((item, index) => (
                        <tr
                          key={`${code}-${item.iter}`}
                          className={item.accepted === 'YES' ? 'row-accepted' : item.accepted === 'ORIGINAL' ? 'row-original' : ''}
                        >
                          {index === 0 && (
                            <td rowSpan={Object.values(iters).length} className="td-code">
                              <strong>{item.code}</strong>
                              <br />
                              <small>{item.name}</small>
                            </td>
                          )}
                          <td>{item.iter === 0 ? '原始' : `第 ${item.iter} 轮`}</td>
                          <td><strong>{item.avg}%</strong></td>
                          <td className="td-samples">
                            <div className="sample-list">
                              {item.samples.slice(0, 3).map((sample, sampleIndex) => (
                                <span key={sampleIndex} className="sample-badge">{sample}</span>
                              ))}
                              {item.samples.length > 3 && <span>...等 {item.samples.length} 份</span>}
                            </div>
                          </td>
                          <td>
                            {item.accepted === 'YES' ? <Badge color="green" size="xs">已采纳</Badge>
                              : item.accepted === 'ORIGINAL' ? <Badge color="blue" size="xs">基准线</Badge>
                                : <Badge color="gray" size="xs">未采用</Badge>}
                          </td>
                          <td className="td-prompt">
                            <Tooltip label={item.prompt} multiline w={500} withArrow>
                              <div className="prompt-preview">{item.prompt}</div>
                            </Tooltip>
                          </td>
                        </tr>
                      ))
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="no-data">暂无优化轨迹数据，请确保运行了包含验证步骤的优化流程。</p>
            )}
          </div>

        </div>
      )}

      <div className="testbench-standalone">
        <div className="testbench-standalone-header">
          <span className="testbench-phase-label">独立 Prompt 优化</span>
          <span className="testbench-standalone-hint">已有关联文件？跳过提取直接优化</span>
        </div>
        <div className="testbench-standalone-row">
          <div className="testbench-standalone-upload">
            <UploadCard
              icon={<IconTableImport size={22} stroke={1.8} />}
              tag="EXCEL"
              title="关联对比文件"
              hint="上传阶段一导出的关联文件"
              acceptHint="需含 report_name、indicator_code、pdf_numbers、llm_text_value 列"
              buttonLabel="选择关联文件"
              accept=".xlsx,.xls,.csv"
              file={comparisonFile}
              onFileSelect={onSelectComparisonFile}
              onRemoveFile={onRemoveComparisonFile}
              formatFileInfo={(file) => file ? `${file.name} (${(file.size / 1024).toFixed(1)} KB)` : ''}
            />
          </div>
          <div className="testbench-standalone-action">
            <Button
              size="md"
              radius="xl"
              className="btn-primary btn-primary-mantine"
              disabled={!canStandaloneOptimize}
              onClick={onStartStandaloneOptimize}
              leftSection={<IconSparkles size={15} />}
            >
              {isRunning ? '优化中...' : '开始独立优化'}
            </Button>
            <Switch
              label="循环优化"
              checked={loopOptEnabled}
              onChange={(e) => onLoopOptChange(e.currentTarget.checked)}
              disabled={isRunning}
              size="sm"
            />
            <div className="opt-params">
              <NumberInput
                label="循环轮数"
                min={1}
                max={20}
                size="xs"
                style={{ width: 90 }}
                value={llm2Settings.maxOptIterations || 1}
                onChange={(val) => onChangeLlm2('maxOptIterations', Number(val) || 1)}
                disabled={!loopOptEnabled || isRunning}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
