import { expect, it, vi } from 'vitest';
vi.mock('../../models/ClientPhiDocument.model.js', () => ({ default: {} }));
vi.mock('../storage.service.js', () => ({ default: {} }));
vi.mock('../documentEncryption.service.js', () => ({ default: {} }));
import { paperPacketBytes } from '../paperPacketBytes.service.js';
const scope={documentId:4052,clientId:2439,schoolOrganizationId:451};
function fixture(change={}) {const doc={id:4052,client_id:2439,school_organization_id:451,scan_status:'clean',is_encrypted:1,storage_path:'private',...change};return {documents:{findSchoolPaperPacket:vi.fn(async()=>doc)},storage:{readObject:vi.fn(async()=>Buffer.from('encrypted')),sanitizeFilename:x=>x},encryption:{decryptPhiDocumentBuffer:vi.fn(async()=>Buffer.from('%PDF-actual'))}};}
it('passes decrypted bytes to OCR only after the private file check',async()=>{const deps=fixture();expect((await paperPacketBytes(scope,deps)).buffer.toString()).toBe('%PDF-actual');expect(deps.encryption.decryptPhiDocumentBuffer).toHaveBeenCalledOnce();});
it.each([{client_id:2440},{school_organization_id:99},{removed_at:'2026-01-01'},{scan_status:null},{scan_status:'infected'}])('never reads mismatched or unsafe source bytes: %j',async change=>{const deps=fixture(change);await expect(paperPacketBytes(scope,deps)).rejects.toThrow();expect(deps.storage.readObject).not.toHaveBeenCalled();});
