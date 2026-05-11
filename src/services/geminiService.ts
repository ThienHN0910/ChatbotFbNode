import type { AppConfig } from '../types.js';

export class GeminiService {
  constructor(private readonly config: AppConfig['gemini']) {}

  async generateAnswer(systemPrompt: string, contexts: string[], question: string): Promise<string> {
    if (!this.config.apiKey) {
      throw new Error('Gemini API key is not configured.');
    }

    const prompt = `${systemPrompt}\n\nContext:\n${contexts.length > 0 ? contexts.join('\n\n---\n\n') : 'Không có dữ liệu liên quan.'}\n\nUser: ${question}\n\nTrả lời:`;
    const requestUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.config.model)}:generateContent?key=${encodeURIComponent(this.config.apiKey)}`;

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 512
        }
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Gemini request failed (${response.status}): ${errorBody}`);
      throw new Error(`Gemini request failed (${response.status})`);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
          }>;
        };
      }>;
    };

    const answer = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (answer) {
      return answer;
    }

    return 'Trùm Động chưa biết trả lời câu này, thử hỏi khác đi nhé 🎮';
  }
}
