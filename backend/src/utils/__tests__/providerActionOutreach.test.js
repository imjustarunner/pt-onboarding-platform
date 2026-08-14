import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateSeconds,
  formatEstimateLabel,
  formatActiveDuration,
  pdfFilenameForProvider,
  normalizeActionToken,
  SECONDS_PER_CLIENT
} from '../providerActionOutreach.js';

describe('providerActionOutreach', () => {
  it('estimates 15 seconds per client', () => {
    assert.equal(SECONDS_PER_CLIENT, 15);
    assert.equal(estimateSeconds(16), 240);
    assert.equal(formatEstimateLabel(240), '~ 4 min');
  });

  it('names the pdf after the provider', () => {
    assert.equal(
      pdfFilenameForProvider({ firstName: 'Jane', lastName: 'Doe' }),
      'Doe_Jane_client-action.pdf'
    );
  });

  it('formats active time', () => {
    assert.equal(formatActiveDuration(12), '12s');
    assert.equal(formatActiveDuration(75), '1m 15s');
  });

  it('recovers tokens copied from a wrapped PDF URL', () => {
    const token = '6eb2365f7cc635c8911993c529942525';
    assert.equal(normalizeActionToken(token), token);
    assert.equal(
      normalizeActionToken(`https://plottwisthq.com/client-action/${token}`),
      token
    );
    assert.equal(normalizeActionToken(`https://plottwisthq.com/ca/${token}`), token);
    assert.equal(normalizeActionToken(`${token.slice(0, 16)}\n${token.slice(16)}`), token);
    assert.equal(normalizeActionToken(` ${token} `), token);
  });
});

describe('providerActionPdf links', () => {
  it('builds a square branded card with icons and the action URL', async () => {
    const {
      buildProviderActionPdfHtml,
      resolveProviderActionPdfAssets
    } = await import('../../services/providerActionPdf.service.js');
    const url = 'https://plottwisthq.com/ca/6eb2365f7cc635c8911993c529942525';
    const agency = { name: 'ITSCO', slug: 'itsco' };
    const assets = await resolveProviderActionPdfAssets({ agency });
    const html = buildProviderActionPdfHtml({
      firstName: 'Robin',
      clientCount: 1,
      secondsPerClient: 15,
      estimatedSeconds: 15,
      actionUrl: url,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      agency,
      assets
    });
    assert.match(html, /size:\s*8\.5in 8\.5in/);
    assert.match(html, /Action required/i);
    assert.match(html, /Open my clients/);
    assert.ok(html.includes(url));
    assert.ok(html.includes('hero-photo') || html.includes('hero-frame'));
    assert.ok(html.includes('metric-icon-img') || html.includes('metric-icon-wrap'));
    assert.ok(html.includes('school-art'));
    assert.ok(assets.heroDataUri.startsWith('data:image/'), 'hero asset should load from backend bundle');
    assert.ok(assets.iconTeam.startsWith('data:image/'), 'team icon should load from backend bundle');
  });

  it('embeds a real URI link for the Open my clients button', async () => {
    const { renderProviderActionPdf } = await import('../../services/providerActionPdf.service.js');
    const { PDFDocument } = await import('pdf-lib');
    const url = 'https://plottwisthq.com/ca/6eb2365f7cc635c8911993c529942525';
    const buf = await renderProviderActionPdf({
      firstName: 'Robin',
      clientCount: 1,
      secondsPerClient: 15,
      estimatedSeconds: 15,
      actionUrl: url,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString()
    });
    const raw = buf.toString('latin1');
    assert.ok(raw.includes('/URI'), 'PDF should contain a URI annotation');
    assert.ok(raw.includes(url), 'PDF should contain the action URL');
    const pdf = await PDFDocument.load(buf);
    const annots = pdf.getPages()[0].node.Annots();
    assert.ok(annots?.size() >= 1);
  });
});
