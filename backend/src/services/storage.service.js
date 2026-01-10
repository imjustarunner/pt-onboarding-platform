/**
 * Storage Service - Abstracted file storage layer
 * Currently uses local filesystem, but designed for easy migration to Google Cloud Storage
 * 
 * Storage Structure:
 * - Signed Documents: signed/{userId}/{documentId}/{filename}
 * - Templates: templates/{templateId}/{filename}
 * - User-specific: users/{userId}/{type}/{filename}
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Storage configuration
const STORAGE_TYPE = process.env.STORAGE_TYPE || 'local'; // 'local' or 'gcs' (future)
const BASE_UPLOAD_DIR = path.join(__dirname, '../../uploads');

class StorageService {
  /**
   * Get the storage path for a signed document
   * Structure: signed/{userId}/{documentId}/{filename}
   */
  static getSignedDocumentPath(userId, documentId, filename) {
    if (STORAGE_TYPE === 'gcs') {
      // Future: Return GCS path
      return `signed/${userId}/${documentId}/${filename}`;
    }
    // Local filesystem
    return path.join(BASE_UPLOAD_DIR, 'signed', String(userId), String(documentId), filename);
  }

  /**
   * Get the storage key/path for a signed document (for GCS compatibility)
   */
  static getSignedDocumentKey(userId, documentId, filename) {
    return `signed/${userId}/${documentId}/${filename}`;
  }

  /**
   * Save a signed document
   * @param {number} userId - User ID
   * @param {number} documentId - Signed document ID
   * @param {Buffer} fileBuffer - File content as buffer
   * @param {string} filename - Filename (will be sanitized)
   * @returns {Promise<{path: string, key: string, filename: string}>}
   */
  static async saveSignedDocument(userId, documentId, fileBuffer, filename) {
    // Sanitize filename
    const sanitizedFilename = this.sanitizeFilename(filename || `signed-${documentId}-${Date.now()}.pdf`);
    
    if (STORAGE_TYPE === 'gcs') {
      // Upload to Google Cloud Storage
      try {
        const { Storage } = await import('@google-cloud/storage');
        const storage = new Storage({
          projectId: process.env.GCS_PROJECT_ID,
          keyFilename: process.env.GCS_KEY_FILENAME, // Path to service account key file
          // Or use credentials object if provided
          credentials: process.env.GCS_CREDENTIALS ? JSON.parse(process.env.GCS_CREDENTIALS) : undefined
        });
        const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
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
        
        // Make file publicly readable if needed (or use signed URLs)
        // await file.makePublic(); // Uncomment if public access is needed
        
        return {
          path: key,
          key: key,
          filename: sanitizedFilename,
          relativePath: key // For GCS, the key is the relative path
        };
      } catch (gcsError) {
        console.error('GCS upload error:', gcsError);
        throw new Error(`Failed to upload to Google Cloud Storage: ${gcsError.message}`);
      }
    }

    // Local filesystem storage
    const filePath = this.getSignedDocumentPath(userId, documentId, sanitizedFilename);
    const dirPath = path.dirname(filePath);
    
    // Ensure directory exists
    await fs.mkdir(dirPath, { recursive: true });
    
    // Write file
    await fs.writeFile(filePath, fileBuffer);
    
    // Return relative path for database storage
    const relativePath = path.relative(BASE_UPLOAD_DIR, filePath);
    
    return {
      path: filePath,
      key: this.getSignedDocumentKey(userId, documentId, sanitizedFilename),
      filename: sanitizedFilename,
      relativePath: relativePath.replace(/\\/g, '/') // Normalize path separators
    };
  }

  /**
   * Read a signed document
   * @param {number} userId - User ID
   * @param {number} documentId - Signed document ID
   * @param {string} filename - Filename
   * @returns {Promise<Buffer>}
   */
  static async readSignedDocument(userId, documentId, filename) {
    if (STORAGE_TYPE === 'gcs') {
      // Read from Google Cloud Storage
      try {
        const { Storage } = await import('@google-cloud/storage');
        const storage = new Storage({
          projectId: process.env.GCS_PROJECT_ID,
          keyFilename: process.env.GCS_KEY_FILENAME, // Path to service account key file
          // Or use credentials object if provided
          credentials: process.env.GCS_CREDENTIALS ? JSON.parse(process.env.GCS_CREDENTIALS) : undefined
        });
        const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
        const key = this.getSignedDocumentKey(userId, documentId, filename);
        const file = bucket.file(key);
        
        // Check if file exists
        const [exists] = await file.exists();
        if (!exists) {
          throw new Error(`File not found in GCS: ${key}`);
        }
        
        const [buffer] = await file.download();
        return buffer;
      } catch (gcsError) {
        console.error('GCS read error:', gcsError);
        throw new Error(`Failed to read from Google Cloud Storage: ${gcsError.message}`);
      }
    }

    // Local filesystem
    const filePath = this.getSignedDocumentPath(userId, documentId, filename);
    
    // Verify file exists
    try {
      await fs.access(filePath);
    } catch (err) {
      throw new Error(`File not found: ${filename} at path: ${filePath}`);
    }
    
    return await fs.readFile(filePath);
  }

  /**
   * Check if a signed document exists
   * @param {number} userId - User ID
   * @param {number} documentId - Signed document ID
   * @param {string} filename - Filename
   * @returns {Promise<boolean>}
   */
  static async signedDocumentExists(userId, documentId, filename) {
    if (STORAGE_TYPE === 'gcs') {
      try {
        const { Storage } = await import('@google-cloud/storage');
        const storage = new Storage({
          projectId: process.env.GCS_PROJECT_ID,
          keyFilename: process.env.GCS_KEY_FILENAME,
          credentials: process.env.GCS_CREDENTIALS ? JSON.parse(process.env.GCS_CREDENTIALS) : undefined
        });
        const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
        const key = this.getSignedDocumentKey(userId, documentId, filename);
        const file = bucket.file(key);
        const [exists] = await file.exists();
        return exists;
      } catch (gcsError) {
        console.error('GCS exists check error:', gcsError);
        return false;
      }
    }

    const filePath = this.getSignedDocumentPath(userId, documentId, filename);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a signed document
   * @param {number} userId - User ID
   * @param {number} documentId - Signed document ID
   * @param {string} filename - Filename
   * @returns {Promise<void>}
   */
  static async deleteSignedDocument(userId, documentId, filename) {
    if (STORAGE_TYPE === 'gcs') {
      try {
        const { Storage } = await import('@google-cloud/storage');
        const storage = new Storage({
          projectId: process.env.GCS_PROJECT_ID,
          keyFilename: process.env.GCS_KEY_FILENAME,
          credentials: process.env.GCS_CREDENTIALS ? JSON.parse(process.env.GCS_CREDENTIALS) : undefined
        });
        const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
        const key = this.getSignedDocumentKey(userId, documentId, filename);
        const file = bucket.file(key);
        await file.delete();
      } catch (gcsError) {
        // Ignore if file doesn't exist (404)
        if (gcsError.code !== 404) {
          throw new Error(`Failed to delete from GCS: ${gcsError.message}`);
        }
      }
      return;
    }

    const filePath = this.getSignedDocumentPath(userId, documentId, filename);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      // Ignore if file doesn't exist
      if (err.code !== 'ENOENT') {
        throw err;
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
   * Migrate old format path to new format
   * This is a helper for backward compatibility
   */
  static async migrateOldPathToNew(storedPath, userId, documentId) {
    const parsed = this.parseSignedDocumentPath(storedPath);
    if (!parsed || parsed.format === 'new') {
      return storedPath; // Already in new format or invalid
    }

    // Read from old location
    const oldPath = path.join(BASE_UPLOAD_DIR, storedPath);
    try {
      const fileBuffer = await fs.readFile(oldPath);
      
      // Save to new location
      const result = await this.saveSignedDocument(userId, documentId, fileBuffer, parsed.filename);
      
      // Delete old file
      try {
        await fs.unlink(oldPath);
      } catch (err) {
        console.warn(`Failed to delete old file ${oldPath}:`, err);
      }
      
      return result.relativePath;
    } catch (err) {
      console.error(`Failed to migrate file ${storedPath}:`, err);
      return storedPath; // Return original if migration fails
    }
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
   * Get file size
   */
  static async getFileSize(userId, documentId, filename) {
    if (STORAGE_TYPE === 'gcs') {
      // Future: Get from GCS metadata
      throw new Error('Google Cloud Storage not yet implemented');
    }

    const filePath = this.getSignedDocumentPath(userId, documentId, filename);
    const stats = await fs.stat(filePath);
    return stats.size;
  }
}

export default StorageService;

