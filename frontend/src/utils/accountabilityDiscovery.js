// Discovery mirror of the deliberately fixed work-account policy. Server grants,
// company membership and record authorization remain mandatory on every request.
export const canDiscoverAccountability = userId => [501,507,538].includes(Number(userId));
