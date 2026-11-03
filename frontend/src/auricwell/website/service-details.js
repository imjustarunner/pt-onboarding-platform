// Native disclosures work by click/keyboard. Deep links reveal the requested
// service before scrolling, including when that same shortcut is selected again.
export function initializeManagementServices(doc = document, browser = window) {
  const panels = [...doc.querySelectorAll('[data-management-service]')];
  if (!panels.length) return;
  const reveal = hash => {
    const panel = panels.find(item => '#' + item.id === hash);
    if (!panel) return;
    for (const item of panels) item.open = item === panel;
    browser.requestAnimationFrame(() => panel.scrollIntoView({ block: 'start' }));
  };
  for (const panel of panels) panel.addEventListener('toggle', () => {
    if (panel.open) for (const other of panels) if (other !== panel) other.open = false;
  });
  browser.addEventListener('hashchange', () => reveal(browser.location.hash));
  doc.addEventListener('click', event => {
    const link = event.target.closest('[data-management-link]');
    if (!link) return;
    const target = new URL(link.href, browser.location.href);
    if (target.origin === browser.location.origin && target.pathname === browser.location.pathname) reveal(target.hash);
  });
  reveal(browser.location.hash);
}
