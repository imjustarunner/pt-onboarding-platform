import { validationResult } from 'express-validator';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import StorageService from '../services/storage.service.js';

const QUARANTINE_PREFIX = 'referrals_quarantine/';
const CLEAN_PREFIX = 'referrals/';

function isAuthorized(req) {
  const token = process.env.REFERRAL_SCAN_TOKEN;
  if (!token) return false;
  const header = req.headers['x-referral-scan-token'];
  return String(header || '') === String(token);
}

export const handleReferralScanResult = async (req, res, next) => {
  try {
    if (!isAuthorized(req)) {
      return res.status(401).json({ error: { message: 'Unauthorized scan callback' } });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const storagePath = String(req.body.storagePath || '').trim();
    const scanStatus = String(req.body.scanStatus || '').trim().toLowerCase();
    const scanResult = req.body.scanResult ? String(req.body.scanResult).slice(0, 512) : null;

    const doc = await ClientPhiDocument.findByStoragePath(storagePath);
    if (!doc) {
      return res.status(404).json({ error: { message: 'PHI document not found for storagePath' } });
    }

    const scannedAt = new Date();
    let updatedStoragePath = storagePath;

    if (scanStatus === 'clean') {
      if (storagePath.startsWith(QUARANTINE_PREFIX)) {
        updatedStoragePath = storagePath.replace(QUARANTINE_PREFIX, CLEAN_PREFIX);
        await StorageService.moveObject(storagePath, updatedStoragePath);
      }
    } else if (scanStatus === 'infected') {
      await StorageService.deleteObject(storagePath);
    }

    const updated = await ClientPhiDocument.updateScanStatusById({
      id: doc.id,
      scanStatus,
      scanResult,
      scannedAt,
      storagePath: updatedStoragePath
    });

    res.json({ document: updated });
  } catch (error) {
    next(error);
  }
};
