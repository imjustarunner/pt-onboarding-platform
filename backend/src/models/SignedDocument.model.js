import pool from '../config/database.js';

class SignedDocument {
  static async create(documentData) {
    const {
      documentTemplateId,
      templateVersion,
      userId,
      taskId,
      signedPdfPath,
      pdfHash,
      ipAddress,
      userAgent,
      auditTrail,
      userDocumentId
    } = documentData;

    // Pass timestamp as parameter instead of using NOW() in SQL for better compatibility
    const now = new Date();
    const [result] = await pool.execute(
      `INSERT INTO signed_documents (
        document_template_id, template_version, user_id, task_id,
        signed_pdf_path, pdf_hash, signed_at, ip_address, user_agent, audit_trail, user_document_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        documentTemplateId,
        templateVersion,
        userId,
        taskId,
        signedPdfPath || null, // Allow NULL for consent phase
        pdfHash || null,        // Allow NULL for consent phase
        now, // Pass as parameter instead of NOW()
        ipAddress || null,
        userAgent || null,
        auditTrail ? JSON.stringify(auditTrail) : null,
        userDocumentId || null
      ]
    );

    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM signed_documents WHERE id = ?',
      [id]
    );
    if (rows[0]) {
      let auditTrail = null;
      if (rows[0].audit_trail) {
        try {
          // If it's already an object, use it as-is
          if (typeof rows[0].audit_trail === 'object') {
            auditTrail = rows[0].audit_trail;
          } else if (typeof rows[0].audit_trail === 'string') {
            // Try to parse it
            auditTrail = JSON.parse(rows[0].audit_trail);
          }
        } catch (parseError) {
          console.error(`SignedDocument.findById: Error parsing audit_trail for id ${id}:`, parseError);
          console.error(`SignedDocument.findById: audit_trail value:`, rows[0].audit_trail);
          // Return null if parsing fails
          auditTrail = null;
        }
      }
      return {
        ...rows[0],
        audit_trail: auditTrail
      };
    }
    return null;
  }

  static async findByUser(userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM signed_documents WHERE user_id = ? ORDER BY signed_at DESC',
      [userId]
    );
    return rows.map(row => {
      let auditTrail = null;
      if (row.audit_trail) {
        try {
          if (typeof row.audit_trail === 'object') {
            auditTrail = row.audit_trail;
          } else if (typeof row.audit_trail === 'string') {
            auditTrail = JSON.parse(row.audit_trail);
          }
        } catch (e) {
          console.error('SignedDocument.findByUser: Error parsing audit_trail:', e);
          auditTrail = null;
        }
      }
      return {
        ...row,
        audit_trail: auditTrail
      };
    });
  }

  static async findByTemplate(templateId) {
    const [rows] = await pool.execute(
      'SELECT * FROM signed_documents WHERE document_template_id = ? ORDER BY signed_at DESC',
      [templateId]
    );
    return rows.map(row => {
      let auditTrail = null;
      if (row.audit_trail) {
        try {
          if (typeof row.audit_trail === 'object') {
            auditTrail = row.audit_trail;
          } else if (typeof row.audit_trail === 'string') {
            auditTrail = JSON.parse(row.audit_trail);
          }
        } catch (e) {
          console.error('SignedDocument.findByTemplate: Error parsing audit_trail:', e);
          auditTrail = null;
        }
      }
      return {
        ...row,
        audit_trail: auditTrail
      };
    });
  }

  static async findByTask(taskId) {
    const [rows] = await pool.execute(
      'SELECT * FROM signed_documents WHERE task_id = ?',
      [taskId]
    );
    if (rows[0]) {
      let auditTrail = null;
      if (rows[0].audit_trail) {
        try {
          if (typeof rows[0].audit_trail === 'object') {
            auditTrail = rows[0].audit_trail;
          } else if (typeof rows[0].audit_trail === 'string') {
            auditTrail = JSON.parse(rows[0].audit_trail);
          }
        } catch (parseError) {
          console.error(`SignedDocument.findByTask: Error parsing audit_trail for task ${taskId}:`, parseError);
          console.error(`SignedDocument.findByTask: audit_trail value:`, rows[0].audit_trail);
          auditTrail = null;
        }
      }
      return {
        ...rows[0],
        audit_trail: auditTrail
      };
    }
    return null;
  }
}

export default SignedDocument;

