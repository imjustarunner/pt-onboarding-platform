import {describe,it,expect,vi,beforeEach} from 'vitest';
const db=vi.hoisted(()=>({execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:vi.fn(async()=>db)}}));
import {installEmploymentStarter} from '../employmentStarter.service.js';
beforeEach(()=>vi.resetAllMocks());
describe('agency employment starter installation',()=>{
 it('creates isolated inactive configs with agency-owned clauses in one transaction',async()=>{
  db.execute.mockImplementation(async sql=>sql.startsWith('SELECT id FROM agencies')?[[{id:7}]]:sql.startsWith('SELECT')?[[]]:[{insertId:42}]);
  await installEmploymentStarter(7,19);
  expect(db.beginTransaction).toHaveBeenCalledOnce();expect(db.commit).toHaveBeenCalledOnce();expect(db.rollback).not.toHaveBeenCalled();
  const inserts=db.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT'));
  expect(inserts).toHaveLength(35);expect(inserts.every(([,args])=>args[0]===7)).toBe(true);
  expect(inserts.filter(([sql])=>sql.includes('contract_configs')).every(([sql])=>sql.endsWith('0)'))).toBe(true);
  expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE')||sql.startsWith('DELETE'))).toBe(false);
  expect(db.release).toHaveBeenCalledOnce();
 });
 it('reuses installed copies rather than overwriting edits',async()=>{
  db.execute.mockResolvedValueOnce([[{id:7}]]).mockResolvedValueOnce([[{id:42}]]);
  expect(await installEmploymentStarter(7,19)).toMatchObject({existing:true});expect(db.execute).toHaveBeenCalledTimes(2);expect(db.commit).toHaveBeenCalledOnce();
 });
 it('rolls back a partial installation',async()=>{
  db.execute.mockResolvedValueOnce([[{id:7}]]).mockResolvedValueOnce([[]]).mockRejectedValueOnce(new Error('storage failure'));
  await expect(installEmploymentStarter(7,19)).rejects.toThrow('storage failure');expect(db.rollback).toHaveBeenCalledOnce();expect(db.commit).not.toHaveBeenCalled();expect(db.release).toHaveBeenCalledOnce();
 });
});
