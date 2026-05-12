import type { AppConfig } from "../types.js";

export class GeminiService {
  constructor(private readonly config: AppConfig["gemini"]) {}

  async generateAnswer(
    systemPrompt: string,
    contexts: string[],
    question: string,
  ): Promise<string> {
    if (!this.config.apiKey) {
      throw new Error("Gemini API key is not configured.");
    }

    const prompt = `${systemPrompt}\n\nContext:\n${contexts.length > 0 ? contexts.join("\n\n---\n\n") : "Không có dữ liệu liên quan."}\n\nUser: ${question}\n\nTrả lời:`;
    const requestUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.config.model)}:generateContent?key=${encodeURIComponent(this.config.apiKey)}`;

    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          // Tăng lên để Bot chém gió lầy lội, hài hước và dù
          // ng từ ngữ game thủ đa dạng hơn
          temperature: 0.85,

          // Giúp Bot chọn từ ngữ sắc bén hơn, tránh bị lặp từ
          topP: 0.95,
          topK: 40,

          // 1024 là quá đủ (khoảng 700-800 chữ tiếng Việt), giữ nguyên
          maxOutputTokens: 1024,

          // Để trống là đúng, tránh bị dừng đột ngột
          stopSequences: [],
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Gemini request failed (${response.status}): ${errorBody}`);
      throw new Error(`Gemini request failed (${response.status})`);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{
        finishReason?: string;
        content?: {
          parts?: Array<{
            text?: string;
          }>;
        };
      }>;
    };

    console.log(
      "Gemini finishReason:",
      payload.candidates?.[0]?.finishReason ?? "unknown",
    );

    const answer = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (answer) {
      return answer;
    }

    return "Trùm Động chưa biết trả lời câu này, thử hỏi khác đi nhé 🎮";
  }
}
