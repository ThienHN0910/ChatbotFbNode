import type { BotCommandHandler } from '../commands.js';

export const meCommandHandler: BotCommandHandler = {
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