#!/usr/bin/env node
// Scheduled HTTP caller. Reads its secret from the environment, never command-line arguments.
const base=process.env.NARRIVA_API_BASE_URL;
const secret=process.env.NARRIVA_REPORT_JOB_SECRET || process.env.BILLING_JOB_SECRET;
if(!base||!secret)throw new Error('Configure NARRIVA_API_BASE_URL and NARRIVA_REPORT_JOB_SECRET.');
const endpoint=new URL('/api/billing/run-narriva-compliance',base);
if(endpoint.protocol!=='https:' && !['localhost','127.0.0.1'].includes(endpoint.hostname))throw new Error('An HTTPS worker endpoint is required.');
const limit=1;
const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-billing-job-secret':secret},body:JSON.stringify({limit}),signal:AbortSignal.timeout(240000)});
if(!response.ok)throw new Error(`Narriva worker failed with HTTP ${response.status}; no response body was logged.`);
const result=await response.json();
console.log(JSON.stringify({queued:Number(result.queued)||0,processed:Number(result.processed)||0}));
