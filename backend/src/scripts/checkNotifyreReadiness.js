// Read-only check. Does not send messages, change registrations, or expose secrets.
import dotenv from 'dotenv';
import { notifyreCampaignForAgency } from '../utils/smsCarrierPolicy.js';
if (process.env.ENROLLMENT_ENV_FILE) dotenv.config({path:process.env.ENROLLMENT_ENV_FILE});
const required=['NOTIFYRE_API_TOKEN','NOTIFYRE_WEBHOOK_SECRET','NOTIFYRE_BAA_REFERENCE','NOTIFYRE_CLIENT_CAMPAIGNS_JSON'];
const missing=required.filter(key=>!process.env[key]);
if(missing.length){console.log(JSON.stringify({ready:false,missing}));process.exitCode=1;}
else {
  try {
    const agencies=Object.keys(JSON.parse(process.env.NOTIFYRE_CLIENT_CAMPAIGNS_JSON));
    if(!agencies.length || agencies.some(id=>!notifyreCampaignForAgency(id))) throw new Error('Configure agency campaign bindings');
    const response=await fetch('https://api.notifyre.com/sms/numbers',{headers:{'x-api-token':process.env.NOTIFYRE_API_TOKEN},redirect:'error',signal:AbortSignal.timeout(10000)});
    const data=await response.json();
    const authenticated=response.ok&&(data.success??data.Success)===true;
    const payload=data.payload??data.Payload;
    const numbers=payload?.smsNumbers??payload?.SmsNumbers;
    const numberCount=Array.isArray(numbers)?numbers.length:null;
    console.log(JSON.stringify({authenticated,enabled:process.env.NOTIFYRE_ENABLED==='true',agencyIds:agencies,numberCount,ready:false,next:'This read-only inventory is not activation. Verify each agency campaign and linked numbers, sender registrations, signed webhook receipt, and consent migration before enabling traffic.'}));
    if(!authenticated)process.exitCode=1;
  }catch{console.error('Notifyre credentials could not be verified. No messages were sent.');process.exitCode=1;}
}
