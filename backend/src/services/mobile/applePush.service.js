import crypto from 'node:crypto';
import http2 from 'node:http2';

export const applePushConfigured=()=>!!(process.env.APNS_TEAM_ID && process.env.APNS_KEY_ID && process.env.APNS_PRIVATE_KEY);
let cached;
function providerToken() {
  if(cached && Date.now()-cached.at<40*60000)return cached.token;
  const header=Buffer.from(JSON.stringify({alg:'ES256',kid:process.env.APNS_KEY_ID})).toString('base64url');
  const claims=Buffer.from(JSON.stringify({iss:process.env.APNS_TEAM_ID,iat:Math.floor(Date.now()/1000)})).toString('base64url');
  const input=`${header}.${claims}`;
  const signature=crypto.sign('sha256',Buffer.from(input),{key:process.env.APNS_PRIVATE_KEY.replace(/\\n/g,'\n'),dsaEncoding:'ieee-p1363'}).toString('base64url');
  cached={at:Date.now(),token:`${input}.${signature}`}; return cached.token;
}
export async function sendApplePush(token,environment,payload) {
  if(!applePushConfigured())throw Object.assign(new Error('Apple push is not configured'),{code:'APNS_NOT_CONFIGURED'});
  if(!/^[a-f0-9]{64}$/.test(token || ''))throw Object.assign(new Error('Invalid push token'),{code:'APNS_UNREGISTERED'});
  const authorization=providerToken();
  return new Promise((resolve,reject)=>{
    const client=http2.connect(environment==='sandbox'?'https://api.sandbox.push.apple.com':'https://api.push.apple.com');
    let done=false;
    const finish=error=>{if(done)return;done=true;client.close();error?reject(error):resolve();};
    client.on('error',finish);client.setTimeout(15000,()=>finish(Object.assign(new Error('Apple push timed out'),{code:'APNS_TIMEOUT'})));
    const request=client.request({':method':'POST',':path':`/3/device/${token}`,authorization:`bearer ${authorization}`,
      'apns-topic':'com.auricwell.mobile','apns-push-type':'alert','apns-priority':'10','apns-expiration':String(Math.floor(Date.now()/1000)+3600)});
    let status=0;
    request.on('response',headers=>{status=Number(headers[':status']);});request.on('data',()=>{});
    request.on('error',finish);request.on('end',()=>finish(status===200?null:Object.assign(new Error('Apple push delivery failed'),{code:status===410?'APNS_UNREGISTERED':`APNS_${status}`})));
    request.end(JSON.stringify({aps:{alert:{title:payload.title,body:payload.body},sound:'default'},url:payload.url}));
  });
}
