import { describe, expect, it } from 'vitest';
import { libraryFileError, LIBRARY_FILE_LIMIT, LIBRARY_BATCH_LIMIT, LIBRARY_BATCH_FILES } from '../libraryUploads';
const file = (name = 'Document.pdf', size = 1024, type = 'application/pdf') => ({ name, size, type });
describe('library upload limits', () => {
  it('accepts a file at 40 MB and rejects a file one byte over', () => {
    expect(libraryFileError([file('Boundary.pdf', LIBRARY_FILE_LIMIT)])).toBe('');
    expect(libraryFileError([file('Oversized.pdf', LIBRARY_FILE_LIMIT + 1)])).toContain('40 MB');
  });
  it('accepts 50 files and rejects 51 files', () => {
    expect(libraryFileError(Array.from({ length: LIBRARY_BATCH_FILES }, () => file()))).toBe('');
    expect(libraryFileError(Array.from({ length: LIBRARY_BATCH_FILES + 1 }, () => file()))).toContain('50 files');
  });
  it('limits aggregate upload size even when each file is small enough', () => {
    const files = [file('A.pdf', LIBRARY_FILE_LIMIT), file('B.pdf', LIBRARY_FILE_LIMIT), file('C.pdf', LIBRARY_BATCH_LIMIT - LIBRARY_FILE_LIMIT * 2)];
    expect(libraryFileError(files)).toBe(''); files[2].size += 1;
    expect(libraryFileError(files)).toContain('100 MB');
  });
  it.each([['Orientation.MOV', ''], ['Orientation.webm', 'application/octet-stream'], ['Orientation.pdf', 'video/mp4']])('redirects video uploads to hosted links (%s)', (name, type) => {
    expect(libraryFileError([file(name, 512, type)])).toContain('Video link');
  });
  it('accepts supported document formats without relying on a browser MIME value', () => {
    expect(libraryFileError(['PDF', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'txt'].map(extension => file(`Document.${extension}`, 1024, '')))).toBe('');
  });
  it('rejects unrecognized uploads instead of silently dropping files in a folder', () => {
    expect(libraryFileError([file(), file('Executable.exe', 512, '')])).toContain('Add other resources as links');
  });
});
