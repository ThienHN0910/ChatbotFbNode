import type { AppConfig } from './types.js';
import type { MongoDbContext } from './mongo.js';
import type { FacebookGraphService } from './services/facebookGraphService.js';
import type { GeminiService } from './services/geminiService.js';

export interface BotCommandContext {
  senderId: string;
  recipientId?: string | null;
  messageText: string;
  args: string[];
  mongo: MongoDbContext;
  facebook: FacebookGraphService;
  gemini: GeminiService;
  facebookOptions: AppConfig['facebook'];
  botOptions: AppConfig['bot'];
  logger: Pick<Console, 'log' | 'warn' | 'error'>;
  send(text: string): Promise<void>;
}

export interface BotCommandHandler {
  name: string;
  aliases: string[];
  handle(context: BotCommandContext): Promise<void>;
}

export class BotCommandDispatcher {
  private readonly handlersByAlias: ReadonlyMap<string, BotCommandHandler>;

  constructor(handlers: BotCommandHandler[]) {
    const handlersByAlias = new Map<string, BotCommandHandler>();
    for (const handler of handlers) {
      for (const alias of handler.aliases) {
        handlersByAlias.set(alias.toLowerCase(), handler);
      }
    }

    this.handlersByAlias = handlersByAlias;
  }

  async dispatch(command: string, args: string[], context: BotCommandContext): Promise<boolean> {
    if (!command || command.trim().length === 0) {
      return false;
    }

    const handler = this.handlersByAlias.get(command.toLowerCase());
    if (handler) {
      context.args = args;
      await handler.handle(context);
      return true;
    }

    await context.send('Lệnh không được hỗ trợ. Gõ /h để xem danh sách lệnh.');
    return true;
  }
}

export function createDefaultBotCommandHandlers(): BotCommandHandler[] {
  return [
    helpCommandHandler,
    askCommandHandler,
    timeCommandHandler,
    pingCommandHandler,
    meCommandHandler,
    randomCommandHandler,
    facebookLinksCommandHandler,
    memoryStatsCommandHandler,
    historyCommandHandler,
    topCommandHandler
  ];
}

export function createDefaultBotCommandDispatcher(): BotCommandDispatcher {
  return new BotCommandDispatcher(createDefaultBotCommandHandlers());
}

const helpCommandHandler: BotCommandHandler = {
  name: 'help',
  aliases: ['h', 'help'],
  async handle(context) {
    const helpLines = [
      '/ask <question> - Hỏi Gemini (RAG + AI)',
      '/time, /gio, /keo - Trả về giờ hệ thống (Asia/Ho_Chi_Minh)',
      '/ping - Kiểm tra độ trễ',
      '/fb, /link - Trả về links của Động',
      '/me - Hiển thị tên Facebook và ID của bạn',
      '/random - Tỉ lệ ngẫu nhiên (0-100%) hoặc /random <min> <max>',
      '/mem - Thống kê số người đã nhắn bot',
      '/top - Top gửi tin nhắn',
      '/history - Lịch sử 10 tin nhắn gần nhất',
      '/h, /help - Hiện trợ giúp'
    ];

    await context.send(helpLines.join('\n'));
  }
};

const askCommandHandler: BotCommandHandler = {
  name: 'ask',
  aliases: ['ask'],
  async handle(context) {
    const question = context.args.join(' ').trim();
    if (!question) {
      await context.send('Usage: /ask <question>');
      return;
    }

    try {
      const contexts = await buildKnowledgeContexts(context, question);
      const systemPrompt = buildSystemPrompt(contexts, question);
      const answer = await context.gemini.generateAnswer(systemPrompt, contexts, question);
      await context.send(answer);
    } catch (error) {
      context.logger.error('ask error', error);
      await context.send('Server Động đang bị lag, đợi anh em gank xong tí trả lời nhé!');
    }
  }
};

const timeCommandHandler: BotCommandHandler = {
  name: 'time',
  aliases: ['time', 'gio', 'keo'],
  async handle(context) {
    try {
      const timeZone = resolveTimeZone(context.botOptions.timeZoneId);
      const now = new Date();
      const timeFormatter = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      const hourFormatter = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        hour12: false
      });

      const currentHour = Number(hourFormatter.formatToParts(now).find((part) => part.type === 'hour')?.value ?? '0');
      const exclaim = getTimeGreeting(currentHour);
      const timeStr = timeFormatter.format(now);

      await context.send(`Bây giờ là ${timeStr}. ${exclaim}`.trim());
    } catch {
      await context.send('Không thể lấy thời gian hiện tại.');
    }
  }
};

const pingCommandHandler: BotCommandHandler = {
  name: 'ping',
  aliases: ['ping'],
  async handle(context) {
    await context.send('Pong!');
  }
};

const meCommandHandler: BotCommandHandler = {
  name: 'me',
  aliases: ['me'],
  async handle(context) {
    try {
      const name = await context.facebook.getUserName(context.senderId);
      await context.send(`Bạn là: ${name ?? 'Facebook user'}. ID của bạn: ${context.senderId}. Bạn đang ở trong Động Nghiện!`);
    } catch {
      await context.send('Không thể lấy thông tin người dùng.');
    }
  }
};

