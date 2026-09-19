import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import PlatformBranding from '../models/PlatformBranding.model.js';
import StorageService from '../services/storage.service.js';

const fields = { terms: 'termsUrl', privacypolicy: 'privacyPolicyUrl', platformhipaa: 'platformHipaaUrl' };

export async function publishLegalDocument(req, res, next) {
  try {
    // These documents are platform-wide, not tenant-specific.
    if (req.user?.role !== 'super_admin') return res.status(403).json({ error: { message: 'Super admin access is required.' } });
    const field = Object.hasOwn(fields, req.params.docType) ? fields[req.params.docType] : null;
    if (!field) return res.status(400).json({ error: { message: 'Unknown legal document.' } });
    let url = String(req.body?.url || '').trim();
    if (req.file && url) return res.status(400).json({ error: { message: 'Choose a PDF or a web link, not both.' } });
    if (req.file) {
      if (req.file.mimetype !== 'application/pdf' || req.file.buffer.subarray(0, 5).toString() !== '%PDF-') {
        return res.status(400).json({ error: { message: 'Upload a PDF document.' } });
      }
      try { await PDFDocument.load(req.file.buffer); }
      catch { return res.status(400).json({ error: { message: 'Upload a readable, unencrypted PDF.' } }); }
      const saved = await StorageService.savePublicMarketingAsset(req.file.buffer, `legal-${req.params.docType}-${randomUUID()}.pdf`, 'application/pdf');
      url = `https://plottwisthq.com/${saved.relativePath.replace(/^\/+/, '')}`;
    } else {
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || url.length > 2048) throw new Error();
        url = parsed.href;
      } catch { return res.status(400).json({ error: { message: 'Enter a complete http:// or https:// document link.' } }); }
    }
    const branding = await PlatformBranding.update({ [field]: url }, req.user.id);
    const storedField = { terms: 'terms_url', privacypolicy: 'privacy_policy_url', platformhipaa: 'platform_hipaa_url' }[req.params.docType];
    if (branding?.[storedField] !== url) return res.status(409).json({ error: { message: 'The document setting could not be saved. Please check the platform configuration.' } });
    res.json({ url, branding });
  } catch (error) { next(error); }
}
