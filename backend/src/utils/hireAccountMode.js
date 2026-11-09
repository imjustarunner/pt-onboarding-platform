export function hireAccountModeForUser(agency,user={}) {
 if([true,1,'1'].includes(user.login_is_group_email))return 'group_password';
 let flags=agency?.feature_flags || {};if(typeof flags==='string'){try{flags=JSON.parse(flags);}catch{flags={};}}
 return String(flags.hireAccountMode || '').trim().toLowerCase() || null;
}
