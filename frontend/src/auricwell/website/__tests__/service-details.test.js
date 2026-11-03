import { describe, expect, it, vi } from 'vitest';
import { renderWebsite } from '../render.mjs';
import { initializeManagementServices } from '../service-details.js';

describe('management service disclosures', () => {
  it('opens the deep-linked service, switches with navigation, and reopens the same shortcut', () => {
    const doc = new DOMParser().parseFromString(renderWebsite('about'), 'text/html');
    doc.head.insertAdjacentHTML('afterbegin', '<base href="https://auricwell.com">');
    const handlers = {};
    const browser = { location: new URL('https://auricwell.com/about#service-billing'),
      addEventListener: (event, fn) => { handlers[event] = fn; }, requestAnimationFrame: fn => fn() };
    const panels = [...doc.querySelectorAll('[data-management-service]')];
    for (const panel of panels) panel.scrollIntoView = vi.fn();
    initializeManagementServices(doc, browser);
    expect(panels.filter(panel => panel.open).map(panel => panel.id)).toEqual(['service-billing']);
    expect(panels[0].scrollIntoView).toHaveBeenCalledWith({block:'start'});
    browser.location.hash = '#service-credentialing'; handlers.hashchange();
    expect(panels.filter(panel => panel.open).map(panel => panel.id)).toEqual(['service-credentialing']);
    panels[1].open = false;
    doc.querySelector('.practice-help a[href="/about#service-credentialing"]').dispatchEvent(new MouseEvent('click', {bubbles:true}));
    expect(panels[1].open).toBe(true);
    panels[2].open = true; panels[2].dispatchEvent(new Event('toggle'));
    expect(panels.filter(panel => panel.open).map(panel => panel.id)).toEqual(['service-people-operations']);
  });
  it('keeps unrelated and malformed hashes from selecting a service', () => {
    const doc = new DOMParser().parseFromString(renderWebsite('about'), 'text/html');
    const browser = { location: new URL('https://auricwell.com/about#service-unknown'), addEventListener: vi.fn(), requestAnimationFrame: vi.fn() };
    initializeManagementServices(doc, browser);
    expect(doc.querySelectorAll('[data-management-service][open]')).toHaveLength(0);
    expect(browser.requestAnimationFrame).not.toHaveBeenCalled();
  });
});
