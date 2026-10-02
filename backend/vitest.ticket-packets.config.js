export default {
  root: new URL('.', import.meta.url).pathname,
  test: { environment: 'node', include: ['src/**/__tests__/ticketAttachmentFiling*.test.js', 'src/**/__tests__/clientDocumentUpload*.test.js'], restoreMocks: true }
};
