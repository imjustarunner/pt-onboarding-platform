import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:m}));
import Policy from '../BookingCancellationPolicy.model.js';
beforeEach(()=>vi.resetAllMocks());
it.each([{lateFeeCents:-1},{noShowFeeCents:1.5},{providerCategory:5},{providerLevel:0},{customerTierId:'L6'},{noShowUndoAfterEndMinutes:-1},{scopeLevel:'payer'},{scopeLevel:'service'},{scopeLevel:'package'}])('rejects invalid fee rules before persistence: %j',patch=>{
 expect(()=>Policy.normalizePayload({name:'QA rule',...patch},453)).toThrow();expect(m.execute).not.toHaveBeenCalled();
});
it('keeps platform defaults global without converting NULL agency into zero',async()=>{
 m.execute.mockResolvedValueOnce([{insertId:8}]).mockResolvedValueOnce([[{id:8,agency_id:null,name:'Default',scope_level:'platform',is_active:1}]]);
 const rule=await Policy.create(null,{name:'Default',scopeLevel:'platform',lateFeeCents:1500,noShowFeeCents:2200},1807);
 expect(rule).toMatchObject({agencyId:null,scopeLevel:'platform',noShowSuggestedWaitMinutes:15,noShowUndoAfterEndMinutes:10});
 const [sql,params]=m.execute.mock.calls[0];expect(params).toHaveLength((sql.match(/\?/g)||[]).length);expect(params[0]).toBeNull();
});
it('versions changed terms atomically and preserves the previous booked row',async()=>{
 const old={id:7,agency_id:453,name:'Original',scope_level:'tenant',late_fee_cents:1500,no_show_fee_cents:2200,is_active:1};
 const db={execute:vi.fn().mockResolvedValueOnce([[old]]).mockResolvedValueOnce([{insertId:8}]).mockResolvedValueOnce([[{...old,id:8,no_show_fee_cents:2500}]]).mockResolvedValue([{affectedRows:1}]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};m.getConnection.mockResolvedValue(db);
 expect(await Policy.update(7,453,{noShowFeeCents:2500},1807)).toMatchObject({id:8,noShowFeeCents:2500,supersedesPolicyId:7});
 expect(db.commit).toHaveBeenCalledOnce();expect(db.execute.mock.calls.filter(([sql])=>sql.startsWith('UPDATE'))).toEqual([
 ['UPDATE booking_cancellation_policies SET supersedes_policy_id=? WHERE id=?',[7,8]],['UPDATE booking_cancellation_policies SET is_active=0 WHERE id=?',[7]]]);
});
it('refuses to version another agency’s terms',async()=>{
 const db={execute:vi.fn().mockResolvedValue([[{id:7,agency_id:6}]]),beginTransaction:vi.fn(),rollback:vi.fn(),release:vi.fn()};m.getConnection.mockResolvedValue(db);
 expect(await Policy.update(7,453,{name:'No'},1807)).toBeNull();expect(db.execute).toHaveBeenCalledOnce();expect(db.rollback).toHaveBeenCalledOnce();
});
