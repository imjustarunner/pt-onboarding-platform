// A parsed request/claim metadata object cannot grant a clinical exception.
// Only a freshly evaluated server decision receives this process-local identity.
const verified=new WeakSet();
export function markScheduleDerived99051Decision(value) {
  const decision=Object.freeze({...value,binding:Object.freeze({...value.binding})});verified.add(decision);return decision;
}
export const isScheduleDerived99051Decision=value=>!!value&&verified.has(value);
