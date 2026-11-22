import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),balances:vi.fn(),payer:vi.fn(),collectible:vi.fn(),find:vi.fn(),managed:vi.fn(),testPayer:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../clientPortalEmail.service.js',()=>({clientEmailContext:vi.fn(),sendClientPortalEmail:vi.fn()}));
vi.mock('../clientPortalEmailContent.js',()=>({buildFamilyBillingEmail:vi.fn()}));
vi.mock('../familyBillingPolicy.service.js',()=>({billingError:(status,message)=>Object.assign(new Error(message),{status}),auditBilling:vi.fn(),requireResponsiblePayer:m.payer,positiveId:v=>Number(v)}));
vi.mock('../familyBillingEncryption.service.js',()=>({encryptFamilyBilling:vi.fn(),decryptFamilyBilling:vi.fn()}));
vi.mock('../familyLedger/views.js',()=>({listBalances:m.balances,renderPrivatePdf:vi.fn()}));
vi.mock('../familyLedger/receivables.js',()=>({findReceivable:m.find}));
vi.mock('../familyLedger/policy.js',()=>({assertCollectible:m.collectible,dateOnly:v=>String(v).slice(0,10),today:()=> '2026-11-22',key:v=>v,transaction:vi.fn(),parseJson:vi.fn()}));
vi.mock('../familyLedger/senders.js',()=>({requireReadySender:vi.fn()}));
vi.mock('../familyLedger/collectionHandoff.js',()=>({externallyManaged:m.managed}));
vi.mock('../guardianTestAccess.service.js',()=>({isGuardianTestAccountId:m.testPayer,requireLiveGuardianBilling:vi.fn()}));
import {aging} from '../familyLedger/collections.js';
const balance={clientId:4,payerUserId:20,receivableId:5,allocationId:6,status:'open',balanceCents:2500,dueDate:'2026-12-01'};
beforeEach(()=>{vi.resetAllMocks();m.balances.mockResolvedValue([balance]);m.testPayer.mockResolvedValue(false);m.managed.mockResolvedValue(false);m.find.mockResolvedValue({id:5});});
it('includes verified current balances in a statement without treating them as past due',async()=>{
 expect(await aging({agencyId:2,userId:7,payerUserId:20,clientId:4})).toEqual([]);
 const rows=await aging({agencyId:2,userId:7,payerUserId:20,clientId:4,includeCurrent:true});expect(rows).toHaveLength(1);expect(rows[0].pastDueCents).toBe(2500);
 expect(m.balances).toHaveBeenLastCalledWith({agencyId:2,userId:7,clientId:4,staff:true,allForStatement:true});
});
it.each([{payerUserId:21},{holdReason:'review'},{disputedAt:'2026-11-22'},{paymentStatus:'pending'},{status:'voided'}])('excludes other payers, held, disputed and unsettled rows: %j',async extra=>{
 m.balances.mockResolvedValue([{...balance,...extra}]);expect(await aging({agencyId:2,userId:7,payerUserId:20,includeCurrent:true})).toEqual([]);
});
it('rechecks responsibility and collectible state before including a statement line',async()=>{
 m.collectible.mockRejectedValue(Object.assign(new Error('Unverified patient responsibility'),{status:409}));expect(await aging({agencyId:2,userId:7,payerUserId:20,includeCurrent:true})).toEqual([]);expect(m.payer).toHaveBeenCalledWith(20,4,2);
});
