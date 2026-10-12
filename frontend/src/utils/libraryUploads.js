export const LIBRARY_FILE_LIMIT = 40 * 1024 * 1024;
export const LIBRARY_BATCH_LIMIT = 100 * 1024 * 1024;
export const LIBRARY_BATCH_FILES = 50;
export const LIBRARY_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.txt';
export function libraryFileError(files) {
  if (files.length > LIBRARY_BATCH_FILES) return 'Upload up to 50 files at a time. Choose a smaller folder.';
  if (files.some(file => /^video\//i.test(file.type || '') || /\.(mp4|mov|m4v|webm|avi|mkv|wmv|mpeg|mpg)$/i.test(file.name))) return 'For videos, choose Video link and paste a link from YouTube, Vimeo, Loom, Google Drive, or another video host.';
  if (files.some(file => file.size > LIBRARY_FILE_LIMIT)) return 'Each file must be 40 MB or smaller.';
  if (files.reduce((sum, file) => sum + file.size, 0) > LIBRARY_BATCH_LIMIT) return 'Upload up to 100 MB at a time. Split this folder into smaller uploads.';
  if (files.some(file => !/\.(pdf|docx?|xlsx?|csv|pptx?|jpe?g|png|gif|webp|txt)$/i.test(file.name))) return 'Use PDFs, Word, Excel, PowerPoint, images, CSV, or text files. Add other resources as links.';
  return '';
}
