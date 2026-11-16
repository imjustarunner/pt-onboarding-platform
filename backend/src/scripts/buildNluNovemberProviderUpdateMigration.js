import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {NLU_UPDATE_TITLE,nluRefreshTopics,nluRolloutNote} from '../content/nluProviderUpdateRefresh.js';
const sql=value=>`'${String(value).replaceAll('\\','\\\\').replaceAll("'","''")}'`;
const marker='nlu-oct-nov-2026-v1';
export function nluNovemberMigration(){
 const ready=`JOIN provider_update_content_revisions revision ON revision.agency_id=6 AND revision.source_id=u.id AND revision.revision_key=${sql(marker)} AND revision.applied_at IS NULL`;
 const statements=[
 `-- NLU's undelivered draft only. Preserve issued invitations, signed agreements, pay and original audit actors.
CREATE TABLE IF NOT EXISTS provider_update_content_revisions (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 agency_id INT NOT NULL,source_id INT NOT NULL,revision_key VARCHAR(100) NOT NULL,
 automation_actor VARCHAR(120) NOT NULL,snapshot_json JSON NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,applied_at DATETIME NULL,
 UNIQUE KEY uq_provider_update_content_revision(agency_id,source_id,revision_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
 `INSERT INTO provider_update_content_revisions(agency_id,source_id,revision_key,automation_actor,snapshot_json)
SELECT 6,u.id,${sql(marker)},'migration:1835_nlu_combined_provider_update',JSON_OBJECT(
 'update',JSON_OBJECT('title',u.title,'subtitle',u.subtitle,'intro_html',u.intro_html),
 'topics',COALESCE((SELECT JSON_ARRAYAGG(JSON_OBJECT('id',t.id,'topic_key',t.topic_key,'title',t.title,'enabled',t.enabled,'sort_order',t.sort_order,'body_html',t.body_html)) FROM admin_update_topics t WHERE t.update_id=u.id),JSON_ARRAY()),
 'pushes',COALESCE((SELECT JSON_ARRAYAGG(JSON_OBJECT('id',p.id,'title',p.title,'section_config_json',p.section_config_json,'section_audience_json',p.section_audience_json,'amendment_plan_json',p.amendment_plan_json,'notes',p.notes)) FROM provider_update_pushes p WHERE p.agency_id=6 AND p.attached_admin_update_id=u.id),JSON_ARRAY()))
FROM admin_updates u WHERE u.id=2 AND u.agency_id=6 AND u.status='draft'
 AND NOT EXISTS(SELECT 1 FROM provider_update_pushes p WHERE p.agency_id=6 AND p.attached_admin_update_id=u.id AND (p.status<>'draft' OR p.sent_at IS NOT NULL))
 AND NOT EXISTS(SELECT 1 FROM provider_update_recipients r JOIN provider_update_pushes p ON p.id=r.push_id WHERE p.agency_id=6 AND p.attached_admin_update_id=u.id AND LEFT(r.token,8)<>'preview_')
ON DUPLICATE KEY UPDATE id=provider_update_content_revisions.id`,
 `UPDATE admin_updates u ${ready} SET u.title=${sql(NLU_UPDATE_TITLE)},u.subtitle='November 2026 release including the undelivered October update',u.intro_html=${sql(nluRefreshTopics()[0].body)} WHERE u.agency_id=6 AND u.id=2 AND u.status='draft'`,
 `UPDATE provider_update_pushes p JOIN admin_updates u ON u.id=p.attached_admin_update_id AND u.agency_id=p.agency_id ${ready}
SET p.notes=${sql(marker+' '+nluRolloutNote)},p.title=CONCAT(IF(LEFT(p.title,9)='[PREVIEW]','[PREVIEW] ',''),${sql(NLU_UPDATE_TITLE)}),
 p.section_config_json=JSON_MERGE_PATCH(COALESCE(p.section_config_json,JSON_OBJECT()),CAST('${JSON.stringify({services:true,spanish_intake:false,client_fall_update:false,school_availability:false,amendments:true})}' AS JSON)),
 p.amendment_plan_json=CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(p.amendment_plan_json,'$.mode'))='compensation' THEN p.amendment_plan_json ELSE JSON_OBJECT('mode','compensation','title','Individual Compensation Amendment') END
WHERE p.agency_id=6 AND p.status='draft'`,
 `UPDATE admin_update_topics t JOIN admin_updates u ON u.id=t.update_id ${ready} SET t.enabled=0 WHERE u.agency_id=6 AND u.id=2 AND t.topic_key IN ('spanish_intake','school_assignments','client_updates','client_fall_update','compensation','compensation_october','private_virtual_rooms','schoolcarebridge','auricwell')`
 ];
 for(const [index,topic]of nluRefreshTopics().entries()){
  // Existing videos stay attached; media-bearing topics are held for a manual prose merge.
  statements.push(`UPDATE admin_update_topics t JOIN admin_updates u ON u.id=t.update_id ${ready} SET t.title=${sql(topic.title)},t.body_html=${sql(topic.body)},t.enabled=1,t.sort_order=${index} WHERE u.agency_id=6 AND u.id=2 AND t.topic_key=${sql(topic.key)} AND COALESCE(t.body_html,'') NOT REGEXP '<(video|iframe)|data-training-key'`);
  statements.push(`INSERT INTO admin_update_topics(update_id,topic_key,title,body_html,enabled,icon_key,color,sort_order,is_builtin)
SELECT u.id,${sql(topic.key)},${sql(topic.title)},${sql(topic.body)},1,${sql(topic.icon)},'#0f766e',${index},0 FROM admin_updates u ${ready} WHERE u.agency_id=6 AND u.id=2 AND NOT EXISTS(SELECT 1 FROM admin_update_topics t WHERE t.update_id=u.id AND t.topic_key=${sql(topic.key)})`);
 }
 statements.push(
 `INSERT INTO workplace_handbook_digests(agency_id,title,period_label,admin_update_id,status,notes)
SELECT 6,'October and November 2026 NLU Handbook Updates','October and November 2026',u.id,'draft',${sql(marker)} FROM admin_updates u ${ready} WHERE u.agency_id=6 AND u.id=2 AND NOT EXISTS(SELECT 1 FROM workplace_handbook_digests d WHERE d.agency_id=6 AND d.admin_update_id=u.id AND d.notes=${sql(marker)})`,
 `INSERT INTO workplace_handbook_digest_entries(digest_id,agency_id,sort_order,subject,rationale,changed_content,handbook_section_slug,change_kind,previous_content)
SELECT target.id,6,prior.sort_order,prior.subject,prior.rationale,prior.changed_content,prior.handbook_section_slug,prior.change_kind,prior.previous_content
FROM workplace_handbook_digests target JOIN admin_updates u ON u.id=target.admin_update_id ${ready}
JOIN (SELECT e.*,ROW_NUMBER() OVER(PARTITION BY e.subject ORDER BY d.id DESC,e.id DESC) AS latest FROM workplace_handbook_digest_entries e JOIN workplace_handbook_digests d ON d.id=e.digest_id WHERE d.agency_id=6 AND d.admin_update_id=2 AND COALESCE(d.notes,'')<>${sql(marker)}) prior ON prior.latest=1
WHERE target.agency_id=6 AND target.notes=${sql(marker)} AND NOT EXISTS(SELECT 1 FROM workplace_handbook_digest_entries existing WHERE existing.digest_id=target.id AND existing.subject=prior.subject)`,
 `UPDATE provider_update_content_revisions SET applied_at=UTC_TIMESTAMP() WHERE agency_id=6 AND source_id=2 AND revision_key=${sql(marker)} AND applied_at IS NULL`
 );
 return statements.join(';\n\n')+';\n';
}
if(process.argv[1]===fileURLToPath(import.meta.url))writeFileSync(new URL('../../../database/migrations/1835_nlu_combined_provider_update.sql',import.meta.url),nluNovemberMigration());
