import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {autoVerifyEmail,createLoginAutomation} from '../loginAutomation';
let state,verify,submit,auto;
beforeEach(()=>{vi.useFakeTimers();state={username:'qa@example.com',password:'',verifiedUsername:'',showPassword:false,needsOrgChoice:false,loading:false,verifying:false};verify=vi.fn(async()=>{state.verifiedUsername=state.username;state.showPassword=true;});submit=vi.fn();auto=createLoginAutomation({read:()=>state,verify,submit});});afterEach(()=>{auto.dispose();vi.useRealTimers();});
it('verifies a settled .com or .health email once, not an unfinished address',async()=>{for(const x of ['qa@example.com','qa@itsco.health'])expect(autoVerifyEmail(x)).toBe(true);for(const x of ['qa@','qa@example.com.evil','first last@example.com'])expect(autoVerifyEmail(x)).toBe(false);auto.usernameChanged();await vi.advanceTimersByTimeAsync(650);auto.usernameChanged();await vi.advanceTimersByTimeAsync(650);expect(verify).toHaveBeenCalledTimes(1);});
it('signs in once when a password manager fills both fields before verification finishes',async()=>{auto.usernameChanged();state.password='fictional-test-password';auto.passwordInserted();auto.passwordInserted();await vi.advanceTimersByTimeAsync(800);expect(submit).toHaveBeenCalledTimes(1);auto.passwordInserted();await vi.advanceTimersByTimeAsync(200);expect(submit).toHaveBeenCalledTimes(1);});
it('does not reuse a verified identity for another username or submit after unmount',async()=>{state.verifiedUsername='other@example.com';state.showPassword=true;state.password='fictional-test-password';auto.passwordInserted();await vi.advanceTimersByTimeAsync(200);expect(submit).not.toHaveBeenCalled();auto.usernameChanged();auto.dispose();await vi.advanceTimersByTimeAsync(800);expect(verify).not.toHaveBeenCalled();});

it('allows one fresh verification after the user corrects a failed identifier',async()=>{verify.mockImplementation(async()=>{});auto.usernameChanged();await vi.advanceTimersByTimeAsync(650);state.username='qa@example.co';auto.usernameChanged();state.username='qa@example.com';auto.usernameChanged();await vi.advanceTimersByTimeAsync(650);expect(verify).toHaveBeenCalledTimes(2);});

it('does not follow a manual sign-in with a second automatic attempt',async()=>{state.verifiedUsername=state.username;state.showPassword=true;state.password='fictional-test-password';auto.passwordInserted();auto.submissionStarted();await vi.advanceTimersByTimeAsync(500);expect(submit).not.toHaveBeenCalled();auto.passwordInserted();await vi.advanceTimersByTimeAsync(500);expect(submit).not.toHaveBeenCalled();});

it('recognizes browser/password-manager bulk fills labeled insertText without submitting ordinary single-key typing',async()=>{
 state.verifiedUsername=state.username;state.showPassword=true;
 for(const letter of 'typed'){
  state.password+=letter;auto.passwordInput({inputType:'insertText',data:letter,target:{value:state.password}});
  await vi.advanceTimersByTimeAsync(200);
 }
 expect(submit).not.toHaveBeenCalled();
 state.password='';auto.passwordInput({inputType:'deleteContentBackward',target:{value:''}});
 state.password='fictional-saved-password';
 auto.passwordInput({inputType:'insertText',data:null,target:{value:state.password}});
 await vi.advanceTimersByTimeAsync(200);expect(submit).toHaveBeenCalledTimes(1);
 auto.passwordInput({inputType:'insertReplacementText',target:{value:state.password}});
 await vi.advanceTimersByTimeAsync(200);expect(submit).toHaveBeenCalledTimes(1);
});
it('waits for an in-flight manual Verify and submits once when the form becomes ready',async()=>{
 state.verifying=true;state.password='fictional-password';auto.passwordInserted();
 await vi.advanceTimersByTimeAsync(200);expect(submit).not.toHaveBeenCalled();
 state.verifying=false;state.verifiedUsername=state.username;state.showPassword=true;auto.readyChanged();
 await vi.advanceTimersByTimeAsync(200);expect(submit).toHaveBeenCalledTimes(1);
 auto.readyChanged();await vi.advanceTimersByTimeAsync(500);expect(submit).toHaveBeenCalledTimes(1);
});
