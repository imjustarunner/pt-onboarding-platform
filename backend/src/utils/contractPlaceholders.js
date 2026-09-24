// Imported Markdown can turn underscores inside a merge field into emphasis:
// {{COMPANY<em>NAME}} ... {{ROLE</em>LABEL}}. Restore the merge fields before
// replacement AND validation, including the paired formatting outside a field.
export function normalizeContractPlaceholders(html) {
  const source = String(html || '');
  const fields = [...source.matchAll(/\{\{[^{}]*\}\}/g)].filter(([field]) =>
    /^[A-Za-z][A-Za-z0-9_\s]*$/.test(field.slice(2, -2).replace(/<\/?(?:em|strong|b|i|span)\b[^>]*>/gi, '').replace(/&nbsp;|&#160;/gi, ' ').trim())
  );
  const stacks = new Map();
  const removals = [];
  for (const match of source.matchAll(/<(\/?)(em|strong|b|i|span)\b[^>]*>/gi)) {
    const tag = { start: match.index, end: match.index + match[0].length,
      inside: fields.some(field => match.index >= field.index && match.index < field.index + field[0].length) };
    const key = match[2].toLowerCase();
    const stack = stacks.get(key) || [];
    stacks.set(key, stack);
    if (!match[1]) stack.push(tag);
    else {
      const opening = stack.pop();
      if (opening?.inside || tag.inside) {
        if (opening) removals.push(opening);
        removals.push(tag);
      }
    }
  }
  for (const stack of stacks.values()) for (const tag of stack) if (tag.inside) removals.push(tag);
  let normalized = source;
  for (const tag of removals.sort((a, b) => b.start - a.start)) normalized = normalized.slice(0, tag.start) + normalized.slice(tag.end);
  return normalized.replace(/\{\{([^{}]+)\}\}/g, (field, key) => {
    const name = key.replace(/&nbsp;|&#160;/gi, ' ').trim();
    return /^[A-Za-z][A-Za-z0-9_\s]*$/.test(name) ? `{{${name.replace(/\s+/g, '').toUpperCase()}}}` : field;
  });
}

export function findContractPlaceholders(html) {
  return [...new Set([...normalizeContractPlaceholders(html).matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)].map(match => match[1]))];
}
