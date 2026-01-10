import Task from '../models/Task.model.js';
import DocumentTemplate from '../models/DocumentTemplate.model.js';
import SignedDocument from '../models/SignedDocument.model.js';
import DocumentSignatureWorkflow from '../models/DocumentSignatureWorkflow.model.js';
import DocumentSigningService from '../services/documentSigning.service.js';
import pool from '../config/database.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { validationResult } from 'express-validator';
import { getClientIpAddress } from '../utils/ipAddress.util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getDocumentTask = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;

    console.log(`getDocumentTask: Fetching task ${taskId} for user ${userId}`);

    const task = await Task.findById(taskId);
    if (!task || task.task_type !== 'document') {
      console.error(`getDocumentTask: Task ${taskId} not found or not a document task`);
      return res.status(404).json({ error: { message: 'Document task not found' } });
    }

    console.log(`getDocumentTask: Task found, reference_id: ${task.reference_id}`);

    // Verify user has access - check direct assignment first (simpler and faster)
    let userHasAccess = false;
    
    // First, check direct assignment (most common case)
    if (task.assigned_to_user_id === userId) {
      console.log('getDocumentTask: User has direct access via assigned_to_user_id');
      userHasAccess = true;
    } else {
      // Check agency assignment
      if (task.assigned_to_agency_id) {
        try {
          const User = (await import('../models/User.model.js')).default;
          const userAgencies = await User.getAgencies(userId);
          userHasAccess = userAgencies.some(agency => agency.id === task.assigned_to_agency_id);
          if (userHasAccess) {
            console.log('getDocumentTask: User has access via agency assignment');
          }
        } catch (agencyError) {
          console.error('getDocumentTask: Error checking agency access:', agencyError);
          // Try the complex query as last resort
          try {
            const userTasks = await Task.findByUser(userId);
            userHasAccess = userTasks.some(t => t.id === parseInt(taskId));
            if (userHasAccess) {
              console.log('getDocumentTask: User has access via Task.findByUser');
            }
          } catch (queryError) {
            console.error('getDocumentTask: Error in Task.findByUser:', queryError);
            console.error('getDocumentTask: Query error details:', {
              message: queryError.message,
              code: queryError.code,
              sqlMessage: queryError.sqlMessage
            });
          }
        }
      } else {
        // No agency assignment, try the complex query
        try {
          const userTasks = await Task.findByUser(userId);
          userHasAccess = userTasks.some(t => t.id === parseInt(taskId));
          if (userHasAccess) {
            console.log('getDocumentTask: User has access via Task.findByUser');
          }
        } catch (queryError) {
          console.error('getDocumentTask: Error in Task.findByUser:', queryError);
          console.error('getDocumentTask: Query error details:', {
            message: queryError.message,
            code: queryError.code,
            sqlMessage: queryError.sqlMessage
          });
        }
      }
    }
    
    if (!userHasAccess) {
      console.error(`getDocumentTask: User ${userId} does not have access to task ${taskId}`);
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    // Check document action type - if review, don't allow signature workflow
    if (task.document_action_type === 'review') {
      console.log(`getDocumentTask: Task ${taskId} is a review document, not signature`);
      return res.status(400).json({ 
        error: { message: 'This document requires review/acknowledgment, not signature. Use the review workflow.' } 
      });
    }

    console.log(`getDocumentTask: Fetching template ${task.reference_id}`);
    const template = await DocumentTemplate.findById(task.reference_id);
    if (!template) {
      console.error(`getDocumentTask: Template ${task.reference_id} not found`);
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    console.log(`getDocumentTask: Template found, checking for user document or user-specific document...`);
    
    // Try to get user document (personalized copy) or user-specific document
    const UserDocument = (await import('../models/UserDocument.model.js')).default;
    const UserSpecificDocument = (await import('../models/UserSpecificDocument.model.js')).default;
    
    let userDocument = null;
    let userSpecificDocument = null;
    
    try {
      userDocument = await UserDocument.findByTask(taskId);
      if (!userDocument) {
        userSpecificDocument = await UserSpecificDocument.findByTask(taskId);
      }
    } catch (err) {
      console.warn('Error fetching user document or user-specific document:', err);
    }
    
    // Check if already signed
    let existingSigned = null;
    let workflow = null;
    
    try {
      existingSigned = await SignedDocument.findByTask(taskId);
      console.log(`getDocumentTask: Existing signed document: ${existingSigned ? existingSigned.id : 'none'}`);

      if (existingSigned) {
        try {
          console.log(`getDocumentTask: Fetching workflow for signed document ${existingSigned.id}`);
          workflow = await DocumentSignatureWorkflow.findBySignedDocument(existingSigned.id);
          console.log(`getDocumentTask: Workflow found: ${workflow ? workflow.id : 'none'}`);
        } catch (workflowError) {
          console.error(`getDocumentTask: Error fetching workflow:`, workflowError);
          console.error(`getDocumentTask: Workflow error details:`, {
            message: workflowError.message,
            code: workflowError.code,
            sqlMessage: workflowError.sqlMessage
          });
          // Don't fail if workflow doesn't exist, just set to null
          workflow = null;
        }
      }
    } catch (signedDocError) {
      console.error(`getDocumentTask: Error fetching signed document:`, signedDocError);
      console.error(`getDocumentTask: Signed document error details:`, {
        message: signedDocError.message,
        code: signedDocError.code,
        sqlMessage: signedDocError.sqlMessage
      });
      // Continue without signed document - user might be starting fresh
      existingSigned = null;
    }

    res.json({
      task,
      template,
      userDocument, // Personalized copy if exists
      userSpecificDocument, // User-specific document if exists
      signedDocument: existingSigned,
      workflow
    });
  } catch (error) {
    console.error('getDocumentTask: Error:', error);
    console.error('getDocumentTask: Error stack:', error.stack);
    console.error('getDocumentTask: Error details:', {
      message: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage,
      sqlState: error.sqlState,
      errno: error.errno
    });
    
    // Always return detailed error info
    return res.status(500).json({
      error: {
        message: error.message || 'Internal server error',
        code: error.code,
        sqlMessage: error.sqlMessage,
        sqlState: error.sqlState,
        errno: error.errno,
        ...(process.env.NODE_ENV === 'development' && { 
          stack: error.stack
        })
      }
    });
  }
};

