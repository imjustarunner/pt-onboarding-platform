import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import mysql from 'mysql2/promise';
import { randomBytes } from 'node:crypto';
const state=vi.hoisted(()=>({db:null}));
vi.mock('../../config/database.js',()=>({default:{getConnection:()=>state.db.getConnection()}}));
import { ensureCompanyEventPage, findCompanyEventPage } from '../companyEventPages.service.js';
import { saveEventOperations } from '../companyEventOperations.service.js';
const socket=process.env.EVENT_PAGE_TEST_SOCKET,host=process.env.EVENT_PAGE_TEST_HOST,port=Number(process.env.EVENT_PAGE_TEST_PORT);
const schema=`event_page_links_test_${process.pid}_${randomBytes(5).toString('hex')}`;
let admin;
describe.skipIf(!socket&&!host)('company page persistence with isolated MySQL',()=>{
  beforeAll(async()=>{
    if(socket&&!/^\/private\/tmp\/event-page-links-test\.[^/]+\/mysql\.sock$/.test(socket))throw Error('Isolated event-page test socket required');
    if(!socket&&(host!=='127.0.0.1'||port!==3306||process.env.EVENT_PAGE_TEST_PASSWORD!=='stale_text_ci_only'))throw Error('Explicit synthetic CI fixture required');
    const config=socket?{socketPath:socket,user:'root'}:{host,port,user:'root',password:process.env.EVENT_PAGE_TEST_PASSWORD};
    admin=await mysql.createConnection(config);await admin.query(`CREATE DATABASE ${schema}`);
    state.db=mysql.createPool({...config,database:schema,connectionLimit:8});
    await state.db.query(`CREATE TABLE company_events(id INT PRIMARY KEY,agency_id INT,title VARCHAR(255),event_type VARCHAR(50),is_active BOOLEAN DEFAULT TRUE,school_event_status VARCHAR(30),operations_json JSON,updated_by_user_id INT,staff_link_token VARCHAR(48),updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`);
    await state.db.query('CREATE TABLE company_event_coordinators(company_event_id INT,user_id INT,assigned_by_user_id INT)');
    for(const id of [1,2,3])await state.db.execute("INSERT INTO company_events(id,agency_id,title,event_type,operations_json) VALUES (?,2,'Team dinner','company_event',JSON_OBJECT('potluckEnabled',true))",[id]);
  });
  afterAll(async()=>{if(state.db)await state.db.end();if(admin){await admin.query(`DROP DATABASE IF EXISTS ${schema}`);await admin.end();}});
  const row=async id=>(await state.db.execute('SELECT * FROM company_events WHERE id=?',[id]))[0][0];
  it('preserves one URL through concurrent first reads, renaming and stale settings saves',async()=>{
    const source=await row(1);
    const urls=await Promise.all(Array.from({length:6},()=>ensureCompanyEventPage({...source},{slug:'itsco'},state.db)));
    expect(new Set(urls).size).toBe(1);expect(urls[0]).toBe('https://auricwell.com/conversa/events/itsco/team-dinner-1');
    await state.db.execute("UPDATE company_events SET title='A completely different title' WHERE id=1");
    expect(await ensureCompanyEventPage(await row(1),{slug:'renamed-agency'},state.db)).toBe(urls[0]);
    await saveEventOperations({eventId:1,agencyId:2,actorUserId:7,operations:{coordinatorUserIds:[],potluckEnabled:false}});
    expect(await ensureCompanyEventPage(await row(1),{slug:'itsco'},state.db)).toBe(urls[0]);
    const found=await findCompanyEventPage({organizationSlug:'itsco',eventSlug:'team-dinner-1'},state.db);expect(found.id).toBe(1);
  });
  it('gives identically titled events distinct links and never reuses a deleted event URL',async()=>{
    const original=await row(1);const second=await row(2);
    const url=await ensureCompanyEventPage(second,{slug:'itsco'},state.db);expect(url).toBe('https://auricwell.com/conversa/events/itsco/team-dinner-2');
    await state.db.execute('DELETE FROM company_events WHERE id=2');
    expect(await findCompanyEventPage({organizationSlug:'itsco',eventSlug:'team-dinner-2'},state.db)).toBeNull();
    const next=await ensureCompanyEventPage(await row(3),{slug:'itsco'},state.db);expect(next).toMatch(/\/team-dinner-3$/);
    await state.db.execute('UPDATE company_events SET is_active=0 WHERE id=3');
    expect(await findCompanyEventPage({organizationSlug:'itsco',eventSlug:'team-dinner-3'},state.db)).toBeNull();
    expect(original.operations_json.pageLink.eventId).toBe(1);
  });
});
