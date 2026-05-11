import type { BotCommandHandler } from '../commands.js';
import { getTimeGreeting, resolveTimeZone } from './shared.js';

export const timeCommandHandler: BotCommandHandler = {
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