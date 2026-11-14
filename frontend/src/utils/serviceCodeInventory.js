/** Add visual and text categories to code tables from the versioned catalog. */
export function decorateServiceCodeInventory(html, catalog) {
  if (!catalog?.codes?.length || typeof document === 'undefined') return html;
  const codes = new Map(catalog.codes.map(item => [String(item.code || '').toUpperCase(), item]));
  const template = document.createElement('template'); template.innerHTML = html;
  for (const row of template.content.querySelectorAll('table tr')) {
    const cell = row.querySelector('td:first-child,th:first-child');
    const code = cell?.textContent.trim().toUpperCase(), definition = codes.get(code);
    if (!cell || !definition) continue;
    const group = definition.requiredRole ? definition.bucket === 'credit' ? 'testing-evaluation' : 'testing-administration' : 'direct-care';
    const label = definition.requiredRole ? definition.bucket === 'credit' ? 'Testing evaluation' : 'Testing administration/scoring' : 'Direct Care';
    const badge = document.createElement('span');badge.className = `service-code-category-badge service-code-${group}`;
    badge.textContent = `${code} · ${label}`;cell.replaceChildren(badge);
  }
  return template.innerHTML;
}