const randomCommandHandler: BotCommandHandler = {
  name: 'random',
  aliases: ['random'],
  async handle(context) {
    try {
      if (context.args.length >= 2) {
        const min = Number.parseInt(context.args[0] ?? '', 10);
        const max = Number.parseInt(context.args[1] ?? '', 10);

        if (Number.isFinite(min) && Number.isFinite(max)) {
          const lower = Math.min(min, max);
          const upper = Math.max(min, max);
          const value = randomIntInclusive(lower, upper);
          await context.send(`Random: ${value}`);
          return;
        }

        await context.send('Usage: /random <min> <max>');
        return;
      }

      const percentage = randomIntInclusive(0, 100);
      await context.send(`Tỉ lệ ngẫu nhiên: ${percentage}%`);
    } catch {
      await context.send('Lỗi khi sinh số ngẫu nhiên.');
    }
  }
};

const facebookLinksCommandHandler: BotCommandHandler = {
  name: 'fb',
  aliases: ['fb', 'link'],
  async handle(context) {
    const group = context.facebookOptions.groupLink?.trim() || 'https://www.facebook.com/messages/t/6141393309283013';
    const page = context.facebookOptions.pageLink?.trim() || 'https://www.facebook.com/profile.php?id=61589654425540';
    const discord = context.facebookOptions.discordLink?.trim() || 'https://discord.gg/zKumexN9p';
    const website = context.facebookOptions.websiteLink?.trim();

    const text = `Links:\nGroup: ${group}${website ? `\nWebsite: ${website}` : ''}\nPage: ${page}\nDiscord: ${discord}`;
    await context.send(text);
  }
};

const memoryStatsCommandHandler: BotCommandHandler = {
  name: 'mem',
  aliases: ['mem'],
  async handle(context) {
    try {
      if (!context.mongo.isConfigured) {
        await context.send('MongoDB chưa được cấu hình.');
        return;
      }

      const messages = await context.mongo.getMessagesCollection();
      const distinctSenderIds = await messages.distinct('senderId');
      await context.send(`Số thành viên đã từng nhắn cho bot: ${distinctSenderIds.length}`);
    } catch (error) {
      context.logger.error('mem error', error);
      await context.send('Lấy số thành viên thất bại.');
    }
  }
};

const historyCommandHandler: BotCommandHandler = {
  name: 'history',
  aliases: ['history'],
  async handle(context) {
    try {
      if (!context.mongo.isConfigured) {
        await context.send('MongoDB chưa được cấu hình.');
        return;
      }

      const messages = await context.mongo.getMessagesCollection();
      const history = await messages
        .find({ senderId: context.senderId })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray();

      if (history.length === 0) {
        await context.send('Không tìm thấy lịch sử nhắn tin của bạn.');
        return;
      }

      const vietnamTimeZone = resolveTimeZone('Asia/Ho_Chi_Minh');
      const timestampFormatter = new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: vietnamTimeZone
      });

      const lines = history.map((message) => {
        const shortText = message.text.slice(0, 200);
        return `${timestampFormatter.format(message.createdAt)}: ${shortText}`;
      });

      await context.send(`Lịch sử tin nhắn của bạn:\n${lines.join('\n')}`);
    } catch (error) {
      context.logger.error('history error', error);
      await context.send('Lấy lịch sử thất bại.');
    }
  }
};

const topCommandHandler: BotCommandHandler = {
  name: 'top',
  aliases: ['top'],
  async handle(context) {
    try {
      if (!context.mongo.isConfigured) {
        await context.send('MongoDB chưa được cấu hình.');
        return;
      }

      const messages = await context.mongo.getMessagesCollection();
      const results = await messages
        .aggregate<{ _id: string; count: number; name?: string | null }>([
          {
            $group: {
              _id: '$senderId',
              count: { $sum: 1 },
              name: { $first: '$senderName' }
            }
          },
          {
            $sort: { count: -1 }
          },
          {
            $limit: 10
          }
        ])
        .toArray();

      if (results.length === 0) {
        await context.send('Chưa có dữ liệu thống kê.');
        return;
      }

      const lines = results.map((item, index) => {
        const name = item.name?.trim() || item._id;
        return `${index + 1}. ${name}: ${item.count} tin nhắn`;
      });

      await context.send(`Top gửi tin nhắn:\n${lines.join('\n')}`);
    } catch (error) {
      context.logger.error('top error', error);
      await context.send('Lấy top thất bại.');
    }
  }
};

async function buildKnowledgeContexts(context: BotCommandContext, question: string): Promise<string[]> {
  if (!context.mongo.isConfigured) {
    return [];
  }

  const tokens = Array.from(question.toLowerCase().matchAll(/[\p{L}\p{N}_]+/gu), (match) => match[0]).filter(Boolean).slice(0, 10);
  const collection = await context.mongo.getKnowledgeCollection();

  if (tokens.length > 0) {
    const keywordMatches = await collection.find({ keywords: { $in: tokens } }).limit(5).toArray();
    if (keywordMatches.length > 0) {
      return keywordMatches.map((document) => `${document.topic}\n${document.content}`);
    }
  }

  const escaped = escapeRegExp(question);
  const regex = new RegExp(escaped, 'i');
  const regexMatches = await collection.find({ $or: [{ topic: regex }, { content: regex }] }).limit(3).toArray();
  return regexMatches.map((document) => `${document.topic}\n${document.content}`);
}

function buildSystemPrompt(contexts: string[], question: string): string {
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

function resolveTimeZone(timeZoneId: string): string {
  const trimmed = timeZoneId.trim();
  if (!trimmed) {
    return 'Asia/Ho_Chi_Minh';
  }

  if (trimmed.toLowerCase() === 'se asia standard time') {
    return 'Asia/Ho_Chi_Minh';
  }

  return trimmed;
}

function getTimeGreeting(hour: number): string {
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

function randomIntInclusive(min: number, max: number): number {
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