export const giveConsent = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;
    const ipAddress = getClientIpAddress(req);
    const userAgent = req.get('user-agent');

    console.log(`giveConsent: Processing consent for task ${taskId}, user ${userId}`);

    const task = await Task.findById(taskId);
    if (!task || task.task_type !== 'document') {
      console.error(`giveConsent: Task ${taskId} not found or not a document task`);
      return res.status(404).json({ error: { message: 'Document task not found' } });
    }

    console.log(`giveConsent: Task found, reference_id: ${task.reference_id}`);

    // Check if already signed and finalized (has a PDF path)
    const existingSigned = await SignedDocument.findByTask(taskId);
    if (existingSigned) {
      // Only block if document is actually finalized (has a signed PDF)
      if (existingSigned.signed_pdf_path && existingSigned.signed_pdf_path.trim() !== '') {
        console.log(`giveConsent: Document already signed and finalized for task ${taskId}`);
        return res.status(400).json({ error: { message: 'Document already signed' } });
      } else {
        // Document record exists but not finalized - delete it and start fresh
        console.log(`giveConsent: Found incomplete signed document (ID: ${existingSigned.id}), deleting to start fresh`);
        try {
          // Delete workflow record first (foreign key constraint)
          await pool.execute('DELETE FROM document_signature_workflow WHERE signed_document_id = ?', [existingSigned.id]);
          console.log(`giveConsent: Deleted workflow for incomplete signed document ${existingSigned.id}`);
          // Then delete the signed document
          await pool.execute('DELETE FROM signed_documents WHERE id = ?', [existingSigned.id]);
          console.log(`giveConsent: Deleted incomplete signed document ${existingSigned.id}`);
        } catch (deleteError) {
          console.error(`giveConsent: Error deleting incomplete signed document:`, deleteError);
          console.error(`giveConsent: Delete error details:`, {
            message: deleteError.message,
            code: deleteError.code,
            sqlMessage: deleteError.sqlMessage
          });
          // Continue anyway - we'll try to create a new one
        }
      }
    }

    // Check for user document or user-specific document
    const UserDocument = (await import('../models/UserDocument.model.js')).default;
    const UserSpecificDocument = (await import('../models/UserSpecificDocument.model.js')).default;
    
    let userDocument = null;
    let userSpecificDocument = null;
    let template = null;
    let documentTemplateId = null;
    let templateVersion = 1;
    let userDocumentId = null;
    
    // Try to get user document first (personalized copy)
    try {
      userDocument = await UserDocument.findByTask(taskId);
      if (userDocument) {
        console.log(`giveConsent: Found user document ${userDocument.id}`);
        template = await DocumentTemplate.findById(userDocument.document_template_id);
        if (template) {
          documentTemplateId = template.id;
          templateVersion = template.version || 1;
          userDocumentId = userDocument.id;
        }
      } else {
        // Check for user-specific document
        userSpecificDocument = await UserSpecificDocument.findByTask(taskId);
        if (userSpecificDocument) {
          console.log(`giveConsent: Found user-specific document ${userSpecificDocument.id}`);
          // For user-specific documents, we still need a template ID for signed_documents
          // Use the task's reference_id (which should be the user-specific document ID)
          documentTemplateId = task.reference_id; // This will be the user-specific document ID
          templateVersion = 1;
        } else {
          // Fallback to template (for backward compatibility)
          console.log(`giveConsent: No user document found, using template ${task.reference_id}`);
          template = await DocumentTemplate.findById(task.reference_id);
          if (!template) {
            console.error(`giveConsent: Template ${task.reference_id} not found`);
            return res.status(404).json({ 
              error: { 
                message: 'Document template not found',
                templateId: task.reference_id 
              } 
            });
          }
          documentTemplateId = template.id;
          templateVersion = template.version || 1;
        }
      }
    } catch (err) {
      console.error('giveConsent: Error fetching user document or template:', err);
      // Fallback to template
      template = await DocumentTemplate.findById(task.reference_id);
      if (!template) {
        return res.status(404).json({ 
          error: { 
            message: 'Document template not found',
            templateId: task.reference_id 
          } 
        });
      }
      documentTemplateId = template.id;
      templateVersion = template.version || 1;
    }

    // Validate template version
    if (templateVersion === null || templateVersion === undefined) {
      console.warn(`giveConsent: Template version is null, defaulting to 1`);
      templateVersion = 1;
    }

    console.log(`giveConsent: Creating signed document with template ID ${documentTemplateId}, version: ${templateVersion}...`);
    console.log(`giveConsent: Data being inserted:`, {
      documentTemplateId,
      templateVersion,
      userId,
      taskId,
      userDocumentId,
      signedPdfPath: null,
      pdfHash: null
    });
    
    let signedDoc;
    try {
      // Ensure taskId is an integer
      const taskIdInt = parseInt(taskId);
      if (isNaN(taskIdInt)) {
        throw new Error(`Invalid taskId: ${taskId}`);
      }

      signedDoc = await SignedDocument.create({
        documentTemplateId,
        templateVersion,
        userId,
        taskId: taskIdInt,
        userDocumentId: userDocumentId || null,
        signedPdfPath: null, // NULL during consent phase, will be set on finalization
        pdfHash: null,        // NULL during consent phase, will be set on finalization
        ipAddress: ipAddress || 'unknown',
        userAgent: userAgent || 'unknown',
        auditTrail: {}
      });
      
      if (!signedDoc || !signedDoc.id) {
        throw new Error('Failed to create signed document: No ID returned');
      }
      
      console.log(`giveConsent: Signed document created with ID ${signedDoc.id}`);
    } catch (createError) {
      console.error('giveConsent: Error creating signed document:', createError);
      console.error('giveConsent: Create error details:', {
        message: createError.message,
        code: createError.code,
        sqlMessage: createError.sqlMessage,
        sqlState: createError.sqlState,
        errno: createError.errno,
        sql: createError.sql
      });
      throw createError; // Re-throw to be caught by outer catch
    }

    // Create workflow record
    let workflow;
    try {
      console.log(`giveConsent: Creating workflow for signed document ${signedDoc.id}`);
      workflow = await DocumentSignatureWorkflow.create(signedDoc.id);
      console.log(`giveConsent: Workflow created with ID ${workflow.id}`);
    } catch (workflowError) {
      console.error('giveConsent: Error creating workflow:', workflowError);
      console.error('giveConsent: Workflow error details:', {
        message: workflowError.message,
        code: workflowError.code,
        sqlMessage: workflowError.sqlMessage,
        sqlState: workflowError.sqlState,
        signedDocumentId: signedDoc.id
      });
      // Clean up the signed document if workflow creation fails
      try {
        await pool.execute('DELETE FROM signed_documents WHERE id = ?', [signedDoc.id]);
        console.log(`giveConsent: Cleaned up signed document ${signedDoc.id} after workflow creation failure`);
      } catch (cleanupError) {
        console.error('giveConsent: Error cleaning up signed document:', cleanupError);
      }
      throw workflowError;
    }

    try {
      console.log(`giveConsent: Recording consent for signed document ${signedDoc.id}...`);
      await DocumentSignatureWorkflow.recordConsent(signedDoc.id, ipAddress, userAgent);
      console.log(`giveConsent: Consent recorded successfully`);
    } catch (consentError) {
      console.error('giveConsent: Error recording consent:', consentError);
      console.error('giveConsent: Consent error details:', {
        message: consentError.message,
        code: consentError.code,
        sqlMessage: consentError.sqlMessage
      });
      // Don't fail - workflow is created, consent can be retried
    }

    const finalWorkflow = await DocumentSignatureWorkflow.findBySignedDocument(signedDoc.id);
    res.json({ success: true, workflow: finalWorkflow });
  } catch (error) {
    console.error('giveConsent: Error:', error);
    console.error('giveConsent: Error stack:', error.stack);
    console.error('giveConsent: Error details:', {
      message: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage,
      sqlState: error.sqlState,
      errno: error.errno,
      sql: error.sql
    });
    
    // Always return detailed error info for debugging
    return res.status(500).json({
      error: {
        message: error.message || 'Internal server error',
        code: error.code,
        sqlMessage: error.sqlMessage,
        sqlState: error.sqlState,
        errno: error.errno,
        ...(process.env.NODE_ENV === 'development' && { 
          stack: error.stack,
          sql: error.sql
        })
      }
    });
  }
};

