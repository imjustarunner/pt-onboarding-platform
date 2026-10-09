import {it,expect,vi} from 'vitest';
import {connectAdminUpdateFrame,adminUpdateFrameHtml} from '../adminUpdateFrame';
it('opens app links outside the sandbox while keeping topics within the update',()=>{
 const doc=document.implementation.createHTMLDocument('Update');doc.body.innerHTML=adminUpdateFrameHtml('<a href="https://app.itsco.health/itsco/tasks">Tasks</a><a href="#topic">Topic</a><h2 id="topic">Topic</h2>');
 const heading=doc.getElementById('topic');heading.scrollIntoView=vi.fn();connectAdminUpdateFrame({target:{contentDocument:doc}});
 expect(doc.querySelector('a').target).toBe('_blank');expect(doc.querySelector('a').rel).toContain('noopener');doc.querySelectorAll('a')[1].click();expect(heading.scrollIntoView).toHaveBeenCalled();
});
