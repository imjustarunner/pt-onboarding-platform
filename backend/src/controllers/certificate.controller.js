import CertificateService from '../services/certificate.service.js';
import Certificate from '../models/Certificate.model.js';
import { validationResult } from 'express-validator';

export const generateCertificate = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { certificateType, referenceId } = req.body;
    const userId = req.user.id || null;
    const email = req.user.email || null;

    // For passwordless users, use email
    if (req.user.type === 'passwordless') {
      const certificate = await CertificateService.generateCertificate(
        certificateType,
        referenceId,
        null,
        email
      );
      return res.status(201).json(certificate);
    }

    // For regular users
    const certificate = await CertificateService.generateCertificate(
      certificateType,
      referenceId,
      userId,
      null
    );

    res.status(201).json(certificate);
  } catch (error) {
    next(error);
  }
};

export const getUserCertificates = async (req, res, next) => {
  try {
    let certificates = [];

    if (req.user.type === 'passwordless') {
      // Passwordless users - get by email
      certificates = await Certificate.findByEmail(req.user.email);
    } else {
      // Regular users - get by user ID
      certificates = await Certificate.findByUser(req.user.id);
    }

    res.json(certificates);
  } catch (error) {
    next(error);
  }
};

export const getCertificate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const certificate = await Certificate.findById(id);

    if (!certificate) {
      return res.status(404).json({ error: { message: 'Certificate not found' } });
    }

    // Check access
    if (req.user.type === 'passwordless') {
      if (certificate.email !== req.user.email) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    } else {
      if (certificate.user_id !== req.user.id) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    res.json(certificate);
  } catch (error) {
    next(error);
  }
};

export const downloadCertificate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const certificate = await Certificate.findById(id);

    if (!certificate) {
      return res.status(404).json({ error: { message: 'Certificate not found' } });
    }

    // Check access
    if (req.user.type === 'passwordless') {
      if (certificate.email !== req.user.email) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    } else {
      if (certificate.user_id !== req.user.id) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const pdfBytes = await CertificateService.getCertificatePDF(id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate-${certificate.certificate_number}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    next(error);
  }
};

