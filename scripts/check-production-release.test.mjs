import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertReleaseContainsProduction } from './check-production-release.mjs';

test('production promotion requires both live releases in the candidate history',()=>{
 const cwd=mkdtempSync(join(tmpdir(),'pt-release-guard-'));
 const git=(args,input)=>execFileSync('git',args,{cwd,input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 try{
  git(['init']);const tree=git(['mktree'],'');
  const commit=(message,parents=[])=>git(['-c','user.name=Codex','-c','user.email=codex@openai.com','commit-tree',tree,...parents.flatMap(p=>['-p',p]),'-m',message]);
  const base=commit('base'),front=commit('frontend fix',[base]),back=commit('backend fix',[base]);
  const stale=commit('unrelated next release',[base]),combined=commit('combined release',[front,back]);
  assert.throws(()=>assertReleaseContainsProduction({candidate:stale,frontend:front,backend:back,cwd}),/would drop the production frontend/);
  assert.throws(()=>assertReleaseContainsProduction({candidate:front,frontend:front,backend:back,cwd}),/would drop the production backend/);
  assert.doesNotThrow(()=>assertReleaseContainsProduction({candidate:combined,frontend:front,backend:back,cwd}));
  assert.doesNotThrow(()=>assertReleaseContainsProduction({candidate:combined,frontend:combined,backend:back,cwd}));
  assert.throws(()=>assertReleaseContainsProduction({candidate:combined,frontend:'f'.repeat(40),backend:back,cwd}),/missing from this checkout/);
  assert.throws(()=>assertReleaseContainsProduction({candidate:combined,frontend:'local-unknown',backend:back,cwd}),/no verifiable source commit/);
 }finally{rmSync(cwd,{recursive:true});}
});
