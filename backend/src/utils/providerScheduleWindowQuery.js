/** Build candidates from indexed ownership/attendance paths before hydrating events. */
export function providerScheduleWindowQuery({agencyId,agencyIds=null,allAgencies=false,providerId,windowStart,windowEnd,startDate=null,endDate=null}) {
 const id=Number(providerId),ids=Array.isArray(agencyIds)?[...new Set(agencyIds.map(Number).filter(n=>n>0))]:[],agency=Number(agencyId);
 let scope='pse.agency_id IS NULL',scopeParams=[];
 if(allAgencies)scope='1=1';
 else if(ids.length){scope=`(pse.agency_id IN (${ids.map(()=>'?').join(',')}) OR pse.agency_id IS NULL)`;scopeParams=ids;}
 else if(agency>0){scope='(pse.agency_id=? OR pse.agency_id IS NULL)';scopeParams=[agency];}
 const window=`pse.recurrence_horizon_held=0 AND ((pse.all_day=1 AND pse.start_date<DATE(?) AND pse.end_date>DATE(?)) OR (pse.all_day=0 AND pse.start_at<? AND pse.end_at>?))`;
 const times=[endDate || windowEnd,startDate || windowStart,windowEnd,windowStart];
 const sql=`SELECT pse.* FROM provider_schedule_events pse JOIN (
  SELECT pse.id FROM provider_schedule_events pse
   WHERE pse.provider_id=? AND (${scope} OR UPPER(COALESCE(pse.kind,'')) IN ('FALL_CHECKIN_PRESLOT','FALL_CHECKIN_BOOKED')) AND ${window}
  UNION
  SELECT pse.id FROM provider_schedule_event_attendees psea
   JOIN provider_schedule_events pse ON pse.id=psea.event_id
   WHERE psea.user_id=? AND ${scope} AND UPPER(COALESCE(pse.kind,'')) IN ('TEAM_MEETING','HUDDLE') AND ${window}
  UNION
  SELECT pse.id FROM scheduled_trainings st
   JOIN provider_schedule_events pse ON pse.id=st.event_id
   JOIN user_agencies ua ON ua.agency_id=pse.agency_id AND ua.user_id=? AND ua.is_active=1
   JOIN users su ON su.id=ua.user_id AND COALESCE(su.is_active,1)=1
    AND su.role NOT IN ('client','client_guardian','guardian','parent','school_staff','school_support','school_admin','school','kiosk','prehire','candidate')
   WHERE st.agency_visible=1 AND ${scope} AND ${window}
 ) visible_events ON visible_events.id=pse.id
 ORDER BY CASE WHEN pse.all_day=1 THEN CONCAT(pse.start_date,' 00:00:00') ELSE pse.start_at END ASC,pse.id ASC`;
 return {sql,params:[id,...scopeParams,...times,id,...scopeParams,...times,id,...scopeParams,...times]};
}
