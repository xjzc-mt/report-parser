import { parseExcel } from './fileParsers.js';
import * as repository from './promptOptimizationRepository.js';
import { createPromptAsset, createPromptVersion } from '../utils/promptOptimizationModel.js';

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeImportRow(row = {}) {
  return {
    indicatorCode: normalizeString(row.indicator_code || row.indicatorCode),
    indicatorName: normalizeString(row.indicator_name || row.indicatorName),
    systemPrompt: normalizeString(row.system_prompt || row.systemPrompt),
    userPromptTemplate: normalizeString(row.user_prompt || row.userPrompt || row.prompt || row.original_prompt),
    outputContract: normalizeString(row.output_contract || row.outputContract),
    notes: normalizeString(row.notes)
  };
}

function versionMatchesRow(version, row) {
  if (!version) {
    return false;
  }

  return normalizeString(version.systemPrompt) === row.systemPrompt &&
    normalizeString(version.userPromptTemplate) === row.userPromptTemplate &&
    normalizeString(version.outputContract) === row.outputContract &&
    normalizeString(version.notes) === row.notes;
}

function assetMetadataMatchesRow(asset, row) {
  return normalizeString(asset?.indicatorCode) === row.indicatorCode &&
    normalizeString(asset?.indicatorName) === row.indicatorName &&
    normalizeString(asset?.name) === (row.indicatorName || row.indicatorCode) &&
    normalizeString(asset?.targetName) === (row.indicatorName || row.indicatorCode);
}

