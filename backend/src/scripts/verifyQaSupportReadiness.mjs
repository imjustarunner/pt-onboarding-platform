// Read-only post-deployment gate. Uses ordinary provider/support credentials;
// never accepts an admin credential and never creates clients or sends mail.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const option=name=>process.argv.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3);
const credentialsDir=option('credentials-dir') || path.join(root,'secrets/auricwell-qa');
const output=option('output') || path.join(root,'deliverables/qa-support-addendum/preflight.json');
const base='https://app.itsco.health';
const report={at:new Date().toISOString(),readOnly:true,agencyId:450,schoolId:451,launchEnabled:false,accounts:[],limitations:[
  'Does not prove delivery, scheduling, enrollment, document dispatch or cross-tenant record isolation.',
  'Does not start a scheduler or provision any provider.'
]};
for(const role of ['provider','support']){
  const expectedId=role==='provider'?1433:1434;
  const result={role,checks:[]};report.accounts.push(result);
  try {
    const account=JSON.parse(fs.readFileSync(path.join(credentialsDir,`${role}.json`),'utf8'));
    if(account.role!==role || Number(account.agencyId)!==450)throw new Error('Credential file does not match the expected demo role and agency');
    const signed=await fetch(base+'/api/auth/login',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({email:account.username,password:account.password,organizationSlug:'auricwell-qa-demo'})});
    if(!signed.ok)throw new Error(`Login returned ${signed.status}; do not reset credentials or bypass rate limits`);
    const login=await signed.json();
    if(login.user?.role!==role || Number(login.user?.id)!==expectedId)throw new Error('Unexpected authenticated identity or elevated role');
    const get=async (url,expected=200)=>{
      const response=await fetch(base+url,{redirect:'error',headers:{Authorization:`Bearer ${login.token}`,'X-Agency-Id':'450'}});
      result.checks.push({path:url,status:response.status,expected,passed:response.status===expected});
      return response.ok ? response.json() : null;
    };
    const agencies=await get('/api/users/me/agencies');
    result.organizationIds=Array.isArray(agencies)?agencies.map(agency=>Number(agency.id)):[];
    result.scopePassed=result.organizationIds.includes(450)&&result.organizationIds.every(id=>[450,451].includes(id));
    if(!result.scopePassed)throw new Error('Unexpected or missing organization scope; stop all test writes');
    await get('/api/client-exchange/listings?agencyId=450');
    await get('/api/communications/qa-email-inbox');
    if(role==='support'){
      const clients=await get('/api/clients?agencyId=450');
      result.visibleActiveClientCount=Array.isArray(clients)?clients.length:null;
      await get('/api/clinical-notes/context?agencyId=450',403);
      await get('/api/clinical-notes/contact-documentation?agencyId=450');
      await get('/api/agencies/450/settings-people-snapshot',403);
      if(clients?.[0]?.id)await get(`/api/clients/${Number(clients[0].id)}/operational-status`);
      result.populationGate='BLOCKED: coordinator must count all retained/archived clients and all provider identities before creation';
    }
  }catch(error){result.error=error.message;}
}
report.passed=report.accounts.every(account=>!account.error&&account.scopePassed&&account.checks.every(check=>check.passed));
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.passed)process.exitCode=1;
