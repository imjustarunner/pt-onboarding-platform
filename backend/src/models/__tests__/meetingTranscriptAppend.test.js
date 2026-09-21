import {beforeEach,describe,expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:db}));
import Artifact from '../ProviderScheduleEventArtifact.model.js';
describe('concurrent meeting transcript append',()=>{
  beforeEach(()=>{vi.clearAllMocks();db.execute.mockResolvedValue([[]]);});
  it('appends atomically in SQL rather than replacing a stale read',async()=>{
    await Promise.all([
      Artifact.appendTranscriptChunk({eventId:7,text:'[Alice] First',updatedByUserId:1}),
      Artifact.appendTranscriptChunk({eventId:7,text:'[Bob] Second',updatedByUserId:2})
    ]);
    const writes=db.execute.mock.calls.filter(([sql])=>sql.startsWith('UPDATE'));
    expect(writes).toHaveLength(2);
    for(const [sql] of writes){
      expect(sql).toContain("CONCAT_WS('");
      expect(sql).toContain("NULLIF(transcript_text,'')");
      expect(sql).toContain('COALESCE(transcript_paused,0)=0');
      expect(sql).toContain('transcript_stopped_at IS NULL');
    }
    expect(writes[0][1]).toEqual(['[Alice] First','[Alice] First',1,7]);
    expect(writes[1][1]).toEqual(['[Bob] Second','[Bob] Second',2,7]);
  });
});
