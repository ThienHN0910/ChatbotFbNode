import type { BotCommandHandler } from '../commands.js';

type WeatherUnits = 'standard' | 'metric' | 'imperial';

interface ParsedWeatherRequest {
  dayOffset: number;
  location: string;
}

interface GeoLocation {
  name: string;
  state?: string;
  country?: string;
  lat: number;
  lon: number;
}

interface CurrentWeatherResponse {
  main?: {
    temp?: number;
    humidity?: number;
  };
  wind?: {
    speed?: number;
  };
  weather?: Array<{
    description?: string;
  }>;
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
    //   const location = await geocodeLocation(request.location, options.apiKey);
    //   if (!location) {
    //     await context.send(`Không tìm thấy địa điểm: ${request.location}`);
    //     return;
    //   }

      if (request.dayOffset === 0) {
        const current = await fetchCurrentWeather(location, options.apiKey, options.units, options.language);
        await context.send(formatCurrentWeatherMessage(location, current, options.units));
        return;
      }

      const oneCall = await fetchOneCallDaily(location, options.apiKey, options.units, options.language);
      const dayForecast = oneCall.daily?.[request.dayOffset];
      if (!dayForecast) {
        await context.send('Không có dữ liệu dự báo cho ngày bạn yêu cầu. Thử giảm số ngày, ví dụ /weather 3 Hue');
        return;
      }

      await context.send(formatForecastMessage(location, request.dayOffset, dayForecast, options.units));
    } catch (error) {
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

async function geocodeLocation(query: string, apiKey: string): Promise<GeoLocation | null> {
  const requestUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=1&appid=${encodeURIComponent(apiKey)}`;
  const response = await fetch(requestUrl);
  if (!response.ok) {
    throw new Error(`OpenWeather geocode failed (${response.status})`);
  }

  const data = (await response.json()) as GeoLocation[];
  const first = data[0];
  if (!first) {
    return null;
  }

  return first;
}

async function fetchCurrentWeather(
  location: GeoLocation,
  apiKey: string,
  units: WeatherUnits,
  language: string
): Promise<CurrentWeatherResponse> {
  const requestUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${encodeURIComponent(String(location.lat))}&lon=${encodeURIComponent(String(location.lon))}&appid=${encodeURIComponent(apiKey)}&units=${encodeURIComponent(units)}&lang=${encodeURIComponent(language)}`;
  const response = await fetch(requestUrl);
  if (!response.ok) {
    throw new Error(`OpenWeather current weather failed (${response.status})`);
  }

  return (await response.json()) as CurrentWeatherResponse;
}

async function fetchOneCallDaily(
  location: GeoLocation,
  apiKey: string,
  units: WeatherUnits,
  language: string
): Promise<OneCallResponse> {
  const requestUrl = `https://api.openweathermap.org/data/3.0/onecall?lat=${encodeURIComponent(String(location.lat))}&lon=${encodeURIComponent(String(location.lon))}&appid=${encodeURIComponent(apiKey)}&units=${encodeURIComponent(units)}&lang=${encodeURIComponent(language)}&exclude=minutely,hourly,alerts,current`;
  const response = await fetch(requestUrl);
  if (!response.ok) {
    throw new Error(`OpenWeather onecall failed (${response.status})`);
  }

  return (await response.json()) as OneCallResponse;
}

function formatCurrentWeatherMessage(location: GeoLocation, data: CurrentWeatherResponse, units: WeatherUnits): string {
  const temp = formatTemperature(data.main?.temp, units);
  const humidity = Number.isFinite(data.main?.humidity) ? `${data.main?.humidity}%` : 'N/A';
  const wind = formatWind(data.wind?.speed, units);
  const desc = data.weather?.[0]?.description ?? 'không rõ';

  return [
    `Thời tiết hôm nay tại ${formatLocation(location)}:`,
    `- Mô tả: ${desc}`,
    `- Nhiệt độ: ${temp}`,
    `- Độ ẩm: ${humidity}`,
    `- Gió: ${wind}`
  ].join('\n');
}

function formatForecastMessage(
  location: GeoLocation,
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
  const desc = day.weather?.[0]?.description ?? 'không rõ';

  return [
    `Dự báo sau ${dayOffset} ngày tại ${formatLocation(location)} (${dateLabel}):`,
    `- Mô tả: ${desc}`,
    `- Nhiệt độ: ${tempDay} (thấp nhất ${tempMin}, cao nhất ${tempMax})`,
    `- Độ ẩm: ${humidity}`,
    `- Gió: ${wind}`
  ].join('\n');
}

function formatLocation(location: GeoLocation): string {
  return [location.name, location.state, location.country].filter(Boolean).join(', ');
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
