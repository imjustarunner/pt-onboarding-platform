import {describe,it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({agency:vi.fn(),existing:vi.fn(),execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:m.agency}}));
vi.mock('../../models/AgencyBillingInvoice.model.js',()=>({default:{findByAgencyAndPeriod:m.existing}}));
import InvoiceService from '../billingInvoice.service.js';
import {runMonthlyBilling} from '../../controllers/billingJobs.controller.js';
beforeEach(()=>{vi.clearAllMocks();});
describe('SchoolCareBridge billing stays inactive',()=>{
 it('blocks direct invoice generation before usage, ledgers, PDF or payments',async()=>{m.agency.mockResolvedValue({id:50,feature_flags:{schoolCareBridgeOnly:true}});await expect(InvoiceService.generateForAgency(50)).rejects.toMatchObject({code:'SCHOOLCAREBRIDGE_BILLING_INACTIVE',status:409});expect(m.existing).not.toHaveBeenCalled();expect(m.execute).not.toHaveBeenCalled();});
 it('keeps an existing ITSCO invoice accessible without changing its charges',async()=>{m.agency.mockResolvedValue({id:2,feature_flags:{}});m.existing.mockResolvedValue({id:10,agency_id:2});expect(await InvoiceService.generateForAgency(2)).toEqual({id:10,agency_id:2});});
 it('skips standalone tenants in the recurring job while retaining ordinary agency processing',async()=>{m.execute.mockResolvedValue([[{agency_id:50,feature_flags:'{"schoolCareBridgeOnly":true}'},{agency_id:2,feature_flags:null}]]);const generator=vi.spyOn(InvoiceService,'generateForAgency').mockResolvedValue({id:10,status:'draft'}),res={json:vi.fn()},next=vi.fn();await runMonthlyBilling({},res,next);expect(generator).toHaveBeenCalledOnce();expect(generator.mock.calls[0][0]).toBe(2);expect(res.json.mock.calls[0][0].results[0]).toMatchObject({agencyId:50,status:'skipped'});expect(next).not.toHaveBeenCalled();});
});
