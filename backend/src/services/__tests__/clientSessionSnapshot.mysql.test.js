import {beforeAll,afterAll,describe,expect,it,vi} from 'vitest';
import mysql from 'mysql2/promise';
import {clientSessionSnapshots} from '../clientSessionSnapshot.service.js';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{}}));
const socketPath=process.env.HUB_SCOPE_MYSQL_SOCKET;
describe.skipIf(!socketPath)('client appointment snapshots on MySQL',()=>{
  let db;
  const database='client_snapshot_'+process.pid;
  beforeAll(async()=>{
    db=await mysql.createConnection({socketPath,user:'root'});
    await db.query(`CREATE DATABASE ${database}`);await db.query(`USE ${database}`);
    await db.query('CREATE TABLE appointments(id INT,agency_id INT,start_at DATETIME,status VARCHAR(32),provider_user_id INT DEFAULT 9)');
    await db.query('CREATE TABLE appointment_participants(appointment_id INT,client_id INT,role VARCHAR(24))');
    await db.query('CREATE TABLE clinical_sessions(agency_id INT,client_id INT,scheduled_start_at DATETIME,encounter_status VARCHAR(32),provider_user_id INT DEFAULT 9)');
    await db.query("INSERT INTO appointments(id,agency_id,start_at,status) VALUES(1,2,DATE_ADD(NOW(),INTERVAL 1 DAY),'confirmed'),(2,2,DATE_SUB(NOW(),INTERVAL 2 DAY),'completed'),(3,2,DATE_ADD(NOW(),INTERVAL 1 HOUR),'canceled_by_client'),(4,3,NOW(),'completed')");
    await db.query("INSERT INTO appointment_participants VALUES(1,12,'client'),(2,12,'client'),(3,12,'client'),(4,12,'client')");
    await db.query("INSERT INTO clinical_sessions(agency_id,client_id,scheduled_start_at,encounter_status) VALUES(2,12,DATE_ADD(NOW(),INTERVAL 2 DAY),'scheduled'),(2,12,DATE_SUB(NOW(),INTERVAL 1 DAY),'completed'),(3,12,DATE_ADD(NOW(),INTERVAL 1 MINUTE),'scheduled')");
  });
  afterAll(async()=>{if(db){await db.query(`DROP DATABASE ${database}`);await db.end();}});
  it('combines both calendars, omits canceled sessions and keeps other agencies outside the result',async()=>{
    const [row,empty]=await clientSessionSnapshots(2,[12,13],db,db);
    expect(new Date(row.nextAt).getTime()-Date.now()).toBeGreaterThan(23*3600000);
    expect(new Date(row.lastCompletedAt).getTime()-Date.now()).toBeLessThan(-23*3600000);
    expect(row.lastAt).toEqual(row.lastCompletedAt);expect(row.unavailable).toBe(false);
    expect(empty).toMatchObject({clientId:13,nextAt:null,lastAt:null,lastCompletedAt:null});
  });
  it('limits provider snapshots to their own scheduled sessions',async()=>{
    const [row]=await clientSessionSnapshots(2,[12],db,db,99);
    expect(row.nextAt).toBeNull();expect(row.lastAt).toBeNull();
  });
  it('reports unavailable calendar sources without claiming there are no sessions',async()=>{
    const [row]=await clientSessionSnapshots(2,[12],db,{execute:async()=>{throw Error('unavailable');}});
    expect(row.unavailable).toBe(true);expect(row.nextAt).toBeTruthy();
  });
});
