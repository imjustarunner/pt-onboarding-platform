// Dry-run by default. Example: node backend/scripts/reconcile-provider-clinical-facets.mjs --agency=2 --report=/private/tmp/facets.json [--apply]
import fs from 'node:fs/promises';
import pool from '../src/config/database.js';
import {CLINICAL_INDEX_FIELD_KEYS as INDEX_FIELD_KEYS,listClinicalFacetsForUsers} from '../src/services/providerClinicalFacets.service.js';
import {clinicalFieldOptions} from '../src/utils/providerClinicalFieldOptions.js';
const args=Object.fromEntries(process.argv.slice(2).map(arg=>arg.replace(/^--/,'').split(/=(.*)/s).slice(0,2)));
const agencyId=Number(args.agency);const apply=Object.hasOwn(args,'apply');
if(!Number.isSafeInteger(agencyId)||agencyId<=0||!args.report)throw Error('Provide --agency=<id> and --report=<private path>. No changes were made.');
const db=await pool.getConnection();
try {
 const [people]=await db.execute(`SELECT u.id,u.first_name,u.last_name FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE ua.agency_id=? AND COALESCE(ua.is_active,1)=1 AND u.sees_clients=1 AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0 AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE')`,[agencyId]);
 const facets=await listClinicalFacetsForUsers(people.map(p=>p.id),{agencyId,database:db});
 const [beforeIndex]=await db.execute(`SELECT * FROM provider_search_index WHERE agency_id=? AND field_key IN (${INDEX_FIELD_KEYS.map(()=>'?').join(',')})`,[agencyId,...INDEX_FIELD_KEYS]);
 const [definitions]=await db.execute(`SELECT id,field_key,field_label,field_type,options,agency_id FROM user_info_field_definitions WHERE agency_id=? OR agency_id IS NULL`,[agencyId]);
 const fields=definitions.filter(d=>clinicalFieldOptions(d.field_key));
 const report={agencyId,applied:false,createdAt:new Date().toISOString(),beforeIndex,beforeFields:fields,providers:people.map(p=>({...p,facets:facets.get(p.id)}))};
 // Private audit/rollback evidence is written before mutation; original survey answers are never changed.
 await fs.writeFile(args.report,JSON.stringify(report,null,2),{mode:0o600});
 if(apply){
  await db.beginTransaction();
  for(const person of people){
   await db.execute(`DELETE FROM provider_search_index WHERE agency_id=? AND user_id=? AND field_key IN (${INDEX_FIELD_KEYS.map(()=>'?').join(',')})`,[agencyId,person.id,...INDEX_FIELD_KEYS]);
   for(const [group,field] of Object.entries({specialties:'specialties_general',ageGroups:'age_specialty',populations:'groups',modalities:'modality',interventions:'provider_interventions_techniques'}))
    for(const value of facets.get(person.id)?.[group]||[])await db.execute(`INSERT INTO provider_search_index (agency_id,user_id,field_key,field_type,value_text,value_option) VALUES (?,?,?,'multi_select',NULL,?)`,[agencyId,person.id,field,value]);
  }
  // Limit persistence to this agency; platform templates receive the catalog through the shared read layer.
  for(const field of fields.filter(f=>Number(f.agency_id)===agencyId)){
   const config=clinicalFieldOptions(field.field_key);
   await db.execute(`UPDATE user_info_field_definitions SET options=?,field_label=?,field_type='multi_select' WHERE id=?`,[JSON.stringify(config.options),config.label,field.id]);
  }
  await db.commit();report.applied=true;await fs.writeFile(args.report,JSON.stringify(report,null,2),{mode:0o600});
 }
 console.log(JSON.stringify({applied:report.applied,agencyId,providers:people.length,withSpecialties:[...facets.values()].filter(f=>f.specialties.length).length,reviewItems:[...facets.values()].reduce((n,f)=>n+(f.reviewNeeded?.length||0),0),report:args.report}));
}catch(error){await db.rollback();throw error;}finally{db.release();await pool.end();}
