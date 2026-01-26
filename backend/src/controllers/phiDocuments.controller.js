import Client from '../models/Client.model.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import StorageService from '../services/storage.service.js';
import User from '../models/User.model.js';
import pool from '../config/database.js';
import multer from 'multer';

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
          mimeType: req.file.mimetype || null,
          uploadedByUserId: req.user.id
        });
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

    // Return a signed URL for the underlying object (do not expose via /uploads without auth)
    const url = await StorageService.getSignedUrl(doc.storage_path);
    res.json({ url });
  } catch (e) {
    next(e);
  }
};

