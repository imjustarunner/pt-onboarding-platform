import {it,expect} from 'vitest';
import {guardianDirectoryMatches,guardianAccountPath} from '../guardianDirectory.js';
const guardian={first_name:'Example',last_name:'Parent',email:'parent@example.test',phone:'(303) 555-0100',agencies:'Care agency',school_names:'Example School',linked_clients:[{name:'First Child'}]};
it.each(['example parent','3035550100','555-0100','First Child','example school','Care agency','parent@example.test'])('finds a guardian by %s',query=>expect(guardianDirectoryMatches(guardian,query)).toBe(true));
it('requires every search term and builds the actual guardian account link',()=>{
 expect(guardianDirectoryMatches(guardian,'Parent missing')).toBe(false);expect(guardianAccountPath(20,'itsco')).toBe('/itsco/admin/users/20');expect(guardianAccountPath(20)).toBe('/admin/users/20');
});
