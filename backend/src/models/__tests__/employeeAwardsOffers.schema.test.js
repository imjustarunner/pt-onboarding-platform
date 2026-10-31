import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { pool } = vi.hoisted(() => ({ pool: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../../config/database.js',()=>({default:pool}));
import Awards from '../EmployeeServiceMilestone.model.js';
let db, failHistory;
beforeEach(()=>{
  vi.resetAllMocks();failHistory=false;db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE agencies(id INTEGER PRIMARY KEY,timezone TEXT);
    INSERT INTO agencies VALUES(2,'America/Denver');
    CREATE TABLE employee_service_milestones(id INTEGER PRIMARY KEY,agency_id INTEGER,milestone_years INTEGER,status TEXT,fulfilled_on TEXT);
    INSERT INTO employee_service_milestones VALUES(1,2,2,'owed',NULL),(2,2,2,'gift_sent','2020-01-01');
    CREATE TABLE employee_award_dinner_offers(id INTEGER PRIMARY KEY,milestone_id INTEGER,outcome TEXT,offered_on TEXT,note TEXT,actor_user_id INTEGER);
    CREATE TABLE employee_award_notes(id INTEGER PRIMARY KEY,milestone_id INTEGER,actor_user_id INTEGER,note TEXT);`);
  const execute=async(sql,params=[])=>{
    if(failHistory && sql.includes('INSERT INTO employee_award_notes'))throw new Error('History unavailable');
    const statement=db.prepare(sql.replace(/ FOR UPDATE\s*$/i,''));
    if(/^\s*SELECT/i.test(sql))return [statement.all(...params)];
    const result=statement.run(...params);return [{insertId:Number(result.lastInsertRowid),affectedRows:Number(result.changes)}];
  };
  pool.execute.mockImplementation(execute);
  pool.getConnection.mockResolvedValue({execute,beginTransaction:async()=>db.exec('BEGIN'),commit:async()=>db.exec('COMMIT'),rollback:async()=>db.exec('ROLLBACK'),release:()=>{}});
});
afterEach(()=>db.close());
describe('dinner offer persistence in an isolated database',()=>{
  it('retains every offer and reason while leaving the original award owed',async()=>{
    for(const outcome of ['offered','unable_to_attend','declined','no_show'])await Awards.recordDinnerOffer(1,{outcome,offeredOn:'2020-10-20',note:'Could not attend'},7);
    expect(db.prepare('SELECT status,fulfilled_on FROM employee_service_milestones WHERE id=1').get()).toMatchObject({status:'owed',fulfilled_on:null});
    expect(db.prepare('SELECT outcome,note,offered_on FROM employee_award_dinner_offers ORDER BY id').all()).toEqual(['offered','unable_to_attend','declined','no_show'].map(outcome=>expect.objectContaining({outcome,note:'Could not attend',offered_on:'2020-10-20'})));
    expect(db.prepare('SELECT COUNT(*) n FROM employee_award_notes').get().n).toBe(4);
  });
  it('does not reopen a completed dinner when historical notes are added',async()=>{
    await Awards.recordDinnerOffer(2,{outcome:'unable_to_attend',note:'Earlier offer'},7);
    expect(db.prepare('SELECT status,fulfilled_on FROM employee_service_milestones WHERE id=2').get()).toMatchObject({status:'gift_sent',fulfilled_on:'2020-01-01'});
  });
  it('rolls back the offer if its audit note cannot be written',async()=>{
    failHistory=true;
    await expect(Awards.recordDinnerOffer(1,{outcome:'offered'},7)).rejects.toThrow('History unavailable');
    expect(db.prepare('SELECT COUNT(*) n FROM employee_award_dinner_offers').get().n).toBe(0);
    expect(db.prepare('SELECT status FROM employee_service_milestones WHERE id=1').get().status).toBe('owed');
  });
});
