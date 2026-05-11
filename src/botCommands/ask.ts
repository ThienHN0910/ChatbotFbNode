import type { BotCommandHandler } from '../commands.js';
import { buildKnowledgeContexts, buildSystemPrompt } from './shared.js';

export const askCommandHandler: BotCommandHandler = {
  name: 'ask',
  aliases: ['ask'],
  async handle(context) {
    const question = context.args.join(' ').trim();
    if (!question) {
      await context.send('Usage: /ask <question>');
      return;
    }

    try {
      const contexts = await buildKnowledgeContexts(context, question);
      const systemPrompt = buildSystemPrompt(contexts, question);
      const answer = await context.gemini.generateAnswer(systemPrompt, contexts, question);
      await context.send(answer);
    } catch (error) {
      context.logger.error('ask error', error);
      await context.send('Server Động đang bị lag, đợi anh em gank xong tí trả lời nhé!');
    }
  }
};