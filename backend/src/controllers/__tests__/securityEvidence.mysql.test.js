import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import express from 'express';
import { splitSqlStatements, stripSqlLineComments, isIgnorableSchemaError } from '../../../../database/migrationSqlUtils.js';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../config/database.js', () => ({ default: {
  execute: (...args) => state.db.execute(...args),
  getConnection: async () => ({ execute: (...args) => state.db.execute(...args), beginTransaction: () => state.db.beginTransaction(), commit: () => state.db.commit(), rollback: () => state.db.rollback(), release() {} })
} }));
import { appendSecurityEvidence, flushSecurityEvidence, assertEvidenceStorage } from '../../services/securityEvidence.service.js';
import { createSecurityEvidenceMiddleware } from '../../middleware/securityEvidence.middleware.js';
import { evidenceRequestContext } from '../../utils/evidenceRequestContext.js';
import { listEvidence, evidenceSignals, revokeUserSessions, exportEvidence } from '../securityEvidence.controller.js';

const socket = process.env.EVIDENCE_TEST_SOCKET;
describe.skipIf(!socket)('isolated MySQL evidence integration', () => {
  beforeEach(() => { vi.spyOn(console, 'info').mockImplementation(() => {}); vi.stubEnv('MFA_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,1).toString('base64')); });
  let server;
  let origin;
  const event = {requestId:'11111111-1111-4111-8111-111111111111',phase:'completed',userId:507,email:'test@example.invalid',role:'admin',method:'GET',route:'/api/documents/:id/download',clientIp:'192.0.2.10',ipSource:'direct_peer',peerIp:'192.0.2.10',forwardedIps:[],action:'file_response',outcome:'response_sent',responseBytes:5};
  beforeAll(async () => {
    // Refuse arbitrary sockets or TCP credentials: this suite cannot use the app DB.
    if (!/^\/private\/tmp\/pt-security-evidence-db\.[^/]+\/mysql\.sock$/.test(socket)) throw new Error('Use an isolated temporary test database socket');
    vi.spyOn(console,'info').mockImplementation(()=>{});
    state.db=await mysql.createConnection({socketPath:socket,user:'root',timezone:'Z'});
    await state.db.query('CREATE DATABASE IF NOT EXISTS security_evidence_test');
    await state.db.query('USE security_evidence_test');
    const sql=await fs.readFile(new URL('../../../../database/migrations/1456_security_evidence.sql',import.meta.url),'utf8');
    for(let pass=0;pass<2;pass++) for(const statement of splitSqlStatements(stripSqlLineComments(sql))) {
      try{await state.db.query(statement);}catch(e){if(!isIgnorableSchemaError(e))throw e;}
    }
    await state.db.query('CREATE TABLE users (id INT PRIMARY KEY, email VARCHAR(255), role VARCHAR(64),failed_login_attempts INT DEFAULT 0,locked_until DATETIME)');
    await state.db.query('INSERT INTO users (id,email,role) VALUES (507,"test@example.invalid","admin")');
    await state.db.query('CREATE TABLE auth_session_security (user_id INT, session_key CHAR(64), revoked_at DATETIME(3))');
    const accountSql=await fs.readFile(new URL('../../../../database/migrations/1458_account_security.sql',import.meta.url),'utf8');
    for (const statement of splitSqlStatements(stripSqlLineComments(accountSql))) await state.db.query(statement);
    const emailSql=await fs.readFile(new URL('../../../../database/migrations/1463_school_email_verification.sql',import.meta.url),'utf8');
    for(const statement of splitSqlStatements(stripSqlLineComments(emailSql)))await state.db.query(statement);
    const protectionSql=await fs.readFile(new URL('../../../../database/migrations/1459_activity_protection.sql',import.meta.url),'utf8');
    for (const statement of splitSqlStatements(stripSqlLineComments(protectionSql))) await state.db.query(statement);
    vi.stubEnv('MFA_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,1).toString('base64'));
    await state.db.query('INSERT INTO auth_session_security (user_id,revoked_at) VALUES (507,NULL)');
    await state.db.query('CREATE TABLE quick_view_sessions (user_id INT, revoked_at DATETIME(3))');
    await state.db.query('INSERT INTO quick_view_sessions VALUES (507,NULL)');
    const app=express(); app.use(express.json()); app.use(createSecurityEvidenceMiddleware());
    app.get('/api/documents/:id/download',async(req,res,next)=>{try{await req.auditIdentify({id:507,email:'test@example.invalid',role:'admin',sessionId:'test-session'});res.attachment('private.pdf');res.end(Buffer.from('hello'));}catch(e){next(e);}});
    app.get('/api/links/:id',async(req,res,next)=>{try{await req.auditIdentify({id:507,sessionId:'test-session'});res.json({url:'https://storage.example/file?X-Goog-Signature=DO-NOT-RECORD'});}catch(e){next(e);}});
    app.get('/api/denied',(_req,res)=>res.sendStatus(401));
    app.get('/api/partial-file',(_req,res)=>res.status(206).set({ 'Content-Type': 'application/pdf', 'Content-Range': 'bytes 5-9/100' }).send(Buffer.from('hello')));
    app.get('/api/cached-file',(_req,res)=>res.status(304).set('Content-Type','application/pdf').end('discarded'));
    app.get('/api/empty-file',(_req,res)=>res.status(204).set('Content-Type','application/pdf').end('discarded'));
    app.get('/api/grants/:id',async(req,res,next)=>{try{await req.auditIdentify({id:507,sessionId:'test-session'});await Promise.resolve();await evidenceRequestContext.getStore().auditStorageGrant({storageRef:'a'.repeat(64),expiresAt:'2026-09-17T00:00:00Z'});res.json({message:'prepared for another operation'});}catch(e){next(e);}});
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}); origin=`http://127.0.0.1:${server.address().port}`;
  },15000);
  afterAll(async()=>{ if(server)await new Promise(resolve=>server.close(resolve));await flushSecurityEvidence();if(state.db){await state.db.query('DROP DATABASE security_evidence_test');await state.db.end();} });
  it('supports the real migration twice and refuses historical updates/deletes',async()=>{
    await assertEvidenceStorage();await appendSecurityEvidence(event);
    await expect(state.db.execute('UPDATE security_evidence SET outcome="failed" WHERE user_id=507')).rejects.toMatchObject({code:'ER_SIGNAL_EXCEPTION'});
    await expect(state.db.execute('DELETE FROM security_evidence WHERE user_id=507')).rejects.toMatchObject({code:'ER_SIGNAL_EXCEPTION'});
  });
  it('records an actual HTTP file response with linked identity, byte count and request ID',async()=>{
    const res=await fetch(`${origin}/api/documents/8/download`);expect(await res.text()).toBe('hello');await flushSecurityEvidence();
    const [rows]=await state.db.execute('SELECT * FROM security_evidence WHERE request_id=? ORDER BY id',[res.headers.get('x-request-id')]);
    expect(rows.map(r=>r.phase)).toEqual(['received','authenticated','completed']);expect(rows.at(-1)).toMatchObject({user_id:507,action:'file_response',outcome:'response_sent',response_bytes:5,route:'/api/documents/:id/download'});
    expect(JSON.stringify(rows)).not.toContain('private.pdf');
  });
  it('audits unauthenticated denial and temporary link issuance without recording the secret',async()=>{
    const denied=await fetch(`${origin}/api/denied`);await denied.text();const link=await fetch(`${origin}/api/links/9`);await link.text();await flushSecurityEvidence();
    const [rows]=await state.db.execute('SELECT action,outcome,details FROM security_evidence WHERE request_id IN (?,?) AND phase="completed"',[denied.headers.get('x-request-id'),link.headers.get('x-request-id')]);
    expect(rows.some(r=>r.outcome==='denied')).toBe(true);expect(rows.some(r=>r.action==='download_link_issued'&&r.outcome==='issued')).toBe(true);expect(JSON.stringify(rows)).not.toContain('DO-NOT-RECORD');
  });
  it('distinguishes actual HTTP partial bytes from metadata and cache-only file requests',async()=>{
    const cases = [
      { path:'/api/documents/8/download', method:'HEAD', action:'file_metadata', outcome:'metadata_only', bytes:0 },
      { path:'/api/cached-file', method:'GET', action:'file_response', outcome:'not_modified', bytes:0 },
      { path:'/api/empty-file', method:'GET', action:'file_response', outcome:'no_content', bytes:0 },
      { path:'/api/partial-file', method:'GET', action:'file_response', outcome:'response_sent', bytes:5 }
    ];
    for (const item of cases) {
      const response = await fetch(`${origin}${item.path}`, { method:item.method });
      expect((await response.arrayBuffer()).byteLength).toBe(item.bytes);
      await flushSecurityEvidence();
      const [[row]] = await state.db.execute('SELECT * FROM security_evidence WHERE request_id=? AND phase="completed"',[response.headers.get('x-request-id')]);
      expect(row).toMatchObject({action:item.action,outcome:item.outcome,response_bytes:item.bytes});
      const metadata = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
      if (item.bytes) expect(metadata.transfer).toMatchObject({partial:true,rangeStart:5,rangeEnd:9,resourceBytes:100});
      else expect(metadata.transfer.bodyPermitted).toBe(false);
    }
  });
  it('returns one latest outcome per request with exact user/IP filters',async()=>{
    let body;const next=vi.fn();await listEvidence({query:{userId:'507',ip:'192.0.2.10'}},{setHeader(){},json:v=>{body=v;}},next);expect(next).not.toHaveBeenCalled();expect(body.items).toHaveLength(1);expect(body.items[0].outcome).toBe('response_sent');
  });
  it('executes the real signal query including strict GROUP BY rules',async()=>{
    let body;const next=vi.fn();await evidenceSignals({}, {setHeader(){},json:v=>{body=v;}},next);expect(next).not.toHaveBeenCalled();expect(body.highVolume).toEqual([]);
  });
  it('finds prepared storage grants even when the response is not itself a link',async()=>{
    const res=await fetch(`${origin}/api/grants/9`);await res.text();await flushSecurityEvidence();let body;const next=vi.fn();
    await listEvidence({query:{userId:'507',request:res.headers.get('x-request-id'),kind:'downloads',end:new Date(Date.now()+1000).toISOString()}},{setHeader(){},json:v=>{body=v;}},next);
    const [recorded] = await state.db.execute('SELECT phase,action,occurred_at,user_id FROM security_evidence WHERE request_id=?',[res.headers.get('x-request-id')]);
    expect(next).not.toHaveBeenCalled();expect(body.items,JSON.stringify({recorded,range:body.range,snapshot:body.snapshot})).toHaveLength(1);expect(body.items[0].action).toBe('data_read');
    const[stages]=await state.db.execute('SELECT * FROM security_evidence WHERE request_id=? AND phase="link_prepared"',[res.headers.get('x-request-id')]);expect(stages).toHaveLength(1);expect(stages[0].user_id).toBe(507);
  });
  it('keeps completed outcomes terminal when a delayed stage arrives and preserves snapshot history',async()=>{
    const requestId='22222222-2222-4222-8222-222222222222';const partial={...event,requestId,phase:'authenticated',action:'request',outcome:'started'};
    await appendSecurityEvidence(partial);const[[initial]]=await state.db.execute('SELECT MAX(id) snapshot FROM security_evidence');
    await appendSecurityEvidence({...event,requestId});await appendSecurityEvidence({...partial,phase:'link_prepared',action:'file_link_prepared',outcome:'prepared'});
    const base={userId:'507',request:requestId,end:new Date(Date.now()+1000).toISOString()};let body;const res={setHeader(){},json:v=>{body=v;}};const next=vi.fn();
    await listEvidence({query:base},res,next);expect(next).not.toHaveBeenCalled();expect(body.items[0].phase).toBe('completed');
    await listEvidence({query:{...base,snapshot:String(initial.snapshot)}},res,next);expect(next).not.toHaveBeenCalled();expect(body.items[0].phase).toBe('authenticated');
  });
  it('exports all request stages instead of only the latest summary',async()=>{
    const res=await fetch(`${origin}/api/documents/11/download`);await res.text();await flushSecurityEvidence();let csv;const headers={};const next=vi.fn();
    await exportEvidence({query:{request:res.headers.get('x-request-id'),end:new Date(Date.now()+1000).toISOString()}},{setHeader:(k,v)=>{headers[k]=v;},send:v=>{csv=v;}},next);
    expect(next).not.toHaveBeenCalled();expect(csv.split('\r\n')).toHaveLength(4);for(const phase of ['received','authenticated','completed'])expect(csv).toContain(`"${phase}"`);expect(headers['X-Evidence-SHA256']).toHaveLength(64);
  });
  it('commits an independently enforced user cutoff and revokes Quick View sessions',async()=>{
    let body;const next=vi.fn();await revokeUserSessions({params:{userId:'507'},body:{confirmUserId:507},user:{id:1,email:'it@example.invalid',role:'super_admin'},method:'POST',headers:{}},{json:v=>{body=v;}},next);expect(next).not.toHaveBeenCalled();expect(body.revokedSessionRows).toBe(1);
    const[rows]=await state.db.execute('SELECT * FROM user_auth_revocations WHERE user_id=507');expect(Number(rows[0].reject_issued_before)).toBeGreaterThan(Date.now()/1000-2);
    const[qv]=await state.db.execute('SELECT revoked_at FROM quick_view_sessions WHERE user_id=507');expect(qv[0].revoked_at).not.toBeNull();
  });
  it('retains all outcomes through a concurrent download burst and exposes a review lead',async()=>{
    const ids=[];const times=[];
    for(let batch=0;batch<6;batch++) await Promise.all(Array.from({length:10},async()=>{const started=performance.now();const response=await fetch(`${origin}/api/documents/8/download`);expect(await response.text()).toBe('hello');ids.push(response.headers.get('x-request-id'));times.push(performance.now()-started);}));
    await flushSecurityEvidence();const[rows]=await state.db.execute(`SELECT request_id,COUNT(*) stages FROM security_evidence WHERE request_id IN (${ids.map(()=>'?').join(',')}) AND phase='completed' GROUP BY request_id`,ids);
    expect(rows).toHaveLength(60);expect(rows.every(r=>r.stages===1)).toBe(true);
    let signals;const next=vi.fn();await evidenceSignals({}, {setHeader(){},json:v=>{signals=v;}},next);expect(next).not.toHaveBeenCalled();expect(signals.highVolume.some(r=>Number(r.request_count)>=25)).toBe(true);
    times.sort((a,b)=>a-b);console.log(`Isolated 60-request burst: p50=${times[29].toFixed(1)}ms p95=${times[56].toFixed(1)}ms; all completion records present. Not a production latency benchmark.`);
  },15000);
});
