import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../familyBillingEncryption.service.js',()=>({decryptFamilyBilling:vi.fn(()=>({amountCents:1000,method:'card ending 0001'}))}));
vi.mock('../familyLedger/receivables.js',()=>({findReceivable:vi.fn(),sourcePayload:vi.fn()}));
vi.mock('../familyLedger/policy.js',()=>({parseJson:(v,f)=>v||f,today:()=>'',assertCollectible:vi.fn()}));
import pool from '../../config/database.js';import {receiptFor} from '../familyLedger/views.js';
let payer,self;
beforeEach(()=>{vi.resetAllMocks();payer=5;self=false;pool.execute.mockImplementation(async q=>{
 if(q.includes('SELECT p.*'))return [[{id:9,client_id:8,payer_user_id:payer,receipt_encrypted:'encrypted'}]];
 if(q.includes('SELECT * FROM client_guardians'))return [self?[{relationship_type:'self',access_enabled:1}]:[]];
 if(q.includes('SELECT cg.*'))return [[{relationship_type:'guardian',access_enabled:0,independence_status:'active',support_scopes:['billing']}]];
 if(q.startsWith('SELECT'))return [[]];return [{affectedRows:1}];
 });});
it('preserves a payer’s own historical receipt after full family disconnection',async()=>{expect(await receiptFor({agencyId:2,paymentId:9,userId:5})).toMatchObject({amountCents:1000,method:'card ending 0001'});});
it('does not carry an old shared-family statement policy into another payer’s receipts',async()=>{payer=6;await expect(receiptFor({agencyId:2,paymentId:9,userId:5})).rejects.toMatchObject({status:403});});
it('allows the client’s own payment history without exposing the parent’s card',async()=>{self=true;const receipt=await receiptFor({agencyId:2,paymentId:9,userId:3});expect(receipt.amountCents).toBe(1000);expect(receipt.method).toBeUndefined();});
