import {it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../services/providerUpdate.service.js',()=>({assertAgencyAdmin:vi.fn()}));
vi.mock('../../services/providerUpdateReminders.service.js',()=>({providerUpdateReminders:{getSettings:vi.fn(),saveSettings:vi.fn()}}));
import {assertAgencyAdmin} from '../../services/providerUpdate.service.js';
import {providerUpdateReminders} from '../../services/providerUpdateReminders.service.js';
import {reminderSettings} from '../providerUpdateReminders.controller.js';
beforeEach(()=>{vi.clearAllMocks();assertAgencyAdmin.mockResolvedValue(2);});
it('requires agency administrator access before reading or changing reminders',async()=>{assertAgencyAdmin.mockRejectedValue(Object.assign(Error('Access denied'),{status:403}));const next=vi.fn();await reminderSettings({method:'PUT',body:{agencyId:2,enabled:true},user:{id:10},params:{pushId:'5'}},{},next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(providerUpdateReminders.saveSettings).not.toHaveBeenCalled();});
it('scopes schedule mutations to the verified agency and actor',async()=>{const req={method:'PUT',body:{agencyId:2,enabled:true,smsEnabled:true},user:{id:10},params:{pushId:'5'}};const res={json:vi.fn()};await reminderSettings(req,res,vi.fn());expect(providerUpdateReminders.saveSettings).toHaveBeenCalledWith({pushId:5,agencyId:2,enabled:true,smsEnabled:true,actorUserId:10});});
