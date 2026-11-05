import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SKIP_DB_CONNECT='1';
process.env.NODE_ENV='test';
const port=Number(process.env.BUSINESS_AGREEMENT_TEST_MYSQL_PORT || 0);

test('MySQL agreement queries keep the independent owner and managed operator inside their real scope',{skip:!port},async()=>{
  assert.equal(port,3359,'Use only the disposable business-agreement fixture server, never a production proxy.');
  const mysql=await import('mysql2/promise');
  const db=await mysql.createConnection({host:'127.0.0.1',port,user:'root',password:'',multipleStatements:true});
  const schema=`business_agreement_access_${process.pid}`;
  try {
    await db.query(`CREATE DATABASE ${schema}; USE ${schema};
      CREATE TABLE users(id INT PRIMARY KEY,role VARCHAR(40),first_name VARCHAR(50),last_name VARCHAR(50),is_active BOOL,is_archived BOOL,status VARCHAR(40));
      CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(100),slug VARCHAR(80),organization_type VARCHAR(40),account_owner_user_id INT,is_active BOOL,is_archived BOOL);
      CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active BOOL);
      CREATE TABLE agency_billing_management(agency_id INT,manager_agency_id INT,is_active BOOL);
      INSERT INTO users VALUES(41,'super_admin','Sam','Operator',1,0,'ACTIVE_EMPLOYEE'),(42,'admin','Morgan','Manager',1,0,'ACTIVE_EMPLOYEE'),(43,'provider','Avery','Owner',1,0,'ACTIVE_EMPLOYEE'),(44,'provider','Other','Provider',1,0,'ACTIVE_EMPLOYEE');
      INSERT INTO agencies VALUES(11,'Example Manager','plottwistco','agency',41,1,0),(12,'Example Clinical Practice','example-clinical','agency',41,1,0),(13,'Example Independent Practice','example-practice','life_coach',43,1,0);
      INSERT INTO user_agencies VALUES(42,11,1),(43,13,1),(43,12,1),(44,12,1);
      INSERT INTO agency_billing_management VALUES(13,11,1);`);
    const {scopeFor,signerOptions,organizations}=await import('../organizationAgreements.js');
    const {default:pool}=await import('../../config/database.js');
    try {
      const owner=await scopeFor(43,13,db),manager=await scopeFor(42,13,db);
      assert.equal(owner.profile.operator,false);assert.equal(manager.profile.operator,true);
      const options=await signerOptions(owner,db);
      assert.deepEqual(options.map(s=>[s.id,s.operator,s.organization]),[['43',false,true],['42',true,false],['41',true,false]]);
      assert.deepEqual((await organizations(43,db)).map(a=>a.id),[13]);
      assert.deepEqual((await organizations(42,db)).map(a=>a.id).sort((a,b)=>a-b),[11,13]);
      await assert.rejects(()=>scopeFor(43,12,db),e=>e.status===403);
      await assert.rejects(()=>scopeFor(42,12,db),e=>e.status===403);
      await db.execute('UPDATE user_agencies SET is_active=0 WHERE user_id=43 AND agency_id=13');
      await assert.rejects(()=>scopeFor(43,13,db),e=>e.status===403);
      assert.equal((await signerOptions(manager,db)).some(s=>s.id==='43'),false);
    } finally {await pool.end();}
  } finally {await db.query(`DROP DATABASE IF EXISTS ${schema}`);await db.end();}
});
