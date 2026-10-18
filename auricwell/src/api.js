export async function api(path, { method = "GET", body, signal, headers = {} } = {}) {
  const response = await fetch(`/api/auricwell${path}`, {
    method,
    credentials: "same-origin",
    signal,
    headers: { "Content-Type": "application/json", "X-AuricWell": "1", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.error?.message || "Request failed."), {
      status: response.status,
    });
  return data;
}
