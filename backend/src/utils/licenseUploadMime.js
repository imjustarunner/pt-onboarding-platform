/** MIME types accepted for license document uploads (PDF or image). */
export const LICENSE_UPLOAD_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

export function isAllowedLicenseUploadMime(mime) {
  return LICENSE_UPLOAD_MIME_TYPES.includes(String(mime || '').toLowerCase());
}

export const LICENSE_UPLOAD_ACCEPT =
  '.pdf,application/pdf,image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif';
