import axios from 'axios';

// Both weather surfaces and users near the same location share one upstream call.
// A provider outage must not replace a usable forecast or trigger a retry storm.
export function createWeatherForecastCache({ get = axios.get, now = Date.now } = {}) {
  const entries = new Map(), freshMs = 10 * 60_000, retryMs = 60_000, staleMs = 6 * 60 * 60_000;
  return async ({ latitude, longitude }) => {
    const key = `${Number(latitude).toFixed(3)}:${Number(longitude).toFixed(3)}`;
    let entry = entries.get(key);
    if (!entry) {
      entry = {};
      entries.set(key, entry);
      if (entries.size > 256) {
        const oldest = [...entries].find(([id, value]) => id !== key && !value.pending);
        if (oldest) entries.delete(oldest[0]);
      }
    }
    const result = () => ({ data: entry.data, fetchedAt: new Date(entry.at).toISOString(), stale: !!entry.failedAt });
    if (entry.data && now() - entry.at < freshMs && !entry.failedAt) return result();
    if (entry.pending) return entry.pending;
    if (entry.retryAt && now() < entry.retryAt) {
      if (entry.data && now() - entry.at < staleMs) return result();
      throw Object.assign(new Error('Weather provider temporarily unavailable'), { weatherUnavailable: true });
    }
    entry.pending = (async () => {
      try {
        const response = await get('https://api.open-meteo.com/v1/forecast', {
          params: { latitude, longitude, timezone: 'auto', forecast_days: 16, past_days: 6,
            temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch',
            current: 'temperature_2m,weather_code',
            daily: 'snowfall_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min,weather_code' },
          timeout: 15_000
        });
        if (!response.data?.daily?.time?.length) throw new Error('Weather provider returned no daily forecast');
        entry.data = response.data;
        entry.at = now();
        entry.failedAt = null;
        entry.retryAt = null;
        return result();
      } catch (error) {
        entry.failedAt = now();
        entry.retryAt = now() + retryMs;
        // Only operational status: no address, account, coordinates or provider body.
        console.warn('[weather] forecast unavailable', Number(error.response?.status) || error.code || 'invalid_response');
        if (entry.data && now() - entry.at < staleMs) return result();
        throw Object.assign(new Error('Weather provider temporarily unavailable'), { weatherUnavailable: true });
      } finally { entry.pending = null; }
    })();
    return entry.pending;
  };
}

export const cachedWeatherForecast = createWeatherForecastCache();
