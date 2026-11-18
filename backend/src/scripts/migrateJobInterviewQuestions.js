// Operational migration only; no app credentials, identity or interview created.
import fs from 'node:fs/promises';
import pool from '../config/database.js';
const args=process.argv.slice(2),apply=args.includes('--apply');
const expected=args.find(arg=>arg.startsWith('--expected-database='))?.split('=')[1];
try {
  const [[database]]=await pool.execute('SELECT DATABASE() name');
  if(!expected || expected!==database.name)throw new Error('The exact expected database is required.');
  const [[column]]=await pool.execute("SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='hiring_job_descriptions' AND COLUMN_NAME='interview_question_set_id'");
  let linked=0;
  if(apply){
    const source=await fs.readFile(process.env.NODE_ENV==='production'?'/app/database/migrations/1849_job_interview_question_defaults.sql':new URL('../../../database/migrations/1849_job_interview_question_defaults.sql',import.meta.url),'utf8');
    const statements=source.replace(/^--.*$/gm,'').split(';').map(sql=>sql.trim()).filter(Boolean);
    if(statements.length!==2 || !statements[0].startsWith('ALTER TABLE hiring_job_descriptions') || !statements[1].startsWith('UPDATE hiring_job_descriptions'))throw new Error('Unexpected migration shape.');
    if(!Number(column.n))await pool.query(statements[0]);
    const [result]=await pool.query(statements[1]);linked=result.affectedRows;
    await pool.execute("INSERT IGNORE INTO migrations_log(migration_name,execution_time_ms,success,error_message) VALUES('1849_job_interview_question_defaults',0,1,NULL)");
  }
  console.log(JSON.stringify({applied:apply,columnReady:!!Number(column.n)||apply,legacyJobsLinked:linked,interviewSnapshotsChanged:0,appIdentitiesCreated:0}));
}catch(error){console.error(JSON.stringify({ready:false,code:error.code || 'JOB_INTERVIEW_SCHEMA_FAILED'}));process.exitCode=1;}
finally{await pool.end();}
