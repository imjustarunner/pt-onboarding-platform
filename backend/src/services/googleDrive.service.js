import { Readable } from 'stream';
import { getWorkspaceClientsForEmployee, logGoogleUnauthorizedHint } from './googleWorkspaceAuth.service.js';

export class GoogleDriveService {
  /**
   * Upload a Buffer to Google Drive into a folder (parents).
   *
   * Requires GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON(_BASE64) and DWD.
   * Uses subject impersonation.
   */
  static async uploadBufferToFolder({ subjectEmail, folderId, filename, mimeType, buffer } = {}) {
    const subject = String(subjectEmail || '').trim().toLowerCase();
    const parent = String(folderId || '').trim();
    const name = String(filename || '').trim() || `upload-${Date.now()}`;
    const type = String(mimeType || '').trim() || 'application/octet-stream';
    if (!subject) throw new Error('Missing subjectEmail for Drive impersonation');
    if (!parent) throw new Error('Missing folderId for Drive upload');
    if (!buffer || !(buffer instanceof Buffer) || buffer.length === 0) throw new Error('Missing file buffer for Drive upload');

    let drive;
    try {
      ({ drive } = await getWorkspaceClientsForEmployee({ subjectEmail: subject }));
    } catch (e) {
      logGoogleUnauthorizedHint(e, { context: 'GoogleDriveService.uploadBufferToFolder' });
      throw e;
    }

    const media = {
      mimeType: type,
      body: Readable.from(buffer)
    };

    const resp = await drive.files.create({
      requestBody: {
        name,
        parents: [parent]
      },
      media,
      fields: 'id,name,webViewLink,webContentLink'
    });

    return {
      id: resp?.data?.id || null,
      name: resp?.data?.name || name,
      webViewLink: resp?.data?.webViewLink || null,
      webContentLink: resp?.data?.webContentLink || null
    };
  }
}

