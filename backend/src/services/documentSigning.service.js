import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DocumentSigningService {
  /**
   * Generate finalized PDF with signature and audit certificate
   */
  static async generateFinalizedPDF(templatePath, templateType, htmlContent, signatureImage, workflowData, userData, auditTrail, signatureCoords = null) {
    console.log(`DocumentSigningService.generateFinalizedPDF: Starting PDF generation`);
    console.log(`DocumentSigningService.generateFinalizedPDF: Template type: ${templateType}, has templatePath: ${!!templatePath}, has htmlContent: ${!!htmlContent}`);
    
    let pdfDoc;

    try {
      // Load or create base PDF
      if (templateType === 'pdf' && templatePath) {
        console.log(`DocumentSigningService.generateFinalizedPDF: Loading PDF template from ${templatePath}`);
        
        // templatePath is the GCS key (e.g., "templates/filename.pdf")
        const StorageService = (await import('./storage.service.js')).default;
        const templateFilename = templatePath.includes('/') 
          ? templatePath.split('/').pop() 
          : templatePath.replace('templates/', '');
        const templateBuffer = await StorageService.readTemplate(templateFilename);
        
        pdfDoc = await PDFDocument.load(templateBuffer);
        console.log(`DocumentSigningService.generateFinalizedPDF: PDF template loaded successfully`);
      } else if (templateType === 'html' && htmlContent) {
        console.log(`DocumentSigningService.generateFinalizedPDF: Converting HTML to PDF...`);
        // Convert HTML to PDF using Puppeteer
        const htmlPdf = await this.convertHTMLToPDF(htmlContent);
        console.log(`DocumentSigningService.generateFinalizedPDF: HTML converted to PDF, loading into PDFDocument...`);
        pdfDoc = await PDFDocument.load(htmlPdf);
        console.log(`DocumentSigningService.generateFinalizedPDF: HTML PDF loaded successfully`);
      } else {
        throw new Error(`Invalid template type (${templateType}) or missing content. templatePath: ${!!templatePath}, htmlContent: ${!!htmlContent}`);
      }

      // Add signature image at fixed bottom position
      if (signatureImage) {
        console.log(`DocumentSigningService.generateFinalizedPDF: Adding signature to PDF...`);
        console.log(`DocumentSigningService.generateFinalizedPDF: Signature coordinates:`, signatureCoords);
        await this.addSignatureToPDF(pdfDoc, signatureImage, signatureCoords);
        console.log(`DocumentSigningService.generateFinalizedPDF: Signature added successfully`);
      }

      // Add audit certificate page
      console.log(`DocumentSigningService.generateFinalizedPDF: Adding audit certificate page...`);
      await this.addAuditCertificatePage(pdfDoc, workflowData, userData, auditTrail);
      console.log(`DocumentSigningService.generateFinalizedPDF: Audit certificate added successfully`);

      // Save finalized PDF
      console.log(`DocumentSigningService.generateFinalizedPDF: Saving PDF...`);
      const pdfBytes = await pdfDoc.save();
      console.log(`DocumentSigningService.generateFinalizedPDF: PDF saved successfully, size: ${pdfBytes.length} bytes`);
      return pdfBytes;
    } catch (error) {
      console.error('DocumentSigningService.generateFinalizedPDF: Error:', error);
      console.error('DocumentSigningService.generateFinalizedPDF: Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * Convert HTML to PDF using Puppeteer with fallback to simple PDF generation
   */
  static async convertHTMLToPDF(htmlContent) {
    let browser;
    let retries = 2; // Reduced retries since we have a fallback
    let lastError;
    
    while (retries > 0) {
      try {
        console.log(`DocumentSigningService.convertHTMLToPDF: Attempting to launch browser (${3 - retries}/2)...`);
        // Use system Chromium if available (set via PUPPETEER_EXECUTABLE_PATH env var)
        const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
        browser = await puppeteer.launch({
          executablePath, // Use system Chromium in production (Alpine Linux)
          headless: 'new', // Use new headless mode
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process'
          ],
          timeout: 30000
        });
        
        console.log(`DocumentSigningService.convertHTMLToPDF: Browser launched successfully`);
        const page = await browser.newPage();
        
        console.log(`DocumentSigningService.convertHTMLToPDF: Setting page content...`);
        // Use a simpler waitUntil to avoid network issues
        await page.setContent(htmlContent, { 
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        
        // Wait a bit for any async content to load
        await page.waitForTimeout(1000);
        
        console.log(`DocumentSigningService.convertHTMLToPDF: Generating PDF...`);
        const pdf = await page.pdf({
          format: 'Letter',
          printBackground: true,
          margin: { top: '1in', right: '1in', bottom: '1in', left: '1in' },
          timeout: 60000 // Increased timeout for PDF generation
        });
        
        console.log(`DocumentSigningService.convertHTMLToPDF: PDF generated successfully, size: ${pdf.length} bytes`);
        await browser.close();
        return pdf;
      } catch (error) {
        lastError = error;
        console.error(`DocumentSigningService.convertHTMLToPDF: Error (attempt ${3 - retries}/2):`, error.message);
        if (browser) {
          try {
            await browser.close();
          } catch (closeError) {
            console.error('DocumentSigningService.convertHTMLToPDF: Error closing browser:', closeError);
          }
        }
        retries--;
        if (retries > 0) {
          console.log(`DocumentSigningService.convertHTMLToPDF: Retrying in 1 second...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    // Fallback: Create a simple PDF from HTML content using pdf-lib
    console.warn(`DocumentSigningService.convertHTMLToPDF: Puppeteer failed, using fallback PDF generation`);
    return this.convertHTMLToPDFFallback(htmlContent);
  }

  /**
   * Fallback method to create a simple PDF from HTML content when Puppeteer fails
   */
  static async convertHTMLToPDFFallback(htmlContent) {
    console.log(`DocumentSigningService.convertHTMLToPDFFallback: Creating PDF from HTML content...`);
    
    // Strip HTML tags and extract text content
    const textContent = htmlContent
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove scripts
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove styles
      .replace(/<[^>]+>/g, ' ') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size
    const { width, height } = page.getSize();
    
    const helvetica = await pdfDoc.embedFont('Helvetica');
    const helveticaBold = await pdfDoc.embedFont('Helvetica-Bold');
    
    const margin = 72; // 1 inch
    const maxWidth = width - (margin * 2);
    let y = height - margin;
    
    // Add title
    page.drawText('Document', {
      x: margin,
      y,
      size: 18,
      font: helveticaBold,
      color: rgb(0, 0, 0)
    });
    y -= 30;
    
    // Split text into lines that fit the page width
    const words = textContent.split(' ');
    let currentLine = '';
    const lineHeight = 14;
    const fontSize = 10;
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const textWidth = helvetica.widthOfTextAtSize(testLine, fontSize);
      
      if (textWidth > maxWidth && currentLine) {
        // Draw current line and start new line
        page.drawText(currentLine, {
          x: margin,
          y,
          size: fontSize,
          font: helvetica,
          color: rgb(0, 0, 0),
          maxWidth
        });
        y -= lineHeight;
        currentLine = word;
        
        // Add new page if needed
        if (y < margin) {
          const newPage = pdfDoc.addPage([612, 792]);
          y = height - margin;
        }
      } else {
        currentLine = testLine;
      }
    }
    
    // Draw remaining text
    if (currentLine) {
      page.drawText(currentLine, {
        x: margin,
        y,
        size: fontSize,
        font: helvetica,
        color: rgb(0, 0, 0),
        maxWidth
      });
    }
    
    const pdfBytes = await pdfDoc.save();
    console.log(`DocumentSigningService.convertHTMLToPDFFallback: PDF created successfully, size: ${pdfBytes.length} bytes`);
    return pdfBytes;
  }

  /**
   * Add signature image to PDF at specified position or fixed bottom position
   * @param {PDFDocument} pdfDoc - The PDF document
   * @param {string} signatureImageBase64 - Base64 encoded signature image
   * @param {Object|null} coords - Signature coordinates {x, y, width, height, page} or null for default
   */
  static async addSignatureToPDF(pdfDoc, signatureImageBase64, coords = null) {
    try {
      // Remove data URL prefix if present
      const base64Data = signatureImageBase64.replace(/^data:image\/\w+;base64,/, '');
      const imageBytes = Buffer.from(base64Data, 'base64');
      
      // Embed image
      let signatureImage;
      try {
        signatureImage = await pdfDoc.embedPng(imageBytes);
      } catch (e) {
        // Try as JPEG if PNG fails
        signatureImage = await pdfDoc.embedJpg(imageBytes);
      }

      const pages = pdfDoc.getPages();
      
      // Determine which page to use
      let targetPage;
      if (coords && coords.page !== null && coords.page !== undefined) {
        // Use specified page (1-indexed, convert to 0-indexed)
        const pageIndex = Math.max(0, Math.min(coords.page - 1, pages.length - 1));
        targetPage = pages[pageIndex];
      } else {
        // Default to last page
        targetPage = pages[pages.length - 1];
      }
      
      const { width, height } = targetPage.getSize();

      // Use provided coordinates or default to fixed bottom position (2 inches from bottom, centered)
      let signatureX, signatureY, signatureWidth, signatureHeight;
      
      if (coords && coords.x !== null && coords.y !== null && coords.width !== null && coords.height !== null) {
        // Use provided coordinates
        signatureX = parseFloat(coords.x) || 0;
        signatureY = parseFloat(coords.y) || 0;
        signatureWidth = parseFloat(coords.width) || 200;
        signatureHeight = parseFloat(coords.height) || 60;
        console.log(`DocumentSigningService.addSignatureToPDF: Using provided coordinates: x=${signatureX}, y=${signatureY}, width=${signatureWidth}, height=${signatureHeight}, page=${coords.page || 'last'}`);
        console.log(`DocumentSigningService.addSignatureToPDF: Page size: width=${width}, height=${height}`);
        console.log(`DocumentSigningService.addSignatureToPDF: Signature will be placed at bottom-left corner (${signatureX}, ${signatureY})`);
      } else {
        // Default position: 2 inches from bottom, centered
        signatureWidth = 200;
        signatureHeight = 60;
        signatureX = (width - signatureWidth) / 2;
        signatureY = 144; // 2 inches from bottom (72 points per inch)
        console.log(`DocumentSigningService.addSignatureToPDF: Using default position: x=${signatureX}, y=${signatureY}, width=${signatureWidth}, height=${signatureHeight}`);
      }

      targetPage.drawImage(signatureImage, {
        x: signatureX,
        y: signatureY,
        width: signatureWidth,
        height: signatureHeight
      });

      // Add signature label only if using default position (to avoid overlapping with document content)
      if (!coords || coords.x === null || coords.y === null) {
        targetPage.drawText('Signature:', {
          x: signatureX - 80,
          y: signatureY + 30,
          size: 10,
          color: rgb(0, 0, 0)
        });
      }
    } catch (error) {
      console.error('Error adding signature to PDF:', error);
      throw error;
    }
  }

  /**
   * Add ESIGN Act compliant audit certificate page
   */
  static async addAuditCertificatePage(pdfDoc, workflowData, userData, auditTrail) {
    const page = pdfDoc.addPage([612, 792]); // Letter size
    const { width, height } = page.getSize();

    let y = height - 72; // Start from top with 1 inch margin

    // Title
    const helveticaBold = await pdfDoc.embedFont('Helvetica-Bold');
    page.drawText('Electronic Signature Certificate', {
      x: 72,
      y,
      size: 18,
      color: rgb(0, 0, 0),
      font: helveticaBold
    });
    y -= 40;

    // ESIGN Act Compliance Statement
    page.drawText('ESIGN Act Compliance Statement', {
      x: 72,
      y,
      size: 14,
      color: rgb(0, 0, 0),
      font: helveticaBold
    });
    y -= 30;

    const complianceText = `This document was electronically signed in compliance with the Electronic Signatures in Global and National Commerce Act (ESIGN Act), 15 U.S.C. § 7001 et seq. The signer has consented to conduct this transaction electronically and has been provided with the required disclosures.`;
    
    page.drawText(complianceText, {
      x: 72,
      y,
      size: 10,
      color: rgb(0, 0, 0),
      maxWidth: width - 144,
      lineHeight: 14
    });
    y -= 80;

    // Signer Information
    page.drawText('Signer Information', {
      x: 72,
      y,
      size: 14,
      color: rgb(0, 0, 0),
      font: helveticaBold
    });
    y -= 30;

    const signerInfo = [
      `Name: ${userData.firstName} ${userData.lastName}`,
      `Email: ${userData.email}`,
      `User ID: ${userData.userId}`
    ];

    signerInfo.forEach(line => {
      page.drawText(line, {
        x: 72,
        y,
        size: 10,
        color: rgb(0, 0, 0)
      });
      y -= 20;
    });

    y -= 20;

    // Timestamps
    page.drawText('Signature Timeline', {
      x: 72,
      y,
      size: 14,
      color: rgb(0, 0, 0),
      font: helveticaBold
    });
    y -= 30;

    if (workflowData.consent_given_at) {
      page.drawText(`Consent Given: ${new Date(workflowData.consent_given_at).toISOString()}`, {
        x: 72,
        y,
        size: 10,
        color: rgb(0, 0, 0)
      });
      y -= 20;
    }

    if (workflowData.intent_to_sign_at) {
      page.drawText(`Intent to Sign: ${new Date(workflowData.intent_to_sign_at).toISOString()}`, {
        x: 72,
        y,
        size: 10,
        color: rgb(0, 0, 0)
      });
      y -= 20;
    }

    if (workflowData.identity_verified_at) {
      page.drawText(`Identity Verified: ${new Date(workflowData.identity_verified_at).toISOString()}`, {
        x: 72,
        y,
        size: 10,
        color: rgb(0, 0, 0)
      });
      y -= 20;
    }

    if (workflowData.finalized_at) {
      page.drawText(`Document Finalized: ${new Date(workflowData.finalized_at).toISOString()}`, {
        x: 72,
        y,
        size: 10,
        color: rgb(0, 0, 0)
      });
      y -= 20;
    }

    y -= 20;

    // IP Addresses and User Agents
    if (workflowData.consent_ip || workflowData.intent_ip) {
      page.drawText('Network Information', {
        x: 72,
        y,
        size: 14,
        color: rgb(0, 0, 0),
        font: helveticaBold
      });
      y -= 30;

      if (workflowData.consent_ip) {
        page.drawText(`Consent IP: ${workflowData.consent_ip}`, {
          x: 72,
          y,
          size: 10,
          color: rgb(0, 0, 0)
        });
        y -= 20;
      }

      if (workflowData.intent_ip) {
        page.drawText(`Intent IP: ${workflowData.intent_ip}`, {
          x: 72,
          y,
          size: 10,
          color: rgb(0, 0, 0)
        });
        y -= 20;
      }
    }

    y -= 20;

    // Audit Trail Summary
    if (auditTrail) {
      page.drawText('Audit Trail', {
        x: 72,
        y,
        size: 14,
        color: rgb(0, 0, 0),
        font: helveticaBold
      });
      y -= 30;

      const auditText = JSON.stringify(auditTrail, null, 2);
      page.drawText(auditText, {
        x: 72,
        y,
        size: 8,
        color: rgb(0, 0, 0),
        maxWidth: width - 144,
        lineHeight: 10
      });
    }
  }

  /**
   * Calculate SHA-256 hash of PDF
   */
  static calculatePDFHash(pdfBytes) {
    return crypto.createHash('sha256').update(pdfBytes).digest('hex');
  }

  /**
   * Verify PDF integrity by recalculating hash from file path
   */
  static async verifyPDFIntegrity(filePath, storedHash) {
    const fileBuffer = await fs.readFile(filePath);
    return this.verifyPDFIntegrityFromBuffer(fileBuffer, storedHash);
  }

  /**
   * Verify PDF integrity by recalculating hash from buffer
   */
  static verifyPDFIntegrityFromBuffer(fileBuffer, storedHash) {
    const calculatedHash = this.calculatePDFHash(fileBuffer);
    return {
      isValid: calculatedHash === storedHash,
      storedHash,
      calculatedHash
    };
  }
}

export default DocumentSigningService;

