import DocumentSigningService from './documentSigning.service.js';
import StorageService from './storage.service.js';
import { PDFDocument } from 'pdf-lib';

class PublicIntakeSigningService {
  static async generateSignedDocument({
    template,
    signatureData,
    signer,
    auditTrail,
    workflowData,
    submissionId,
    fieldDefinitions = [],
    fieldValues = {}
  }) {
    const templateType = template.template_type;
    const htmlContent = templateType === 'html' ? template.html_content : null;
    const templatePath = templateType === 'pdf' ? template.file_path || null : null;
    const signatureCoords = {
      x: template.signature_x,
      y: template.signature_y,
      width: template.signature_width,
      height: template.signature_height,
      page: template.signature_page
    };

    const referenceNumber = `INTAKE-${submissionId}-${template.id}-${Date.now().toString(36).toUpperCase()}`;
    const documentName = template.name || 'Document';
    const mergedAuditTrail = {
      ...(auditTrail || {}),
      documentReference: referenceNumber,
      documentName
    };

    const pdfBytes = await DocumentSigningService.generateFinalizedPDF(
      templatePath,
      templateType,
      htmlContent,
      signatureData,
      workflowData,
      signer,
      mergedAuditTrail,
      signatureCoords,
      {
        referenceNumber,
        documentName,
        signatureOnAuditPage: true,
        fieldDefinitions,
        fieldValues
      }
    );

    const pdfHash = DocumentSigningService.calculatePDFHash(pdfBytes);
    const filename = `intake-${submissionId}-${template.id}-${Date.now()}.pdf`;
    const storageResult = await StorageService.saveIntakeSignedDocument({
      submissionId,
      templateId: template.id,
      fileBuffer: pdfBytes,
      filename
    });

    return {
      pdfHash,
      storagePath: storageResult.relativePath,
      pdfBytes,
      referenceNumber
    };
  }

  static async mergeSignedPdfs(pdfBuffers) {
    const merged = await PDFDocument.create();
    for (const buf of pdfBuffers) {
      const doc = await PDFDocument.load(buf);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    }
    return await merged.save();
  }
}

export default PublicIntakeSigningService;
