import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import pool from '../../config/clinicalDatabase.js';
import {splitSqlStatements,stripSqlLineComments} from '../../utils/migrationSql.js';
export async function ensureSafetyPlanSchema() {
  for(const file of ['025_client_safety_plans.sql','033_portal_document_assignment_batches.sql','036_clinical_document_requests.sql','037_confidential_clinician_entries.sql']) {
    const deployed=new URL('../../../database/clinical_migrations/'+file,import.meta.url);
    const local=new URL('../../../../database/clinical_migrations/'+file,import.meta.url);
    const sql=await readFile(existsSync(deployed)?deployed:local,'utf8');
    for(const statement of splitSqlStatements(stripSqlLineComments(sql))){
      if(statement.startsWith('ALTER TABLE clinical_form_versions')){
        const [[column]]=await pool.query("SHOW COLUMNS FROM clinical_form_versions LIKE 'created_by_user_id'");
        if(column?.Null==='YES')continue;
      }
      if(statement.startsWith('ALTER TABLE clinical_form_signers ADD')){
        const [[column]]=await pool.query("SHOW COLUMNS FROM clinical_form_signers LIKE 'delivery_managed'");
        if(column)continue;
      }
      if(statement.startsWith('ALTER TABLE clinical_form_signers MODIFY')){
        const [[column]]=await pool.query("SHOW COLUMNS FROM clinical_form_signers LIKE 'signing_method'");
        if(column?.Type?.includes("'direct_link'"))continue;
      }
      if(statement.startsWith('ALTER TABLE client_outcome_measure_responses')){
        const [[table]]=await pool.query("SHOW TABLES LIKE 'client_outcome_measure_responses'");
        if(!table) continue;
        const [[column]]=await pool.query("SHOW COLUMNS FROM client_outcome_measure_responses LIKE 'recorded_by_user_id'");
        if(column?.Null==='YES')continue;
      }
      await pool.query(statement);
    }
  }
}
