import {it,expect} from 'vitest';
import {validateOutboundEmailQuality} from '../outboundEmailQuality.service.js';
import {meetingFollowupContent} from '../meetingFollowupContent.service.js';
it('allows a linked recap to discuss attachment topics while explicitly keeping files in the app',()=>{
 const url='https://app.itsco.health/my-meetings?type=supervision&meetingId=365';
 const content=meetingFollowupContent({title:'Supervision',summary:'Discussed attachment styles and attached worksheets.',url});
 expect(validateOutboundEmailQuality({...content,linkUrl:url,templateType:'meeting_summary_ready'})).toEqual({ok:true,flags:[]});
 expect(validateOutboundEmailQuality({...content,linkUrl:null,templateType:'meeting_summary_ready'}).ok).toBe(false);
 expect(validateOutboundEmailQuality({text:'See attached worksheet.'}).ok).toBe(false);
});
