import { google } from 'googleapis';
import pool from '../config/database.js';
import { buildImpersonatedJwtClient } from './googleWorkspaceAuth.service.js';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const PDF_EXPORT_TYPES = new Set(['application/vnd.google-apps.document', 'application/vnd.google-apps.spreadsheet', 'application/vnd.google-apps.presentation', 'application/vnd.google-apps.drawing']);
const DISPLAY_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const fail = (message, status = 400) => Object.assign(new Error(message), { status, libraryPreviewError: true });

export function libraryGoogleFileId(value) {
  let url;
  try { url = new URL(String(value || '')); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (!['docs.google.com', 'drive.google.com'].includes(url.hostname)) return null;
  const match = url.pathname.match(/^\/(?:document|spreadsheets|presentation|drawings|file)\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/);
  const id = match?.[1] || (url.hostname === 'drive.google.com' ? url.searchParams.get('id') : null);
  return id && /^[a-zA-Z0-9_-]+$/.test(id) && id !== 'e' ? id : null;
}

async function downloadGoogleDocument(drive, auth, fileId, options) {
  // files.export has a 10 MB ceiling. Google's download operation also handles
  // larger guides while retaining the publisher's file permissions.
  let { data: operation } = await drive.files.download({ fileId, mimeType: 'application/pdf' }, { timeout: 30000, retry: false });
  for (let attempt = 0; !operation.done && attempt < 2; attempt++) {
    if (!operation.name) throw fail('Google is still preparing this document. Try again shortly.', 503);
    await new Promise(resolve => setTimeout(resolve, 10000 * (attempt + 1)));
    const headers = operation.metadata?.resourceKey ? { 'X-Goog-Drive-Resource-Keys': `${fileId}/${operation.metadata.resourceKey}` } : undefined;
    ({ data: operation } = await drive.operations.get({ name: operation.name }, { timeout: 10000, retry: false, ...(headers ? { headers } : {}) }));
  }
  if (!operation.done) throw fail('Google is still preparing this document. Try again shortly.', 503);
  if (operation.error) throw fail('Google could not prepare this document. Ask the resource owner to check access or upload a PDF.', 409);
  let url;
  try { url = new URL(operation.response?.downloadUri); } catch { /* Reject missing download links. */ }
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.port || !['docs.google.com', 'drive.usercontent.google.com', 'www.googleapis.com'].includes(url.hostname)) {
    throw fail('Google did not return a usable document download.', 502);
  }
  // Only use the download URI returned by Google's authenticated API. The
  // Google client follows its content-host redirects; the browser gets PDF bytes.
  return auth.request({ url: url.href, ...options, maxRedirects: 3 });
}

/** The caller must enforce library visibility before accessing a Google file.
 * Read only as the person who last published/edited this resource, never falling back to a
 * platform administrator or trying to sign in as the group-account viewer. No Drive sharing changes.
 */
export async function loadLibraryGooglePreview(resource) {
  const fileId = libraryGoogleFileId(resource?.externalUrl);
  if (!fileId) throw fail('This Google link cannot be previewed. Ask the resource owner to add a Docs, Sheets, Slides, or Drive file link.');
  const publisherId = Number(resource.updatedBy || resource.createdBy);
  const [users] = await pool.execute(`SELECT u.email, u.work_email, u.login_is_group_email FROM users u
    WHERE u.id = ? AND u.is_active = 1 AND (u.role = 'super_admin' OR EXISTS
      (SELECT 1 FROM user_agencies ua WHERE ua.user_id = u.id AND ua.agency_id = ? AND ua.is_active = 1)) LIMIT 1`, [publisherId, resource.agencyId]);
  const publisher = users[0];
  if (!publisher || [true, 1, '1'].includes(publisher.login_is_group_email)) {
    throw fail('This link needs a portal copy. Ask the resource owner to upload a PDF so everyone with library access can open it.', 409);
  }
  const subjectEmail = String(publisher.work_email || publisher.email || '').trim().toLowerCase();
  if (!subjectEmail) throw fail('The resource owner needs to reconnect this document or upload a PDF.', 409);
  try {
    const auth = await buildImpersonatedJwtClient({ subjectEmail, scopes: [DRIVE_SCOPE] });
    const drive = google.drive({ version: 'v3', auth });
    const { data: file } = await drive.files.get({ fileId, fields: 'mimeType,capabilities(canDownload),trashed', supportsAllDrives: true });
    if (file.trashed || file.capabilities?.canDownload === false) throw fail('The resource owner needs to allow downloading this document or upload a PDF to the library.', 409);
    const exported = PDF_EXPORT_TYPES.has(file.mimeType);
    const mimeType = exported ? 'application/pdf' : file.mimeType;
    if (!DISPLAY_TYPES.has(mimeType)) throw fail('This file format needs a PDF copy for viewing in the portal. Ask the resource owner to upload one.', 415);
    const options = { responseType: 'arraybuffer', timeout: 30000, maxContentLength: 40 * 1024 * 1024, retry: false };
    const response = exported
      ? await downloadGoogleDocument(drive, auth, fileId, options)
      : await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, options);
    const buffer = Buffer.from(response.data);
    if (!buffer.length || buffer.length > 40 * 1024 * 1024 || (mimeType === 'application/pdf' && !buffer.subarray(0, 1024).includes(Buffer.from('%PDF-')))) {
      throw fail('Google did not return a usable document preview. Ask the resource owner to upload a PDF.', 502);
    }
    const extension = mimeType === 'application/pdf' ? 'pdf' : mimeType.split('/')[1];
    const name = String(resource.name || 'Document').replace(/[\r\n"\\/\x00-\x1f]/g, '_').slice(0, 160).replace(/\.(pdf|png|jpe?g|gif|webp)$/i, '');
    return { buffer, mimeType, filename: `${name}.${extension}` };
  } catch (error) {
    if (error.libraryPreviewError) throw error;
    const status = Number(error.response?.status || error.code);
    if ([401, 403, 404].includes(status) || /invalid_grant|unauthorized_client/i.test(error.message || '')) {
      throw fail('The portal cannot read this Google document yet. Ask the resource owner to reconnect the link or upload a PDF. You do not need a Google account to view an uploaded copy.', 409);
    }
    throw fail('The document preview is temporarily unavailable. Try again or ask the resource owner for a PDF copy.', 503);
  }
}
