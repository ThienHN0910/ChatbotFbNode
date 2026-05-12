import type { BotCommandContext } from '../commands.js';

export async function buildKnowledgeContexts(context: BotCommandContext, question: string): Promise<string[]> {
  if (!context.mongo.isConfigured) {
    return [];
  }

  const tokens = Array.from(question.matchAll(/[\p{L}\p{N}_]+/gu), (match) => match[0].trim().toLowerCase())
    .filter(Boolean)
    .filter((token, index, all) => all.indexOf(token) === index)
    .slice(0, 10);
  const collection = await context.mongo.getKnowledgeCollection();

  if (tokens.length > 0) {
    const keywordMatches = await collection
      .find({
        $or: tokens.map((token) => ({ keywords: new RegExp(`^${escapeRegExp(token)}$`, 'i') }))
      })
      .limit(5)
      .toArray();
    if (keywordMatches.length > 0) {
      return uniqueContexts(keywordMatches.map((document) => `${document.topic}\n${document.content}`));
    }
  }

  if (tokens.length > 0) {
    const tokenMatches = await collection
      .find({
        $or: tokens.flatMap((token) => [
          { topic: new RegExp(escapeRegExp(token), 'i') },
          { content: new RegExp(escapeRegExp(token), 'i') },
          { keywords: new RegExp(escapeRegExp(token), 'i') }
        ])
      })
      .limit(5)
      .toArray();

    if (tokenMatches.length > 0) {
      return uniqueContexts(tokenMatches.map((document) => `${document.topic}\n${document.content}`));
    }
  }

  const escaped = escapeRegExp(question.trim());
  const regex = new RegExp(escaped, 'i');
  const regexMatches = await collection.find({ $or: [{ topic: regex }, { content: regex }, { keywords: regex }] }).limit(3).toArray();
  return uniqueContexts(regexMatches.map((document) => `${document.topic}\n${document.content}`));
}

export function buildSystemPrompt(contexts: string[], question: string): string {
  return [
    'Bạn là Trùm Động, đại diện DNE (Động Nghiệp Esport).',
    'Gọi người dùng là Nghiện hữu hoặc Anh em.',
    'Trả lời lầy lội, dùng từ ngữ game thủ, hài hước.',
    'Dựa vào dữ liệu sau để trả lời:',
    contexts.length > 0 ? contexts.join('\n\n---\n\n') : 'Không có dữ liệu liên quan.',
    '',
    `User hỏi: ${question}`,
    'Trả lời:'
  ].join('\n');
}

export function resolveTimeZone(timeZoneId: string): string {
  const trimmed = timeZoneId.trim();
  if (!trimmed) {
    return 'Asia/Ho_Chi_Minh';
  }

  if (trimmed.toLowerCase() === 'se asia standard time') {
    return 'Asia/Ho_Chi_Minh';
  }

  return trimmed;
}

export function getTimeGreeting(hour: number): string {
  if (hour >= 0 && hour < 5) {
    return 'Ngủ đi các con nghiện.';
  }

  if (hour >= 5 && hour < 7) {
    return 'Sáng rồi, cà phê rồi leo rank.';
  }

  if (hour >= 7 && hour < 10) {
    return 'Dậy leo rank thôi!';
  }

  if (hour === 12) {
    return 'Trưa rồi, ăn tí rồi gank tiếp.';
  }

  if (hour >= 18 && hour < 22) {
    return 'Tối rồi, chuẩn bị combat.';
  }

  return '';
}

export function randomIntInclusive(min: number, max: number): number {
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueContexts(contexts: string[]): string[] {
  return contexts.filter((context, index, all) => all.indexOf(context) === index);
}