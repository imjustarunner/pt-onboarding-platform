/**
 * Video webhooks — NOT CONFIGURED.
 * Video has been removed. These stubs keep existing route registrations intact.
 */

export const videoRoomStatusWebhook = (req, res) => {
  res.status(200).json({ ok: true });
};

export const videoCompositionStatusWebhook = (req, res) => {
  res.status(200).json({ ok: true });
};
