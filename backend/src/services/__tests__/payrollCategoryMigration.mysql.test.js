import {beforeAll,afterAll,beforeEach,describe,expect,it} from 'vitest';import {readFileSync} from 'node:fs';
import {isolatedWorkflowMysql,recoveryMysqlEnabled} from './fixtures/isolatedWorkflowMysql.js';
import {splitSqlStatements,stripSqlLineComments} from '../../../../database/migrationSqlUtils.js';
const migration=readFileSync(new URL('../../../../database/migrations/1815_payroll_service_code_category_labels.sql',import.meta.url),'utf8');
const categories=['direct','indirect','other','admin','meeting','mileage','bonus','reimbursement','other_pay','tutoring','homework_help'];
describe.runIf(recoveryMysqlEnabled)('actual additive payroll category migration',()=>{let fixture,connection;
 beforeAll(async()=>{fixture=await isolatedWorkflowMysql('payroll_catalog_category');connection=await fixture.db.getConnection();});afterAll(async()=>{connection?.release();await fixture?.close();});
 beforeEach(async()=>{await connection.query('DROP TABLE IF EXISTS payroll_service_code_rules');});
 const apply=async()=>{for(const sql of splitSqlStatements(stripSqlLineComments(migration)))await connection.query(sql);};
 const metadata=async()=>(await connection.query("SELECT COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,COLUMN_COMMENT,CHARACTER_SET_NAME,COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payroll_service_code_rules' AND COLUMN_NAME='category'"))[0][0];
 const rows=async()=>(await connection.query('SELECT service_code,category,category+0 AS ordinal,amount,pay_divisor,updated_at FROM payroll_service_code_rules ORDER BY service_code'))[0];
 it('reproduces the current enum rejection, then accepts every source/UI category without changing existing rows/rates/ordinals',async()=>{
  await connection.query("CREATE TABLE payroll_service_code_rules(service_code VARCHAR(64) PRIMARY KEY,category ENUM('direct','indirect','other') NOT NULL DEFAULT 'direct' COMMENT 'Existing rate classification',amount DECIMAL(12,4),pay_divisor INT,updated_at DATETIME)");
  await connection.query("INSERT INTO payroll_service_code_rules VALUES('OLD DIRECT','direct',123.4567,4,'2026-01-01'),('OLD OTHER','other',22.5000,2,'2026-01-02')");
  await expect(connection.execute('INSERT INTO payroll_service_code_rules(service_code,category) VALUES(?,?)',['ADMIN TIME','admin'])).rejects.toMatchObject({errno:1265});const before=await rows(),beforeMeta=await metadata();await apply();expect(await rows()).toEqual(before);const after=await metadata();expect({...after,COLUMN_TYPE:beforeMeta.COLUMN_TYPE}).toEqual(beforeMeta);
  for(const value of categories)await connection.execute('INSERT INTO payroll_service_code_rules(service_code,category) VALUES(?,?)',['NEW '+value,value]);
  const snapshot=await rows(),meta=await metadata();await apply();expect(await rows()).toEqual(snapshot);expect(await metadata()).toEqual(meta);
 });
 it('retains custom/quoted labels, null/default/comment metadata and existing classification ordinals',async()=>{
  await connection.query("CREATE TABLE payroll_service_code_rules(service_code VARCHAR(64) PRIMARY KEY,category ENUM('direct','indirect','other','custom,one','owner''s custom','legacy,''admin'',x') NULL DEFAULT NULL COMMENT 'Owner''s custom classification',amount DECIMAL(12,4),pay_divisor INT,updated_at DATETIME)");
  await connection.execute('INSERT INTO payroll_service_code_rules VALUES(?,?,?,?,?)',['CUSTOM',"owner's custom",77.125,3,'2026-01-02']);const before=await rows(),meta=await metadata();await apply();expect(await rows()).toEqual(before);const after=await metadata();expect(after.COLUMN_TYPE.startsWith(meta.COLUMN_TYPE.slice(0,-1)+',')).toBe(true);expect({...after,COLUMN_TYPE:meta.COLUMN_TYPE}).toEqual(meta);
  await connection.execute('INSERT INTO payroll_service_code_rules(service_code,category) VALUES(?,?)',['ADMIN TIME','admin']);
 });
 it('does not rewrite a sufficient VARCHAR projection or its values/metadata',async()=>{
  await connection.query("CREATE TABLE payroll_service_code_rules(service_code VARCHAR(64) PRIMARY KEY,category VARCHAR(64) NULL DEFAULT 'my_custom' COMMENT 'Retain string projection',amount DECIMAL(12,4),pay_divisor INT,updated_at DATETIME)");await connection.query("INSERT INTO payroll_service_code_rules VALUES('CUSTOM','my_custom',44.25,2,'2026-01-02')");const before=await rows(),meta=await metadata();await apply();expect(await rows()).toEqual(before);expect(await metadata()).toEqual(meta);
 });
});
