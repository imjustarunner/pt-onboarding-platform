import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),auth:vi.fn(),get:vi.fn(),download:vi.fn(),read:vi.fn(),operation:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../googleWorkspaceAuth.service.js',()=>({buildImpersonatedJwtClient:mocks.auth}));
vi.mock('googleapis',()=>({google:{drive:()=>({files:{get:mocks.get,download:mocks.download},operations:{get:mocks.operation}})}}));
import {libraryGoogleFileId,loadLibraryGooglePreview} from '../libraryGooglePreview.service.js';
const resource={id:1,agencyId:2,createdBy:3,updatedBy:4,name:'Guide',externalUrl:'https://docs.google.com/document/d/doc_123/edit'};
beforeEach(()=>{vi.resetAllMocks();mocks.execute.mockResolvedValue([[{email:'publisher@example.org',work_email:'author@work.test',login_is_group_email:0}]]);mocks.auth.mockResolvedValue({request:mocks.read});mocks.get.mockResolvedValue({data:{mimeType:'application/vnd.google-apps.document',capabilities:{canDownload:true}}});mocks.download.mockResolvedValue({data:{done:true,response:{downloadUri:'https://docs.google.com/feeds/download/documents/export/Export?id=doc_123'}}});mocks.read.mockResolvedValue({data:Buffer.from('%PDF-1.7\npreview')});});
it('exports a linked document using its publisher, independent of the reader’s Google login',async()=>{
 const result=await loadLibraryGooglePreview(resource);
 expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('ua.agency_id'),[4,2]);
 expect(mocks.auth).toHaveBeenCalledWith({subjectEmail:'author@work.test',scopes:['https://www.googleapis.com/auth/drive']});
 expect(mocks.download).toHaveBeenCalledWith({fileId:'doc_123',mimeType:'application/pdf'},expect.objectContaining({timeout:30000}));
 expect(result).toMatchObject({mimeType:'application/pdf',filename:'Guide.pdf'});expect(result.buffer.toString()).toContain('%PDF-');
});
it.each(['https://evil.test/document/d/private','https://docs.google.com.evil.test/document/d/private','https://user:pass@docs.google.com/document/d/private','http://docs.google.com/document/d/private','https://drive.google.com/open?id=../private','https://docs.google.com/document/d/e/published/pub','https://drive.google.com/folders/private'])('rejects non-file or unsafe URLs: %s',async url=>{
 expect(libraryGoogleFileId(url)).toBeNull();await expect(loadLibraryGooglePreview({...resource,externalUrl:url})).rejects.toMatchObject({status:400});expect(mocks.auth).not.toHaveBeenCalled();
});
it.each(['https://docs.google.com/spreadsheets/d/doc_123/edit','https://drive.google.com/file/d/doc_123/view','https://drive.google.com/open?id=doc_123'])('accepts supported Google file links: %s',url=>expect(libraryGoogleFileId(url)).toBe('doc_123'));
it('does not fall back to an administrator when a resource was added by a group account',async()=>{
 mocks.execute.mockResolvedValue([[{email:'group@work.test',login_is_group_email:1}]]);
 await expect(loadLibraryGooglePreview(resource)).rejects.toMatchObject({status:409});expect(mocks.auth).not.toHaveBeenCalled();
});
it('honors revoked publisher access and Google download restrictions',async()=>{
 mocks.get.mockRejectedValueOnce({code:404});await expect(loadLibraryGooglePreview(resource)).rejects.toMatchObject({status:409});
 mocks.get.mockResolvedValueOnce({data:{mimeType:'application/vnd.google-apps.document',capabilities:{canDownload:false}}});await expect(loadLibraryGooglePreview(resource)).rejects.toMatchObject({status:409});expect(mocks.download).not.toHaveBeenCalled();
});
it('rejects an HTML login page instead of passing it to the preview',async()=>{
 mocks.read.mockResolvedValueOnce({data:Buffer.from('<html>Sign in</html>')});await expect(loadLibraryGooglePreview(resource)).rejects.toMatchObject({status:502});
});
it('reads existing PDF files without exporting them',async()=>{
 mocks.get.mockResolvedValueOnce({data:{mimeType:'application/pdf'}}).mockResolvedValueOnce({data:Buffer.from('%PDF-1.7\nfile')});
 expect((await loadLibraryGooglePreview(resource)).mimeType).toBe('application/pdf');expect(mocks.download).not.toHaveBeenCalled();expect(mocks.get).toHaveBeenLastCalledWith({fileId:'doc_123',alt:'media',supportsAllDrives:true},expect.any(Object));
});

it('rejects a download URI outside Google before sending any credentials',async()=>{
 mocks.download.mockResolvedValue({data:{done:true,response:{downloadUri:'https://evil.test/steal'}}});
 await expect(loadLibraryGooglePreview(resource)).rejects.toMatchObject({status:502});expect(mocks.read).not.toHaveBeenCalled();
});
it('polls a pending Google operation and keeps the download credentials on the server',async()=>{
 vi.useFakeTimers();
 try {
  mocks.download.mockResolvedValue({data:{name:'operations/preparing',done:false,metadata:{resourceKey:'key'}}});
  mocks.operation.mockResolvedValue({data:{done:true,response:{downloadUri:'https://docs.google.com/feeds/download/file'}}});
  const result=loadLibraryGooglePreview(resource);await vi.runAllTimersAsync();
  expect((await result).mimeType).toBe('application/pdf');
  expect(mocks.operation).toHaveBeenCalledWith({name:'operations/preparing'},expect.objectContaining({headers:{'X-Goog-Drive-Resource-Keys':'doc_123/key'}}));
  expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({url:'https://docs.google.com/feeds/download/file',maxRedirects:3}));
 } finally {vi.useRealTimers();}
});
