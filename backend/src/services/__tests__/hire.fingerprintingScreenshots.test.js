import { beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ bytes: Buffer.from('synthetic screenshot fixture'), sha: '230408060fc9812060f74799830d3e19fd6bb63664abf30b7bbead186a674016' }));
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../../../frontend/src/navigation/hireFingerprintingScreenshots.js', async original => {
 const actual = await original();
 return { ...actual, FINGERPRINTING_SCREENSHOTS: [...actual.FINGERPRINTING_SCREENSHOTS, { sha256: fixture.sha, caption: 'Synthetic fixture' }] };
});
import { FINGERPRINTING_SCREENSHOTS, addFingerprintingScreenshots } from '../../../../frontend/src/navigation/hireFingerprintingScreenshots.js';
import { loadHireFingerprintingGuide, readHireFingerprintingScreenshot } from '../hireFingerprintingGuide.service.js';
let db, bucket, download, file;
beforeEach(() => {
 db = { execute: vi.fn(async () => [[{ id: 9000 }]]) };
 download = vi.fn(async () => [fixture.bytes]); file = vi.fn(() => ({ download })); bucket = { file };
});
it('adds all nine originals beside their matching instructions and never duplicates them', async () => {
 const images = FINGERPRINTING_SCREENSHOTS.filter(item => item.originalSequence);
 const body = [...new Set(images.map(item => item.stepTitle))].map(title => '<li><h3>' + title + '</h3><p>Instruction preserved.</p></li>').join('');
 const html = '<ol>' + body + '</ol>';
 db.execute.mockResolvedValue([[{ module_id: 1, content_type: 'text', content_data: { content: html } }]]);
 const guide = await loadHireFingerprintingGuide(9000, db);
 expect(guide.html.match(/data-fingerprinting-screenshot=/g)).toHaveLength(9);
 for (const image of images) expect(guide.html).toContain(image.sha256);
 expect(guide.html.match(/Instruction preserved\./g)).toHaveLength(8);
 expect(addFingerprintingScreenshots(guide.html)).toBe(guide.html);
 expect(guide.revision).toMatch(/^[a-f0-9]{64}$/);
});
it('keeps safe inline and library image blocks while removing active image content', async () => {
 db.execute.mockResolvedValue([[{ module_id: 1, content_type: 'text', content_data: { content: '<p>Guide</p><img src="https://example.invalid/inline.png" onerror="evil()"><img src="javascript:evil()"><script>evil()</script>' } }, { module_id: 1, content_type: 'image', content_data: { imageUrl: 'https://example.invalid/block.png', alt: 'Library screenshot' } }]]);
 const guide = await loadHireFingerprintingGuide(9000, db);
 expect(guide.html).toContain('https://example.invalid/inline.png');expect(guide.html).toContain('https://example.invalid/block.png');
 expect(guide.html).not.toMatch(/onerror|javascript:|<script/i);
});
it('reads only the immutable private object and verifies its original bytes', async () => {
 expect(await readHireFingerprintingScreenshot(9000, fixture.sha, { db, bucket })).toEqual(fixture.bytes);
 expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('organization_type = ?'), [9000, 'itsco', 'agency']);
 expect(file).toHaveBeenCalledWith('training-assets/itsco-denver-fingerprinting/' + fixture.sha + '.png');
});
it('rejects unknown image identifiers before storage or database access', async () => {
 await expect(readHireFingerprintingScreenshot(9000, '../private-file', { db, bucket })).rejects.toMatchObject({ status: 404 });
 expect(db.execute).not.toHaveBeenCalled();expect(file).not.toHaveBeenCalled();
});
it('does not open an object for another organization or inactive ITSCO', async () => {
 db.execute.mockResolvedValue([[]]);await expect(readHireFingerprintingScreenshot(9001, fixture.sha, { db, bucket })).rejects.toMatchObject({ status: 403 });expect(file).not.toHaveBeenCalled();
});
it('rejects changed or unavailable image bytes without exposing the storage path', async () => {
 download.mockResolvedValue([Buffer.from('changed')]);await expect(readHireFingerprintingScreenshot(9000, fixture.sha, { db, bucket })).rejects.toMatchObject({ status: 503, message: 'The screenshot could not be loaded. Please retry.' });
 download.mockRejectedValue(new Error('private storage error'));await expect(readHireFingerprintingScreenshot(9000, fixture.sha, { db, bucket })).rejects.toMatchObject({ status: 503 });
});