function formatDateTime(timestamp) {
  if (!timestamp) {
    return '';
  }

  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

export function buildPromptAssetLibraryEntries(assets = [], versions = []) {
  const versionGroups = new Map();

  for (const version of versions) {
    const assetId = normalizeString(version?.assetId);
    if (!assetId) {
      continue;
    }

    if (!versionGroups.has(assetId)) {
      versionGroups.set(assetId, []);
    }
    versionGroups.get(assetId).push(version);
  }

  return assets
    .map((asset) => {
      const assetVersions = [...(versionGroups.get(asset.id) || [])].sort(
        (left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0)
      );
      const latestVersion = assetVersions.find((item) => item.id === asset.latestVersionId) || assetVersions[0] || null;

      return {
        asset,
        latestVersion,
        versions: assetVersions
      };
    })
    .sort((left, right) => {
      const leftUpdatedAt = Number(left.asset?.updatedAt || 0);
      const rightUpdatedAt = Number(right.asset?.updatedAt || 0);
      return rightUpdatedAt - leftUpdatedAt;
    });
}

export function buildPromptAssetExportSheets(entries = []) {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const assets = normalizedEntries.map((entry) => ({
    asset_id: entry.asset.id,
    indicator_code: entry.asset.indicatorCode || '',
    indicator_name: entry.asset.indicatorName || entry.asset.name || '',
    latest_version_id: entry.asset.latestVersionId || '',
    latest_version_label: entry.latestVersion?.label || '',
    latest_source_type: entry.latestVersion?.sourceType || '',
    latest_system_prompt: entry.latestVersion?.systemPrompt || '',
    latest_user_prompt: entry.latestVersion?.userPromptTemplate || '',
    updated_at: formatDateTime(entry.asset.updatedAt)
  }));

  const versions = normalizedEntries.flatMap((entry) => (
    (entry.versions || []).map((version) => ({
      asset_id: entry.asset.id,
      indicator_code: entry.asset.indicatorCode || '',
      indicator_name: entry.asset.indicatorName || entry.asset.name || '',
      version_id: version.id,
      label: version.label || '',
      source_type: version.sourceType || '',
      parent_version_id: version.parentVersionId || '',
      system_prompt: version.systemPrompt || '',
      user_prompt: version.userPromptTemplate || '',
      output_contract: version.outputContract || '',
      notes: version.notes || '',
      is_current: entry.asset.latestVersionId === version.id ? '是' : '否',
      created_at: formatDateTime(version.createdAt)
    }))
  ));

  return { assets, versions };
}

export function findPromptAssetEntryByIndicatorCode(entries = [], indicatorCode) {
  const normalizedCode = normalizeString(indicatorCode);
  if (!normalizedCode) {
    return null;
  }

  return entries.find((entry) => normalizeString(entry?.asset?.indicatorCode) === normalizedCode) || null;
}

export function resolvePromptAssetBaseline({
  indicatorCode,
  promptAssetEntries = [],
  comparisonRows = []
} = {}) {
  const entry = findPromptAssetEntryByIndicatorCode(promptAssetEntries, indicatorCode);
  const latestVersion = entry?.latestVersion || null;

  if (latestVersion?.userPromptTemplate) {
    return {
      source: 'library',
      assetEntry: entry,
      asset: entry?.asset || null,
      version: latestVersion,
      systemPrompt: normalizeString(latestVersion.systemPrompt),
      userPromptTemplate: normalizeString(latestVersion.userPromptTemplate)
    };
  }

  const comparisonPrompt = normalizeString(
    comparisonRows.find((row) => normalizeString(row?.indicator_code) === normalizeString(indicatorCode) && normalizeString(row?.prompt))?.prompt
  );

  if (comparisonPrompt) {
    return {
      source: 'comparison_file',
      assetEntry: entry,
      asset: entry?.asset || null,
      version: latestVersion,
      systemPrompt: normalizeString(latestVersion?.systemPrompt),
      userPromptTemplate: comparisonPrompt
    };
  }

  return {
    source: 'missing',
    assetEntry: entry,
    asset: entry?.asset || null,
    version: latestVersion,
    systemPrompt: normalizeString(latestVersion?.systemPrompt),
    userPromptTemplate: ''
  };
}

export function buildPromptIterationSeed({
  assetId = '',
  versionId = '',
  indicatorCode = '',
  indicatorName = '',
  systemPrompt = '',
  userPrompt = ''
} = {}) {
  return {
    name: normalizeString(indicatorName || indicatorCode),
    systemPrompt: normalizeString(systemPrompt),
    userPrompt: normalizeString(userPrompt),
    promptAssetId: normalizeString(assetId),
    promptVersionId: normalizeString(versionId),
    promptIndicatorCode: normalizeString(indicatorCode)
  };
}

export async function listPromptAssetLibraryEntries(deps = {}) {
  const repo = deps.repository ?? repository;
  const [assets, versions] = await Promise.all([
    repo.listPromptAssets?.() ?? [],
    repo.listPromptVersions?.() ?? []
  ]);

  return buildPromptAssetLibraryEntries(assets, versions);
}

async function resolvePromptAssetByReference({ assetId, indicatorCode }, repo) {
  if (assetId) {
    return repo.getPromptAsset?.(assetId) ?? null;
  }

  const normalizedCode = normalizeString(indicatorCode);
  if (!normalizedCode) {
    return null;
  }

  const assets = await (repo.listPromptAssets?.() ?? []);
  return assets.find((item) => normalizeString(item?.indicatorCode) === normalizedCode) || null;
}

export async function savePromptAssetVersion(raw = {}, deps = {}) {
  const repo = deps.repository ?? repository;
  const now = deps.now?.() ?? Date.now();
  const systemPrompt = normalizeString(raw.systemPrompt);
  const userPromptTemplate = normalizeString(raw.userPromptTemplate || raw.userPrompt);
  const indicatorCode = normalizeString(raw.indicatorCode);
  const indicatorName = normalizeString(raw.indicatorName);

  if (!userPromptTemplate) {
    throw new Error('写入 Prompt 资产库时缺少用户提示词');
  }

  let asset = await resolvePromptAssetByReference({
    assetId: normalizeString(raw.assetId),
    indicatorCode
  }, repo);

  if (!asset) {
    if (!indicatorCode) {
      throw new Error('创建新的 Prompt 资产前，需要先提供指标编码');
    }

    asset = createPromptAsset({
      name: indicatorName || indicatorCode,
      targetName: indicatorName || indicatorCode,
      indicatorCode,
      indicatorName
    }, deps);
  } else {
    asset = createPromptAsset({
      ...asset,
      name: indicatorName || asset.name || indicatorCode,
      targetName: indicatorName || asset.targetName || indicatorCode,
      indicatorCode: indicatorCode || asset.indicatorCode,
      indicatorName: indicatorName || asset.indicatorName,
      createdAt: asset.createdAt,
      updatedAt: now
    }, deps);
  }

  const latestVersion = asset.latestVersionId
    ? await repo.getPromptVersion?.(asset.latestVersionId)
    : null;
  const nextVersionInput = {
    systemPrompt,
    userPromptTemplate,
    outputContract: normalizeString(raw.outputContract),
    notes: normalizeString(raw.notes)
  };

  if (versionMatchesRow(latestVersion, nextVersionInput)) {
    await repo.savePromptAsset?.(asset);
    return {
      asset,
      version: latestVersion,
      createdVersion: false
    };
  }

  const version = createPromptVersion({
    assetId: asset.id,
    label: normalizeString(raw.label) || '手动更新版本',
    systemPrompt,
    userPromptTemplate,
    outputContract: nextVersionInput.outputContract,
    notes: nextVersionInput.notes,
    sourceType: normalizeString(raw.sourceType) || 'manual',
    parentVersionId: latestVersion?.id || ''
  }, deps);

  asset = createPromptAsset({
    ...asset,
    latestVersionId: version.id,
    createdAt: asset.createdAt,
    updatedAt: now
  }, deps);

  await repo.savePromptVersion?.(version);
  await repo.savePromptAsset?.(asset);

  return {
    asset,
    version,
    createdVersion: true
  };
}

export async function rollbackPromptAssetToVersion({ assetId, versionId }, deps = {}) {
  const repo = deps.repository ?? repository;
  const asset = await repo.getPromptAsset?.(normalizeString(assetId));
  const version = await repo.getPromptVersion?.(normalizeString(versionId));

  if (!asset) {
    throw new Error('未找到对应的 Prompt 资产');
  }
  if (!version || normalizeString(version.assetId) !== normalizeString(asset.id)) {
    throw new Error('未找到可回退的 Prompt 版本');
  }

  const nextAsset = createPromptAsset({
    ...asset,
    latestVersionId: version.id,
    createdAt: asset.createdAt,
    updatedAt: deps.now?.() ?? Date.now()
  }, deps);
  await repo.savePromptAsset?.(nextAsset);

  return {
    asset: nextAsset,
    version
  };
}

export async function deletePromptAssetVersion({ assetId, versionId }, deps = {}) {
  const repo = deps.repository ?? repository;
  const asset = await repo.getPromptAsset?.(normalizeString(assetId));
  const version = await repo.getPromptVersion?.(normalizeString(versionId));

  if (!asset) {
    throw new Error('未找到对应的 Prompt 资产');
  }
  if (!version || normalizeString(version.assetId) !== normalizeString(asset.id)) {
    throw new Error('未找到待删除的 Prompt 版本');
  }
  if (normalizeString(asset.latestVersionId) === normalizeString(version.id)) {
    throw new Error('当前基线版本不能直接删除，请先回退到其他版本');
  }

  await repo.deletePromptVersion?.(version.id);
  return { deletedVersionId: version.id };
}

export async function importPromptAssetRows(rows = [], deps = {}) {
  const repo = deps.repository ?? repository;
  const entries = await listPromptAssetLibraryEntries({ repository: repo });

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let invalidCount = 0;

  for (const rawRow of Array.isArray(rows) ? rows : []) {
    const row = normalizeImportRow(rawRow);
    if (!row.indicatorCode || !row.userPromptTemplate) {
      invalidCount += 1;
      continue;
    }

    const existingEntry = findPromptAssetEntryByIndicatorCode(entries, row.indicatorCode);
    let asset = existingEntry?.asset || null;

    if (!asset) {
      const version = createPromptVersion({
        assetId: '',
        label: '导入初始版本',
        systemPrompt: row.systemPrompt,
        userPromptTemplate: row.userPromptTemplate,
        outputContract: row.outputContract,
        notes: row.notes,
        sourceType: 'imported'
      }, deps);
      asset = createPromptAsset({
        name: row.indicatorName || row.indicatorCode,
        targetName: row.indicatorName || row.indicatorCode,
        indicatorCode: row.indicatorCode,
        indicatorName: row.indicatorName,
        latestVersionId: version.id
      }, deps);
      version.assetId = asset.id;

      await repo.savePromptAsset?.(asset);
      await repo.savePromptVersion?.(version);
      entries.unshift({
        asset,
        latestVersion: version,
        versions: [version]
      });
      createdCount += 1;
      continue;
    }

    const latestVersion = existingEntry?.latestVersion || null;
    if (versionMatchesRow(latestVersion, row)) {
      if (!assetMetadataMatchesRow(asset, row)) {
        const nextAsset = createPromptAsset({
          ...asset,
          name: row.indicatorName || asset.name || row.indicatorCode,
          targetName: row.indicatorName || asset.targetName || row.indicatorCode,
          indicatorCode: row.indicatorCode,
          indicatorName: row.indicatorName || asset.indicatorName,
          createdAt: asset.createdAt,
          updatedAt: deps.now?.() ?? Date.now()
        }, deps);
        await repo.savePromptAsset?.(nextAsset);
        const entryIndex = entries.findIndex((entry) => entry.asset.id === asset.id);
        if (entryIndex >= 0) {
          entries[entryIndex] = {
            ...existingEntry,
            asset: nextAsset
          };
        }
        updatedCount += 1;
      } else {
        skippedCount += 1;
      }
      continue;
    }

    const nextVersion = createPromptVersion({
      assetId: asset.id,
      label: '导入更新版本',
      systemPrompt: row.systemPrompt,
      userPromptTemplate: row.userPromptTemplate,
      outputContract: row.outputContract,
      notes: row.notes,
      sourceType: 'imported',
      parentVersionId: latestVersion?.id || ''
    }, deps);

    const nextAsset = createPromptAsset({
      ...asset,
      name: row.indicatorName || asset.name || row.indicatorCode,
      targetName: row.indicatorName || asset.targetName || row.indicatorCode,
      indicatorCode: row.indicatorCode,
      indicatorName: row.indicatorName || asset.indicatorName,
      latestVersionId: nextVersion.id,
      createdAt: asset.createdAt,
      updatedAt: deps.now?.() ?? Date.now()
    }, deps);

    await repo.savePromptVersion?.(nextVersion);
    await repo.savePromptAsset?.(nextAsset);

    const nextEntry = {
      asset: nextAsset,
      latestVersion: nextVersion,
      versions: [nextVersion, ...(existingEntry?.versions || [])]
    };
    const entryIndex = entries.findIndex((entry) => entry.asset.id === asset.id);
    if (entryIndex >= 0) {
      entries[entryIndex] = nextEntry;
    } else {
      entries.unshift(nextEntry);
    }
    updatedCount += 1;
  }

  return {
    createdCount,
    updatedCount,
    skippedCount,
    invalidCount,
    entries
  };
}

export async function importPromptAssetFile(file, deps = {}) {
  const rows = await (deps.parseRows ?? parseExcel)(file);
  return importPromptAssetRows(rows, deps);
}
