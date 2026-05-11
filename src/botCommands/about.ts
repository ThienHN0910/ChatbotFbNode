import type { BotCommandHandler } from '../commands.js';

export const aboutCommandHandler: BotCommandHandler = {
  name: 'about',
  aliases: ['about', 'info'],
  async handle(context) {
    const statusBits = [
      `Service: BotFacebook.Node`,
      `Mongo: ${context.mongo.isConfigured ? 'ready' : 'not configured'}`,
      `Facebook: ${context.facebookOptions.pageAccessToken ? 'ready' : 'missing token'}`,
      `Gemini: service wired`,
      `Time zone: ${context.botOptions.timeZoneId || 'Asia/Ho_Chi_Minh'}`
    ];

    await context.send(statusBits.join('\n'));
  }
};