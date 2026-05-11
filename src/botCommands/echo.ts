import type { BotCommandHandler } from '../commands.js';

export const echoCommandHandler: BotCommandHandler = {
  name: 'echo',
  aliases: ['echo', 'say'],
  async handle(context) {
    const text = context.args.join(' ').trim();
    if (!text) {
      await context.send('Usage: /echo <text>');
      return;
    }

    await context.send(text.slice(0, 1000));
  }
};