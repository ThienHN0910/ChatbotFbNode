import type { BotCommandHandler } from '../commands.js';

export const uptimeCommandHandler: BotCommandHandler = {
  name: 'uptime',
  aliases: ['uptime', 'up'],
  async handle(context) {
    const totalSeconds = Math.floor(process.uptime());
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [
      days > 0 ? `${days}d` : '',
      `${hours}h`,
      `${minutes}m`,
      `${seconds}s`
    ].filter(Boolean);

    await context.send(`Bot đã chạy được: ${parts.join(' ')}`);
  }
};