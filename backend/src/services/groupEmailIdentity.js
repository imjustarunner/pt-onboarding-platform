import {groupKeyForIdentity,DEPARTMENTAL_GROUPS} from './departmentalGroupPolicy.js';

const norm=value=>String(value || '').trim().toLowerCase();
/** Only the destination inbox establishes group identity. Senders, subjects and
 * membership in a similarly named group never turn a personal copy into group mail. */
export function groupEmailIdentity(inbox,managedGroups=[]) {
 if(!inbox || norm(inbox.kind)==='personal' || inbox.owner_user_id!=null || /^(personal_|login_|hire_)/.test(norm(inbox.identity_key)))return null;
 const managed=managedGroups.find(group=>Number(group.agency_id)===Number(inbox.agency_id) && norm(group.email)===norm(inbox.from_email));
 const key=groupKeyForIdentity(inbox);
 if(!key && !managed)return null;
 return {groupKey:key || managed.group_key || null,groupName:managed?.label || inbox.display_name || DEPARTMENTAL_GROUPS[key]?.label || 'Group',groupEmail:inbox.from_email,ticketed:!!key};
}

// Address columns come from several schema generations with different collations.
export const groupEmailNameSql=`COALESCE((SELECT NULLIF(g.label,'') FROM managed_workspace_groups g
 WHERE g.agency_id=c.agency_id AND
 (CONVERT(LOWER(TRIM(g.email)) USING utf8mb4) COLLATE utf8mb4_unicode_ci)=
 (CONVERT(LOWER(TRIM(i.from_email)) USING utf8mb4) COLLATE utf8mb4_unicode_ci)
 ORDER BY g.id LIMIT 1),NULLIF(i.display_name,''),'Group')`;
