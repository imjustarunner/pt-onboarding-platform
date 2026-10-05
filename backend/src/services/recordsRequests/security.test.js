import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptFamilyBilling as seal,decryptFamilyBilling as open } from '../familyBillingEncryption.service.js';
import { publicBrand } from './branding.js';
import { recordsError } from './errors.js';
import { fail } from './policy.js';
import { requestLoggingMiddleware } from '../../middleware/requestLogging.middleware.js';
test('sensitive records are authenticated ciphertext tied to the practice and request',()=>{
 const original=process.env.FAMILY_BILLING_ENCRYPTION_KEY_BASE64;process.env.FAMILY_BILLING_ENCRYPTION_KEY_BASE64=Buffer.alloc(32,9).toString('base64');
 try{
 const data={patientName:'Synthetic Private Name',scope:'Sensitive treatment detail'},context='auricwell:records:10:request';
 const encrypted=seal(data,context);for(const value of Object.values(data))assert.ok(!encrypted.includes(value));
 assert.deepEqual(open(encrypted,context),data);
 assert.throws(()=>open(encrypted,'auricwell:records:20:request'));
 const tampered=JSON.parse(encrypted);tampered.tag=Buffer.alloc(16).toString('base64');assert.throws(()=>open(tampered,context));
 process.env.FAMILY_BILLING_ENCRYPTION_KEY_BASE64='';assert.throws(()=>seal(data,context),/unavailable/);
 }finally{if(original===undefined)delete process.env.FAMILY_BILLING_ENCRYPTION_KEY_BASE64;else process.env.FAMILY_BILLING_ENCRYPTION_KEY_BASE64=original;}
});
test('branding supplies only public fields and keeps images on this origin',()=>{
 const brand=publicBrand({id:2,slug:'itsco',name:'ITSCO',logo_url:'https://tracker.invalid/logo.png',color_palette:{primary:'url(evil)'},private_field:'secret'});
 assert.equal(brand.logoUrl,'/assets/itsco/logo.png');assert.equal(brand.brandColor,'#0649ce');assert.equal(brand.private_field,undefined);
 assert.equal(publicBrand({slug:'nlu',logo_path:'uploads/logos/../../private.png'}).logoUrl,'/assets/nlu/logo.png');
});
test('request logging and unexpected errors never include submitted or database details',()=>{
 const req={path:'/api/auricwell-records/public/2',body:{scope:'Synthetic sensitive detail'}};
 requestLoggingMiddleware(req,{},()=>{});assert.equal(req.sanitizedBody,'[PRIVATE RECORDS REQUEST]');
 let status,body;const res={set(){return this;},status(v){status=v;return this;},json(v){body=v;return this;}};
 const original=console.error,logs=[];console.error=(...args)=>logs.push(args);
 try{recordsError(Object.assign(new Error('Synthetic sensitive detail'),{sql:'private SQL',body:req.body}),req,res);}finally{console.error=original;}
 assert.equal(status,500);assert.ok(!JSON.stringify([body,logs]).includes('Synthetic sensitive detail'));assert.ok(!JSON.stringify([body,logs]).includes('private SQL'));
 recordsError(fail(400,'Choose a practice.'),req,res);assert.equal(status,400);assert.equal(body.error.message,'Choose a practice.');
});
