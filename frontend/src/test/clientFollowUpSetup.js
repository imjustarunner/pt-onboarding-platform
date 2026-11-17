import { vi } from 'vitest';

// Task and profile tests stub document previews; PDF.js needs browser canvas APIs.
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }));
vi.mock('../components/documents/PDFPreview.vue', () => ({ default: { name: 'PDFPreview', template: '<div />' } }));
