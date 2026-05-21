import type { AppConfig } from "../types.js";

export interface AskPlanningInput {
  question: string;
  recentMessages: string[];
  knowledgeMetadata: Array<{
    id: string;
    topic: string;
    keywords: string[];
  }>;
}

export interface AskPlanningResult {
  action: "answer" | "need_more_data";
  answer?: string;
  requiredKnowledgeIds: string[];
  requiredKnowledgeTopics: string[];
  reason?: string;
}

export class GeminiService {
  constructor(private readonly config: AppConfig["gemini"]) {}

  async planAskResponse(input: AskPlanningInput): Promise<AskPlanningResult> {
    if (!this.config.apiKey) {
      throw new Error("Gemini API key is not configured.");
    }

    const requestUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.config.model)}:generateContent?key=${encodeURIComponent(this.config.apiKey)}`;
    const recentMessagesBlock = input.recentMessages.length > 0
      ? input.recentMessages.map((message, index) => `${index + 1}. ${message}`).join("\n")
      : "Không có lịch sử gần đây.";
    const knowledgeMetadataBlock = input.knowledgeMetadata.length > 0
      ? input.knowledgeMetadata
        .map((item) => `- id: ${item.id} | topic: ${item.topic} | keywords: ${item.keywords.join(", ")}`)
        .join("\n")
      : "Không có dữ liệu knowledge base.";

    const plannerPrompt = [
      "Bạn là AI điều phối dữ liệu cho bot chat.",
      "Nhiệm vụ: dựa vào câu hỏi user + 3 tin nhắn gần nhất + metadata knowledge base để quyết định:",
      "1) Trả lời ngay nếu dữ liệu đã đủ.",
      "2) Hoặc yêu cầu thêm dữ liệu cụ thể từ knowledge base trước khi trả lời.",
      "", 
      "BẮT BUỘC trả về JSON hợp lệ, KHÔNG markdown, KHÔNG text thừa.",
      "Schema JSON:",
      "{",
      "  \"action\": \"answer\" | \"need_more_data\",",
      "  \"answer\": \"string (chỉ dùng khi action=answer)\",",
      "  \"requiredKnowledgeIds\": [\"id1\", \"id2\"],",
      "  \"requiredKnowledgeTopics\": [\"topic1\", \"topic2\"],",
      "  \"reason\": \"ngắn gọn\"",
      "}",
      "", 
      "Ràng buộc:",
      "- Nếu action=answer thì answer phải có nội dung hoàn chỉnh.",
      "- Nếu action=need_more_data thì ưu tiên điền requiredKnowledgeIds theo metadata đã có.",
      "- requiredKnowledgeIds tối đa 5 phần tử.",
      "- Nếu không chắc id, có thể dùng requiredKnowledgeTopics để gợi ý.",
      "", 
      `User hỏi: ${input.question}`,
      "", 
      "3 tin nhắn gần nhất:",
      recentMessagesBlock,
      "", 
      "Knowledge metadata:",
      knowledgeMetadataBlock
    ].join("\n");

    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: plannerPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          topP: 0.9,
          topK: 20,
          maxOutputTokens: 512,
          stopSequences: [],
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Gemini planner request failed (${response.status}): ${errorBody}`);
      throw new Error(`Gemini planner request failed (${response.status})`);
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

    const plannerRawText = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    const parsed = parsePlannerResponse(plannerRawText);
    if (parsed) {
      return parsed;
    }

    return {
      action: "need_more_data",
      requiredKnowledgeIds: [],
      requiredKnowledgeTopics: [],
      reason: "Planner response is not valid JSON."
    };
  }

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

function parsePlannerResponse(raw: string): AskPlanningResult | null {
  if (!raw) {
    return null;
  }

  const normalized = raw
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();

  try {
    const payload = JSON.parse(normalized) as {
      action?: string;
      answer?: string;
      requiredKnowledgeIds?: unknown;
      requiredKnowledgeTopics?: unknown;
      reason?: string;
    };

    const action = payload.action === "answer" ? "answer" : payload.action === "need_more_data" ? "need_more_data" : null;
    if (!action) {
      return null;
    }

    const requiredKnowledgeIds = normalizeStringArray(payload.requiredKnowledgeIds).slice(0, 5);
    const requiredKnowledgeTopics = normalizeStringArray(payload.requiredKnowledgeTopics).slice(0, 5);
    const answer = typeof payload.answer === "string" ? payload.answer.trim() : undefined;
    const reason = typeof payload.reason === "string" ? payload.reason.trim() : undefined;

    return {
      action,
      answer,
      requiredKnowledgeIds,
      requiredKnowledgeTopics,
      reason
    };
  } catch {
    return null;
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index);
}