export const recordIntent = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;
    const ipAddress = getClientIpAddress(req);
    const userAgent = req.get('user-agent');

    const task = await Task.findById(taskId);
    if (!task || task.task_type !== 'document') {
      return res.status(404).json({ error: { message: 'Document task not found' } });
    }

    const signedDoc = await SignedDocument.findByTask(taskId);
    if (!signedDoc) {
      return res.status(400).json({ error: { message: 'Consent must be given first' } });
    }

    await DocumentSignatureWorkflow.recordIntent(signedDoc.id, ipAddress, userAgent);

    res.json({ success: true, workflow: await DocumentSignatureWorkflow.findBySignedDocument(signedDoc.id) });
  } catch (error) {
    next(error);
  }
};

export const signDocument = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { taskId } = req.params;
    const { signatureData } = req.body;
    const userId = req.user.id;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent');

    console.log(`signDocument: Processing signature for task ${taskId}, user ${userId}`);

    if (!signatureData) {
      return res.status(400).json({ error: { message: 'Signature data is required' } });
    }

    const task = await Task.findById(taskId);
    if (!task || task.task_type !== 'document') {
      console.error(`signDocument: Task ${taskId} not found or not a document task`);
      return res.status(404).json({ error: { message: 'Document task not found' } });
    }

    const signedDoc = await SignedDocument.findByTask(taskId);
    if (!signedDoc) {
      console.error(`signDocument: Signed document not found for task ${taskId}`);
      return res.status(400).json({ error: { message: 'Consent and intent must be recorded first' } });
    }

    const workflow = await DocumentSignatureWorkflow.findBySignedDocument(signedDoc.id);
    if (!workflow) {
      console.error(`signDocument: Workflow not found for signed document ${signedDoc.id}`);
      return res.status(400).json({ error: { message: 'Workflow not found. Please start over.' } });
    }

    if (!workflow.consent_given_at || !workflow.intent_to_sign_at) {
      console.error(`signDocument: Missing consent or intent. Consent: ${workflow.consent_given_at}, Intent: ${workflow.intent_to_sign_at}`);
      return res.status(400).json({ error: { message: 'Consent and intent must be recorded first' } });
    }

    console.log(`signDocument: Recording identity verification...`);
    // Record identity verification (authenticated user = identity binding)
    await DocumentSignatureWorkflow.recordIdentityVerification(signedDoc.id);

    console.log(`signDocument: Fetching user document or template...`);
    
    // Try to get user document first (personalized copy)
    const UserDocument = (await import('../models/UserDocument.model.js')).default;
    const userDocument = await UserDocument.findByTask(taskId);
    
    let template = null;
    let userSpecificDocument = null;
    let templatePath = null;
    let htmlContent = null;
    let templateType = null;
    let signatureCoords = null;

    if (userDocument) {
      // Use personalized user document
      console.log(`signDocument: Using personalized user document ${userDocument.id}`);
      template = await DocumentTemplate.findById(userDocument.document_template_id);
      if (!template) {
        return res.status(404).json({ error: { message: 'Document template not found' } });
      }
      
      templateType = template.template_type;
      if (templateType === 'html') {
        htmlContent = userDocument.personalized_content || template.html_content;
      } else if (templateType === 'pdf') {
        templatePath = userDocument.personalized_file_path
          ? path.join(__dirname, '../../uploads', userDocument.personalized_file_path)
          : (template.file_path ? path.join(__dirname, '../../uploads/templates', template.file_path) : null);
      }
      
      signatureCoords = {
        x: template.signature_x,
        y: template.signature_y,
        width: template.signature_width,
        height: template.signature_height,
        page: template.signature_page
      };
    } else {
      // Check for user-specific document
      const UserSpecificDocument = (await import('../models/UserSpecificDocument.model.js')).default;
      userSpecificDocument = await UserSpecificDocument.findByTask(taskId);
      
      if (userSpecificDocument) {
        console.log(`signDocument: Using user-specific document ${userSpecificDocument.id}`);
        templateType = userSpecificDocument.template_type;
        if (templateType === 'html') {
          htmlContent = userSpecificDocument.html_content;
        } else if (templateType === 'pdf') {
          templatePath = userSpecificDocument.file_path
            ? path.join(__dirname, '../../uploads', userSpecificDocument.file_path)
            : null;
        }
        
        signatureCoords = {
          x: userSpecificDocument.signature_x,
          y: userSpecificDocument.signature_y,
          width: userSpecificDocument.signature_width,
          height: userSpecificDocument.signature_height,
          page: userSpecificDocument.signature_page
        };
      } else {
        // Fallback to template (for backward compatibility)
        console.log(`signDocument: Falling back to template ${signedDoc.document_template_id}`);
        template = await DocumentTemplate.findById(signedDoc.document_template_id);
        if (!template) {
          console.error(`signDocument: Template ${signedDoc.document_template_id} not found`);
          return res.status(404).json({ error: { message: 'Document template not found' } });
        }
        
        templateType = template.template_type;
        if (templateType === 'html') {
          htmlContent = template.html_content;
        } else if (templateType === 'pdf') {
          // Use relative path - StorageService will handle GCS vs local
          templatePath = template.file_path || null;
        }
        
        signatureCoords = {
          x: template.signature_x,
          y: template.signature_y,
          width: template.signature_width,
          height: template.signature_height,
          page: template.signature_page
        };
      }
    }

    console.log(`signDocument: Fetching user ${userId}...`);
    const User = (await import('../models/User.model.js')).default;
    const user = await User.findById(userId);
    if (!user) {
      console.error(`signDocument: User ${userId} not found`);
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    console.log(`signDocument: Generating finalized PDF...`);
    // Generate finalized PDF
    let pdfBytes;
    try {
      pdfBytes = await DocumentSigningService.generateFinalizedPDF(
        templatePath,
        templateType,
        htmlContent,
        signatureData,
        workflow,
        { firstName: user.first_name, lastName: user.last_name, email: user.email, userId: user.id },
        signedDoc.audit_trail || {},
        signatureCoords // Pass signature coordinates
      );
      console.log(`signDocument: PDF generated successfully, size: ${pdfBytes.length} bytes`);
    } catch (pdfError) {
      console.error('signDocument: Error generating PDF:', pdfError);
      console.error('signDocument: PDF error stack:', pdfError.stack);
      throw new Error(`Failed to generate PDF: ${pdfError.message}`);
    }

    console.log(`signDocument: Calculating PDF hash...`);
    // Calculate hash
    const pdfHash = DocumentSigningService.calculatePDFHash(pdfBytes);

    console.log(`signDocument: Saving PDF file using storage service...`);
    // Save PDF using storage service (user-specific, secure structure)
    const StorageService = (await import('../services/storage.service.js')).default;
    const filename = `signed-${signedDoc.id}-${Date.now()}.pdf`;
    const storageResult = await StorageService.saveSignedDocument(
      userId,
      signedDoc.id,
      pdfBytes,
      filename
    );
    console.log(`signDocument: PDF saved to ${storageResult.path}`);

    console.log(`signDocument: Updating signed document record...`);
    // Update signed document with relative path and user_document_id (for database storage)
    const updateQuery = userDocument
      ? 'UPDATE signed_documents SET signed_pdf_path = ?, pdf_hash = ?, user_document_id = ? WHERE id = ?'
      : 'UPDATE signed_documents SET signed_pdf_path = ?, pdf_hash = ? WHERE id = ?';
    const updateParams = userDocument
      ? [storageResult.relativePath, pdfHash, userDocument.id, signedDoc.id]
      : [storageResult.relativePath, pdfHash, signedDoc.id];
    await pool.execute(updateQuery, updateParams);

    console.log(`signDocument: Finalizing workflow...`);
    // Finalize workflow
    await DocumentSignatureWorkflow.finalize(signedDoc.id);

    console.log(`signDocument: Marking task as complete...`);
    // Mark task as complete
    await Task.markComplete(taskId, userId);

    console.log(`signDocument: Successfully finalized document for task ${taskId}`);
    res.json({
      success: true,
      signedDocument: await SignedDocument.findById(signedDoc.id),
      downloadUrl: `/api/document-signing/${taskId}/download`
    });
  } catch (error) {
    console.error('signDocument: Error:', error);
    console.error('signDocument: Error stack:', error.stack);
    console.error('signDocument: Error details:', {
      message: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage,
      sqlState: error.sqlState
    });
    
    return res.status(500).json({
      error: {
        message: error.message || 'Internal server error',
        code: error.code,
        sqlMessage: error.sqlMessage,
        sqlState: error.sqlState,
        ...(process.env.NODE_ENV === 'development' && { 
          stack: error.stack
        })
      }
    });
  }
};

