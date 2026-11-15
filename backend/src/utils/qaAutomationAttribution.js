// Owner confirmed on 2026-11-14 that these retained QA fixtures are reserved
// solely for automated synthetic tests. This registry labels evidence; it grants
// no role, membership, record access, credential, signature or session.
const AUTHORIZATION_REF = 'owner-reserved-automated-qa-2026-11-14-v1';
const FIXTURES = Object.freeze({1433:'Avery',1434:'Jordan',1438:'Cameron',1439:'Alex',1453:'Billing',1465:'Jamie',1728:'Cedar',1729:'Aspen',1746:'Una',1766:'Riley adult self',1790:'Rowan'});
// Additional owner confirmation in this session reserves these NLU identities
// exclusively for automation. Retain the original registration/version above.
const NLU_AUTHORIZATION_REF = 'owner-reserved-nlu-automated-qa-2026-11-14-v1';
const NLU_FIXTURES = Object.freeze({1456:'Linked parent',1496:'Finley',1759:'Morgan',1771:'Casey',1785:'Rene',1807:'Riley QA reviewer'});
export function qaAutomationActorFor(userId) {
 const raw=String(userId ?? '');
 if(!/^[1-9]\d*$/.test(raw))return null;
 const id=Number(raw);
 if(!Number.isSafeInteger(id))return null;
 if(Object.hasOwn(NLU_FIXTURES,id))return {kind:'qa_automation',actorUserId:id,fixture:NLU_FIXTURES[id],authorizationRef:NLU_AUTHORIZATION_REF,qaAgencyBoundary:id===1456?[450,451,452,453,454]:[453,454]};
 if(!Object.hasOwn(FIXTURES,id))return null;
 return {kind:'qa_automation',actorUserId:id,fixture:FIXTURES[id],authorizationRef:AUTHORIZATION_REF,qaAgencyBoundary:[450,451,452]};
}
export function withQaAutomationAttribution(metadata,userId) {
 const actor=qaAutomationActorFor(userId);
 if(!actor&&(!metadata||typeof metadata!=='object'||!Object.hasOwn(metadata,'automationActor')))return metadata;
 // The reserved classification is always server-owned. Request metadata cannot
 // register a human account or replace the authenticated automation actor.
 const result=metadata&&typeof metadata==='object'&&!Array.isArray(metadata)?{...metadata}:metadata==null?{}:{originalMetadata:metadata};
 delete result.automationActor;
 if(actor)result.automationActor=actor;
 return Object.keys(result).length?result:null;
}
export function qaAutomationUserAgent(userId,userAgent,maxLength=512) {
 const actor=qaAutomationActorFor(userId),prefix=actor?`qa-automation/${actor.actorUserId}; authorization=${actor.authorizationRef}; `:'';
 return (prefix+String(userAgent||'')).slice(0,maxLength)||null;
}

export function qaAuditMetadataJson(metadata,userId) {
 const value=withQaAutomationAttribution(metadata,userId);
 return value ? JSON.stringify(value) : null;
}

export function verifiedQaAutomationAttribution(metadata,userId) {
 const expected=qaAutomationActorFor(userId),stored=metadata?.automationActor;
 return expected&&stored?.kind===expected.kind&&stored.actorUserId===expected.actorUserId&&stored.authorizationRef===expected.authorizationRef?expected:null;
}
