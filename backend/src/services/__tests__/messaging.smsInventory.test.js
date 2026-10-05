import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
const root = fileURLToPath(new URL('../../', import.meta.url));
function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '__tests__') return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith('.js') ? [path] : [];
  });
}
describe('SMS producer inventory', () => {
  it('keeps direct provider delivery confined to the guarded transport', () => {
    const senders = sourceFiles(root).filter((path) => /vonage\.sms\.send\(/.test(readFileSync(path, 'utf8')));
    expect(senders.map((path) => path.slice(root.length))).toEqual(['services/vonage.service.js']);
  });
  it('requires an explicit purpose at every inline SMS call site', () => {
    const missing = sourceFiles(root).flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return [...source.matchAll(/VonageService\.sendSms\(\{([^}]*?)/g)]
        .filter((match) => !/^\s*purpose:/.test(source.slice(match.index + 'VonageService.sendSms({'.length)))
        .map(() => path.slice(root.length));
    });
    expect(missing).toEqual([]);
  });
  it('runs control keywords before event and clinical routing', () => {
    const source = readFileSync(join(root, 'controllers/vonageWebhook.controller.js'), 'utf8');
    const handler = source.slice(source.indexOf('export const inboundSmsWebhook'));
    expect(handler.indexOf('await processSmsKeyword')).toBeLessThan(handler.indexOf('await handleCompanyEventInbound'));
    expect(handler.indexOf('await processSmsKeyword')).toBeLessThan(handler.indexOf('if (route.skipClinicalInbox)'));
    expect(source).not.toContain("source: 'inbound_message'");
  });
});
