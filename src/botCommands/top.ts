import type { BotCommandHandler } from '../commands.js';

export const topCommandHandler: BotCommandHandler = {
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