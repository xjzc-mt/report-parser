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

function parseStrictPageToken(token) {
  if (!/^[1-9]\d*(?:-[1-9]\d*)?$/.test(token)) {
    return null;
  }

  const [startRaw, endRaw] = token.split('-');
  const start = Number(startRaw);
  const end = endRaw === undefined ? start : Number(endRaw);

  if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end < start) {
    return null;
  }

  return { start, end };
}

export function parsePromptIterationPageSpec(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return { valid: true, pages: [], normalized: '', error: '' };
  }

  const pages = [];
  for (const chunk of raw.split(',')) {
    const part = chunk.trim();
    if (!part) {
      return makeInvalidPageResult();
    }

    const token = parseStrictPageToken(part);
    if (!token) {
      return makeInvalidPageResult();
    }

    for (let page = token.start; page <= token.end; page += 1) {
      pages.push(page);
    }
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

  const fencePattern = /```([^\n`]*)\n([\s\S]*?)```/g;
  let sawJsonFence = false;
  for (const match of raw.matchAll(fencePattern)) {
    const lang = match[1].trim().toLowerCase();
    if (lang !== 'json') {
      continue;
    }

    sawJsonFence = true;
    try {
      return { status: 'success', parsed: JSON.parse(match[2].trim()), source: 'fence' };
    } catch (_) {
      // keep scanning later json fences
    }
  }

  const fragmentCandidate = extractFirstJsonFragment(raw);
  if (fragmentCandidate !== null) {
    try {
      return { status: 'success', parsed: JSON.parse(fragmentCandidate), source: 'fragment' };
    } catch (_) {
      return { status: 'invalid', parsed: null, source: 'fragment' };
    }
  }

  if (sawJsonFence) {
    return { status: 'invalid', parsed: null, source: 'fence' };
  }

  return { status: 'not_found', parsed: null, source: 'none' };
}

function extractFirstJsonFragment(text) {
  const firstOpen = text.search(/[\[{]/);
  if (firstOpen === -1) {
    return null;
  }

  const open = text[firstOpen];
  const close = open === '{' ? '}' : ']';
  const stack = [close];
  let inString = false;
  let escaped = false;

  for (let index = firstOpen + 1; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      stack.push('}');
      continue;
    }

    if (char === '[') {
      stack.push(']');
      continue;
    }

    if (char === '}' || char === ']') {
      const expected = stack[stack.length - 1];
      if (char !== expected) {
        return text.slice(firstOpen);
      }

      stack.pop();
      if (stack.length === 0) {
        return text.slice(firstOpen, index + 1);
      }
    }
  }

  return text.slice(firstOpen);
}

export function summarizeParsedJson(value) {
  if (Array.isArray(value)) {
    const first = value[0];
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      return `数组：${value.length} 项，首项 key 为 ${Object.keys(first).join(', ')}`;
    }
    return `数组：${value.length} 项`;
  }

  if (value && typeof value === 'object') {
    return `对象：${Object.keys(value).join(', ')}`;
  }

  return '基础类型';
}
