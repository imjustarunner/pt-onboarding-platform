import {afterEach,describe,expect,it,vi} from 'vitest';
import {canUseMeetingMiniMode} from '../meetingMiniMode.js';
import {useActiveMeeting} from '../../composables/useActiveMeeting.js';
afterEach(()=>{useActiveMeeting().clearMiniMode();vi.unstubAllGlobals();});
describe('mobile meeting mini mode',()=>{
 it('rejects programmatic mini mode on narrow screens',()=>{vi.stubGlobal('innerWidth',390);expect(canUseMeetingMiniMode()).toBe(false);expect(useActiveMeeting().setMiniMode({token:'secret'})).toBe(false);expect(useActiveMeeting().state.active).toBe(false);});
 it('rejects tablets even at desktop viewport widths',()=>{vi.stubGlobal('innerWidth',1366);vi.stubGlobal('navigator',{userAgent:'Macintosh',maxTouchPoints:5});expect(canUseMeetingMiniMode()).toBe(false);});
 it('allows a desktop session',()=>{vi.stubGlobal('innerWidth',1440);expect(useActiveMeeting().setMiniMode({token:'token'})).toBe(true);expect(useActiveMeeting().state.active).toBe(true);});
});
