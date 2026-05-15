import type { AppConfig } from './types.js';

export function loadConfig(): AppConfig {
  const sessionSecret = env('Auth__SessionSecret', 'change-me-in-prod');
  assertStrongSecret(sessionSecret, 'Auth__SessionSecret');

  return {
    port: parseInteger(env('PORT', '5000'), 5000),
    mongo: {
      connectionString: env('Mongo__ConnectionString', ''),
      databaseName: env('Mongo__DatabaseName', 'dne_chatbot')
    },
    facebook: {
      pageAccessToken: env('Facebook__PageAccessToken', ''),
      pageId: env('Facebook__PageId', ''),
      graphApiVersion: env('Facebook__GraphApiVersion', 'v19.0'),
      groupLink: env('Facebook__GroupLink', 'https://www.facebook.com/messages/t/6141393309283013'),
      pageLink: env('Facebook__PageLink', 'https://www.facebook.com/profile.php?id=61589654425540'),
      discordLink: env('Facebook__DiscordLink', 'https://discord.gg/zKumexN9p'),
      websiteLink: env('Facebook__WebsiteLink', ''),
      appSecret: env('Facebook__AppSecret', '')
    },
    gemini: {
      apiKey: env('Gemini__ApiKey', ''),
      model: env('Gemini__Model', 'gemini-3.1-flash-lite')
    },
    webhook: {
      verifyToken: env('Webhook__VerifyToken', '')
    },
    bot: {
      timeZoneId: env('Bot__TimeZoneId', 'Asia/Ho_Chi_Minh')
    },
    openWeather: {
      apiKey: env('OpenWeather__ApiKey', ''),
      defaultLocation: env('OpenWeather__DefaultLocation', 'Da Nang'),
      language: env('OpenWeather__Language', 'vi'),
      units: parseUnits(env('OpenWeather__Units', 'metric'))
    },
    auth: {
      googleClientId: env('Auth__GoogleClientId', ''),
      googleClientSecret: env('Auth__GoogleClientSecret', ''),
      oauthRedirect: env('Auth__OAuthRedirect', 'http://localhost:5000/api/auth/callback'),
      frontendBaseUrl: env('Auth__FrontendBaseUrl', 'http://localhost:5173'),
      sessionSecret
    }
  };
}

function env(name: string, defaultValue: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : defaultValue;
}

function parseInteger(value: string, defaultValue: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseUnits(value: string): 'standard' | 'metric' | 'imperial' {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'standard' || normalized === 'imperial') {
    return normalized;
  }

  return 'metric';
}

function assertStrongSecret(secret: string, name: string): void {
  const normalized = secret.trim();
  if (!normalized || normalized === 'change-me-in-prod' || normalized === 'change-me') {
    throw new Error(`${name} must be set to a strong non-default value before startup.`);
  }
}
