import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../narrivaReview.service.js',()=>({latestNarrivaStatus:vi.fn(),createNarrivaReview:vi.fn(),narrivaFeatures:vi.fn()}));
import {createSubmissionReviewer} from '../narrivaSubmissionReview.service.js';
let latest,create,features,review,req,note;
beforeEach(()=>{
 latest=vi.fn(async()=>null);create=vi.fn(async()=>({id:3,status:'running'}));features=vi.fn(async()=>({compliance:true}));
 review=createSubmissionReviewer({latest,create,features});req={user:{id:7},body:{untrusted:'ignored'},headers:{'x-request-id':'synthetic'}};
 note={id:25,agency_id:450,created_by_user_id:7,provider_signed_at:'2026-11-11T19:00:00Z'};
});
it('starts a saved-note review at author submission, using the original audit request and trusted note identity',async()=>{
 expect(await review(req,note)).toMatchObject({id:3,status:'running'});
 const forwarded=create.mock.calls[0][0];expect(forwarded.user).toBe(req.user);expect(forwarded.headers).toBe(req.headers);expect(forwarded.body).toEqual({agencyId:450,noteId:25});expect(req.body).toEqual({untrusted:'ignored'});
 expect(latest).toHaveBeenCalledWith(req.user,450,25,{actorUserId:7});
});
it.each(['passed','bypassed','action_required','running','unavailable'])('preserves saved %s evidence on signature retry',async status=>{
 latest.mockResolvedValue({id:2,status});expect(await review(req,note)).toEqual({id:2,status});expect(create).not.toHaveBeenCalled();
});
it('reviews the current submitted version when earlier evidence is stale',async()=>{latest.mockResolvedValue({id:2,status:'stale'});await review(req,note);expect(create).toHaveBeenCalledTimes(1);});
it('never dispatches a review for co-signing, an unsigned note, or disabled compliance',async()=>{
 await review({...req,user:{id:8}},note);await review(req,{...note,provider_signed_at:null});expect(features).not.toHaveBeenCalled();features.mockResolvedValue({compliance:false});await review(req,note);expect(create).not.toHaveBeenCalled();
});
it('deduplicates concurrent signature retries and releases failed starts for an explicit later retry',async()=>{
 let finish;latest.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const first=review(req,note),second=review(req,note);await Promise.resolve();finish(null);await Promise.all([first,second]);expect(create).toHaveBeenCalledTimes(1);
 create.mockRejectedValueOnce(new Error('Private review unavailable'));await expect(review(req,note)).rejects.toThrow('Private review unavailable');await review(req,note);expect(create).toHaveBeenCalledTimes(3);
});
