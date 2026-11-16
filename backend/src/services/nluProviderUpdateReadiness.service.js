import pool from '../config/database.js';
export async function requireNluProviderUpdateReadiness(db=pool){
 const [[migration]]=await db.execute("SELECT success FROM migrations_log WHERE migration_name='1835_nlu_combined_provider_update' LIMIT 1");
 if(Number(migration?.success)!==1)throw new Error('NLU combined provider-update migration is not verified.');
 const [[revision]]=await db.execute("SELECT applied_at,(SELECT COUNT(*) FROM admin_update_topics WHERE update_id=2 AND enabled=1 AND topic_key IN ('welcome','services','profile','availability_profiles','communications','tasks_my_work','notes_workspace','supervision','office_kiosk','business_cards','quick_view','handbook','library_transition') AND COALESCE(body_html,'') REGEXP '<(video|iframe)|data-training-key') AS media_prose_holds FROM provider_update_content_revisions WHERE agency_id=6 AND source_id=2 AND revision_key='nlu-oct-nov-2026-v1'");
 if(revision&&!revision.applied_at)throw new Error('NLU combined provider-update refresh is incomplete.');
 return {migration:'1835_nlu_combined_provider_update',appliedDrafts:revision?1:0,heldForIssuedUpdate:!revision,mediaProseHolds:Number(revision?.media_prose_holds||0)};
}
