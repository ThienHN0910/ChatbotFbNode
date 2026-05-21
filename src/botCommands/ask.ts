import type { BotCommandHandler } from '../commands.js';
import type { MongoDbContext } from '../mongo.js';
import { ObjectId } from 'mongodb';

import { buildSystemPrompt, escapeRegExp } from './shared.js';

interface KnowledgeMetadata {
  id: string;
  topic: string;
  keywords: string[];
}

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
      await context.facebook.sendTextMessage(
        context.senderId,
        'Anh em chờ tí nhé, AI đang tìm tài liệu phù hợp...'
      );

      const recentMessages = await loadRecentAskMessages(context.senderId, context.mongo);
      const knowledgeMetadata = await loadKnowledgeMetadata(context.mongo, question);
      const plannerResult = await context.gemini.planAskResponse({
        question,
        recentMessages,
        knowledgeMetadata
      });

      if (plannerResult.action === 'answer' && plannerResult.answer) {
        await context.send(plannerResult.answer);
        return;
      }

      const requestedKnowledgeIds = resolveRequestedKnowledgeIds(plannerResult, knowledgeMetadata);
      const contexts = await loadKnowledgeContextsByIds(context.mongo, requestedKnowledgeIds);
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

async function loadKnowledgeMetadata(mongo: MongoDbContext, question: string): Promise<KnowledgeMetadata[]> {
  if (!mongo.isConfigured) {
    return [];
  }

  const collection = await mongo.getKnowledgeCollection();
  const tokens = Array.from(question.matchAll(/[\p{L}\p{N}_]+/gu), (match) => match[0].trim().toLowerCase())
    .filter(Boolean)
    .filter((token, index, all) => all.indexOf(token) === index)
    .slice(0, 10);
  const results: KnowledgeMetadata[] = [];
  const seenIds = new Set<string>();

  const appendDocuments = (
    documents: Array<{ _id?: ObjectId; topic?: string; keywords?: string[] }>
  ): void => {
    for (const document of documents) {
      if (!document._id || !document.topic) {
        continue;
      }

      const id = document._id.toHexString();
      if (seenIds.has(id)) {
        continue;
      }

      seenIds.add(id);
      results.push({
        id,
        topic: document.topic,
        keywords: Array.isArray(document.keywords) ? document.keywords.filter(Boolean).slice(0, 10) : []
      });

      if (results.length >= 12) {
        break;
      }
    }
  };

  if (tokens.length > 0) {
    const keywordMatches = await collection
      .find({
        $or: tokens.map((token) => ({ keywords: new RegExp(`^${escapeRegExp(token)}$`, 'i') }))
      })
      .limit(12)
      .toArray();
    appendDocuments(keywordMatches);
  }

  if (tokens.length > 0 && results.length < 12) {
    const tokenMatches = await collection
      .find({
        $or: tokens.flatMap((token) => [
          { topic: new RegExp(escapeRegExp(token), 'i') },
          { content: new RegExp(escapeRegExp(token), 'i') },
          { keywords: new RegExp(escapeRegExp(token), 'i') }
        ])
      })
      .limit(12)
      .toArray();
    appendDocuments(tokenMatches);
  }

  if (results.length < 12) {
    const regex = new RegExp(escapeRegExp(question.trim()), 'i');
    const regexMatches = await collection
      .find({ $or: [{ topic: regex }, { content: regex }, { keywords: regex }] })
      .limit(12)
      .toArray();
    appendDocuments(regexMatches);
  }

  if (results.length < 12) {
    const latestDocuments = await collection
      .find({})
      .sort({ updatedAt: -1 })
      .limit(12)
      .toArray();
    appendDocuments(latestDocuments);
  }

  return results.slice(0, 12);
}

function resolveRequestedKnowledgeIds(
  plannerResult: {
    requiredKnowledgeIds: string[];
    requiredKnowledgeTopics: string[];
  },
  metadata: KnowledgeMetadata[]
): string[] {
  const validIds = plannerResult.requiredKnowledgeIds.filter((id) => ObjectId.isValid(id));
  if (validIds.length > 0) {
    return validIds.slice(0, 5);
  }

  const lowerTopics = plannerResult.requiredKnowledgeTopics.map((topic) => topic.trim().toLowerCase()).filter(Boolean);
  if (lowerTopics.length > 0) {
    const matchedByTopic = metadata
      .filter((item) => lowerTopics.some((topic) => item.topic.trim().toLowerCase().includes(topic)))
      .map((item) => item.id);
    if (matchedByTopic.length > 0) {
      return matchedByTopic.slice(0, 5);
    }
  }

  return metadata.slice(0, 3).map((item) => item.id);
}

async function loadKnowledgeContextsByIds(mongo: MongoDbContext, ids: string[]): Promise<string[]> {
  if (!mongo.isConfigured || ids.length === 0) {
    return [];
  }

  const objectIds = ids
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));

  if (objectIds.length === 0) {
    return [];
  }

  const collection = await mongo.getKnowledgeCollection();
  const documents = await collection
    .find({ _id: { $in: objectIds } })
    .limit(5)
    .toArray();

  return documents
    .map((document) => {
      if (!document._id) {
        return null;
      }

      return [`ID: ${document._id.toHexString()}`, `Topic: ${document.topic}`, document.content].join('\n');
    })
    .filter((item): item is string => Boolean(item));
}