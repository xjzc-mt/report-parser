function normalizePageList(pages) {
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
  const ranges = [];

  if (sorted.length === 0) {
    return { pages: sorted, normalized: '' };
  }

  let start = sorted[0];
  let prev = sorted[0];

  for (let index = 1; index <= sorted.length; index += 1) {
    const current = sorted[index];
    if (current === prev + 1) {
      prev = current;
      continue;
    }

    ranges.push(start === prev ? String(start) : `${start}-${prev}`);
    start = current;
    prev = current;
  }

  return {
    pages: sorted,
    normalized: ranges.join(',')
  };
}

function makeInvalidPageResult() {
  return {
    valid: false,
    pages: [],
    normalized: '',
    error: '页码格式不正确，请使用 12、12-15、12,15 这类格式。'
  };
}

export function parsePromptIterationPageSpec(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return { valid: true, pages: [], normalized: '', error: '' };
  }

  const pages = [];
  for (const chunk of raw.split(',')) {
    const part = chunk.trim();
    if (!part) continue;

    if (part.includes('-')) {
      const [startRaw, endRaw, ...rest] = part.split('-').map((item) => item.trim());
      if (rest.length > 0) return makeInvalidPageResult();

      const start = Number.parseInt(startRaw, 10);
      const end = Number.parseInt(endRaw, 10);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end < start) {
        return makeInvalidPageResult();
      }

      for (let page = start; page <= end; page += 1) {
        pages.push(page);
      }
      continue;
    }

    const page = Number.parseInt(part, 10);
    if (!Number.isInteger(page) || page <= 0) {
      return makeInvalidPageResult();
    }
    pages.push(page);
  }

  const normalized = normalizePageList(pages);
  return { valid: true, pages: normalized.pages, normalized: normalized.normalized, error: '' };
}

export function extractJsonCandidate(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return { status: 'not_found', parsed: null, source: 'none' };
  }

  try {
    return { status: 'success', parsed: JSON.parse(raw), source: 'whole' };
  } catch (_) {
    // ignore whole-text parse failure and continue to structured fallback
  }

  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      return { status: 'success', parsed: JSON.parse(fenceMatch[1].trim()), source: 'fence' };
    } catch (_) {
      return { status: 'invalid', parsed: null, source: 'fence' };
    }
  }

  const bracketMatch = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (bracketMatch) {
    try {
      return { status: 'success', parsed: JSON.parse(bracketMatch[1]), source: 'snippet' };
    } catch (_) {
      return { status: 'invalid', parsed: null, source: 'snippet' };
    }
  }

  return { status: 'not_found', parsed: null, source: 'none' };
}

export function summarizeParsedJson(value) {
  if (Array.isArray(value)) {
    const first = value[0];
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      return `数组：${value.length} 项，首项 key 为 ${Object.keys(first).slice(0, 3).join(', ')}`;
    }
    return `数组：${value.length} 项`;
  }

  if (value && typeof value === 'object') {
    return `对象：${Object.keys(value).slice(0, 4).join(', ')}`;
  }

  return '基础类型';
}
