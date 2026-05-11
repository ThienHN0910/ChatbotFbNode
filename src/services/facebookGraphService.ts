import type { AppConfig } from '../types.js';

export class FacebookGraphService {
  private cachedPageId: string | null = null;
  private pageIdPromise: Promise<string | null> | null = null;

  constructor(private readonly config: AppConfig['facebook']) {}

  async sendTextMessage(psid: string, text: string): Promise<void> {
    this.ensureConfigured();

    const requestUrl = `https://graph.facebook.com/${this.config.graphApiVersion}/me/messages?access_token=${encodeURIComponent(this.config.pageAccessToken)}`;
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        messaging_type: 'RESPONSE',
        recipient: { id: psid },
        message: { text }
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Facebook send message failed (${response.status}): ${errorBody}`);
      throw new Error(`Facebook send message failed (${response.status})`);
    }
  }

  async getUserName(psid: string): Promise<string | null> {
    if (!this.config.pageAccessToken) {
      return null;
    }

    const requestUrl = `https://graph.facebook.com/${this.config.graphApiVersion}/${psid}?fields=name&access_token=${encodeURIComponent(this.config.pageAccessToken)}`;

    try {
      const response = await fetch(requestUrl);
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as { name?: string };
      return typeof payload.name === 'string' ? payload.name : null;
    } catch (error) {
      console.warn(`Failed to fetch Facebook user name for ${psid}:`, error);
      return null;
    }
  }

  async getPageId(): Promise<string | null> {
    if (this.config.pageId.trim().length > 0) {
      return this.config.pageId;
    }

    if (!this.config.pageAccessToken) {
      return null;
    }

    if (this.cachedPageId) {
      return this.cachedPageId;
    }

    if (!this.pageIdPromise) {
      this.pageIdPromise = this.fetchPageId();
    }

    try {
      return await this.pageIdPromise;
    } finally {
      this.pageIdPromise = null;
    }
  }

  private async fetchPageId(): Promise<string | null> {
    const requestUrl = `https://graph.facebook.com/${this.config.graphApiVersion}/me?access_token=${encodeURIComponent(this.config.pageAccessToken)}`;
    try {
      const response = await fetch(requestUrl);
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as { id?: string };
      this.cachedPageId = typeof payload.id === 'string' ? payload.id : null;
      return this.cachedPageId;
    } catch (error) {
      console.warn('Failed to fetch Facebook page id:', error);
      return null;
    }
  }

  private ensureConfigured(): void {
    if (!this.config.pageAccessToken) {
      throw new Error('Facebook page access token is not configured.');
    }
  }
}
