import { expect,it } from 'vitest';
import { generatedClientInitials } from '../clientInitials';
it.each([['Ekko Loisel','Ekk Loi'],['  EKKO    LOISEL ','Ekk Loi'],['Alex Middle Example','Ale Exa'],['Ana Li','Ana Li'],['','']])('generates spaced, title-case initials for %s',(input,expected)=>expect(generatedClientInitials(input)).toBe(expected));
