// Native details retain click, touch and keyboard behavior without a menu library.
export function initializeWebsiteNavigation(doc = document, browser = window) {
  const menus = [...doc.querySelectorAll('[data-feature-menu]')];
  for (const menu of menus) {
    menu.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse' && browser.matchMedia('(min-width: 1051px)').matches) menu.open = true;
    });
    menu.addEventListener('pointerleave', () => {
      if (!menu.contains(doc.activeElement)) menu.open = false;
    });
    menu.addEventListener('focusout', () => {
      browser.setTimeout(() => { if (!menu.contains(doc.activeElement)) menu.open = false; }, 0);
    });
  }
  doc.addEventListener('click', event => {
    for (const menu of menus) {
      if (!menu.contains(event.target) || event.target.closest('a')) menu.open = false;
    }
    if (event.target.closest('.mobile-menu a')) doc.querySelector('.mobile-menu')?.removeAttribute('open');
  });
  doc.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const open = menus.find(menu => menu.open && menu.contains(doc.activeElement));
    if (open) { open.open = false; open.querySelector('summary')?.focus(); event.preventDefault(); }
    else {
      const mobile = doc.querySelector('.mobile-menu[open]');
      if (mobile) { mobile.open = false; mobile.querySelector('summary')?.focus(); event.preventDefault(); }
    }
  });
}
