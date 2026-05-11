import { randomBytes } from 'node:crypto';

import jwt, { type JwtPayload } from 'jsonwebtoken';

import type { AppConfig, SessionUser } from '../types.js';

export class AuthService {
  constructor(private readonly config: AppConfig['auth']) {}

  buildGoogleAuthUrl(state: string): string {
    this.ensureGoogleConfigured();

    const params = new URLSearchParams({
      client_id: this.config.googleClientId,
      redirect_uri: this.config.oauthRedirect,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
      state
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCodeForAccessToken(code: string): Promise<string | null> {
    this.ensureGoogleConfigured();

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        code,
        client_id: this.config.googleClientId,
        client_secret: this.config.googleClientSecret,
        redirect_uri: this.config.oauthRedirect,
        grant_type: 'authorization_code'
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Google token exchange failed (${response.status}): ${errorBody}`);
      return null;
    }

    const payload = (await response.json()) as { access_token?: string };
    return typeof payload.access_token === 'string' ? payload.access_token : null;
  }

  async getGoogleUserInfo(accessToken: string): Promise<{ email: string | null; name: string | null }> {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo?alt=json', {
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Google userinfo failed (${response.status}): ${errorBody}`);
      return { email: null, name: null };
    }

    const payload = (await response.json()) as { email?: string; name?: string };
    return {
      email: typeof payload.email === 'string' ? payload.email : null,
      name: typeof payload.name === 'string' ? payload.name : null
    };
  }

  createSessionToken(email: string, role: string): string {
    return jwt.sign({ email, role }, this.config.sessionSecret, {
      algorithm: 'HS256',
      expiresIn: '7d'
    });
  }

  validateSessionToken(token: string | undefined): SessionUser | null {
    if (!token) {
      return null;
    }

    try {
      const payload = jwt.verify(token, this.config.sessionSecret) as JwtPayload & {
        email?: unknown;
        role?: unknown;
      };

      const email = typeof payload.email === 'string' ? payload.email : '';
      if (!email) {
        return null;
      }

      return {
        email,
        role: typeof payload.role === 'string' && payload.role.trim().length > 0 ? payload.role : 'user'
      };
    } catch {
      return null;
    }
  }

  static generateState(): string {
    return randomBytes(16).toString('hex');
  }

  private ensureGoogleConfigured(): void {
    if (!this.config.googleClientId || !this.config.googleClientSecret) {
      throw new Error('Google OAuth client settings are not configured.');
    }
  }
}
