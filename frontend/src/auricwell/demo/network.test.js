import { expect, it, vi } from 'vitest';
import { installDemoNetworkBoundary, permittedDemoRequest } from './network.js';
const origin = 'https://auricwell.com';
const path = '/api/public/marketing-pages/auricwell/analytics/events';
it('allows only the exact anonymous analytics destination and method', () => {
  expect(permittedDemoRequest(path, { method: 'POST' }, origin)).toBe(true);
  for (const [url,method] of [['/api/clinical-notes/sign','POST'], ['/api/clients','GET'], ['https://example.com'+path,'POST'], [path+'?recipient=someone','POST'], [path,'GET']]) expect(permittedDemoRequest(url,{method},origin)).toBe(false);
});
it('removes credentials and arbitrary headers from analytics and blocks other live transports', async () => {
  const fetch = vi.fn(async () => ({ ok: true }));
  const window = { fetch, location: { origin }, navigator: { sendBeacon: vi.fn() }, XMLHttpRequest: class {}, WebSocket: class {}, EventSource: class {} };
  installDemoNetworkBoundary(window);
  await window.fetch(path, { method: 'POST', credentials: 'include', headers: { Authorization: 'example-private-token' }, body: '{}' });
  expect(fetch).toHaveBeenCalledWith(path, expect.objectContaining({ credentials: 'omit', headers: { 'Content-Type': 'application/json' } }));
  await expect(window.fetch('/api/clinical-notes/drafts/1/sign', { method: 'POST' })).rejects.toThrow('Demo only');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(() => new window.XMLHttpRequest().open('POST','/api/sign')).toThrow();
  expect(window.navigator.sendBeacon('/api/sign','private')).toBe(false);
  expect(() => new window.WebSocket('wss://example.com')).toThrow();
});
