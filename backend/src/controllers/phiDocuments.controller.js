import Client from '../models/Client.model.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import StorageService from '../services/storage.service.js';
import User from '../models/User.model.js';
import pool from '../config/database.js';
import multer from 'multer';
import DocumentEncryptionService from '../services/documentEncryption.service.js';
import PhiDocumentAuditLog from '../models/PhiDocumentAuditLog.model.js';

// Upload (authenticated): PDF/JPG/PNG up to 10MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (allowedMimes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Only PDF, JPG, and PNG files are allowed.'), false);
  }
});

async function userCanAccessClient({ requestingUserId, requestingUserRole, client }) {
  if (requestingUserRole === 'super_admin') return true;
  const userAgencies = await User.getAgencies(requestingUserId);
  const userAgencyIds = userAgencies.map(a => a.id);
  return userAgencyIds.includes(client.agency_id) || userAgencyIds.includes(client.organization_id);
}

export const uploadClientPhiDocument = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      const clientId = parseInt(req.params.clientId, 10);
      if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });
      if (!req.file) return res.status(400).json({ error: { message: 'No file uploaded' } });

      const client = await Client.findById(clientId, { includeSensitive: true });
      if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

      const allowed = await userCanAccessClient({ requestingUserId: req.user.id, requestingUserRole: req.user.role, client });
      if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });

      const sanitizedFilename = StorageService.sanitizeFilename(req.file.originalname);
      const documentTitle = req.body?.documentTitle ? String(req.body.documentTitle).trim().slice(0, 255) : null;
      const documentType = req.body?.documentType ? String(req.body.documentType).trim().slice(0, 80) : null;
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(7);
      const orgId = client.organization_id || client.school_organization_id || null;
      const fileName = `phi-documents/${orgId || 'unknown-org'}/${clientId}/${timestamp}-${randomId}-${sanitizedFilename}`;

      const bucket = await StorageService.getGCSBucket();
      const file = bucket.file(fileName);
      await file.save(req.file.buffer, {
        contentType: req.file.mimetype,
        metadata: {
          clientId: String(clientId),
          agencyId: String(client.agency_id),
          organizationId: String(orgId || ''),
          uploadedByUserId: String(req.user.id),
          uploadType: 'client_documentation',
          uploadedAt: new Date().toISOString()
        }
      });

      let phiDoc = null;
      try {
        phiDoc = await ClientPhiDocument.create({
          clientId,
          agencyId: client.agency_id,
          schoolOrganizationId: orgId || client.organization_id,
          storagePath: fileName,
          originalName: req.file.originalname || null,
          documentTitle,
          documentType,
          mimeType: req.file.mimetype || null,
          uploadedByUserId: req.user.id
        });
        try {
          const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || null;
          await PhiDocumentAuditLog.create({
            documentId: phiDoc.id,
            clientId,
            action: 'uploaded',
            actorUserId: req.user.id,
            actorLabel: req.user?.email || req.user?.name || null,
            ipAddress: ip,
            metadata: { source: 'manual_upload' }
          });
        } catch {
          // best-effort logging
        }
      } catch (e) {
        if (e.code === 'ER_NO_SUCH_TABLE') {
          return res.status(503).json({ error: { message: 'PHI documents feature not available (migration not run yet).' } });
        }
        throw e;
      }

      // Best-effort: set legacy document_status flag so older UI reflects upload.
      try {
        await pool.execute(`UPDATE clients SET document_status = 'UPLOADED' WHERE id = ?`, [clientId]);
      } catch {
        // ignore
      }

      res.status(201).json({ document: phiDoc });
    } catch (e) {
      next(e);
    }
  }
];

export const listClientPhiDocuments = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.clientId, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });

    const client = await Client.findById(clientId, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    const allowed = await userCanAccessClient({ requestingUserId: req.user.id, requestingUserRole: req.user.role, client });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });

    let docs = [];
    try {
      docs = await ClientPhiDocument.findByClientId(clientId);
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE') {
        return res.json([]);
      }
      throw e;
    }
    res.json(docs);
  } catch (e) {
    next(e);
  }
};