export const viewSignedDocument = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;

    console.log(`viewSignedDocument: Fetching signed document for task ${taskId}, user ${userId}`);

    const task = await Task.findById(taskId);
    if (!task) {
      console.error(`viewSignedDocument: Task ${taskId} not found`);
      return res.status(404).json({ error: { message: 'Task not found' } });
    }

    const signedDoc = await SignedDocument.findByTask(taskId);
    if (!signedDoc) {
      console.error(`viewSignedDocument: Signed document not found for task ${taskId}`);
      return res.status(404).json({ error: { message: 'Signed document not found. Please complete the signature process first.' } });
    }

    // Check if document is finalized (has a signed PDF)
    if (!signedDoc.signed_pdf_path || (typeof signedDoc.signed_pdf_path === 'string' && signedDoc.signed_pdf_path.trim() === '')) {
      console.error(`viewSignedDocument: Document for task ${taskId} is not finalized yet`);
      return res.status(400).json({ 
        error: { 
          message: 'Document has not been finalized yet. Please complete the signature process first.',
          status: 'not_finalized'
        } 
      });
    }

    // Verify access - admins/super_admins/support can access any document
    // Regular users can only access their own documents
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      if (signedDoc.user_id !== userId && task.assigned_to_user_id !== userId) {
        console.error(`viewSignedDocument: Access denied for user ${userId} to task ${taskId}`);
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    // Use storage service to read the document
    const StorageService = (await import('../services/storage.service.js')).default;
    
    // Parse the stored path to get components
    const pathInfo = StorageService.parseSignedDocumentPath(signedDoc.signed_pdf_path);
    
    if (!pathInfo) {
      console.error(`viewSignedDocument: Invalid path format: ${signedDoc.signed_pdf_path}`);
      return res.status(500).json({ 
        error: { 
          message: 'Invalid document path format',
          path: signedDoc.signed_pdf_path
        } 
      });
    }

    // If old format, migrate it
    let finalPath = signedDoc.signed_pdf_path;
    if (pathInfo.format === 'old') {
      console.log(`viewSignedDocument: Migrating old format path to new structure...`);
      finalPath = await StorageService.migrateOldPathToNew(signedDoc.signed_pdf_path, signedDoc.user_id, signedDoc.id);
      // Update database with new path
      await pool.execute(
        'UPDATE signed_documents SET signed_pdf_path = ? WHERE id = ?',
        [finalPath, signedDoc.id]
      );
      // Re-parse with new path
      const newPathInfo = StorageService.parseSignedDocumentPath(finalPath);
      if (newPathInfo) {
        Object.assign(pathInfo, newPathInfo);
      }
    }

    console.log(`viewSignedDocument: Reading document from storage...`);
    let fileBuffer;
    try {
      if (pathInfo.format === 'new') {
        // New format: use storage service
        try {
          fileBuffer = await StorageService.readSignedDocument(
            pathInfo.userId,
            pathInfo.documentId,
            pathInfo.filename
          );
        } catch (storageError) {
          console.error(`viewSignedDocument: Storage service error:`, storageError);
          // Try fallback to old format if new format fails
          console.log(`viewSignedDocument: Attempting fallback to old format...`);
          const oldPath = path.join(__dirname, '../../uploads', signedDoc.signed_pdf_path);
          try {
            fileBuffer = await fs.readFile(oldPath);
            console.log(`viewSignedDocument: Successfully read from old format path`);
          } catch (oldPathError) {
            console.error(`viewSignedDocument: Old path also failed:`, oldPathError);
            throw storageError; // Throw original error
          }
        }
      } else {
        // Fallback for old format (shouldn't happen after migration)
        const oldPath = path.join(__dirname, '../../uploads', signedDoc.signed_pdf_path);
        fileBuffer = await fs.readFile(oldPath);
      }
    } catch (readError) {
      console.error(`viewSignedDocument: Failed to read file:`, readError);
      console.error(`viewSignedDocument: Path info:`, pathInfo);
      console.error(`viewSignedDocument: Stored path:`, signedDoc.signed_pdf_path);
      console.error(`viewSignedDocument: Final path:`, finalPath);
      
      // Provide more helpful error message
      let errorMessage = 'PDF file not found on server.';
      if (readError.code === 'ENOENT') {
        errorMessage = 'The signed document file was not found. This may be due to: 1) The document was signed before proper file storage was implemented, 2) The file was moved or deleted, or 3) A storage migration issue.';
      } else if (readError.message) {
        errorMessage = `Error reading document: ${readError.message}`;
      }
      
      return res.status(404).json({ 
        error: { 
          message: errorMessage,
          path: finalPath,
          storedPath: signedDoc.signed_pdf_path,
          pathInfo: pathInfo
        } 
      });
    }

    console.log(`viewSignedDocument: File found, sending to client for viewing`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="signed-document-${taskId}.pdf"`); // inline for viewing, not attachment
    res.send(fileBuffer);
  } catch (error) {
    console.error('viewSignedDocument: Error:', error);
    console.error('viewSignedDocument: Error stack:', error.stack);
    return res.status(500).json({
      error: {
        message: error.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { 
          stack: error.stack
        })
      }
    });
  }
};

export const downloadSignedDocument = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;

    console.log(`downloadSignedDocument: Fetching signed document for task ${taskId}, user ${userId}`);

    const task = await Task.findById(taskId);
    if (!task) {
      console.error(`downloadSignedDocument: Task ${taskId} not found`);
      return res.status(404).json({ error: { message: 'Task not found' } });
    }

    const signedDoc = await SignedDocument.findByTask(taskId);
    if (!signedDoc) {
      console.error(`downloadSignedDocument: Signed document not found for task ${taskId}`);
      return res.status(404).json({ error: { message: 'Signed document not found. Please complete the signature process first.' } });
    }

    // Check if document is finalized (has a signed PDF)
    if (!signedDoc.signed_pdf_path || (typeof signedDoc.signed_pdf_path === 'string' && signedDoc.signed_pdf_path.trim() === '')) {
      console.error(`downloadSignedDocument: Document for task ${taskId} is not finalized yet`);
      return res.status(400).json({ 
        error: { 
          message: 'Document has not been finalized yet. Please complete the signature process first.',
          status: 'not_finalized'
        } 
      });
    }

    // Verify access - admins/super_admins/support can access any document
    // Regular users can only access their own documents
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      if (signedDoc.user_id !== userId && task.assigned_to_user_id !== userId) {
        console.error(`downloadSignedDocument: Access denied for user ${userId} to task ${taskId}`);
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    // Use storage service to read the document
    const StorageService = (await import('../services/storage.service.js')).default;
    
    // Parse the stored path to get components
    const pathInfo = StorageService.parseSignedDocumentPath(signedDoc.signed_pdf_path);
    
    if (!pathInfo) {
      console.error(`downloadSignedDocument: Invalid path format: ${signedDoc.signed_pdf_path}`);
      return res.status(500).json({ 
        error: { 
          message: 'Invalid document path format',
          path: signedDoc.signed_pdf_path
        } 
      });
    }

    // If old format, migrate it
    let finalPath = signedDoc.signed_pdf_path;
    if (pathInfo.format === 'old') {
      console.log(`downloadSignedDocument: Migrating old format path to new structure...`);
      finalPath = await StorageService.migrateOldPathToNew(signedDoc.signed_pdf_path, signedDoc.user_id, signedDoc.id);
      // Update database with new path
      await pool.execute(
        'UPDATE signed_documents SET signed_pdf_path = ? WHERE id = ?',
        [finalPath, signedDoc.id]
      );
      // Re-parse with new path
      const newPathInfo = StorageService.parseSignedDocumentPath(finalPath);
      if (newPathInfo) {
        Object.assign(pathInfo, newPathInfo);
      }
    }

    console.log(`downloadSignedDocument: Reading document from storage...`);
    let fileBuffer;
    try {
      if (pathInfo.format === 'new') {
        // New format: use storage service
        fileBuffer = await StorageService.readSignedDocument(
          pathInfo.userId,
          pathInfo.documentId,
          pathInfo.filename
        );
      } else {
        // Fallback for old format (shouldn't happen after migration)
        const oldPath = path.join(__dirname, '../../uploads', signedDoc.signed_pdf_path);
        fileBuffer = await fs.readFile(oldPath);
      }
    } catch (readError) {
      console.error(`downloadSignedDocument: Failed to read file:`, readError);
      return res.status(404).json({ 
        error: { 
          message: 'PDF file not found on server. The document may not have been finalized correctly.',
          path: finalPath
        } 
      });
    }

    console.log(`downloadSignedDocument: File found, sending to client`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="signed-document-${taskId}.pdf"`);
    res.send(fileBuffer);
  } catch (error) {
    console.error('downloadSignedDocument: Error:', error);
    console.error('downloadSignedDocument: Error stack:', error.stack);
    console.error('downloadSignedDocument: Error details:', {
      message: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage
    });
    
    return res.status(500).json({
      error: {
        message: error.message || 'Internal server error',
        code: error.code,
        sqlMessage: error.sqlMessage,
        ...(process.env.NODE_ENV === 'development' && { 
          stack: error.stack
        })
      }
    });
  }
};

export const verifyDocument = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;

    const signedDoc = await SignedDocument.findByTask(taskId);
    if (!signedDoc) {
      return res.status(404).json({ error: { message: 'Signed document not found' } });
    }

    // Verify access
    if (signedDoc.user_id !== userId && req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    // Use storage service to read the document
    const StorageService = (await import('../services/storage.service.js')).default;
    const pathInfo = StorageService.parseSignedDocumentPath(signedDoc.signed_pdf_path);
    
    if (!pathInfo) {
      return res.status(500).json({ error: { message: 'Invalid document path format' } });
    }

    let fileBuffer;
    if (pathInfo.format === 'new') {
      fileBuffer = await StorageService.readSignedDocument(
        pathInfo.userId,
        pathInfo.documentId,
        pathInfo.filename
      );
    } else {
      // Old format fallback
      const filePath = path.join(__dirname, '../../uploads', signedDoc.signed_pdf_path);
      fileBuffer = await fs.readFile(filePath);
    }

    // Verify PDF integrity using the buffer
    const verification = await DocumentSigningService.verifyPDFIntegrityFromBuffer(fileBuffer, signedDoc.pdf_hash);

    res.json(verification);
  } catch (error) {
    next(error);
  }
};

