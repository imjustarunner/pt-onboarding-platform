import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import mysql from 'mysql2/promise';
import {exchangeProviderSql} from '../../../utils/clientExchangeProvider.js';
describe.runIf(process.env.MOBILE_MYSQL_TEST==='1')('tenant provider identity with mixed legacy collations',()=>{
 let admin,db;const name=`mobile_provider_test_${process.pid}`;
 beforeAll(async()=>{const options=process.env.MOBILE_MYSQL_SOCKET?{socketPath:process.env.MOBILE_MYSQL_SOCKET}:{host:'127.0.0.1',port:Number(process.env.MOBILE_MYSQL_PORT||3408)};admin=await mysql.createConnection({...options,user:'root',password:process.env.MOBILE_MYSQL_PASSWORD||'',multipleStatements:true});await admin.query(`CREATE DATABASE ${name}`);db=await mysql.createConnection({...options,user:'root',password:process.env.MOBILE_MYSQL_PASSWORD||'',database:name,multipleStatements:true});
 await db.query(`CREATE TABLE users(id INT PRIMARY KEY,role VARCHAR(40),status VARCHAR(40),is_active BOOLEAN,is_archived BOOLEAN,has_provider_access BOOLEAN) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
 CREATE TABLE user_agencies(user_id INT,agency_id INT,agency_role VARCHAR(40),is_active BOOLEAN) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
 CREATE TABLE user_agency_access_profiles(user_id INT,agency_id INT,effective_role VARCHAR(40),effective_permissions JSON) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
 INSERT INTO users VALUES(501,'super_admin','ACTIVE_EMPLOYEE',1,0,0),(7,'provider','ACTIVE_EMPLOYEE',1,0,0),(8,'staff','ACTIVE_EMPLOYEE',1,0,1),(9,'provider','ACTIVE_EMPLOYEE',0,0,1);
 INSERT INTO user_agencies VALUES(501,2,'provider',1),(501,6,'support',1),(7,2,'support',1),(8,2,'staff',1),(9,2,'provider',1);
 INSERT INTO user_agency_access_profiles VALUES(501,2,'provider',JSON_OBJECT('has_provider_access',false)),(501,6,'support',JSON_OBJECT('has_provider_access',false)),(7,2,'support',JSON_OBJECT('has_provider_access',false)),(8,2,'staff',JSON_OBJECT('has_provider_access',false));`);
 });
 afterAll(async()=>{await db?.end();if(admin){await admin.query(`DROP DATABASE ${name}`);await admin.end();}});
 it('recognizes an active local provider even when the platform account is super admin, without granting other agencies',async()=>{const [rows]=await db.execute(`SELECT u.id,ua.agency_id FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE ${exchangeProviderSql}`);expect(rows).toEqual([{id:501,agency_id:2}]);});
 it('honors tenant permission withdrawal and inactive membership on the next lookup',async()=>{await db.query("UPDATE user_agencies SET is_active=0 WHERE user_id=501 AND agency_id=2");const [rows]=await db.execute(`SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE ${exchangeProviderSql}`);expect(rows).toEqual([]);});
});
