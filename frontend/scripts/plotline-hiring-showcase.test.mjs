import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const assets=root+'public/assets/plotline/examples/hiring-showcase/';
const provenance=JSON.parse(readFileSync(assets+'provenance.json','utf8'));
test('new screenshots preserve current source provenance and contain only local fixtures',()=>{
 assert.equal(provenance.fictional,true);assert.equal(provenance.productionAccess,false);assert.equal(provenance.realMedia,false);
 assert.equal(provenance.records.length,6);
 for(const record of provenance.records){
  const png=readFileSync(assets+record.file);assert.equal(png.subarray(1,4).toString(),'PNG');
  assert.equal(createHash('sha256').update(png).digest('hex'),record.sha256);
  for(const source of record.sources)assert.equal(createHash('sha256').update(readFileSync(root+source.path)).digest('hex'),source.sha256,source.path+' requires recapture');
 }
 for(const mockup of [provenance.suppliedMockup,provenance.suppliedApplicantMockup]){
  assert.ok(existsSync(assets+mockup.file));
  assert.equal(createHash('sha256').update(readFileSync(assets+mockup.file)).digest('hex'),mockup.sha256);
 }
});
test('capture harness replaces real media and APIs and never imports a production identity',()=>{
 const server=readFileSync(root+'scripts/plotline-hiring-capture/server.mjs','utf8');
 const capture=readFileSync(root+'scripts/plotline-hiring-capture/capture.mjs','utf8');
 assert.match(server,/MockVideoRoom\.vue/);assert.match(server,/mock-api\.js/);assert.match(server,/no-capture\.js/);
 assert.match(capture,/route\.abort\(\)/);assert.match(capture,/No media access/);
 const main=readFileSync(root+'scripts/plotline-hiring-capture/main.js','utf8');
 assert.doesNotMatch(main,/authToken|super_admin|signJwt|jsonwebtoken|process\.env/);
});
