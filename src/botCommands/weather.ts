import type { BotCommandHandler } from '../commands.js';

type WeatherUnits = 'standard' | 'metric' | 'imperial';

interface ParsedWeatherRequest {
  dayOffset: number;
  location: string;
}

interface CurrentWeatherResponse {
  name?: string;
  sys?: {
    country?: string;
  };
  main?: {
    temp?: number;
    feels_like?: number;
    humidity?: number;
  };
  wind?: {
    speed?: number;
  };
  weather?: Array<{
    description?: string;
  }>;
  rain?: {
    '1h'?: number;
  };
}

interface ForecastListItem {
  dt?: number;
  main?: {
    temp?: number;
    temp_min?: number;
    temp_max?: number;
    feels_like?: number;
    humidity?: number;
  };
  weather?: Array<{
    description?: string;
  }>;
  wind?: {
    speed?: number;
  };
  pop?: number;
  rain?: {
    '3h'?: number;
  };
}

interface ForecastResponse {
  list?: ForecastListItem[];
  city?: {
    name?: string;
    country?: string;
    timezone?: number;
  };
}

interface DailyForecastSummary {
  dt?: number;
  temp?: number;
  tempMin?: number;
  tempMax?: number;
  feelsLike?: number;
  humidity?: number;
  windSpeed?: number;
  description?: string;
  pop?: number;
  rain3h?: number;
}

export const weatherCommandHandler: BotCommandHandler = {
  name: 'weather',
  aliases: ['weather'],
  async handle(context) {
    const options = context.weatherOptions;
    if (!options.apiKey) {
      await context.send('Chưa cấu hình OpenWeather API key. Vui lòng đặt OpenWeather__ApiKey trong .env');
      return;
    }

    const request = parseWeatherArgs(context.args, options.defaultLocation);
    if (request.dayOffset > 5) {
      await context.send('Hiện tại chỉ hỗ trợ xem tối đa 5 ngày tới. Ví dụ: /weather 5 Hue');
      return;
    }

    try {
      const current = await fetchCurrentWeather(request.location, options.apiKey, options.units, options.language);
      const locationLabel = formatLocationFromCurrent(current, request.location);

      if (request.dayOffset === 0) {
        await context.send(formatCurrentWeatherMessage(locationLabel, current, options.units));
        return;
      }

      const forecast = await fetchFiveDayForecast(request.location, options.apiKey, options.units, options.language);
      const dayForecast = getDailyForecastSummary(forecast, request.dayOffset);
      if (!dayForecast) {
        await context.send('Không có dữ liệu dự báo cho ngày bạn yêu cầu. Thử giảm số ngày, ví dụ /weather 3 Hue');
        return;
      }

      const forecastLocation = formatLocationFromForecast(forecast, locationLabel);
      await context.send(formatForecastMessage(forecastLocation, request.dayOffset, dayForecast, options.units));
    } catch (error) {
      if (error instanceof OpenWeatherHttpError && error.status === 404) {
        await context.send(`Không tìm thấy địa điểm: ${request.location}`);
        return;
      }

      context.logger.error('weather error', error);
      await context.send('Không lấy được dữ liệu thời tiết lúc này, bạn thử lại sau nhé.');
    }
  }
};

function parseWeatherArgs(args: string[], defaultLocation: string): ParsedWeatherRequest {
  if (args.length === 0) {
    return { dayOffset: 0, location: defaultLocation };
  }

  const first = args[0] ?? '';
  if (/^\d+$/u.test(first)) {
    const parsed = Number.parseInt(first, 10);
    const location = args.slice(1).join(' ').trim();
    return {
      dayOffset: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
      location: location.length > 0 ? location : defaultLocation
    };
  }

  return {
    dayOffset: 0,
    location: args.join(' ').trim() || defaultLocation
  };
}

