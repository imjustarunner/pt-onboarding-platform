import {expect,it} from 'vitest';
import {filterClientDemos} from '../clientDemoFilter.js';
it('filters marked demos together with generated QA clients before pagination',()=>{const clients=[{id:1},{id:2,is_demo:1},{id:3,created_via_dev_fill:1},{id:4,is_demo:'1'}];expect(filterClientDemos(clients,'exclude').map(row=>row.id)).toEqual([1]);expect(filterClientDemos(clients,'only').map(row=>row.id)).toEqual([2,3,4]);expect(filterClientDemos(clients,'')).toBe(clients);});
