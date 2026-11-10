import { test } from 'node:test';import assert from 'node:assert/strict';import { ticketAttachmentType } from '../ticketAttachmentType.js';
test('an extensionless email certificate previews as a PDF using its bytes',()=>{
 assert.deepEqual(ticketAttachmentType(Buffer.from('%PDF-1.7\n'), 'certificate'),{filename:'certificate.pdf',mimeType:'application/pdf',disposition:'inline'});
});
test('does not preview active or unknown content just because its name claims PDF',()=>{
 for(const b of [Buffer.from('<html>script</html>'),Buffer.from('<svg/>'),Buffer.from('unknown')])assert.deepEqual(ticketAttachmentType(b,'unsafe.pdf'),{filename:'unsafe.pdf',mimeType:'application/octet-stream',disposition:'attachment'});
});
test('normalizes passive image names and removes header control characters',()=>{
 assert.equal(ticketAttachmentType(Buffer.from([255,216,255]),'photo\r\n"').mimeType,'image/jpeg');
 assert.doesNotMatch(ticketAttachmentType(Buffer.from('%PDF-'),'x\r\n"').filename,/[\r\n"]/);
});