async function fetchCurrentWeather(
  locationQuery: string,
  apiKey: string,
  units: WeatherUnits,
  language: string
): Promise<CurrentWeatherResponse> {
  const requestUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(locationQuery)}&appid=${encodeURIComponent(apiKey)}&units=${encodeURIComponent(units)}&lang=${encodeURIComponent(language)}`;
  const response = await fetch(requestUrl);
  if (!response.ok) {
    throw new OpenWeatherHttpError(`OpenWeather current weather failed (${response.status})`, response.status);
  }

  return (await response.json()) as CurrentWeatherResponse;
}

async function fetchFiveDayForecast(
  locationQuery: string,
  apiKey: string,
  units: WeatherUnits,
  language: string
): Promise<ForecastResponse> {
  const requestUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(locationQuery)}&appid=${encodeURIComponent(apiKey)}&units=${encodeURIComponent(units)}&lang=${encodeURIComponent(language)}`;
  const response = await fetch(requestUrl);
  if (!response.ok) {
    throw new OpenWeatherHttpError(`OpenWeather forecast failed (${response.status})`, response.status);
  }

  return (await response.json()) as ForecastResponse;
}

function formatCurrentWeatherMessage(locationLabel: string, data: CurrentWeatherResponse, units: WeatherUnits): string {
  const temp = formatTemperature(data.main?.temp, units);
  const feelsLike = formatTemperature(data.main?.feels_like, units);
  const humidity = Number.isFinite(data.main?.humidity) ? `${data.main?.humidity}%` : 'N/A';
  const wind = formatWind(data.wind?.speed, units);
  const desc = sentenceCase(data.weather?.[0]?.description ?? 'không rõ');
  const rain1h = Number.isFinite(data.rain?.['1h']) ? `${(data.rain?.['1h'] as number).toFixed(2)} mm` : null;

  const lines = [
    `Thời tiết hôm nay tại ${locationLabel}:`,
    `- Mô tả: ${desc}`,
    `- Nhiệt độ: ${temp}`,
    `- Cảm giác như: ${feelsLike}`,
    `- Độ ẩm: ${humidity}`,
    `- Gió: ${wind}`
  ];

  if (rain1h) {
    lines.push(`- Lượng mưa 1h: ${rain1h}`);
  }

  return lines.join('\n');
}

function formatForecastMessage(
  locationLabel: string,
  dayOffset: number,
  day: DailyForecastSummary,
  units: WeatherUnits
): string {
  const dateLabel = formatDate(day.dt);
  const temp = formatTemperature(day.temp, units);
  const tempMin = formatTemperature(day.tempMin, units);
  const tempMax = formatTemperature(day.tempMax, units);
  const feelsLike = formatTemperature(day.feelsLike, units);
  const humidity = Number.isFinite(day.humidity) ? `${day.humidity}%` : 'N/A';
  const wind = formatWind(day.windSpeed, units);
  const desc = sentenceCase(day.description ?? 'không rõ');
  const rainChance = Number.isFinite(day.pop) ? `${Math.round((day.pop as number) * 100)}%` : 'N/A';
  const rain3h = Number.isFinite(day.rain3h) ? `${(day.rain3h as number).toFixed(2)} mm` : null;

  const lines = [
    `Dự báo sau ${dayOffset} ngày tại ${locationLabel} (${dateLabel}):`,
    `- Mô tả: ${desc}`,
    `- Nhiệt độ: ${temp} (thấp nhất ${tempMin}, cao nhất ${tempMax})`,
    `- Cảm giác như: ${feelsLike}`,
    `- Độ ẩm: ${humidity}`,
    `- Gió: ${wind}`,
    `- Xác suất mưa: ${rainChance}`
  ];

  if (rain3h) {
    lines.push(`- Lượng mưa 3h: ${rain3h}`);
  }

  return lines.join('\n');
}

