import pool from '../config/database.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DocumentTemplate {
  static async create(templateData) {
    const {
      name,
      description,
      templateType,
      filePath,
      htmlContent,
      agencyId,
      createdByUserId,
      documentType,
      documentActionType,
      isUserSpecific,
      userId,
      iconId,
      signatureX,
      signatureY,
      signatureWidth,
      signatureHeight,
      signaturePage
    } = templateData;

    // Get latest version for this template name, agency, and user (if user-specific)
    // Documents with the same name but different agencies should have independent versioning
    let versionQuery = 'SELECT MAX(version) as max_version FROM document_templates WHERE name = ?';
    const versionParams = [name];
    
    // Include agency_id in version calculation (NULL for platform, specific ID for agency)
    if (agencyId !== null && agencyId !== undefined) {
      versionQuery += ' AND agency_id = ?';
      versionParams.push(agencyId);
    } else {
      versionQuery += ' AND agency_id IS NULL';
    }
    
    if (isUserSpecific && userId) {
      versionQuery += ' AND user_id = ?';
      versionParams.push(userId);
    } else {
      versionQuery += ' AND (user_id IS NULL OR user_id = ?)';
      versionParams.push(null);
    }
    
    const [versionRows] = await pool.execute(versionQuery, versionParams);
    const version = (versionRows[0].max_version || 0) + 1;

    // Check if icon_id column exists
    let hasIconColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'document_templates' AND COLUMN_NAME = 'icon_id'"
      );
      hasIconColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for icon_id column:', err);
    }

    // Build insert query based on whether icon_id column exists
    let insertFields = `name, description, version, template_type, 
        file_path, html_content, agency_id, created_by_user_id,
        document_type, document_action_type, is_user_specific, user_id`;
    let insertValues = '?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?';
    let insertParams = [
      name,
      description,
      version,
      templateType,
      filePath,
      htmlContent,
      agencyId,
      createdByUserId,
      documentType || 'administrative',
      documentActionType || 'signature',
      isUserSpecific || false,
      userId || null
    ];

    if (hasIconColumn) {
      insertFields += ', icon_id';
      insertValues += ', ?';
      insertParams.push(iconId || null);
    }

    insertFields += ', signature_x, signature_y, signature_width, signature_height, signature_page';
    insertValues += ', ?, ?, ?, ?, ?';
    insertParams.push(
      signatureX || null,
      signatureY || null,
      signatureWidth || null,
      signatureHeight || null,
      signaturePage || null
    );

    const [result] = await pool.execute(
      `INSERT INTO document_templates (${insertFields}) VALUES (${insertValues})`,
      insertParams
    );

    return this.findById(result.insertId);
  }

  static async findById(id) {
    // Check if icon_id column exists to include it in SELECT
    let hasIconColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'document_templates' AND COLUMN_NAME = 'icon_id'"
      );
      hasIconColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for icon_id column:', err);
    }

    let query;
    if (hasIconColumn) {
      query = 'SELECT dt.*, i.file_path as icon_file_path, i.name as icon_name FROM document_templates dt LEFT JOIN icons i ON dt.icon_id = i.id WHERE dt.id = ?';
    } else {
      query = 'SELECT * FROM document_templates WHERE id = ?';
    }

    const [rows] = await pool.execute(query, [id]);
    
    // If icon_id column doesn't exist, set it to null in the result
    if (rows[0] && !hasIconColumn) {
      rows[0].icon_id = null;
      rows[0].icon_file_path = null;
      rows[0].icon_name = null;
    }
    
    return rows[0] || null;
  }

  static async findByAgency(agencyId) {
    // Check if icon_id column exists
    let hasIconColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'document_templates' AND COLUMN_NAME = 'icon_id'"
      );
      hasIconColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for icon_id column:', err);
    }

    let query;
    if (hasIconColumn) {
      query = 'SELECT dt.*, i.file_path as icon_file_path, i.name as icon_name FROM document_templates dt LEFT JOIN icons i ON dt.icon_id = i.id WHERE (dt.agency_id = ? OR dt.agency_id IS NULL) AND dt.is_active = TRUE ORDER BY dt.name, dt.version DESC';
    } else {
      query = 'SELECT * FROM document_templates WHERE (agency_id = ? OR agency_id IS NULL) AND is_active = TRUE ORDER BY name, version DESC';
    }

    const [rows] = await pool.execute(query, [agencyId]);
    
    // If icon_id column doesn't exist, set icon fields to null
    if (!hasIconColumn) {
      rows.forEach(row => {
        row.icon_id = null;
        row.icon_file_path = null;
        row.icon_name = null;
      });
    }
    
    return rows;
  }

  static async findAll(filters = {}) {
    // Check if icon_id column exists
    let hasIconColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'document_templates' AND COLUMN_NAME = 'icon_id'"
      );
      hasIconColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for icon_id column:', err);
    }

    let query;
    let countQuery = 'SELECT COUNT(*) as total FROM document_templates WHERE 1=1';
    
    if (hasIconColumn) {
      query = 'SELECT dt.*, i.file_path as icon_file_path, i.name as icon_name FROM document_templates dt LEFT JOIN icons i ON dt.icon_id = i.id WHERE 1=1';
    } else {
      query = 'SELECT * FROM document_templates WHERE 1=1';
    }
    
    const params = [];
    const countParams = [];

    // Use table prefix for column references when join is present
    const tablePrefix = hasIconColumn ? 'dt.' : '';
    
    // agencyId takes precedence over agencyIds if both are set
    console.log('DocumentTemplate.findAll - filters.agencyId:', filters.agencyId, 'type:', typeof filters.agencyId, 'undefined?', filters.agencyId === undefined);
    console.log('DocumentTemplate.findAll - filters.agencyIds:', filters.agencyIds);
    
    if (filters.agencyId !== undefined) {
      if (filters.agencyId === null) {
        // Filter for platform templates only (agency_id IS NULL)
        query += ` AND ${tablePrefix}agency_id IS NULL`;
        countQuery += ' AND agency_id IS NULL';
        console.log('DocumentTemplate.findAll: Filtering for platform templates only (agency_id IS NULL)');
      } else if (filters.agencyId === -1) {
        // Invalid agency ID - return no results
        query += ` AND 1=0`; // Always false condition
        countQuery += ' AND 1=0';
        console.log('DocumentTemplate.findAll: Invalid agency ID, returning no results');
      } else {
        // Filter for specific agency only (exclude platform templates)
        query += ` AND ${tablePrefix}agency_id = ?`;
        countQuery += ' AND agency_id = ?';
        params.push(filters.agencyId);
        countParams.push(filters.agencyId);
        console.log('DocumentTemplate.findAll: Filtering for agency ID =', filters.agencyId);
      }
    } else if (filters.agencyIds) {
      // For Agency Admin: show global (NULL) + their agency templates
      const nonNullIds = filters.agencyIds.filter(id => id !== null);
      if (nonNullIds.length > 0) {
        const placeholders = nonNullIds.map(() => '?').join(',');
        query += ` AND (${tablePrefix}agency_id IN (${placeholders}) OR ${tablePrefix}agency_id IS NULL)`;
        countQuery += ` AND (agency_id IN (${placeholders}) OR agency_id IS NULL)`;
        params.push(...nonNullIds);
        countParams.push(...nonNullIds);
      } else {
        query += ` AND ${tablePrefix}agency_id IS NULL`;
        countQuery += ' AND agency_id IS NULL';
      }
    }

    if (filters.documentType) {
      if (Array.isArray(filters.documentType)) {
        const placeholders = filters.documentType.map(() => '?').join(',');
        query += ` AND ${tablePrefix}document_type IN (${placeholders})`;
        countQuery += ` AND document_type IN (${placeholders})`;
        params.push(...filters.documentType);
        countParams.push(...filters.documentType);
      } else {
        query += ` AND ${tablePrefix}document_type = ?`;
        countQuery += ' AND document_type = ?';
        params.push(filters.documentType);
        countParams.push(filters.documentType);
      }
    }

    if (filters.isUserSpecific !== undefined) {
      query += ` AND ${tablePrefix}is_user_specific = ?`;
      countQuery += ' AND is_user_specific = ?';
      params.push(filters.isUserSpecific);
      countParams.push(filters.isUserSpecific);
    }

    if (filters.userId !== undefined) {
      query += ` AND ${tablePrefix}user_id = ?`;
      countQuery += ' AND user_id = ?';
      params.push(filters.userId);
      countParams.push(filters.userId);
    }

    if (filters.isActive !== undefined) {
      query += ` AND ${tablePrefix}is_active = ?`;
      countQuery += ' AND is_active = ?';
      params.push(filters.isActive);
      countParams.push(filters.isActive);
    }

    // Exclude archived by default
    if (!filters.includeArchived) {
      query += ` AND (${tablePrefix}is_archived = FALSE OR ${tablePrefix}is_archived IS NULL)`;
      countQuery += ' AND (is_archived = FALSE OR is_archived IS NULL)';
    }

    // Get total count
    console.log('DocumentTemplate.findAll - Executing count query:', countQuery);
    console.log('DocumentTemplate.findAll - Count params:', countParams);
    const [countRows] = await pool.execute(countQuery, countParams);
    const total = countRows[0].total;
    console.log('DocumentTemplate.findAll - Total count:', total);

    // Sorting
    const sortBy = filters.sortBy || 'name';
    const sortOrder = filters.sortOrder || 'asc';
    const validSortBy = ['name', 'created_at', 'document_type'];
    const validSortOrder = ['asc', 'desc'];
    
    if (validSortBy.includes(sortBy) && validSortOrder.includes(sortOrder.toLowerCase())) {
      // Use table alias if join is present
      const tablePrefix = hasIconColumn ? 'dt.' : '';
      query += ` ORDER BY ${tablePrefix}${sortBy} ${sortOrder.toUpperCase()}`;
      if (sortBy !== 'name') {
        query += `, ${tablePrefix}name ASC`; // Secondary sort by name
      }
      if (hasIconColumn) {
        query += ', dt.version DESC'; // Also sort by version
      } else {
        query += ', version DESC';
      }
    } else {
      if (hasIconColumn) {
        query += ' ORDER BY dt.name ASC, dt.version DESC';
      } else {
        query += ' ORDER BY name ASC, version DESC';
      }
    }

    // Pagination
    const limit = filters.limit ? parseInt(filters.limit) : null;
    const offset = filters.offset ? parseInt(filters.offset) : null;
    
    if (limit !== null && limit > 0) {
      query += ` LIMIT ${limit}`;
      if (offset !== null && offset >= 0) {
        query += ` OFFSET ${offset}`;
      }
    }

    console.log('DocumentTemplate.findAll - Executing main query:', query);
    console.log('DocumentTemplate.findAll - Main params:', params);
    const [rows] = await pool.execute(query, params);
    console.log('DocumentTemplate.findAll - Results count:', rows.length);
    if (rows.length > 0) {
      console.log('DocumentTemplate.findAll - Sample results agency_id values:', rows.slice(0, 5).map(r => r.agency_id));
    }
    
    // If icon_id column doesn't exist, set icon fields to null for all rows
    if (!hasIconColumn) {
      rows.forEach(row => {
        row.icon_id = null;
        row.icon_file_path = null;
        row.icon_name = null;
      });
    }
    
    return {
      data: rows,
      total,
      limit: limit || rows.length,
      offset: offset || 0,
      totalPages: limit ? Math.ceil(total / limit) : 1,
      currentPage: limit && offset ? Math.floor(offset / limit) + 1 : 1
    };
  }

  static async update(id, templateData) {
    const existing = await this.findById(id);
    if (!existing) return null;

    console.log('=== DOCUMENT TEMPLATE UPDATE ===');
    console.log('Template ID:', id);
    console.log('Existing template fields:', Object.keys(existing));
    console.log('Existing template values (checking for undefined):');
    Object.keys(existing).forEach(key => {
      if (existing[key] === undefined) {
        console.warn(`⚠️ Existing template has undefined value for ${key}`);
      }
    });
    console.log('templateData keys:', Object.keys(templateData));
    console.log('templateData values:');
    Object.keys(templateData).forEach(key => {
      console.log(`  ${key}: ${templateData[key]} (type: ${typeof templateData[key]}, undefined: ${templateData[key] === undefined})`);
    });
    
    // Normalize existing template values to ensure no undefined
    // Initialize all possible fields to null if they don't exist
    const normalizedExisting = {};
    const possibleFields = ['template_type', 'file_path', 'html_content', 'signature_x', 'signature_y', 'signature_width', 'signature_height', 'signature_page'];
    possibleFields.forEach(field => {
      normalizedExisting[field] = existing[field] !== undefined && existing[field] !== null ? existing[field] : null;
    });
    // Copy all other fields
    Object.keys(existing).forEach(key => {
      if (!normalizedExisting.hasOwnProperty(key)) {
        normalizedExisting[key] = existing[key] === undefined ? null : existing[key];
      }
    });

    // Check if icon_id column exists
    let hasIconColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'document_templates' AND COLUMN_NAME = 'icon_id'"
      );
      hasIconColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for icon_id column:', err);
    }

    // Use default values when destructuring to prevent undefined
    // But also check if fields exist in templateData to know what to update
    const {
      name,
      description,
      templateType,
      filePath,
      htmlContent,
      isActive,
      iconId,
      agencyId,
      signatureX,
      signatureY,
      signatureWidth,
      signatureHeight,
      signaturePage
    } = templateData;
    
    // Normalize all values: if a field is in templateData, use it (even if null)
    // If a field is not in templateData (undefined after destructuring), don't include it
    // This way we only update fields that are explicitly provided
    const normalizedData = {};
    
    // Helper to safely get a value from templateData
    const getValue = (key) => {
      if (key in templateData) {
        const val = templateData[key];
        // If explicitly undefined in templateData, convert to null
        return val === undefined ? null : val;
      }
      // Field not in templateData, return undefined (we won't use it)
      return undefined;
    };
    
    // Only normalize fields that are actually in templateData
    if ('name' in templateData) normalizedData.name = getValue('name');
    if ('description' in templateData) normalizedData.description = getValue('description');
    if ('templateType' in templateData) normalizedData.templateType = getValue('templateType');
    if ('filePath' in templateData) normalizedData.filePath = getValue('filePath');
    if ('htmlContent' in templateData) normalizedData.htmlContent = getValue('htmlContent');
    if ('isActive' in templateData) normalizedData.isActive = getValue('isActive');
    if ('iconId' in templateData) normalizedData.iconId = getValue('iconId');
    if ('agencyId' in templateData) normalizedData.agencyId = getValue('agencyId');
    if ('signatureX' in templateData) normalizedData.signatureX = getValue('signatureX');
    if ('signatureY' in templateData) normalizedData.signatureY = getValue('signatureY');
    if ('signatureWidth' in templateData) normalizedData.signatureWidth = getValue('signatureWidth');
    if ('signatureHeight' in templateData) normalizedData.signatureHeight = getValue('signatureHeight');
    if ('signaturePage' in templateData) normalizedData.signaturePage = getValue('signaturePage');
    
    console.log('Fields in templateData:', Object.keys(templateData));
    console.log('Normalized data keys:', Object.keys(normalizedData));
    console.log('After normalization - checking for undefined:');
    Object.keys(normalizedData).forEach(key => {
      const val = normalizedData[key];
      console.log(`  ${key}: ${val} (type: ${typeof val}, undefined: ${val === undefined})`);
      if (val === undefined) {
        console.error(`❌ UNDEFINED FOUND: ${key} is undefined after normalization!`);
      }
    });
    
    // Use normalized values
    const normName = normalizedData.name;
    const normDescription = normalizedData.description;
    const normTemplateType = normalizedData.templateType;
    const normFilePath = normalizedData.filePath;
    const normHtmlContent = normalizedData.htmlContent;
    const normIsActive = normalizedData.isActive;
    const normIconId = normalizedData.iconId;
    const normAgencyId = normalizedData.agencyId;
    const normSignatureX = normalizedData.signatureX;
    const normSignatureY = normalizedData.signatureY;
    const normSignatureWidth = normalizedData.signatureWidth;
    const normSignatureHeight = normalizedData.signatureHeight;
    const normSignaturePage = normalizedData.signaturePage;

    // If name changed OR createNewVersion flag is set, create new version
    // Use the agencyId from templateData if provided, otherwise keep existing agency_id
    const shouldCreateNewVersion = (normName !== undefined && normName !== null && normName !== existing.name) || 
                                    templateData.createNewVersion === true;
    
    if (shouldCreateNewVersion) {
      // Use the original name if createNewVersion is true but name hasn't changed
      const versionName = (normName !== undefined && normName !== null && normName !== existing.name) 
        ? normName 
        : existing.name;
      const finalAgencyId = normAgencyId !== null && normAgencyId !== undefined ? normAgencyId : existing.agency_id;
      
      // Build create data with all required fields, using normalized values from templateData if provided, otherwise existing values
      const createData = {
        name: versionName,
        description: ('description' in templateData && normDescription !== undefined) ? normDescription : (existing.description || null),
        templateType: ('templateType' in templateData && normTemplateType !== undefined) ? normTemplateType : (existing.template_type || 'pdf'),
        filePath: ('filePath' in templateData && normFilePath !== undefined) ? normFilePath : (existing.file_path || null),
        htmlContent: ('htmlContent' in templateData && normHtmlContent !== undefined) ? normHtmlContent : (existing.html_content || null),
        agencyId: finalAgencyId,
        createdByUserId: existing.created_by_user_id,
        documentType: templateData.documentType !== undefined ? templateData.documentType : (existing.document_type || 'administrative'),
        documentActionType: templateData.documentActionType !== undefined ? templateData.documentActionType : (existing.document_action_type || 'signature'),
        isUserSpecific: templateData.isUserSpecific !== undefined ? templateData.isUserSpecific : (existing.is_user_specific || false),
        userId: templateData.userId !== undefined ? templateData.userId : (existing.user_id || null),
        iconId: ('iconId' in templateData && normIconId !== undefined) ? normIconId : (existing.icon_id || null),
        signatureX: ('signatureX' in templateData && normSignatureX !== undefined) ? normSignatureX : (existing.signature_x || null),
        signatureY: ('signatureY' in templateData && normSignatureY !== undefined) ? normSignatureY : (existing.signature_y || null),
        signatureWidth: ('signatureWidth' in templateData && normSignatureWidth !== undefined) ? normSignatureWidth : (existing.signature_width || null),
        signatureHeight: ('signatureHeight' in templateData && normSignatureHeight !== undefined) ? normSignatureHeight : (existing.signature_height || null),
        signaturePage: ('signaturePage' in templateData && normSignaturePage !== undefined) ? normSignaturePage : (existing.signature_page || null)
      };
      
      // Ensure no undefined values
      Object.keys(createData).forEach(key => {
        if (createData[key] === undefined) {
          console.warn(`⚠️ createData.${key} is undefined, converting to null`);
          createData[key] = null;
        }
      });
      
      console.log('Creating new version due to name change or createNewVersion flag:', {
        oldName: existing.name,
        newName: versionName,
        createNewVersion: templateData.createNewVersion,
        createDataKeys: Object.keys(createData)
      });
      
      // Create the new version
      const newVersion = await this.create(createData);
      
      // Deactivate the old version (set is_active = 0)
      try {
        await pool.execute(
          'UPDATE document_templates SET is_active = 0 WHERE id = ?',
          [id]
        );
        console.log('Deactivated old version:', id);
      } catch (err) {
        console.error('Error deactivating old version:', err);
        // Don't fail the operation if deactivation fails
      }
      
      return newVersion;
    }

    // Build update query dynamically based on what's provided
    // Only include fields that are explicitly in templateData (not undefined)
    const updates = [];
    const params = [];
    
    // Helper function to safely push a value (never undefined)
    const safePush = (value, fieldName) => {
      // Explicitly check for undefined first
      if (value === undefined) {
        console.error(`❌ CRITICAL: ${fieldName} is undefined, forcing to null`);
        params.push(null);
        return;
      }
      
      // Handle null explicitly
      if (value === null) {
        params.push(null);
        console.log(`  Pushed ${fieldName}: null`);
        return;
      }
      
      // For all other values, push as-is
      params.push(value);
      console.log(`  Pushed ${fieldName}: ${value} (type: ${typeof value})`);
    };

    // Check if fields exist in templateData (not just undefined after destructuring)
    if ('description' in templateData) {
      updates.push('description = ?');
      // Use normalized value, ensure never undefined
      const val = normDescription !== null && normDescription !== undefined ? normDescription : null;
      safePush(val, 'description');
    }
    if ('templateType' in templateData) {
      updates.push('template_type = ?');
      // Use normalized value or normalized existing value
      const val = normTemplateType !== null && normTemplateType !== undefined 
        ? normTemplateType 
        : (normalizedExisting.template_type !== undefined && normalizedExisting.template_type !== null 
            ? normalizedExisting.template_type 
            : null);
      safePush(val, 'templateType');
    }
    if ('filePath' in templateData) {
      updates.push('file_path = ?');
      // Use normalized value or normalized existing value
      const val = normFilePath !== null && normFilePath !== undefined 
        ? normFilePath 
        : (normalizedExisting.file_path !== undefined && normalizedExisting.file_path !== null 
            ? normalizedExisting.file_path 
            : null);
      safePush(val, 'filePath');
    }
    if ('htmlContent' in templateData) {
      updates.push('html_content = ?');
      // Use normalized value or normalized existing value
      const val = normHtmlContent !== null && normHtmlContent !== undefined 
        ? normHtmlContent 
        : (normalizedExisting.html_content !== undefined && normalizedExisting.html_content !== null 
            ? normalizedExisting.html_content 
            : null);
      safePush(val, 'htmlContent');
    }
    if ('isActive' in templateData) {
      updates.push('is_active = ?');
      // Ensure boolean is converted to 1/0, never undefined
      const val = normIsActive === true || normIsActive === 1 || normIsActive === '1' || normIsActive === 'true' ? 1 : 0;
      safePush(val, 'isActive');
    }
    // Only update icon_id if column exists
    console.log('🔍 Icon update check - hasIconColumn:', hasIconColumn, 'iconId:', iconId, 'iconId type:', typeof iconId, 'iconId !== undefined:', iconId !== undefined);
    
    if (hasIconColumn && 'iconId' in templateData) {
      updates.push('icon_id = ?');
      // Use normalized value, ensure never undefined
      let finalIconId = null;
      if (normIconId !== null && normIconId !== undefined && normIconId !== '') {
        finalIconId = typeof normIconId === 'string' ? parseInt(normIconId) : normIconId;
        if (isNaN(finalIconId)) {
          finalIconId = null;
        }
      }
      console.log('✅ Updating icon_id to:', finalIconId, '(original:', iconId, 'normalized:', normIconId, 'type:', typeof normIconId, ') for template:', id);
      safePush(finalIconId, 'iconId');
    } else if (!hasIconColumn && 'iconId' in templateData) {
      console.error('❌ CRITICAL: Cannot update icon_id: column does not exist in document_templates table!');
      console.error('❌ Please run migration 046_add_agency_to_icons_and_fix_document_icon.sql');
      console.error('❌ iconId value was:', iconId, 'type:', typeof iconId);
    }
    if ('agencyId' in templateData) {
      updates.push('agency_id = ?');
      // Use normalized value, ensure never undefined
      const val = normAgencyId !== null && normAgencyId !== undefined ? normAgencyId : null;
      safePush(val, 'agencyId');
    }
    if ('signatureX' in templateData) {
      updates.push('signature_x = ?');
      // Use normalized value or normalized existing value
      const val = normSignatureX !== null && normSignatureX !== undefined 
        ? normSignatureX 
        : (normalizedExisting.signature_x !== undefined && normalizedExisting.signature_x !== null 
            ? normalizedExisting.signature_x 
            : null);
      safePush(val, 'signatureX');
    }
    if ('signatureY' in templateData) {
      updates.push('signature_y = ?');
      // Use normalized value or normalized existing value
      const val = normSignatureY !== null && normSignatureY !== undefined 
        ? normSignatureY 
        : (normalizedExisting.signature_y !== undefined && normalizedExisting.signature_y !== null 
            ? normalizedExisting.signature_y 
            : null);
      safePush(val, 'signatureY');
    }
    if ('signatureWidth' in templateData) {
      updates.push('signature_width = ?');
      // Use normalized value or normalized existing value
      const val = normSignatureWidth !== null && normSignatureWidth !== undefined 
        ? normSignatureWidth 
        : (normalizedExisting.signature_width !== undefined && normalizedExisting.signature_width !== null 
            ? normalizedExisting.signature_width 
            : null);
      safePush(val, 'signatureWidth');
    }
    if ('signatureHeight' in templateData) {
      updates.push('signature_height = ?');
      // Use normalized value or normalized existing value
      const val = normSignatureHeight !== null && normSignatureHeight !== undefined 
        ? normSignatureHeight 
        : (normalizedExisting.signature_height !== undefined && normalizedExisting.signature_height !== null 
            ? normalizedExisting.signature_height 
            : null);
      safePush(val, 'signatureHeight');
    }
    if ('signaturePage' in templateData) {
      updates.push('signature_page = ?');
      // Use normalized value or normalized existing value
      const val = normSignaturePage !== null && normSignaturePage !== undefined 
        ? normSignaturePage 
        : (normalizedExisting.signature_page !== undefined && normalizedExisting.signature_page !== null 
            ? normalizedExisting.signature_page 
            : null);
      safePush(val, 'signaturePage');
    }

    // Only update if there are changes
    if (updates.length === 0) {
      return existing;
    }

    // Pre-flight validation: ensure no undefined values in params
    console.log('Pre-flight validation: checking params for undefined values');
    params.forEach((param, index) => {
      if (param === undefined) {
        console.error(`❌ CRITICAL: Found undefined at index ${index} in params array!`);
        console.error(`  Corresponding update: ${updates[index]}`);
        console.error(`  Param value: ${param}`);
        console.error(`  Param type: ${typeof param}`);
        throw new Error(`Cannot update template: parameter at index ${index} (${updates[index]}) is undefined`);
      }
    });
    console.log('✅ Pre-flight validation passed: no undefined values in params');

    // Validate all params one more time before adding ID
    const finalParams = params.map((param, index) => {
      if (param === undefined) {
        console.error(`❌ FINAL CHECK: Parameter at index ${index} is undefined!`);
        console.error(`  Update statement: ${updates[index] || 'WHERE id = ?'}`);
        console.error(`  Param value: ${param}`);
        return null; // Force to null
      }
      return param;
    });
    
    // Double-check
    if (finalParams.some(p => p === undefined)) {
      throw new Error('Cannot execute SQL: undefined parameters detected after final sanitization');
    }
    
    // Push the ID (should never be undefined, but be safe)
    if (id === undefined) {
      throw new Error('Template ID is undefined');
    }
    finalParams.push(id);
    
    if (updates.length > 0) {
      // Validate parameter count matches placeholders
      const placeholderCount = (updates.join(', ').match(/\?/g) || []).length + 1; // +1 for WHERE id = ?
      if (finalParams.length !== placeholderCount) {
        const error = new Error(`Parameter count mismatch: ${finalParams.length} params but ${placeholderCount} placeholders`);
        console.error('SQL Parameter Mismatch:', {
          updates: updates.join(', '),
          params: finalParams,
          placeholderCount,
          paramCount: finalParams.length
        });
        throw error;
      }
      
      try {
        const sql = `UPDATE document_templates 
           SET ${updates.join(', ')}
           WHERE id = ?`;
        console.log('Executing SQL:', sql);
        console.log('Updates count:', updates.length);
        console.log('Params count (before id):', params.length);
        console.log('Final params count:', finalParams.length);
        console.log('With params (final):', finalParams);
        await pool.execute(sql, finalParams);
      } catch (error) {
        if (error.message && error.message.includes('undefined')) {
          console.error('=== SQL EXECUTION ERROR ===');
          console.error('SQL:', `UPDATE document_templates SET ${updates.join(', ')} WHERE id = ?`);
          console.error('Params:', finalParams);
          console.error('Params with types:', finalParams.map((p, i) => ({
            index: i,
            value: p,
            type: typeof p,
            isUndefined: p === undefined,
            update: updates[i] || 'WHERE id = ?'
          })));
        }
        console.error('Error updating document template:', error);
        console.error('Error message:', error.message);
        console.error('SQL Error code:', error.code);
        console.error('SQL Message:', error.sqlMessage);
        console.error('SQL:', `UPDATE document_templates SET ${updates.join(', ')} WHERE id = ?`);
        console.error('Params:', finalParams);
        console.error('Updates array:', updates);
        console.error('Params array length:', finalParams.length);
        throw error;
      }
    }

    // Return updated template with icon data
    // Use findById which includes the icon join
    const updated = await this.findById(id);
    console.log('DocumentTemplate.update - Returning updated template:', {
      id: updated?.id,
      name: updated?.name,
      icon_id: updated?.icon_id,
      icon_file_path: updated?.icon_file_path,
      icon_name: updated?.icon_name
    });
    return updated;
  }

  static async getVersion(templateId, version) {
    const [rows] = await pool.execute(
      'SELECT * FROM document_templates WHERE id = ? AND version = ?',
      [templateId, version]
    );
    return rows[0] || null;
  }

  static async getLatestVersion(templateName) {
    const [rows] = await pool.execute(
      'SELECT * FROM document_templates WHERE name = ? ORDER BY version DESC LIMIT 1',
      [templateName]
    );
    return rows[0] || null;
  }

  static async archive(id, archivedByUserId, archivedByAgencyId = null) {
    // Check if archived_by_agency_id column exists
    let hasAgencyColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'document_templates' AND COLUMN_NAME = 'archived_by_agency_id'"
      );
      hasAgencyColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for archived_by_agency_id column:', err);
    }

    if (hasAgencyColumn) {
      const [result] = await pool.execute(
        'UPDATE document_templates SET is_archived = TRUE, archived_at = NOW(), archived_by_user_id = ?, archived_by_agency_id = ? WHERE id = ?',
        [archivedByUserId, archivedByAgencyId, id]
      );
      return result.affectedRows > 0;
    } else {
      const [result] = await pool.execute(
        'UPDATE document_templates SET is_archived = TRUE, archived_at = NOW(), archived_by_user_id = ? WHERE id = ?',
        [archivedByUserId, id]
      );
      return result.affectedRows > 0;
    }
  }

  static async restore(id, userAgencyIds = []) {
    // Check if archived_by_agency_id column exists
    let hasAgencyColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'document_templates' AND COLUMN_NAME = 'archived_by_agency_id'"
      );
      hasAgencyColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for archived_by_agency_id column:', err);
    }

    if (hasAgencyColumn && userAgencyIds.length > 0) {
      // Only restore if user's agency matches archived_by_agency_id
      const placeholders = userAgencyIds.map(() => '?').join(',');
      const [result] = await pool.execute(
        `UPDATE document_templates SET is_archived = FALSE, archived_at = NULL, archived_by_user_id = NULL, archived_by_agency_id = NULL WHERE id = ? AND is_archived = TRUE AND archived_by_agency_id IN (${placeholders})`,
        [id, ...userAgencyIds]
      );
      return result.affectedRows > 0;
    } else {
      const [result] = await pool.execute(
        'UPDATE document_templates SET is_archived = FALSE, archived_at = NULL, archived_by_user_id = NULL WHERE id = ? AND is_archived = TRUE',
        [id]
      );
      return result.affectedRows > 0;
    }
  }

  static async findAllArchived(filters = {}) {
    const { agencyIds, userRole } = filters;
    
    // Check if archived_by_agency_id column exists
    let hasAgencyColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'document_templates' AND COLUMN_NAME = 'archived_by_agency_id'"
      );
      hasAgencyColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for archived_by_agency_id column:', err);
    }

    let query = 'SELECT * FROM document_templates WHERE is_archived = TRUE';
    const params = [];

    // Filter by archived_by_agency_id
    // - If agencyIds is null (super_admin, no filter), don't filter
    // - If agencyIds is an array, filter by those agencies
    if (hasAgencyColumn && agencyIds !== null && agencyIds !== undefined && agencyIds.length > 0) {
      const placeholders = agencyIds.map(() => '?').join(',');
      query += ` AND archived_by_agency_id IN (${placeholders})`;
      params.push(...agencyIds);
    } else if (hasAgencyColumn && userRole !== 'super_admin') {
      // For non-super_admin users, if no agencyIds provided, return empty (they shouldn't see anything)
      query += ' AND 1=0'; // Always false condition
    }

    query += ' ORDER BY archived_at DESC';
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async delete(id, userAgencyIds = []) {
    const template = await this.findById(id);
    if (!template) return false;

    // Only delete if archived
    if (!template.is_archived) {
      return false;
    }

    // Check if archived_by_agency_id column exists
    let hasAgencyColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'document_templates' AND COLUMN_NAME = 'archived_by_agency_id'"
      );
      hasAgencyColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for archived_by_agency_id column:', err);
    }

    // Delete file using StorageService (handles both local and GCS)
    if (template.file_path) {
      try {
        // Extract filename from path (handles both "templates/filename" and full paths)
        const filename = template.file_path.includes('/') 
          ? template.file_path.split('/').pop() 
          : template.file_path.replace('templates/', '');
        
        const StorageService = (await import('../services/storage.service.js')).default;
        await StorageService.deleteTemplate(filename);
        console.log('Template file deleted successfully:', filename);
      } catch (err) {
        console.error('Error deleting template file:', err);
        // Continue with database deletion even if file deletion fails
      }
    }

    if (hasAgencyColumn && userAgencyIds.length > 0) {
      // Only delete if user's agency matches archived_by_agency_id
      const placeholders = userAgencyIds.map(() => '?').join(',');
      const [result] = await pool.execute(
        `DELETE FROM document_templates WHERE id = ? AND is_archived = TRUE AND archived_by_agency_id IN (${placeholders})`,
        [id, ...userAgencyIds]
      );
      return result.affectedRows > 0;
    } else {
      const [result] = await pool.execute('DELETE FROM document_templates WHERE id = ? AND is_archived = TRUE', [id]);
      return result.affectedRows > 0;
    }
  }

  static async getVersionHistory(templateName, agencyId = null) {
    let query = 'SELECT * FROM document_templates WHERE name = ?';
    const params = [templateName];
    
    // Filter by agency_id if provided (NULL for platform, specific ID for agency)
    if (agencyId !== null && agencyId !== undefined) {
      query += ' AND agency_id = ?';
      params.push(agencyId);
    } else {
      query += ' AND agency_id IS NULL';
    }
    
    query += ' ORDER BY version DESC';
    
    const [rows] = await pool.execute(query, params);
    return rows;
  }
}

export default DocumentTemplate;

