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
  it('builds a portrait phone card with a stamped URI tap target', async () => {
    const { renderProviderActionPdf, PAGE } = await import('../../services/providerActionPdf.service.js');
    const { PDFDocument } = await import('pdf-lib');
    const url = 'https://plottwisthq.com/ca/6eb2365f7cc635c8911993c529942525';
    const buf = await renderProviderActionPdf({
      firstName: 'Robin',
      clientCount: 1,
      secondsPerClient: 15,
      estimatedSeconds: 15,
      actionUrl: url,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      agency: { name: 'ITSCO', slug: 'itsco' }
    });
    const header = buf.slice(0, 8).toString('ascii');
    assert.ok(header.startsWith('%PDF-'), `PDF should start with %PDF- but got: ${header}`);
    assert.ok(buf.slice(-80).toString('ascii').includes('%%EOF'), 'PDF should end with %%EOF');

    const raw = buf.toString('latin1');
    assert.ok(raw.includes('/URI'), 'PDF should contain a URI annotation');
    assert.ok(raw.includes(url), 'PDF should contain the action URL');

    const pdf = await PDFDocument.load(buf);
    const page = pdf.getPages()[0];
    const { width, height } = page.getSize();
    assert.ok(Math.abs(width - PAGE.widthPt) < 4, `expected width ~${PAGE.widthPt}, got ${width}`);
    assert.ok(Math.abs(height - PAGE.heightPt) < 4, `expected height ~${PAGE.heightPt}, got ${height}`);
    assert.ok(height > width, 'page should be portrait for phones');
    const annots = page.node.Annots();
    assert.ok(annots?.size() >= 1, 'should stamp at least one link annotation');
  });
});