function getDailyForecastSummary(forecast: ForecastResponse, dayOffset: number): DailyForecastSummary | null {
  const items = forecast.list ?? [];
  if (items.length === 0) {
    return null;
  }

  const timezoneOffsetSeconds = forecast.city?.timezone ?? 0;
  const nowUnix = Math.floor(Date.now() / 1000);
  const targetDateKey = toDateKey(nowUnix + dayOffset * 86400, timezoneOffsetSeconds);
  const sameDayItems = items.filter((item) => {
    if (!Number.isFinite(item.dt)) {
      return false;
    }

    return toDateKey(item.dt as number, timezoneOffsetSeconds) === targetDateKey;
  });

  if (sameDayItems.length === 0) {
    return null;
  }

  const representative = pickClosestToNoon(sameDayItems, timezoneOffsetSeconds);
  const tempValues = sameDayItems
    .flatMap((item) => [item.main?.temp_min, item.main?.temp_max, item.main?.temp])
    .filter((value): value is number => Number.isFinite(value));

  return {
    dt: representative.dt,
    temp: representative.main?.temp,
    tempMin: tempValues.length > 0 ? Math.min(...tempValues) : undefined,
    tempMax: tempValues.length > 0 ? Math.max(...tempValues) : undefined,
    feelsLike: representative.main?.feels_like,
    humidity: representative.main?.humidity,
    windSpeed: representative.wind?.speed,
    description: representative.weather?.[0]?.description,
    pop: representative.pop,
    rain3h: representative.rain?.['3h']
  };
}

function pickClosestToNoon(items: ForecastListItem[], timezoneOffsetSeconds: number): ForecastListItem {
  return items.reduce((best, current) => {
    const bestHourDistance = Math.abs(getLocalHour(best.dt, timezoneOffsetSeconds) - 12);
    const currentHourDistance = Math.abs(getLocalHour(current.dt, timezoneOffsetSeconds) - 12);
    return currentHourDistance < bestHourDistance ? current : best;
  });
}

function getLocalHour(unixSeconds: number | undefined, timezoneOffsetSeconds: number): number {
  if (!Number.isFinite(unixSeconds)) {
    return 24;
  }

  return new Date(((unixSeconds as number) + timezoneOffsetSeconds) * 1000).getUTCHours();
}

function toDateKey(unixSeconds: number, timezoneOffsetSeconds: number): string {
  return new Date((unixSeconds + timezoneOffsetSeconds) * 1000).toISOString().slice(0, 10);
}

function formatLocationFromCurrent(current: CurrentWeatherResponse, fallback: string): string {
  const city = current.name?.trim();
  const country = current.sys?.country?.trim();
  const composed = [city, country].filter(Boolean).join(', ');
  return composed.length > 0 ? composed : fallback;
}

function formatLocationFromForecast(forecast: ForecastResponse, fallback: string): string {
  const city = forecast.city?.name?.trim();
  const country = forecast.city?.country?.trim();
  const composed = [city, country].filter(Boolean).join(', ');
  return composed.length > 0 ? composed : fallback;
}

function formatDate(unixSeconds: number | undefined): string {
  if (!Number.isFinite(unixSeconds)) {
    return 'N/A';
  }

  return new Date((unixSeconds as number) * 1000).toLocaleDateString('vi-VN');
}

function formatTemperature(value: number | undefined, units: WeatherUnits): string {
  if (!Number.isFinite(value)) {
    return 'N/A';
  }

  const symbol = units === 'imperial' ? 'F' : units === 'standard' ? 'K' : 'C';
  return `${Math.round(value as number)}°${symbol}`;
}

function formatWind(value: number | undefined, units: WeatherUnits): string {
  if (!Number.isFinite(value)) {
    return 'N/A';
  }

  const normalized = value as number;
  const suffix = units === 'imperial' ? 'mph' : 'm/s';
  return `${normalized.toFixed(1)} ${suffix}`;
}

function sentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Không rõ';
  }

  return `${trimmed[0].toUpperCase()}${trimmed.slice(1)}`;
}

class OpenWeatherHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'OpenWeatherHttpError';
  }
}
