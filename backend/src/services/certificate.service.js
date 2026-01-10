import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import Certificate from '../models/Certificate.model.js';
import Module from '../models/Module.model.js';
import TrainingTrack from '../models/TrainingTrack.model.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import GoogleDocsService from './googleDocs.service.js';
import pool from '../config/database.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CertificateService {
  static async generateCertificate(certificateType, referenceId, userId = null, email = null, agencyId = null) {
    let name = '';
    let referenceName = '';
    let completionDate = new Date();
    let userAgencyId = agencyId;

    // Get user info if userId provided
    if (userId) {
      const user = await User.findById(userId);
      if (user) {
        name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
        // Get user's agency if not provided
        if (!userAgencyId) {
          const userAgencies = await User.getAgencies(userId);
          if (userAgencies.length > 0) {
            userAgencyId = userAgencies[0].id;
          }
        }
      }
    } else if (email) {
      name = email;
    }

    // Get reference info (module or training focus)
    let moduleTitles = [];
    if (certificateType === 'module') {
      const module = await Module.findById(referenceId);
      if (module) {
        referenceName = module.title;
      }
    } else if (certificateType === 'training_focus') {
      const track = await TrainingTrack.findById(referenceId);
      if (track) {
        referenceName = track.name;
        // Get all modules in this training focus
        const modules = await TrainingTrack.getModules(referenceId);
        moduleTitles = modules.map(m => m.title);
      }
    }

    // Generate certificate number
    const certificateNumber = await Certificate.generateCertificateNumber();

    // Create certificate data
    const certificateData = {
      name,
      referenceName,
      certificateType,
      completionDate: completionDate.toISOString(),
      certificateNumber,
      moduleTitles
    };

    // Generate PDF with agency template if available
    const pdfBytes = await this.generateCertificatePDF(certificateData, userAgencyId);

    // Save PDF to file system
    const uploadsDir = path.join(__dirname, '../../uploads/certificates');
    await fs.mkdir(uploadsDir, { recursive: true });
    const pdfFileName = `certificate-${certificateNumber}.pdf`;
    const pdfPath = path.join(uploadsDir, pdfFileName);
    await fs.writeFile(pdfPath, pdfBytes);

    // Save certificate record
    const certificate = await Certificate.create({
      userId,
      email,
      certificateType,
      referenceId,
      certificateData,
      pdfPath: `certificates/${pdfFileName}`,
      certificateNumber
    });

    return certificate;
  }

  static async generateCertificatePDF(certificateData, agencyId = null) {
    let pdfDoc;
    let templatePages = [];
    let hasTemplate = false;

    // Try to get agency certificate template
    if (agencyId) {
      try {
        const agency = await Agency.findById(agencyId);
        if (agency && agency.certificate_template_url) {
          try {
            // Download Google Doc as PDF
            const templatePdfBytes = await GoogleDocsService.downloadGoogleDocAsPDF(agency.certificate_template_url);
            // Load template PDF
            pdfDoc = await PDFDocument.load(templatePdfBytes);
            templatePages = pdfDoc.getPages();
            hasTemplate = true;
          } catch (templateError) {
            console.error('Failed to load certificate template, using default:', templateError);
            // Fall through to default generation
            pdfDoc = await PDFDocument.create();
          }
        } else {
          pdfDoc = await PDFDocument.create();
        }
      } catch (error) {
        console.error('Error checking for certificate template:', error);
        pdfDoc = await PDFDocument.create();
      }
    } else {
      pdfDoc = await PDFDocument.create();
    }

    // If no template, create a new page
    if (!hasTemplate || templatePages.length === 0) {
      const page = pdfDoc.addPage([612, 792]); // Letter size
      templatePages = [page];
      
      // Background decoration (optional)
      page.drawRectangle({
        x: 0,
        y: 0,
        width: 612,
        height: 792,
        color: rgb(0.98, 0.98, 0.98)
      });

      // Border
      page.drawRectangle({
        x: 50,
        y: 50,
        width: 512,
        height: 692,
        borderColor: rgb(0.2, 0.2, 0.2),
        borderWidth: 3
      });
    }

    // Use first page of template (or newly created page)
    const page = templatePages[0];
    const { width, height } = page.getSize();

    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Calculate text positions (centered)
    const margin = 72;
    let y = height - margin - 50;

    // Large title with training focus/module name (24-30pt font)
    const titleSize = 28;
    const titleText = certificateData.referenceName || 'Certificate of Completion';
    const titleWidth = helveticaBold.widthOfTextAtSize(titleText, titleSize);
    page.drawText(titleText, {
      x: (width - titleWidth) / 2,
      y,
      size: titleSize,
      font: helveticaBold,
      color: rgb(0, 0, 0)
    });
    y -= 80;

    // Certificate of Completion subtitle
    page.drawText('CERTIFICATE OF COMPLETION', {
      x: (width - helveticaBold.widthOfTextAtSize('CERTIFICATE OF COMPLETION', 20)) / 2,
      y,
      size: 20,
      font: helveticaBold,
      color: rgb(0, 0, 0)
    });
    y -= 60;

    // Name
    page.drawText('This is to certify that', {
      x: (width - helvetica.widthOfTextAtSize('This is to certify that', 14)) / 2,
      y,
      size: 14,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3)
    });
    y -= 40;

    const nameWidth = helveticaBold.widthOfTextAtSize(certificateData.name, 20);
    page.drawText(certificateData.name, {
      x: (width - nameWidth) / 2,
      y,
      size: 20,
      font: helveticaBold,
      color: rgb(0, 0, 0),
      maxWidth: width - margin * 2
    });
    y -= 40;

    // Completion text
    page.drawText('has successfully completed', {
      x: (width - helvetica.widthOfTextAtSize('has successfully completed', 14)) / 2,
      y,
      size: 14,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3)
    });
    y -= 50;

    // For training focus certificates, list module titles
    if (certificateData.certificateType === 'training_focus' && certificateData.moduleTitles && certificateData.moduleTitles.length > 0) {
      // Draw module list
      page.drawText('The following modules:', {
        x: margin + 20,
        y,
        size: 12,
        font: helvetica,
        color: rgb(0.3, 0.3, 0.3)
      });
      y -= 30;

      for (const moduleTitle of certificateData.moduleTitles) {
        if (y < 150) {
          // Add new page if needed
          const newPage = pdfDoc.addPage([612, 792]);
          y = height - margin;
        }
        page.drawText(`• ${moduleTitle}`, {
          x: margin + 40,
          y,
          size: 11,
          font: helvetica,
          color: rgb(0, 0, 0),
          maxWidth: width - margin * 2 - 40
        });
        y -= 20;
      }
      y -= 20;
    }

    // Date
    const dateText = new Date(certificateData.completionDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    page.drawText(`Completed on ${dateText}`, {
      x: (width - helvetica.widthOfTextAtSize(`Completed on ${dateText}`, 12)) / 2,
      y,
      size: 12,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3)
    });
    y -= 80;

    // Certificate number
    const certNumText = `Certificate Number: ${certificateData.certificateNumber}`;
    page.drawText(certNumText, {
      x: (width - helvetica.widthOfTextAtSize(certNumText, 10)) / 2,
      y,
      size: 10,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5)
    });

    return pdfDoc.save();
  }
  
  /**
   * Get modules for a training focus
   */
  static async getTrainingFocusModules(trackId) {
    return await TrainingTrack.getModules(trackId);
  }
  
  /**
   * Check if module is standalone (not part of any training focus)
   */
  static async isModuleStandalone(moduleId) {
    const [rows] = await pool.execute(
      'SELECT COUNT(*) as count FROM track_modules WHERE module_id = ?',
      [moduleId]
    );
    return rows[0].count === 0;
  }
  
  /**
   * Check and generate training focus certificate if all modules are complete
   */
  static async checkAndGenerateTrainingFocusCertificate(userId, trackId) {
    // Get all modules in the track
    const modules = await TrainingTrack.getModules(trackId);
    if (modules.length === 0) {
      return null; // No modules, no certificate
    }
    
    // Check if all modules are completed
    const UserProgress = (await import('../models/UserProgress.model.js')).default;
    let allComplete = true;
    for (const module of modules) {
      const progress = await UserProgress.findByUserAndModule(userId, module.id);
      if (!progress || progress.status !== 'completed') {
        allComplete = false;
        break;
      }
    }
    
    if (allComplete) {
      // Check if certificate already exists for this user
      const existingCert = await Certificate.findByReference('training_focus', trackId, userId);
      if (existingCert) {
        return existingCert; // Already has certificate
      }
      
      // Get user's agency for template
      const userAgencies = await User.getAgencies(userId);
      const agencyId = userAgencies.length > 0 ? userAgencies[0].id : null;
      
      // Generate certificate
      return await this.generateCertificate('training_focus', trackId, userId, null, agencyId);
    }
    
    return null;
  }

  static async getCertificatePDF(certificateId) {
    const certificate = await Certificate.findById(certificateId);
    if (!certificate || !certificate.pdf_path) {
      throw new Error('Certificate not found or PDF not generated');
    }

    const pdfPath = path.join(__dirname, '../../uploads', certificate.pdf_path);
    const pdfBytes = await fs.readFile(pdfPath);
    return pdfBytes;
  }
}

export default CertificateService;

