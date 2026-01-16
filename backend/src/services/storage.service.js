/**
 * Storage Service - Google Cloud Storage (GCS) file storage layer
 * 
 * IMPORTANT: This service uses Google Cloud Storage (GCS) instead of local filesystem.
 * 
 * Why GCS is required for Cloud Run:
 * 1. Cloud Run containers are stateless and ephemeral - local filesystem is not persistent
 * 2. Multiple container instances cannot share local filesystem - files uploaded to one instance
 *    won't be available to other instances
 * 3. Container restarts/deployments lose all local files - GCS provides persistent storage
 * 4. Cloud Run scales horizontally - GCS ensures all instances can access the same files
 * 5. Local filesystem has limited space - GCS provides unlimited scalable storage
 * 
 * Storage Structure (single bucket with folders):
 * - Icons: icons/{filename}
 * - Fonts: fonts/{filename}
 * - Templates: templates/{filename}
 * - Signed Documents: signed/{userId}/{documentId}/{filename}
 * - User-Specific Documents: user_specific_documents/{filename}
 * - User Documents: user_documents/{filename}
 * 
 * Authentication: Uses Cloud Run's service account IAM credentials (no JSON key needed)
 * Bucket: Configured via PTONBOARDFILES environment variable
 * 
 * Database: Only metadata (file paths/keys) are stored in MySQL, not the actual files
 */

import path from 'path';
import crypto from 'crypto';

// Cache for GCS storage instance
let gcsStorage = null;

class StorageService {
  /**
   * Get GCS storage instance (cached)
   * Uses Cloud Run's service account IAM credentials automatically
   * @returns {Promise<Storage>}
   */
  static async getGCSStorage() {
    if (gcsStorage) {
      return gcsStorage;
    }
    
    const { Storage } = await import('@google-cloud/storage');
    
    // Build storage configuration
    const storageConfig = {
      projectId: process.env.GCS_PROJECT_ID
    };
    
    // For local development, support explicit key file or credentials JSON
    // In production (Cloud Run), credentials are automatically provided via service account
    if (process.env.GCS_KEY_FILENAME) {
      // Use explicit key file path
      storageConfig.keyFilename = process.env.GCS_KEY_FILENAME;
    } else if (process.env.GCS_CREDENTIALS) {
      // Use credentials JSON string
      try {
        storageConfig.credentials = JSON.parse(process.env.GCS_CREDENTIALS);
      } catch (error) {
        console.error('Failed to parse GCS_CREDENTIALS JSON:', error);
        throw new Error('Invalid GCS_CREDENTIALS format');
      }
    }
    // If neither is provided, @google-cloud/storage will use:
    // 1. Application Default Credentials (gcloud auth application-default login)
    // 2. Cloud Run service account (in production)
    // 3. Environment variables (GOOGLE_APPLICATION_CREDENTIALS)
    
    gcsStorage = new Storage(storageConfig);
    
    return gcsStorage;
  }

  /**
   * Get GCS bucket instance
   * Bucket name comes from PTONBOARDFILES environment variable
   * @returns {Promise<Bucket>}
   */
  static async getGCSBucket() {
    const storage = await this.getGCSStorage();
    const bucketName = process.env.PTONBOARDFILES;
    
    if (!bucketName) {
      throw new Error('PTONBOARDFILES environment variable is required for GCS bucket name');
    }
    
    return storage.bucket(bucketName);
  }

  /**
   * Get the storage key/path for a signed document in GCS
   * Structure: signed/{userId}/{documentId}/{filename}
   */
  static getSignedDocumentKey(userId, documentId, filename) {
    return `signed/${userId}/${documentId}/${filename}`;
  }

