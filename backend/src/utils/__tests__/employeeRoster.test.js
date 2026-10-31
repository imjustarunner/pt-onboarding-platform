import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ACTIVE_EMPLOYEE_SQL, EMPLOYEE_ROSTER_SQL } from '../staffEligibility.js';
test('employee choices are active real staff in the selected agency; history retains former employees',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE users(id INTEGER,role TEXT,is_active INTEGER,is_archived INTEGER,is_demo INTEGER,created_via_dev_fill INTEGER,status TEXT);
 CREATE TABLE user_agencies(user_id INTEGER,agency_id INTEGER,is_active INTEGER);`);
 const people=[
 [1,'provider',1,0,0,0,'ACTIVE_EMPLOYEE'],[2,'school_staff',1,0,0,0,'ACTIVE_EMPLOYEE'],[3,'client_guardian',1,0,0,0,'ACTIVE_EMPLOYEE'],
 [4,'provider',1,0,1,0,'ACTIVE_EMPLOYEE'],[5,'provider',1,0,0,1,'ACTIVE_EMPLOYEE'],[6,'provider',1,0,0,0,'INACTIVE_EMPLOYEE'],
 [7,'provider',1,0,0,0,'ONBOARDING'],[8,'tutor',1,0,0,0,'ACTIVE_EMPLOYEE'],[9,'super_admin',1,0,0,0,'ACTIVE_EMPLOYEE'],
 [10,'provider',1,0,0,0,'ACTIVE_EMPLOYEE']];
 for(const person of people){db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(...person);db.prepare('INSERT INTO user_agencies VALUES(?,?,?)').run(person[0],person[0]===9?6:2,person[0]===10?0:1);}
 const query=filter=>db.prepare(`SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE ua.agency_id=? AND ${filter} ORDER BY u.id`).all(2).map(r=>r.id);
 assert.deepEqual(query(ACTIVE_EMPLOYEE_SQL),[1,8]);
 assert.deepEqual(query(EMPLOYEE_ROSTER_SQL),[1,6,7,8,10]);
 db.close();
});
