import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../clientInsurance.service.js',()=>({readClientInsurance:vi.fn()}));
vi.mock('../../models/GuardianPaymentCard.model.js',()=>({decodePaymentCard:row=>row}));
vi.mock('../clientPortalContext.service.js',async importOriginal=>{const actual=await importOriginal();return {...actual,clientPortalAppUrl:vi.fn(actual.clientPortalAppUrl)};});
import {clientPortalAppUrl} from '../clientPortalContext.service.js';
import {readClientInsurance} from '../clientInsurance.service.js';
import {clientPaymentSetup,paymentSetupEmail} from '../clientPaymentSetup.service.js';
import {buildMimeMessage} from '../unifiedEmail/mime.js';

function fixture({card=null,links=null,primaryInsurer='Private plan',clientPatch={}}={}){
  return {execute:vi.fn(async(sql)=>{
    if(sql.startsWith('SELECT c.id'))return [[{id:2,agency_id:1,client_type:'clinical',slug:'demo',primary_insurer_name:primaryInsurer,...clientPatch}]];
    if(sql.includes('FROM client_guardians'))return [links||[{guardian_user_id:11,access_enabled:1,relationship_type:'guardian',first_name:'DEMO QA',payer_status:'active',payment_card_id:card?9:null}]];
    if(sql.includes('FROM agency_billing_accounts'))return [[{stripe_connect_account_id:'acct_fixture',stripe_connect_status:'active'}]];
    if(sql.includes('FROM guardian_payment_cards'))return [[card]];
    throw new Error(`Unexpected SQL: ${sql}`);
  })};
}
beforeEach(()=>{vi.clearAllMocks();readClientInsurance.mockResolvedValue({primary:{insurerName:'Private plan'}});});
it('does not request a card for primary OR secondary Medicaid or legacy Medicaid labeling',async()=>{
  for(const insurance of [{primary:{insurerName:'Health First Colorado'}},{primary:{insurerName:'Private'},secondary:{isMedicaid:true}}]){
    readClientInsurance.mockResolvedValue(insurance);const {summary}=await clientPaymentSetup(1,2,fixture());expect(summary.medicaid).toBe(true);expect(summary.paymentMethodNeeded).toBe(false);expect(summary.paymentUrl).toBe(null);
  }
  readClientInsurance.mockResolvedValue({});expect((await clientPaymentSetup(1,2,fixture({primaryInsurer:'Medicaid'}))).summary.medicaid).toBe(true);
});
it('only treats a current merchant-matching Stripe card as on file',async()=>{
  const card={stripe_payment_method_id:'pm_private',connected_account_id:'acct_fixture',card_exp_year:2099,card_exp_month:12};
  const yes=await clientPaymentSetup(1,2,fixture({card}));expect(yes.summary.cardOnFile).toBe(true);expect(JSON.stringify(yes.summary)).not.toMatch(/pm_private|acct_fixture|payment_card/);
  for(const patch of [{connected_account_id:'another_merchant'},{card_exp_year:2020},{stripe_payment_method_id:null}])expect((await clientPaymentSetup(1,2,fixture({card:{...card,...patch}}))).summary.cardOnFile).toBe(false);
});
it('excludes revoked, no-view and adult support links without billing permission',async()=>{
  const db=fixture({links:[{guardian_user_id:11,access_enabled:0},{guardian_user_id:12,access_enabled:1,permissions_json:{noView:true}},{guardian_user_id:13,access_enabled:1,relationship_type:'guardian',independence_status:'active',support_scopes:'["insurance"]'}]});
  const value=await clientPaymentSetup(1,2,db);expect(value.eligible).toEqual([]);expect(value.summary.responsibleParties).toEqual([]);
});
it('does not turn missing coverage into a request for payment',async()=>{
  readClientInsurance.mockResolvedValue({});const {summary}=await clientPaymentSetup(1,2,fixture({primaryInsurer:null}));expect(summary.paymentMethodNeeded).toBe(false);expect(summary.paymentUrl).toBe(null);
});
it('uses truthful follow-up text and embeds a branded QR without allowing MIME header injection',()=>{
  const mail=paymentSetupEmail({clientName:'<script>DEMO</script>',url:'https://auricwell.com/demo/guardian',provider:true,familyNotified:false});
  expect(mail.html).not.toContain('<script>');expect(mail.text).not.toContain('notified by email');expect(mail.html).toContain('fundthred');expect(mail.text).toContain('their own account');expect(mail.text).not.toContain('You may also sign in');
  const mime=buildMimeMessage({to:'qa@example.com',from:'billing@example.com',...mail,attachments:[{contentId:'payment-setup-qr',filename:'qr.png',contentType:'image/png',contentBase64:'dGVzdA=='}]});
  expect(mime).toContain('Content-ID: <payment-setup-qr>');expect(mime).toContain('Content-Disposition: inline');
  const unsafe=buildMimeMessage({to:'qa@example.com',from:'billing@example.com',subject:'test',attachments:[{contentId:'evil\r\nBcc: leak@example.com',filename:'file".png'}]});expect(unsafe).not.toContain('Bcc:');expect(unsafe).not.toContain('Content-ID:');expect(unsafe).toContain('Content-Disposition: attachment');
});

it('keeps clinical QA payment links on its authorized tenant path using agency identity and flags',async()=>{const {summary}=await clientPaymentSetup(450,2304,fixture({clientPatch:{id:2304,agency_id:450,slug:'auricwell-qa-demo',portal_url:'auricwell-qa-demo',custom_domain:'app.itsco.health',feature_flags:{qaSandbox:{syntheticOnly:true}}}}));expect(clientPortalAppUrl).toHaveBeenCalledWith(expect.objectContaining({id:450,feature_flags:{qaSandbox:{syntheticOnly:true}}}),'guardian?panel=payment_methods&clientId=2304');expect(summary.paymentUrl).toBe('https://app.itsco.health/auricwell-qa-demo/guardian?panel=payment_methods&clientId=2304');});
it('keeps a nonclinical organization’s configured payment host',async()=>{const {summary}=await clientPaymentSetup(3,2304,fixture({clientPatch:{id:2304,agency_id:3,client_type:'learning',slug:'demo-learning',custom_domain:'app.learning.example.com'}}));expect(summary.paymentUrl).toBe('https://app.learning.example.com/guardian?panel=payment_methods&clientId=2304');});
