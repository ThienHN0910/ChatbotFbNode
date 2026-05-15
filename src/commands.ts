import type { AppConfig } from './types.js';
import type { MongoDbContext } from './mongo.js';
import type { FacebookGraphService } from './services/facebookGraphService.js';
import type { GeminiService } from './services/geminiService.js';

import { askCommandHandler } from './botCommands/ask.js';
import { aboutCommandHandler } from './botCommands/about.js';
import { echoCommandHandler } from './botCommands/echo.js';
import { facebookLinksCommandHandler } from './botCommands/facebookLinks.js';
import { helpCommandHandler } from './botCommands/help.js';
import { historyCommandHandler } from './botCommands/history.js';
import { meCommandHandler } from './botCommands/me.js';
import { memoryStatsCommandHandler } from './botCommands/memoryStats.js';
import { pickCommandHandler } from './botCommands/pick.js';
import { pingCommandHandler } from './botCommands/ping.js';
import { randomCommandHandler } from './botCommands/random.js';
import { timeCommandHandler } from './botCommands/time.js';
import { topCommandHandler } from './botCommands/top.js';
import { uptimeCommandHandler } from './botCommands/uptime.js';
import { weatherCommandHandler } from './botCommands/weather.js';

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
  weatherOptions: AppConfig['openWeather'];
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
    aboutCommandHandler,
    echoCommandHandler,
    timeCommandHandler,
    pingCommandHandler,
    weatherCommandHandler,
    meCommandHandler,
    randomCommandHandler,
    pickCommandHandler,
    facebookLinksCommandHandler,
    memoryStatsCommandHandler,
    historyCommandHandler,
    topCommandHandler,
    uptimeCommandHandler
  ];
}

export function createDefaultBotCommandDispatcher(): BotCommandDispatcher {
  return new BotCommandDispatcher(createDefaultBotCommandHandlers());
}
