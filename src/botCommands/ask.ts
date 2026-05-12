import type { BotCommandHandler } from '../commands.js';
import type { MongoDbContext } from '../mongo.js';
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
      const recentMessages = await loadRecentAskMessages(context.senderId, context.mongo);
      const contexts = await buildKnowledgeContexts(context, question);
      const systemPrompt = buildSystemPrompt(contexts, question, recentMessages);
      context.logger.log('System Prompt:', systemPrompt);
      const answer = await context.gemini.generateAnswer(systemPrompt, contexts, question);
      context.logger.log('Generated Answer:', answer);
      await context.send(answer);
    } catch (error) {
      context.logger.error('ask error', error);
      await context.send('Server Động đang bị lag, đợi anh em gank xong tí trả lời nhé!');
    }
  }
};

async function loadRecentAskMessages(senderId: string, mongo: MongoDbContext): Promise<string[]> {
  if (!mongo.isConfigured) {
    return [];
  }

  const messages = await mongo.getMessagesCollection();
  const recentMessages = await messages
    .find({ senderId })
    .sort({ createdAt: -1 })
    .limit(3)
    .toArray();

  return recentMessages
    .reverse()
    .map((message) => message.text.trim())
    .filter(Boolean);
}