  /**
   * Save a signed document to GCS
   * Only metadata is stored in MySQL - the actual file is in GCS
   * @param {number} userId - User ID
   * @param {number} documentId - Signed document ID
   * @param {Buffer} fileBuffer - File content as buffer
   * @param {string} filename - Filename (will be sanitized)
   * @returns {Promise<{path: string, key: string, filename: string, relativePath: string}>}
   */
  static async saveSignedDocument(userId, documentId, fileBuffer, filename) {
    // Sanitize filename
    const sanitizedFilename = this.sanitizeFilename(filename || `signed-${documentId}-${Date.now()}.pdf`);
    
    // Upload to Google Cloud Storage
    const bucket = await this.getGCSBucket();
    const key = this.getSignedDocumentKey(userId, documentId, sanitizedFilename);
    const file = bucket.file(key);
    
    // Upload file with proper metadata
    await file.save(fileBuffer, {
      contentType: 'application/pdf',
      metadata: {
        userId: String(userId),
        documentId: String(documentId),
        uploadedAt: new Date().toISOString()
      }
    });
    
    // Return GCS key/path - this is what gets stored in MySQL (metadata only)
    return {
      path: key,
      key: key,
      filename: sanitizedFilename,
      relativePath: key // GCS key is the relative path stored in database
    };
  }

  /**
   * Read a signed document from GCS
   * @param {number} userId - User ID
   * @param {number} documentId - Signed document ID
   * @param {string} filename - Filename
   * @returns {Promise<Buffer>}
   */
  static async readSignedDocument(userId, documentId, filename) {
    const bucket = await this.getGCSBucket();
    const key = this.getSignedDocumentKey(userId, documentId, filename);
    const file = bucket.file(key);
    
    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error(`File not found in GCS: ${key}`);
    }
    
