import type { BotCommandHandler } from '../commands.js';
import { randomIntInclusive } from './shared.js';

export const randomCommandHandler: BotCommandHandler = {
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