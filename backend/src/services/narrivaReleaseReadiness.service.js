import pool from '../config/database.js';
import {listNarrivaClinicalAgencies,publishNarrivaServiceAmendment} from './narrivaServicePublication.service.js';

export async function requireNarrivaReleaseReadiness(database=pool) {
 const [rows]=await database.execute("SELECT migration_name FROM migrations_log WHERE success=1 AND migration_name IN ('1772_narriva_h2011_service_reference','1773_session_recording_participant_consent','1774_narriva_reviews_and_preferences')");
 const names=new Set(rows.map(row=>row.migration_name));
 // Exact filenames are kept in sync below; readiness must not expose clinical routes over missing storage.
 for(const prefix of ['1772_','1773_','1774_']) {
  if(![...names].some(name=>name.startsWith(prefix)))throw Object.assign(new Error('Narriva release storage migration is incomplete; deployment is not ready.'),{code:'NARRIVA_SCHEMA_NOT_READY'});
 }
 await database.execute('SELECT id FROM narriva_reviews LIMIT 0');
 await database.execute('SELECT user_id FROM narriva_writer_preferences LIMIT 0');
 const results=[];
 for(const agency of await listNarrivaClinicalAgencies(database))results.push(await publishNarrivaServiceAmendment({agencyId:agency.id,apply:true},database));
 return results;
}