    const [buffer] = await file.download();
    return buffer;
  }

  /**
   * Check if a signed document exists in GCS
   * @param {number} userId - User ID
   * @param {number} documentId - Signed document ID
   * @param {string} filename - Filename
   * @returns {Promise<boolean>}
   */
  static async signedDocumentExists(userId, documentId, filename) {
    try {
      const bucket = await this.getGCSBucket();
      const key = this.getSignedDocumentKey(userId, documentId, filename);
      const file = bucket.file(key);
      const [exists] = await file.exists();
      return exists;
    } catch (gcsError) {
      console.error('GCS exists check error:', gcsError);
      return false;
    }
  }

  /**
   * Delete a signed document from GCS
   * @param {number} userId - User ID
   * @param {number} documentId - Signed document ID
   * @param {string} filename - Filename
   * @returns {Promise<void>}
   */
  static async deleteSignedDocument(userId, documentId, filename) {
    try {
      const bucket = await this.getGCSBucket();
      const key = this.getSignedDocumentKey(userId, documentId, filename);
      const file = bucket.file(key);
      await file.delete();
    } catch (gcsError) {
      // Ignore if file doesn't exist (404)
      if (gcsError.code !== 404) {
        throw new Error(`Failed to delete from GCS: ${gcsError.message}`);
      }
    }
  }

  /**
   * Parse a stored path to extract components
   * Handles both old format (signed/filename) and new format (signed/userId/documentId/filename)
   */
  static parseSignedDocumentPath(storedPath) {
    if (!storedPath) return null;
    
    // Normalize path separators
    const normalized = storedPath.replace(/\\/g, '/');
    
    // Check if it's the new format: signed/userId/documentId/filename
    const newFormatMatch = normalized.match(/^signed\/(\d+)\/(\d+)\/(.+)$/);
    if (newFormatMatch) {
      return {
        userId: parseInt(newFormatMatch[1]),
        documentId: parseInt(newFormatMatch[2]),
        filename: newFormatMatch[3],
        format: 'new'
      };
    }
    
    // Old format: signed/filename (for backward compatibility)
    const oldFormatMatch = normalized.match(/^signed\/(.+)$/);
    if (oldFormatMatch) {
      return {
        userId: null,
        documentId: null,
        filename: oldFormatMatch[1],
        format: 'old'
      };
    }
    
    return null;
  }

  /**
   * Sanitize filename to prevent directory traversal and other security issues
   */
  static sanitizeFilename(filename) {
    // Remove path separators and dangerous characters
    let sanitized = filename.replace(/[\/\\\?\*\|"<>:]/g, '_');
    
    // Remove leading/trailing dots and spaces
    sanitized = sanitized.replace(/^[\s\.]+|[\s\.]+$/g, '');
    
    // Limit length
    if (sanitized.length > 255) {
      const ext = path.extname(sanitized);
      const name = path.basename(sanitized, ext);
      sanitized = name.substring(0, 255 - ext.length) + ext;
    }
    
    return sanitized || `file-${Date.now()}.pdf`;
  }

  /**
   * Calculate file hash (SHA-256)
   */
  static calculateFileHash(fileBuffer) {
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * Get file size from GCS
   */
  static async getFileSize(userId, documentId, filename) {
    const bucket = await this.getGCSBucket();
    const key = this.getSignedDocumentKey(userId, documentId, filename);
    const file = bucket.file(key);
    const [metadata] = await file.getMetadata();
    return parseInt(metadata.size || 0);
  }

  /**
   * Save an icon file to GCS
   * Only metadata (file path) is stored in MySQL - the actual file is in GCS
   * @param {Buffer} fileBuffer - File content as buffer
   * @param {string} filename - Filename (will be sanitized)
   * @param {string} contentType - MIME type (e.g., 'image/png', 'image/svg+xml')
   * @returns {Promise<{path: string, key: string, filename: string, relativePath: string}>}
   */
  static async saveIcon(fileBuffer, filename, contentType = 'image/png') {
    const sanitizedFilename = this.sanitizeFilename(filename);
    const key = `uploads/icons/${sanitizedFilename}`;
    
    const bucket = await this.getGCSBucket();
    const file = bucket.file(key);
    
    await file.save(fileBuffer, {
      contentType: contentType,
      metadata: {
        uploadedAt: new Date().toISOString()
      }
    });
    
    // Return GCS key - this is what gets stored in MySQL (metadata only)
    return {
      path: key,
      key: key,
      filename: sanitizedFilename,
      relativePath: key
    };
  }

  /**
   * Read an icon file from GCS
   * @param {string} filename - Filename
   * @returns {Promise<Buffer>}
   */
  static async readIcon(filename) {
    const bucket = await this.getGCSBucket();
    // Support both old path (icons/) and new path (uploads/icons/)
    let key = filename.startsWith('uploads/') ? filename : `uploads/icons/${filename}`;
    const file = bucket.file(key);
    
    const [exists] = await file.exists();
    if (!exists) {
      // Try old path for backward compatibility
      const oldKey = filename.startsWith('icons/') ? filename : `icons/${filename}`;
      const oldFile = bucket.file(oldKey);
      const [oldExists] = await oldFile.exists();
      if (oldExists) {
        const [buffer] = await oldFile.download();
        return buffer;
      }
      throw new Error(`Icon not found in GCS: ${key}`);
    }
    
    const [buffer] = await file.download();
    return buffer;
  }

  /**
   * Delete an icon file from GCS
   * @param {string} filename - Filename
   * @returns {Promise<void>}
   */
  static async deleteIcon(filename) {
    // Support both old path (icons/) and new path (uploads/icons/)
    let key = filename.startsWith('uploads/') ? filename : `uploads/icons/${filename}`;
    const bucket = await this.getGCSBucket();
    const file = bucket.file(key);
    
    const [exists] = await file.exists();
    if (!exists) {
      // Try old path for backward compatibility
      const oldKey = filename.startsWith('icons/') ? filename : `icons/${filename}`;
      const oldFile = bucket.file(oldKey);
      const [oldExists] = await oldFile.exists();
      if (oldExists) {
        await oldFile.delete();
        return;
      }
      throw new Error(`Icon not found in GCS: ${key}`);
    }
    
    await file.delete();
  }

  /**
   * Save a logo file to GCS
   * @param {Buffer} fileBuffer - File content as buffer
   * @param {string} filename - Filename (will be sanitized)
   * @param {string} contentType - MIME type (e.g., 'image/png', 'image/svg+xml')
   * @returns {Promise<{path: string, key: string, filename: string, relativePath: string}>}
   */
  static async saveLogo(fileBuffer, filename, contentType = 'image/png') {
    const sanitizedFilename = this.sanitizeFilename(filename);
    const key = `uploads/logos/${sanitizedFilename}`;
    
    const bucket = await this.getGCSBucket();
    const file = bucket.file(key);
    
    await file.save(fileBuffer, {
      contentType: contentType,
      metadata: {
        uploadedAt: new Date().toISOString()
      }
    });
    
    // Return GCS key - this is what gets stored in MySQL (metadata only)
    return {
      path: key,
      key: key,
      filename: sanitizedFilename,
      relativePath: key
    };
  }

  /**
   * Save a font file to GCS
   * Only metadata (file path) is stored in MySQL - the actual file is in GCS
   * @param {Buffer} fileBuffer - File content as buffer
   * @param {string} filename - Filename (will be sanitized)
   * @param {string} contentType - MIME type (e.g., 'font/woff2')
   * @returns {Promise<{path: string, key: string, filename: string, relativePath: string}>}
   */
  static async saveFont(fileBuffer, filename, contentType = 'font/woff2') {
    const sanitizedFilename = this.sanitizeFilename(filename);
    const key = `fonts/${sanitizedFilename}`;
    
    const bucket = await this.getGCSBucket();
    const file = bucket.file(key);
    
    await file.save(fileBuffer, {
      contentType: contentType,
      metadata: {
        uploadedAt: new Date().toISOString()
      }
    });
    
    // Return GCS key - this is what gets stored in MySQL (metadata only)
    return {
      path: key,
      key: key,
      filename: sanitizedFilename,
      relativePath: key
    };
  }

  /**
   * Read a font file from GCS
   * @param {string} filename - Filename
   * @returns {Promise<Buffer>}
   */
  static async readFont(filename) {
    const bucket = await this.getGCSBucket();
    const key = `fonts/${filename}`;
    const file = bucket.file(key);
    
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error(`Font not found in GCS: ${key}`);
    }
    
    const [buffer] = await file.download();
    return buffer;
  }

  /**
   * Delete a font file from GCS
   * @param {string} filename - Filename
   * @returns {Promise<void>}
   */
  static async deleteFont(filename) {
    const key = `fonts/${filename}`;
    const bucket = await this.getGCSBucket();
    const file = bucket.file(key);
    
    try {
      await file.delete();
    } catch (gcsError) {
      // Ignore if file doesn't exist (404)
      if (gcsError.code !== 404) {
        throw new Error(`Failed to delete font from GCS: ${gcsError.message}`);
      }
    }
  }

  /**
   * Check if a font file exists in storage.
   * In production: checks GCS bucket for fonts/{filename}.
   * In development: if GCS isn't configured/available, falls back to backend/uploads/fonts/{filename}.
   * @param {string} filename
   * @returns {Promise<boolean>}
   */
  static async fontExists(filename) {
    if (!filename) return false;
    const clean = String(filename).includes('/') ? String(filename).split('/').pop() : String(filename);
    const key = `fonts/${clean}`;
    try {
      const bucket = await this.getGCSBucket();
      const file = bucket.file(key);
      const [exists] = await file.exists();
      return !!exists;
    } catch (error) {
      // Best-effort dev fallback to local filesystem
      if (process.env.NODE_ENV === 'development') {
        try {
          const fs = (await import('fs/promises')).default;
          const { fileURLToPath } = await import('url');
          const __filename = fileURLToPath(import.meta.url);
          const __dirname = path.dirname(__filename);
          const localPath = path.join(__dirname, '../uploads', key);
          await fs.stat(localPath);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }

  /**
   * Save a document template file to GCS
   * Only metadata (file path) is stored in MySQL - the actual file is in GCS
   * @param {Buffer} fileBuffer - File content as buffer
   * @param {string} filename - Filename (will be sanitized)
   * @returns {Promise<{path: string, key: string, filename: string, relativePath: string}>}
   */
  static async saveTemplate(fileBuffer, filename) {
    const sanitizedFilename = this.sanitizeFilename(filename);
    const key = `templates/${sanitizedFilename}`;
    
    const bucket = await this.getGCSBucket();
    const file = bucket.file(key);
    
    await file.save(fileBuffer, {
      contentType: 'application/pdf',
      metadata: {
        uploadedAt: new Date().toISOString()
      }
    });
    
    // Return GCS key - this is what gets stored in MySQL (metadata only)
    return {
      path: key,
      key: key,
      filename: sanitizedFilename,
      relativePath: key
    };
  }

  /**
   * Read a document template file from GCS
   * @param {string} filename - Filename
   * @returns {Promise<Buffer>}
   */
  static async readTemplate(filename) {
    const bucket = await this.getGCSBucket();
    const key = `templates/${filename}`;
    const file = bucket.file(key);
    
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error(`Template not found in GCS: ${key}`);
    }
    
    const [buffer] = await file.download();
    return buffer;
  }

  /**
   * Delete a document template file from GCS
   * @param {string} filename - Filename
   * @returns {Promise<void>}
   */
  static async deleteTemplate(filename) {
    const key = `templates/${filename}`;
    const bucket = await this.getGCSBucket();
    const file = bucket.file(key);
    
    try {
      await file.delete();
    } catch (gcsError) {
      // Ignore if file doesn't exist (404)
      if (gcsError.code !== 404) {
        throw new Error(`Failed to delete template from GCS: ${gcsError.message}`);
      }
    }
  }

  /**
   * Save a user-specific document file to GCS
   * Only metadata (file path) is stored in MySQL - the actual file is in GCS
   * @param {Buffer} fileBuffer - File content as buffer
   * @param {string} filename - Filename (will be sanitized)
   * @returns {Promise<{path: string, key: string, filename: string, relativePath: string}>}
   */
  static async saveUserSpecificDocument(fileBuffer, filename) {
    const sanitizedFilename = this.sanitizeFilename(filename);
    const key = `user_specific_documents/${sanitizedFilename}`;
    
    const bucket = await this.getGCSBucket();
    const file = bucket.file(key);
    
    await file.save(fileBuffer, {
      contentType: 'application/pdf',
      metadata: {
        uploadedAt: new Date().toISOString()
      }
    });
    
    // Return GCS key - this is what gets stored in MySQL (metadata only)
    return {
      path: key,
      key: key,
      filename: sanitizedFilename,
      relativePath: key
    };
  }

  /**
   * Read a user-specific document file from GCS
   * @param {string} filename - Filename
   * @returns {Promise<Buffer>}
   */
  static async readUserSpecificDocument(filename) {
    const bucket = await this.getGCSBucket();
    const key = `user_specific_documents/${filename}`;
    const file = bucket.file(key);
    
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error(`User-specific document not found in GCS: ${key}`);
    }
    
    const [buffer] = await file.download();
    return buffer;
  }

  /**
   * Delete a user-specific document file from GCS
   * @param {string} filename - Filename
   * @returns {Promise<void>}
   */
  static async deleteUserSpecificDocument(filename) {
    const key = `user_specific_documents/${filename}`;
    const bucket = await this.getGCSBucket();
    const file = bucket.file(key);
    
    try {
      await file.delete();
    } catch (gcsError) {
      // Ignore if file doesn't exist (404)
      if (gcsError.code !== 404) {
        throw new Error(`Failed to delete user-specific document from GCS: ${gcsError.message}`);
      }
    }
  }

  /**
   * Save a user document (personalized document copy) to GCS
   * Only metadata (file path) is stored in MySQL - the actual file is in GCS
   * @param {Buffer} fileBuffer - File content as buffer
   * @param {string} filename - Filename (will be sanitized)
   * @returns {Promise<{path: string, key: string, filename: string, relativePath: string}>}
   */
  static async saveUserDocument(fileBuffer, filename) {
    const sanitizedFilename = this.sanitizeFilename(filename);
    const key = `user_documents/${sanitizedFilename}`;
    
    const bucket = await this.getGCSBucket();
    const file = bucket.file(key);
    
    await file.save(fileBuffer, {
      contentType: 'application/pdf',
      metadata: {
        uploadedAt: new Date().toISOString()
      }
    });
    
    // Return GCS key - this is what gets stored in MySQL (metadata only)
    return {
      path: key,
      key: key,
      filename: sanitizedFilename,
      relativePath: key
    };
  }

  /**
   * Read a user document file from GCS
   * @param {string} filename - Filename
   * @returns {Promise<Buffer>}
   */
  static async readUserDocument(filename) {
    const bucket = await this.getGCSBucket();
    const key = `user_documents/${filename}`;
    const file = bucket.file(key);
    
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error(`User document not found in GCS: ${key}`);
    }
    
    const [buffer] = await file.download();
    return buffer;
  }

  /**
   * Delete a user document file from GCS
   * @param {string} filename - Filename
   * @returns {Promise<void>}
   */
  static async deleteUserDocument(filename) {
    const key = `user_documents/${filename}`;
    const bucket = await this.getGCSBucket();
    const file = bucket.file(key);
    
    try {
      await file.delete();
    } catch (gcsError) {
      // Ignore if file doesn't exist (404)
      if (gcsError.code !== 404) {
        throw new Error(`Failed to delete user document from GCS: ${gcsError.message}`);
      }
    }
  }

  /**
   * Save a user compliance/credential document file to GCS
   * @param {Buffer} fileBuffer
   * @param {string} filename
   * @param {string} contentType
   */
  static async saveComplianceDocument(fileBuffer, filename, contentType = 'application/pdf') {
    const sanitizedFilename = this.sanitizeFilename(filename);
    const key = `credentials/${sanitizedFilename}`;
    const bucket = await this.getGCSBucket();
    const file = bucket.file(key);

    await file.save(fileBuffer, {
      contentType,
      metadata: { uploadedAt: new Date().toISOString() }
    });

    return { path: key, key, filename: sanitizedFilename, relativePath: key };
  }

  static async deleteComplianceDocument(filename) {
    const key = `credentials/${filename}`;
    const bucket = await this.getGCSBucket();
    const file = bucket.file(key);
    try {
      await file.delete();
    } catch (gcsError) {
      if (gcsError.code !== 404) {
        throw new Error(`Failed to delete compliance document from GCS: ${gcsError.message}`);
      }
    }
  }

  /**
   * Get a signed URL for a file in GCS (for direct access)
   * Signed URLs allow temporary direct access to files without proxying through the backend
   * @param {string} key - GCS object key/path
   * @param {number} expirationMinutes - URL expiration time in minutes (default: 60)
   * @returns {Promise<string>}
   */
  static async getSignedUrl(key, expirationMinutes = 60) {
    const bucket = await this.getGCSBucket();
    const file = bucket.file(key);
    
    // Verify file exists
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error(`File not found in GCS: ${key}`);
    }
    
    try {
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + (expirationMinutes * 60 * 1000)
      });
      
      return url;
    } catch (error) {
      console.error(`[StorageService] Error generating signed URL for ${key}:`, error);
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }
}

export default StorageService;
