// Reviewed billing sender setup. No patient records are read and no email is sent.
// Load the intended environment externally. Dry run is the default.
import pool from '../config/database.js';
import Directory from '../services/googleWorkspaceDirectory.service.js';
import {billingSenderMembers,provisionBillingSenders,seedBillingSenders,managedWorkspaceAddress} from '../services/familyLedger/senders.js';
import {auditBilling} from '../services/familyBillingPolicy.service.js';
const apply=process.argv.includes('--apply');
const actorId=Number(process.argv.find(a=>a.startsWith('--actor-user-id='))?.split('=')[1]);
const only=process.argv.find(a=>a.startsWith('--agency='))?.split('=')[1];
const memberUserIds=[501,538,539,559];
const configurations=[{id:1,slug:'plottwistco',domain:'plottwistco.com'},{id:2,slug:'itsco',domain:'itsco.health'},{id:6,slug:'nlu',domain:'nextleveluplcc.com'},{id:377,slug:'tisi',domain:'innerstrengthin.com'}].filter(c=>!only||c.id===Number(only));
try{
 if(!configurations.length)throw new Error('Select a configured managed billing agency');
 if(apply){const [[actor]]=await pool.execute("SELECT id FROM users WHERE id=? AND role='super_admin' AND is_active=1 AND COALESCE(is_archived,0)=0",[actorId]);if(!actor)throw new Error('An active superadmin actor is required');}
 for(const c of configurations){
  const [[agency]]=await pool.execute('SELECT * FROM agencies WHERE id=?',[c.id]);
  if(agency?.slug!==c.slug||agency.organization_type!=='agency'||!agency.is_active||agency.is_archived)throw new Error(`Agency ${c.id} requires review`);
  const flags=typeof agency.feature_flags==='string'?JSON.parse(agency.feature_flags):agency.feature_flags||{};
  if(flags.workspaceEmailDomain&&flags.workspaceEmailDomain!==c.domain)throw new Error(`Agency ${c.id} has a different configured domain`);
  const members=await billingSenderMembers(c.id,c.domain,{managedDomains:['plottwistco.com'],resolveAddress:managedWorkspaceAddress,memberUserIds,actorUserId:actorId||501});
  const group=await Directory.getGroup({groupEmail:`billing@${c.domain}`,strictNotFound:true});
  if(!group)throw new Error(`Expected existing group billing@${c.domain} was not found`);
  const existing=await Directory.listGroupMembers(`billing@${c.domain}`);
  console.log(JSON.stringify({agencyId:c.id,email:`billing@${c.domain}`,existing:existing.map(m=>({email:m.email,role:m.role})),authorized:members,apply}));
  if(!apply)continue;
  // Preserve existing membership. Out-of-scope members stop provisioning and
  // are handled by an explicit, separately reviewed Directory change.
  await pool.execute("UPDATE agencies SET feature_flags=JSON_SET(COALESCE(feature_flags,JSON_OBJECT()),'$.workspaceEmailDomain',?) WHERE id=?",[c.domain,c.id]);
  await auditBilling({agencyId:c.id,userId:actorId,action:'billing_workspace_domain_configured',objectId:c.id});
  console.log(JSON.stringify({agencyId:c.id,results:await provisionBillingSenders({agencyId:c.id,actorUserId:actorId,adoptExisting:true,memberUserIds})}));
 }
 if(apply&&!only){await seedBillingSenders(1,{identityKey:'fundthred_collections'});console.log(JSON.stringify({fundthred:'Collections sender record prepared; separate domain verification and provisioning required.'}));}
}finally{await pool.end();}
