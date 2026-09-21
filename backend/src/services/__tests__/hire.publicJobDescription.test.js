import { describe, expect, it, vi } from 'vitest';
const read = vi.hoisted(() => vi.fn());
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../storage.service.js', () => ({ default: { readObject: read } }));
import { buildPublicJobDescriptionUrl, buildJobDescriptionAttachmentForEmail } from '../publicJobDescription.service.js';

describe('one public job description', () => {
  it('uses the public website with the same canonical job id', () => {
    expect(buildPublicJobDescriptionUrl({ slug: 'itsco' }, 16)).toBe('https://itsco.health/careers/jobs/16');
  });
  it('generates email copies from current job content when an old uploaded PDF also exists', async () => {
    const attachment = await buildJobDescriptionAttachmentForEmail({ id: 16, title: 'Counselor', storage_path: 'old-job.pdf', description_sections_json: { aboutTheRole: 'Updated expectations', responsibilities: ['Work with schools'] } }, { agency: { name: 'ITSCO' } });
    expect(read).not.toHaveBeenCalled();
    expect(attachment.contentType).toBe('application/pdf');
    expect(Buffer.from(attachment.contentBase64, 'base64').subarray(0, 4).toString()).toBe('%PDF');
  });
});