export const viewPhiDocument = async (req, res, next) => {
  try {
    const docId = parseInt(req.params.docId, 10);
    if (!docId) return res.status(400).json({ error: { message: 'docId is required' } });

    let doc = null;
    try {
      doc = await ClientPhiDocument.findById(docId);
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE') {
        return res.status(503).json({ error: { message: 'PHI documents feature not available (migration not run yet).' } });
      }
      throw e;
    }
    if (!doc) return res.status(404).json({ error: { message: 'PHI document not found' } });
    if (doc.removed_at) {
      return res.status(410).json({ error: { message: 'Document has been removed from the system.' } });
    }

    const client = await Client.findById(doc.client_id, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    const allowed = await userCanAccessClient({ requestingUserId: req.user.id, requestingUserRole: req.user.role, client });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });

    // Log access (best-effort)
    try {
      const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || null;
      const userAgent = req.headers['user-agent'] || null;
      await pool.execute(
        `INSERT INTO phi_access_logs (user_id, client_id, document_id, action, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.id, doc.client_id, doc.id, 'view', ip, userAgent ? String(userAgent).slice(0, 512) : null]
      );
    } catch {
      // ignore
    }

    const isPlainText = String(doc.mime_type || '').toLowerCase().includes('text/plain');
    const escapeHtml = (value) =>
      String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    if (doc.is_encrypted) {
      const encryptedBuffer = await StorageService.readObject(doc.storage_path);
      const decryptedBuffer = await DocumentEncryptionService.decryptBuffer({
        encryptedBuffer,
        encryptionKeyId: doc.encryption_key_id,
        encryptionWrappedKeyB64: doc.encryption_wrapped_key,
        encryptionIvB64: doc.encryption_iv,
        encryptionAuthTagB64: doc.encryption_auth_tag,
        aad: JSON.stringify({
          organizationId: doc.school_organization_id,
          uploadType: 'referral_packet',
          filename: StorageService.sanitizeFilename(doc.original_name || '')
        })
      });

      const safeName = StorageService.sanitizeFilename(doc.original_name || `document-${doc.id}`);
      res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
      res.setHeader('Cache-Control', 'no-store');
      try {
        const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || null;
        await PhiDocumentAuditLog.create({
          documentId: doc.id,
          clientId: doc.client_id,
          action: 'downloaded',
          actorUserId: req.user.id,
          actorLabel: req.user?.email || req.user?.name || null,
          ipAddress: ip
        });
      } catch {
        // best-effort logging
      }
      return res.send(decryptedBuffer);
    }

    if (isPlainText) {
      const buffer = await StorageService.readObject(doc.storage_path);
      const text = buffer?.toString('utf8') || '';
      const safeName = StorageService.sanitizeFilename(doc.original_name || `document-${doc.id}`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename="${safeName}.html"`);
      res.setHeader('Cache-Control', 'no-store');
      try {
        const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || null;
        await PhiDocumentAuditLog.create({
          documentId: doc.id,
          clientId: doc.client_id,
          action: 'downloaded',
          actorUserId: req.user.id,
          actorLabel: req.user?.email || req.user?.name || null,
          ipAddress: ip
        });
      } catch {
        // best-effort logging
      }
      const isClinicalSummary = String(doc.document_type || doc.document_title || '').toLowerCase().includes('clinical');
      const lines = text.split('\n');
      const body = lines
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return '<div class="spacer"></div>';
          if (/^-{2,}$/.test(trimmed)) return '';
          if (!trimmed.includes(':')) {
            return `<h2>${escapeHtml(trimmed)}</h2>`;
          }
          const idx = trimmed.indexOf(':');
          const label = trimmed.slice(0, idx).trim();
          const value = trimmed.slice(idx + 1).trim();
          const copyButton = isClinicalSummary
            ? ''
            : `<button class="copy-btn" type="button" data-copy="${escapeHtml(value)}">Copy</button>`;
          return `
            <div class="row">
              ${copyButton}
              <div class="label">${escapeHtml(label)}</div>
              <div class="value">${escapeHtml(value)}</div>
            </div>
          `;
        })
        .join('');
      const copyAllButton = isClinicalSummary
        ? '<button class="copy-all" type="button" data-copy-all>Copy All</button>'
        : '';
      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <title>${escapeHtml(doc.document_title || doc.original_name || 'Document')}</title>
            <style>
              body { background: #fff; color: #111; font-family: Arial, sans-serif; margin: 24px; }
              h1 { margin-bottom: 16px; color: #1f3a60; }
              h2 { margin: 14px 0 6px; font-size: 14px; color: #1f3a60; }
              .row { display: flex; gap: 10px; margin-bottom: 6px; align-items: flex-start; }
              .label { font-weight: 700; min-width: 220px; }
              .value { flex: 1; }
              .copy-btn {
                background: #eef2f6;
                border: 1px solid #c9d2dc;
                border-radius: 6px;
                padding: 2px 8px;
                font-size: 12px;
                cursor: pointer;
              }
              .copy-btn:active { transform: translateY(1px); }
              .copy-all {
                background: #1f3a60;
                color: #fff;
                border: 1px solid #1f3a60;
                border-radius: 6px;
                padding: 6px 12px;
                font-size: 12px;
                cursor: pointer;
                margin-bottom: 12px;
              }
              .spacer { height: 8px; }
            </style>
          </head>
          <body>
            <h1>${escapeHtml(doc.document_title || doc.original_name || 'Document')}</h1>
            ${copyAllButton}
            ${body}
            <script>
              const copyText = async (text) => {
                if (!text) return;
                try {
                  await navigator.clipboard.writeText(text);
                } catch {
                  const textarea = document.createElement('textarea');
                  textarea.value = text;
                  textarea.style.position = 'fixed';
                  textarea.style.opacity = '0';
                  document.body.appendChild(textarea);
                  textarea.focus();
                  textarea.select();
                  document.execCommand('copy');
                  document.body.removeChild(textarea);
                }
              };
              document.querySelectorAll('[data-copy]').forEach((btn) => {
                btn.addEventListener('click', () => copyText(btn.getAttribute('data-copy')));
              });
              const copyAllBtn = document.querySelector('[data-copy-all]');
              if (copyAllBtn) {
                const rawText = ${JSON.stringify(text)};
                copyAllBtn.addEventListener('click', () => copyText(rawText.trim()));
              }
            </script>
          </body>
        </html>
      `;
      return res.send(html);
    }

    // Return a signed URL for the underlying object (do not expose via /uploads without auth)
    const url = await StorageService.getSignedUrl(doc.storage_path);
    try {
      const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || null;
      await PhiDocumentAuditLog.create({
        documentId: doc.id,
        clientId: doc.client_id,
        action: 'downloaded',
        actorUserId: req.user.id,
        actorLabel: req.user?.email || req.user?.name || null,
        ipAddress: ip
      });
    } catch {
      // best-effort logging
    }
    res.json({ url });
  } catch (e) {
    next(e);
  }
};

export const listClientPhiDocumentAudit = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.clientId, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });

    const client = await Client.findById(clientId, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    const allowed = await userCanAccessClient({ requestingUserId: req.user.id, requestingUserRole: req.user.role, client });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });

    let docs = [];
    try {
      docs = await ClientPhiDocument.findByClientId(clientId);
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE') {
        return res.json({ documents: [] });
      }
      throw e;
    }

    let logs = [];
    try {
      logs = await PhiDocumentAuditLog.listByClientId(clientId);
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE') {
        logs = [];
      } else {
        throw e;
      }
    }
    const logsByDoc = new Map();
    for (const log of logs) {
      if (!logsByDoc.has(log.document_id)) logsByDoc.set(log.document_id, []);
      logsByDoc.get(log.document_id).push(log);
    }

    const statements = docs.map(doc => {
      const docLogs = logsByDoc.get(doc.id) || [];
      const uploaded = docLogs.find(l => l.action === 'uploaded') || null;
      const downloaded = docLogs.find(l => l.action === 'downloaded') || null;
      const exported = docLogs.find(l => l.action === 'exported_to_ehr') || null;
      const removed = docLogs.find(l => l.action === 'removed') || null;
      return {
        documentId: doc.id,
        originalName: doc.original_name || null,
        documentTitle: doc.document_title || null,
        documentType: doc.document_type || null,
        uploadedAt: uploaded?.created_at || doc.uploaded_at || null,
        uploadedBy: uploaded?.actor_label || null,
        downloadedAt: downloaded?.created_at || null,
        downloadedBy: downloaded?.actor_label || null,
        exportedToEhrAt: doc.exported_to_ehr_at || exported?.created_at || null,
        exportedToEhrBy: exported?.actor_label || null,
        removedAt: doc.removed_at || removed?.created_at || null,
        removedBy: removed?.actor_label || null,
        removedReason: doc.removed_reason || removed?.metadata?.reason || null
      };
    });

    res.json({ documents: statements });
  } catch (e) {
    next(e);
  }
};

export const markPhiDocumentExported = async (req, res, next) => {
  try {
    const docId = parseInt(req.params.docId, 10);
    if (!docId) return res.status(400).json({ error: { message: 'docId is required' } });

    const doc = await ClientPhiDocument.findById(docId);
    if (!doc) return res.status(404).json({ error: { message: 'PHI document not found' } });
    if (doc.removed_at) {
      return res.status(410).json({ error: { message: 'Document has been removed from the system.' } });
    }

    const client = await Client.findById(doc.client_id, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    const allowed = await userCanAccessClient({ requestingUserId: req.user.id, requestingUserRole: req.user.role, client });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });

    const exportedAt = new Date();
    const removedReason = 'Exported to EHR';
    const updated = await ClientPhiDocument.updateLifecycleById({
      id: doc.id,
      exportedToEhrAt: exportedAt,
      exportedToEhrByUserId: req.user.id,
      removedAt: exportedAt,
      removedByUserId: req.user.id,
      removedReason
    });

    try {
      const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || null;
      await PhiDocumentAuditLog.create({
        documentId: doc.id,
        clientId: doc.client_id,
        action: 'exported_to_ehr',
        actorUserId: req.user.id,
        actorLabel: req.user?.email || req.user?.name || null,
        ipAddress: ip
      });
      await PhiDocumentAuditLog.create({
        documentId: doc.id,
        clientId: doc.client_id,
        action: 'removed',
        actorUserId: req.user.id,
        actorLabel: req.user?.email || req.user?.name || null,
        ipAddress: ip,
        metadata: { reason: removedReason }
      });
    } catch {
      // best-effort logging
    }

    try {
      await StorageService.deleteObject(doc.storage_path);
    } catch {
      // best-effort delete
    }

    res.json({ document: updated });
  } catch (e) {
    next(e);
  }
};

export const removePhiDocument = async (req, res, next) => {
  try {
    const docId = parseInt(req.params.docId, 10);
    if (!docId) return res.status(400).json({ error: { message: 'docId is required' } });

    const doc = await ClientPhiDocument.findById(docId);
    if (!doc) return res.status(404).json({ error: { message: 'PHI document not found' } });
    if (doc.removed_at) {
      return res.json({ document: doc });
    }

    const client = await Client.findById(doc.client_id, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });

    const allowed = await userCanAccessClient({ requestingUserId: req.user.id, requestingUserRole: req.user.role, client });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied' } });

    const removedAt = new Date();
    const reason = String(req.body?.reason || '').trim().slice(0, 255) || 'Shipped to EHR';
    const updated = await ClientPhiDocument.updateLifecycleById({
      id: doc.id,
      removedAt,
      removedByUserId: req.user.id,
      removedReason: reason
    });

    try {
      await StorageService.deleteObject(doc.storage_path);
    } catch {
      // best-effort delete
    }

    try {
      const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || null;
      await PhiDocumentAuditLog.create({
        documentId: doc.id,
        clientId: doc.client_id,
        action: 'removed',
        actorUserId: req.user.id,
        actorLabel: req.user?.email || req.user?.name || null,
        ipAddress: ip,
        metadata: { reason: updated.removed_reason || null }
      });
    } catch {
      // best-effort logging
    }

    res.json({ document: updated });
  } catch (e) {
    next(e);
  }
};

