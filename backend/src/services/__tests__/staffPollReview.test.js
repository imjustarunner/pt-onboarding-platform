import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{getConnection:vi.fn(),execute:vi.fn()}}));
import pool from '../../config/database.js';
import {reviewPollResponse} from '../staffPollReview.service.js';
import {validatePollOptions,unmatchedPollReply,summarizePollResponses} from '../../utils/staffPollResponses.js';
const options=[{key:'MON',label:'Monday afternoon'},{key:'2',label:'Tuesday morning'}];
describe('poll choices and review',()=>{
 it('accepts custom numeric and word codes',()=>expect(()=>validatePollOptions(options)).not.toThrow());
 it.each(['STOP','HELP','SUPPORT','MON'])('rejects ambiguous or command codes %s',key=>expect(()=>validatePollOptions([...options,{key,label:'Another time'}])).toThrow());
 it('preserves unmatched text only when enabled',()=>{expect(unmatchedPollReply('Next week instead',true)).toEqual({key:'__UNCLASSIFIED__',label:'Needs review',raw:'Next week instead'});expect(unmatchedPollReply('STOP',true)).toBeNull();expect(unmatchedPollReply('Something else',false)).toBeNull();});
 it('counts categorized replies once and leaves excluded/unclassified replies out',()=>{const replies=[{response_key:'MON'},{response_key:'__UNCLASSIFIED__',bucketKey:'MON'},{response_key:'2',excluded:true},{response_key:'__UNCLASSIFIED__'}];expect(summarizePollResponses(replies,options).map(r=>r.total)).toEqual([2,0]);expect(replies[1].response_key).toBe('__UNCLASSIFIED__');});
 it('rejects stale review without inserting or erasing the original reply',async()=>{const db={beginTransaction:vi.fn(),execute:vi.fn().mockResolvedValue([[{response_body:'Changed reply',received_at:'2026-10-07T10:00:00Z'}]]),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};pool.getConnection.mockResolvedValue(db);await expect(reviewPollResponse({eventId:1,responseId:2,options,excluded:false,bucketKey:'MON',reason:'clarified',originalBody:'Old reply',receivedAt:'2026-10-07T10:00:00Z'})).rejects.toMatchObject({status:409});expect(db.execute).toHaveBeenCalledTimes(1);expect(db.rollback).toHaveBeenCalled();});
});
