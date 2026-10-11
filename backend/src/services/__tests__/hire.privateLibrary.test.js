import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {unpackPrivateLibrary} from '../privateLibraryContent.service.js';
const sha=b=>createHash('sha256').update(b).digest('hex');
function fixture(name='handbooks/example.json'){const content=Buffer.from('{"example":true}'),bytes=gzipSync(JSON.stringify({version:1,files:{[name]:content.toString('base64')}}));return{bytes,manifest:{sha256:sha(bytes),directories:['handbooks'],files:{[name]:sha(content)}}};}
it('restores only manifest-listed files with matching release and per-file checksums',()=>{const {bytes,manifest}=fixture();expect(unpackPrivateLibrary(bytes,manifest)[0][1].toString()).toBe('{"example":true}');});
it('rejects a different bundle or modified file',()=>{const {bytes,manifest}=fixture();expect(()=>unpackPrivateLibrary(Buffer.from('wrong'),manifest)).toThrow('checksum');manifest.files['handbooks/example.json']='wrong';expect(()=>unpackPrivateLibrary(bytes,manifest)).toThrow('checksum');});
it('rejects traversal and unapproved folders',()=>{for(const name of ['handbooks/../../config.js','secrets/key.json']){const {bytes,manifest}=fixture(name);expect(()=>unpackPrivateLibrary(bytes,manifest)).toThrow('path');}});
