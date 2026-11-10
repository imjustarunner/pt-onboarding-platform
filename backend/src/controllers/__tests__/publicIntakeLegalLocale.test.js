import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveRequestedMasterLanguage } from '../../utils/schoolIntakeMasterLanguage.js';

const source = fs.readFileSync(new URL('../publicIntake.controller.js', import.meta.url), 'utf8');
function load(name, next, deps, exported = true) {
  const start = source.indexOf(`${exported ? 'export const' : 'function'} ${name}`);
  const body = source.slice(start, source.indexOf(next, start)).replace(/^export /, '');
  return new Function(...Object.keys(deps), `${body}; return ${name};`)(...Object.values(deps));
}
const wrapPublicLegalHtml = load('wrapPublicLegalHtml', 'export const viewPublicPacketSectionHtml', {}, false);
const buildPacketSectionSignedHtml = load('buildPacketSectionSignedHtml', 'async function validatePacketEditionsBeforeSubmission', { sectionTitle: () => 'Agreement' }, false);

for (const [name, next, disclosure] of [
  ['getPublicIntakePacketSection', 'function wrapPublicLegalHtml', false],
  ['viewPublicPacketSectionHtml', 'export const viewPublicDocumentVersionHtml', false],
  ['getPublicIntakeDisclosureContext', 'export const viewPublicDisclosureHtml', true],
  ['viewPublicDisclosureHtml', 'export const ', true]
]) {
  for (const locale of ['es', 'en']) test(`${name} respects the selected ${locale} edition of an English office link`, async () => {
    const requests = [];
    const deps = {
      resolvePublicIntakeContext: async () => ({ link: { is_active: true, language_code: 'en' } }),
      resolveIntakeOrgContext: async () => ({ organization: { id: 2, organization_type: 'agency' }, agency: { id: 2, name: 'Example Agency' } }),
      linkLooksLikeOfficeIntake: () => true,
      resolveRequestedMasterLanguage,
      applyAgencyMastersReadOnly: async link => link,
      buildPacketSectionContext: async args => { requests.push(args); return { ...args, html: `<p>${args.locale}</p>`, contentHash: `${args.locale}-hash`, packetVersion: 4 }; },
      buildSmartDisclosureContext: async args => { requests.push(args); return { locale: args.locale }; },
      buildSmartDisclosureHtml: ({ disclosureContext }) => `<p>${disclosureContext.locale}</p>`,
      sectionTitle: (_key, language) => language === 'es' ? 'Acuerdo' : 'Agreement',
      wrapPublicLegalHtml
    };
    // The next export marker needs to be searched past this export declaration.
    const following = next === 'export const ' ? source.slice(source.indexOf('export const viewPublicDisclosureHtml') + 20).match(/export const \w+/)?.[0] : next;
    const endpoint = load(name, following, deps);
    let result;
    const res = { setHeader: () => {}, json: value => { result = value; }, send: value => { result = value; } };
    await endpoint({ params: { publicKey: 'synthetic', sectionKey: 'policy_services' }, query: { locale, variant: 'parent' } }, res, error => { throw error; });
    assert.equal(requests[0].locale, locale);
    if (!disclosure) { assert.equal(requests[0].office, true); assert.equal(requests[0].variant, 'parent'); }
    if (name === 'viewPublicPacketSectionHtml') assert.match(result, new RegExp(`<html lang="${locale}">`));
  });
}

test('signed consent PDF uses the selected canonical edition and rejects a stale acknowledgment', () => {
  const context = { title: 'Acuerdo firmado', html: '<p>Términos revisados en español</p>', locale: 'es', contentHash: 'es-hash', packetVersion: 4 };
  const html = buildPacketSectionSignedHtml({
    sectionContext: context,
    response: { title: 'Untrusted title', snapshotHtml: '<p>Untrusted HTML</p>', contentHash: 'es-hash', packetVersion: 4, signatureData: 'demo-signature', signerName: 'Demo Example' },
    signedAt: new Date('2026-11-02T12:00:00Z')
  });
  assert.match(html, /Términos revisados en español/);
  assert.match(html, /Acuerdo firmado/);
  assert.doesNotMatch(html, /Untrusted/);
  assert.throws(() => buildPacketSectionSignedHtml({ sectionContext: context, response: { contentHash: 'previous-hash' } }), { status: 409 });
  assert.throws(() => buildPacketSectionSignedHtml({ sectionContext: context, response: { contentHash: 'es-hash', packetVersion: 3 } }), { status: 409 });
});
