import type { BotCommandHandler } from '../commands.js';

export const memoryStatsCommandHandler: BotCommandHandler = {
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