const numeric = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
export function snowfallInches(value, unit = 'cm') {
  const amount = numeric(value);
  if (amount == null) return null;
  const factor = ({ cm: 1 / 2.54, mm: 1 / 25.4, m: 1 / 0.0254, inch: 1, inches: 1, in: 1 })[unit];
  return factor ? Number((Math.max(0, amount) * factor).toFixed(2)) : null;
}
const fahrenheit = (value, unit) => numeric(value) == null ? null : unit === '°C' ? numeric(value) * 9 / 5 + 32 : numeric(value);
export function normalizeWeatherForecast(data, days = 7, now = new Date()) {
  const daily = data.daily || {}, units = data.daily_units || {};
  const forecastDays = (daily.time || []).slice(0, days).map((date, index) => ({
    date, tempMaxF: fahrenheit(daily.temperature_2m_max?.[index], units.temperature_2m_max),
    tempMinF: fahrenheit(daily.temperature_2m_min?.[index], units.temperature_2m_min),
    snowfallInches: snowfallInches(daily.snowfall_sum?.[index], units.snowfall_sum || 'cm'),
    weatherCode: numeric(daily.weather_code?.[index]),
    precipitationProbability: numeric(daily.precipitation_probability_max?.[index])
  }));
  let today;
  try { today = new Intl.DateTimeFormat('en-CA', { timeZone: data.timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
  catch { today = now.toISOString().slice(0, 10); }
  const snowDays = forecastDays.filter(day => day.date >= today && Date.parse(day.date) < Date.parse(today) + 3 * 86400000 && day.snowfallInches > 0);
  return { forecastDays, timeZone: data.timezone || null,
    current: { temperatureF: fahrenheit(data.current?.temperature_2m, data.current_units?.temperature_2m), weatherCode: numeric(data.current?.weather_code) },
    snow: { snowLikelyNext72h: !!snowDays.length, nextSnowDate: snowDays[0]?.date || null,
      maxSnowInchesNext72h: Math.max(0, ...snowDays.map(day => day.snowfallInches)), precipProbAtNextSnow: snowDays[0]?.precipitationProbability ?? null }
  };
}
