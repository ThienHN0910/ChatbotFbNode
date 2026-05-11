import type { BotCommandHandler } from '../commands.js';
import { resolveTimeZone } from './shared.js';

export const historyCommandHandler: BotCommandHandler = {
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