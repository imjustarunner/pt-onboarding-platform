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
  static async generateFinalizedPDF(
    templatePath,
    templateType,
    htmlContent,
    signatureImage,
    workflowData,
    userData,
    auditTrail,
    signatureCoords = null,
    options = {}
  ) {
    console.log(`DocumentSigningService.generateFinalizedPDF: Starting PDF generation`);
    console.log(`DocumentSigningService.generateFinalizedPDF: Template type: ${templateType}, has templatePath: ${!!templatePath}, has htmlContent: ${!!htmlContent}`);
    
    let pdfDoc;

    try {
      // Load or create base PDF
      if (templateType === 'pdf' && templatePath) {
        console.log(`DocumentSigningService.generateFinalizedPDF: Loading PDF template from ${templatePath}`);
        
        // templatePath is the GCS key (e.g., "templates/filename.pdf" or "user_documents/filename.pdf")
        const StorageService = (await import('./storage.service.js')).default;
        let cleaned = String(templatePath || '').trim();
        if (cleaned.includes('/uploads/')) {
          cleaned = cleaned.split('/uploads/').pop();
        }
        if (cleaned.startsWith('/')) cleaned = cleaned.slice(1);
        if (cleaned.startsWith('uploads/')) cleaned = cleaned.slice('uploads/'.length);

        let templateBuffer = null;
        if (cleaned.startsWith('user_documents/')) {
          const filename = cleaned.replace('user_documents/', '');
          templateBuffer = await StorageService.readUserDocument(filename);
        } else if (cleaned.startsWith('user_specific_documents/')) {
          const filename = cleaned.replace('user_specific_documents/', '');
          templateBuffer = await StorageService.readUserSpecificDocument(filename);
        } else if (cleaned.startsWith('templates/')) {
          const filename = cleaned.replace('templates/', '');
          templateBuffer = await StorageService.readTemplate(filename);
        } else {
          // Default to templates if no prefix provided
          const filename = cleaned.includes('/') ? cleaned.split('/').pop() : cleaned;
          templateBuffer = await StorageService.readTemplate(filename);
        }
        
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

      const {
        referenceNumber = null,
        documentName = null,
        signatureOnAuditPage = false,
        fieldDefinitions = [],
        fieldValues = {}
      } = options || {};

      const suppressSignatureDate =
        Array.isArray(fieldDefinitions) &&
        fieldDefinitions.some((f) => String(f?.type || '').toLowerCase() === 'date' && f?.autoToday);

      if (referenceNumber) {
        await this.addReferenceToOriginalPages(pdfDoc, referenceNumber);
      }

      // Add custom field values to the original document
      if (Array.isArray(fieldDefinitions) && fieldDefinitions.length > 0) {
        await this.addFieldValuesToPDF(pdfDoc, fieldDefinitions, fieldValues);
      }

      // Add signature image at fixed bottom position (original document)
      if (signatureImage) {
        console.log(`DocumentSigningService.generateFinalizedPDF: Adding signature to PDF...`);
        console.log(`DocumentSigningService.generateFinalizedPDF: Signature coordinates:`, signatureCoords);
        await this.addSignatureToPDF(pdfDoc, signatureImage, signatureCoords, { suppressDate: suppressSignatureDate });
        console.log(`DocumentSigningService.generateFinalizedPDF: Signature added successfully`);
      }

      // Add audit certificate page
      console.log(`DocumentSigningService.generateFinalizedPDF: Adding audit certificate page...`);
      await this.addAuditCertificatePage(pdfDoc, workflowData, userData, auditTrail, {
        referenceNumber,
        documentName,
        signatureImage: signatureOnAuditPage ? signatureImage : null
      });
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
        // Fallback to common Alpine paths if env var not set
        let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        if (!executablePath) {
          // Try common Alpine Chromium paths (chromium-browser is most common)
          const chromiumPaths = ['/usr/bin/chromium-browser', '/usr/bin/chromium'];
          for (const chromiumPath of chromiumPaths) {
            try {
              await fs.stat(chromiumPath);
              executablePath = chromiumPath;
              console.log(`DocumentSigningService.convertHTMLToPDF: Found Chromium at ${chromiumPath}`);
              break;
            } catch (e) {
              // Path doesn't exist, try next
            }
          }
        }
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
  static async addSignatureToPDF(pdfDoc, signatureImageBase64, coords = null, options = {}) {
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

      if (!options?.suppressDate) {
        // Add date near signature (default: to the right, fallback below)
        try {
          const dateText = new Date().toISOString().slice(0, 10);
          const font = await pdfDoc.embedFont('Helvetica');
          const fontSize = 10;
          const dateWidth = font.widthOfTextAtSize(dateText, fontSize);
          let dateX = signatureX + signatureWidth + 8;
          let dateY = signatureY + (signatureHeight / 2) - (fontSize / 2);

          if (dateX + dateWidth > width - 36) {
            dateX = signatureX;
            dateY = signatureY - 14;
          }
          if (dateY < 12) {
            dateY = signatureY + signatureHeight + 6;
          }

          targetPage.drawText(dateText, {
            x: dateX,
            y: dateY,
            size: fontSize,
            font,
            color: rgb(0, 0, 0)
          });
        } catch (e) {
          console.warn('Failed to render signature date:', e);
        }
      }

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
   * Add a reference number to all original pages (before audit page is appended).
   */
  static async addReferenceToOriginalPages(pdfDoc, referenceNumber) {
    if (!referenceNumber) return;
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont('Helvetica');
    const fontSize = 9;
    const text = `Ref: ${referenceNumber}`;

    pages.forEach((page) => {
      const { width, height } = page.getSize();
      const textWidth = font.widthOfTextAtSize(text, fontSize);
      const x = Math.max(36, width - textWidth - 36);
      const y = height - 24;
      page.drawText(text, {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(0.35, 0.35, 0.35)
      });
    });
  }

  /**
   * Render custom field values onto the PDF.
   */
  static async addFieldValuesToPDF(pdfDoc, fieldDefinitions = [], fieldValues = {}) {
    if (!Array.isArray(fieldDefinitions) || fieldDefinitions.length === 0) return;
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont('Helvetica');
    const fontSize = 10;
    const isFieldVisible = (def) => {
      const showIf = def?.showIf;
      if (!showIf || !showIf.fieldId) return true;
      const actual = fieldValues[showIf.fieldId];
      const expected = showIf.equals;
      if (Array.isArray(expected)) {
        return expected.map(String).includes(String(actual));
      }
      if (expected === '' || expected === null || expected === undefined) {
        return Boolean(actual);
      }
      return String(actual ?? '') === String(expected ?? '');
    };

    for (const def of fieldDefinitions) {
      if (!isFieldVisible(def)) continue;
      if (!def) continue;
      if (def.type !== 'radio' && (def.x === null || def.y === null)) continue;
      const pageIndex = def.page ? Math.max(0, Math.min(def.page - 1, pages.length - 1)) : pages.length - 1;
      const page = pages[pageIndex];

      let value = fieldValues[def.id];
      if ((value === null || value === undefined || String(value).trim() === '') && def.type === 'date' && def.autoToday) {
        value = new Date().toISOString().slice(0, 10);
      }
      if (def.type === 'checkbox') {
        const truthy = value === true || value === 'true' || value === '1' || value === 1 || value === 'yes' || value === 'on' || value === 'checked';
        if (!truthy) continue;
        const mark = 'X';
        const boxWidth = Number(def.width) || 20;
        const boxHeight = Number(def.height) || 20;
        const markSize = Math.min(14, Math.max(10, boxHeight - 4));
        const textWidth = font.widthOfTextAtSize(mark, markSize);
        const textX = Number(def.x) + (boxWidth - textWidth) / 2;
        const textY = Number(def.y) + (boxHeight - markSize) / 2 + 1;
        page.drawText(mark, {
          x: textX,
          y: textY,
          size: markSize,
          font,
          color: rgb(0, 0, 0)
        });
        continue;
      }

      if (def.type === 'radio') {
        if (value === null || value === undefined || String(value).trim() === '') continue;
        const options = Array.isArray(def.options) ? def.options : [];
        const selected = options.find(
          (opt) => String(opt.value ?? opt.label ?? '') === String(value)
        );
        if (!selected || selected.x === null || selected.y === null) continue;
        const mark = 'X';
        const boxWidth = Number(selected.width ?? def.width) || 20;
        const boxHeight = Number(selected.height ?? def.height) || 20;
        const markSize = Math.min(14, Math.max(10, boxHeight - 4));
        const textWidth = font.widthOfTextAtSize(mark, markSize);
        const textX = Number(selected.x) + (boxWidth - textWidth) / 2;
        const textY = Number(selected.y) + (boxHeight - markSize) / 2 + 1;
        const optPageIndex = selected.page
          ? Math.max(0, Math.min(selected.page - 1, pages.length - 1))
          : pageIndex;
        const targetPage = pages[optPageIndex];
        targetPage.drawText(mark, {
          x: textX,
          y: textY,
          size: markSize,
          font,
          color: rgb(0, 0, 0)
        });
        continue;
      }

      if (value === null || value === undefined || String(value).trim() === '') continue;

      let text = String(value);
      if (def.type === 'select') {
        const options = Array.isArray(def.options) ? def.options : [];
        const selected = options.find(
          (opt) => String(opt.value ?? opt.label ?? '') === String(value)
        );
        if (selected?.label) text = selected.label;
      }
      const boxWidth = Number(def.width) || 120;
      const boxHeight = Number(def.height) || 24;
      const textY = Number(def.y) + Math.max(2, (boxHeight - fontSize) / 2);
      const textX = Number(def.x) + 2;

      page.drawText(text, {
        x: textX,
        y: textY,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
        maxWidth: boxWidth - 4
      });
    }
  }

  /**
   * Add ESIGN Act compliant audit certificate page
   */
  static async addAuditCertificatePage(pdfDoc, workflowData, userData, auditTrail, options = {}) {
    const { referenceNumber = null, documentName = null, signatureImage = null } = options || {};
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

    // Document Details
    page.drawText('Document Details', {
      x: 72,
      y,
      size: 14,
      color: rgb(0, 0, 0),
      font: helveticaBold
    });
    y -= 30;

    if (documentName) {
      page.drawText(`Document Name: ${documentName}`, {
        x: 72,
        y,
        size: 10,
        color: rgb(0, 0, 0)
      });
      y -= 20;
    }

    if (referenceNumber) {
      page.drawText(`Document Reference: ${referenceNumber}`, {
        x: 72,
        y,
        size: 10,
        color: rgb(0, 0, 0)
      });
      y -= 20;
    }

    y -= 10;

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
    if (auditTrail?.signerRole) {
      signerInfo.push(`Signer Role: ${auditTrail.signerRole}`);
    }
    if (auditTrail?.clientName) {
      signerInfo.push(`Associated Client: ${auditTrail.clientName}`);
    }

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
      const lines = auditText.split('\n');
      const lineHeight = 10;
      const minY = signatureImage ? 170 : 90;
      for (const line of lines) {
        if (y <= minY) {
          page.drawText('... (audit trail truncated)', {
            x: 72,
            y,
            size: 8,
            color: rgb(0.4, 0.4, 0.4)
          });
          break;
        }
        page.drawText(line, {
          x: 72,
          y,
          size: 8,
          color: rgb(0, 0, 0)
        });
        y -= lineHeight;
      }
    }

    // Signature on audit page (optional)
    if (signatureImage) {
      try {
        const base64Data = signatureImage.replace(/^data:image\/\w+;base64,/, '');
        const imageBytes = Buffer.from(base64Data, 'base64');
        let embedded;
        try {
          embedded = await pdfDoc.embedPng(imageBytes);
        } catch (e) {
          embedded = await pdfDoc.embedJpg(imageBytes);
        }
        const sigWidth = 200;
        const sigHeight = 60;
        const sigX = 72;
        const sigY = 90;
        page.drawText('Signature:', {
          x: sigX,
          y: sigY + sigHeight + 10,
          size: 10,
          color: rgb(0, 0, 0)
        });
        page.drawImage(embedded, {
          x: sigX,
          y: sigY,
          width: sigWidth,
          height: sigHeight
        });
      } catch (e) {
        console.error('Failed to render signature on audit page:', e);
      }
    }
  }

  /**
   * Add an admin countersignature to the audit page.
   */
  static async addAdminSignatureToAuditPage(pdfDoc, signatureImageBase64, adminData = {}) {
    if (!signatureImageBase64) return;
    const pages = pdfDoc.getPages();
    if (!pages.length) return;
    const page = pages[pages.length - 1];
    const { width } = page.getSize();

    const base64Data = signatureImageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBytes = Buffer.from(base64Data, 'base64');
    let signatureImage;
    try {
      signatureImage = await pdfDoc.embedPng(imageBytes);
    } catch (e) {
      signatureImage = await pdfDoc.embedJpg(imageBytes);
    }

    const sigWidth = 180;
    const sigHeight = 50;
    const sigX = width - sigWidth - 72;
    const sigY = 90;

    const font = await pdfDoc.embedFont('Helvetica');
    page.drawText('Admin Counter-Signature', {
      x: sigX,
      y: sigY + sigHeight + 12,
      size: 10,
      font,
      color: rgb(0, 0, 0)
    });
    if (adminData?.name) {
      page.drawText(adminData.name, {
        x: sigX,
        y: sigY + sigHeight + 2,
        size: 9,
        font,
        color: rgb(0.2, 0.2, 0.2)
      });
    }

    page.drawImage(signatureImage, {
      x: sigX,
      y: sigY,
      width: sigWidth,
      height: sigHeight
    });
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

