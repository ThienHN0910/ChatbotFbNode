import type { BotCommandHandler } from '../commands.js';

type WeatherUnits = 'standard' | 'metric' | 'imperial';

interface ParsedWeatherRequest {
  dayOffset: number;
  location: string;
}

interface CurrentWeatherResponse {
  coord?: {
    lat?: number;
    lon?: number;
  };
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

interface OneCallResponse {
  daily?: Array<{
    dt?: number;
    temp?: {
      day?: number;
      min?: number;
      max?: number;
    };
    humidity?: number;
    wind_speed?: number;
    weather?: Array<{
      description?: string;
    }>;
  }>;
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
    if (request.dayOffset > 7) {
      await context.send('Hiện tại chỉ hỗ trợ xem tối đa 7 ngày tới. Ví dụ: /weather 7 Hue');
      return;
    }

    try {
      const current = await fetchCurrentWeather(request.location, options.apiKey, options.units, options.language);
      const locationLabel = formatLocationFromCurrent(current, request.location);

      if (request.dayOffset === 0) {
        await context.send(formatCurrentWeatherMessage(locationLabel, current, options.units));
        return;
      }

      const latitude = current.coord?.lat;
      const longitude = current.coord?.lon;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        await context.send(`Không tìm thấy địa điểm: ${request.location}`);
        return;
      }

      const oneCall = await fetchOneCallDaily(latitude as number, longitude as number, options.apiKey, options.units, options.language);
      const dayForecast = oneCall.daily?.[request.dayOffset];
      if (!dayForecast) {
        await context.send('Không có dữ liệu dự báo cho ngày bạn yêu cầu. Thử giảm số ngày, ví dụ /weather 3 Hue');
        return;
      }

      await context.send(formatForecastMessage(locationLabel, request.dayOffset, dayForecast, options.units));
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

async function fetchOneCallDaily(
  latitude: number,
  longitude: number,
  apiKey: string,
  units: WeatherUnits,
  language: string
): Promise<OneCallResponse> {
  const requestUrl = `https://api.openweathermap.org/data/3.0/onecall?lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}&appid=${encodeURIComponent(apiKey)}&units=${encodeURIComponent(units)}&lang=${encodeURIComponent(language)}&exclude=minutely,hourly,alerts,current`;
  const response = await fetch(requestUrl);
  if (!response.ok) {
    throw new OpenWeatherHttpError(`OpenWeather onecall failed (${response.status})`, response.status);
  }

  return (await response.json()) as OneCallResponse;
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
  day: NonNullable<OneCallResponse['daily']>[number],
  units: WeatherUnits
): string {
  const dateLabel = formatDate(day.dt);
  const tempDay = formatTemperature(day.temp?.day, units);
  const tempMin = formatTemperature(day.temp?.min, units);
  const tempMax = formatTemperature(day.temp?.max, units);
  const humidity = Number.isFinite(day.humidity) ? `${day.humidity}%` : 'N/A';
  const wind = formatWind(day.wind_speed, units);
  const desc = sentenceCase(day.weather?.[0]?.description ?? 'không rõ');

  return [
    `Dự báo sau ${dayOffset} ngày tại ${locationLabel} (${dateLabel}):`,
    `- Mô tả: ${desc}`,
    `- Nhiệt độ: ${tempDay} (thấp nhất ${tempMin}, cao nhất ${tempMax})`,
    `- Độ ẩm: ${humidity}`,
    `- Gió: ${wind}`
  ].join('\n');
}

function formatLocationFromCurrent(current: CurrentWeatherResponse, fallback: string): string {
  const city = current.name?.trim();
  const country = current.sys?.country?.trim();
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
