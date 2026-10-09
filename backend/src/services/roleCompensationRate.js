/** Resolve only explicitly assigned duties from an executed agreement snapshot. */
export function roleCompensationRate(roles,serviceCode,{source,categoryGroup}={}){
 if(!roles)return null;
 const code=String(serviceCode||'').trim().toUpperCase();
 if(roles.supervisor){const base=Number(roles.supervisor.hourlyRate);if(code==='99415')return base;if(code==='99416')return base*1.5;if(code==='ADMIN TIME'&&(categoryGroup==='supervision_note'||source==='cosign_review_activity'))return base*.5;}
 const role=roles.mentor||roles.cpa;if(!role)return null;
 if(code==='INDIVIDUAL MEETING'||code==='MENTOR/CPA MEETING')return Number(role.meetingRate)||null;
 if(code==='ADMIN TIME')return Number(role.adminRate)||null;
 if(code==='OUTREACH')return Number(role.outreachRate)||null;
 return null;
}
