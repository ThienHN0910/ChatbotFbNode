import type { BotCommandHandler } from '../commands.js';

export const pingCommandHandler: BotCommandHandler = {
  name: 'ping',
  aliases: ['ping'],
  async handle(context) {
    await context.send('Pong!');
  }
};