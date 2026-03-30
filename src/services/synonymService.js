// 同义词映射服务
let synonymMap = new Map();

/**
 * 加载同义词映射表
 * @param {Array<{term1: string, term2: string}>} rows - Excel 解析后的行数据
 */
export function loadSynonyms(rows) {
  synonymMap.clear();
  for (const row of rows) {
    const t1 = String(row.term1 || '').trim();
    const t2 = String(row.term2 || '').trim();
    if (!t1 || !t2) continue;

    // 双向映射
    if (!synonymMap.has(t1)) synonymMap.set(t1, new Set());
    if (!synonymMap.has(t2)) synonymMap.set(t2, new Set());
    synonymMap.get(t1).add(t2);
    synonymMap.get(t2).add(t1);
  }
}

/**
 * 判断两个词是否为同义词
 */
export function areSynonyms(str1, str2) {
  if (!str1 || !str2) return false;
  const s1 = String(str1).trim();
  const s2 = String(str2).trim();
  if (s1 === s2) return true;

  const syns = synonymMap.get(s1);
  return syns ? syns.has(s2) : false;
}

/**
 * 计算字段相似度（0-100）
 * @param {boolean} useLlmBased - 仅对 text 类型生效，使用 LLM 评估的相似度
 */
export function calculateFieldSimilarity(val1, val2, fieldType = 'text', useLlmBased = false, llmSim = null) {
  const v1 = String(val1 || '').trim();
  const v2 = String(val2 || '').trim();

  if (!v1 || !v2 || v1 === '未披露' || v2 === '未披露') return 0;
  if (v1 === v2) return 100;

  // 数值型：转换为数字比较，只返回0或100
  if (fieldType === 'numeric') {
    const n1 = parseFloat(v1);
    const n2 = parseFloat(v2);
    if (!isNaN(n1) && !isNaN(n2)) {
      return n1 === n2 ? 100 : 0;
    }
    return 0;
  }

  // 页码、单位等：精确匹配或同义词，只返回0或100
  if (fieldType === 'exact') {
    return areSynonyms(v1, v2) ? 100 : 0;
  }

  // 文本型（text_value）：根据 useLlmBased 选择计算方式
  if (useLlmBased && llmSim !== null && llmSim !== undefined) {
    return llmSim;
  }

  // 基于测试集：同义词检查 + 包含关系 + 字符相似度
  if (areSynonyms(v1, v2)) return 100;

  // 检查包含关系：如果v1完全包含在v2中，或v2完全包含在v1中，则100%
  if (v2.includes(v1) || v1.includes(v2)) return 100;

  // 字符相似度：计算共同字符占测试集（较短文本）的比例
  const chars1 = v1.split('');
  const chars2 = new Set(v2.split(''));
  const common = chars1.filter(c => chars2.has(c)).length;
  return Math.round((common / v1.length) * 100);
}
