/**
 * Twilio Function to generate Video Access Tokens
 *
 * Use this if your Node backend gets "Invalid Access Token issuer/subject" despite
 * correct credentials. Running in Twilio's environment bypasses env loading issues.
 *
 * SETUP:
 * 1. Twilio Console → Develop → Functions & Assets → Create Function
 * 2. Path: /video-token
 * 3. Add Secrets (Function config → Environment Variables):
 *    - TWILIO_API_KEY_SID = your API Key SID
 *    - TWILIO_API_KEY_SECRET = your API Key Secret
 * 4. Paste this code, Deploy
 * 5. Copy the Function URL (e.g. https://video-token-1234.twil.io/video-token)
 * 6. Add to your .env: TWILIO_VIDEO_TOKEN_FUNCTION_URL=https://your-url.twil.io/video-token
 *
 * USAGE:
 * POST with JSON body: { "identity": "user-123", "roomName": "supervision-6" }
 * Or form-urlencoded: identity=user-123&roomName=supervision-6
 * Returns: { "token": "eyJ...", "roomName": "supervision-6" }
 *
 * If Function is Protected: caller must send X-Twilio-Signature header (backend does this automatically).
 */
const AccessToken = Twilio.jwt.AccessToken;
const VideoGrant = AccessToken.VideoGrant;

exports.handler = function (context, event, callback) {
  const apiKeySid = context.TWILIO_API_KEY_SID || context.API_KEY_SID;
  const apiKeySecret = context.TWILIO_API_KEY_SECRET || context.API_KEY_SECRET;
  const accountSid = context.ACCOUNT_SID;

  if (!apiKeySid || !apiKeySecret || !accountSid) {
    const err = new Twilio.Response();
    err.setStatusCode(500);
    err.setBody(JSON.stringify({ error: 'Missing TWILIO_API_KEY_SID or TWILIO_API_KEY_SECRET in Function config' }));
    err.appendHeader('Content-Type', 'application/json');
    return callback(null, err);
  }

  let identity = event.identity || event.Identity;
  let roomName = event.roomName || event.RoomName;
  if (event.body && typeof event.body === 'string') {
    try {
      const body = JSON.parse(event.body);
      identity = identity ?? body.identity;
      roomName = roomName ?? body.roomName;
    } catch (_) {}
  }
  identity = (identity || `user-${Date.now()}`).toString();
  roomName = (roomName || 'room-' + Date.now()).toString();

  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, { identity, ttl: 14400 });
  token.addGrant(new VideoGrant({ room: roomName }));

  const response = new Twilio.Response();
  response.setStatusCode(200);
  response.setBody(JSON.stringify({ token: token.toJwt(), roomName }));
  response.appendHeader('Content-Type', 'application/json');
  response.appendHeader('Access-Control-Allow-Origin', '*');
  return callback(null, response);
};
