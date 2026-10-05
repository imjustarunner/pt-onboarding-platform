export function recordsError(err, req, res) {
  const safe=err.recordsSafe===true && err.status>=400 && err.status<500;
  // Unexpected exceptions may contain SQL bindings or parser bodies. Never log them.
  if(!safe)console.error('[Records requests] Operation failed');
  res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  return res.status(safe?err.status:500).json({error:{message:safe?err.message:'Unable to process your records request. Please try again or contact your practice.'}});
}
