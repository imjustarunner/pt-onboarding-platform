import { expect,it } from 'vitest';
import { qaSections } from '../qaAccess.js';
it('keeps support out of clinical authoring and billing',()=>{
  expect(qaSections('support')).toEqual(expect.arrayContaining(['overview','appointments','clients','providers','notifications','account','settings']));
  expect(qaSections('support')).not.toContain('documentation');
  expect(qaSections('support')).not.toContain('billing');
  expect(qaSections('provider')).toContain('documentation');
  expect(qaSections('provider')).not.toContain('billing');
  expect(qaSections('admin')).not.toContain('announcements');
  expect(qaSections('client_guardian')).toEqual([]);
});
