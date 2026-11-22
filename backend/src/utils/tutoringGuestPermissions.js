export function tutoringInvitationAllowed(access,appointment,allows){
 let p=access?.permissions_json||{};if(typeof p==='string'){try{p=JSON.parse(p);}catch{return false;}}
 return !!access&&!p.billingOnly&&!p.noView&&!p.noViewOtherGuardian&&!p.coGuardianInviteRestricted&&p.canViewAppointments!==false&&!access.portal_access?.limited&&allows(access,appointment);
}
