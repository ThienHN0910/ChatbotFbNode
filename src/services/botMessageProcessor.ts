import type { AppConfig, FacebookMessagingEvent, FacebookWebhookPayload } from '../types.js';
import type { MongoDbContext } from '../mongo.js';
import type { FacebookGraphService } from './facebookGraphService.js';
import type { GeminiService } from './geminiService.js';
import type { BotCommandDispatcher, BotCommandContext } from '../commands.js';

export class BotMessageProcessor {
  constructor(
    private readonly mongo: MongoDbContext,
    private readonly facebook: FacebookGraphService,
    private readonly gemini: GeminiService,
    private readonly dispatcher: BotCommandDispatcher,
    private readonly config: AppConfig
  ) {}

  async process(payload: FacebookWebhookPayload): Promise<void> {
    for (const entry of payload.entry ?? []) {
      for (const eventItem of entry.messaging ?? []) {
        try {
          await this.processEvent(eventItem);
        } catch (error) {
          console.error('Error processing webhook event', error);
        }
      }
    }
  }

  private async processEvent(eventItem: FacebookMessagingEvent): Promise<void> {
    const senderId = eventItem.sender?.id?.trim();
    const recipientId = eventItem.recipient?.id?.trim();
    const messageText = eventItem.message?.text?.trim();

    if (!senderId || !messageText) {
      return;
    }

    // await this.storeMessage(senderId, messageText);

    const isCommand = messageText.startsWith('/');
    const isDirectToPage = await this.isDirectToPage(recipientId);

    if (!isCommand && !isDirectToPage) {
      return;
    }

    let commandName = '';
    let args: string[] = [];
    if (isCommand) {
      const parts = splitArgs(messageText);
      commandName = parts[0]?.slice(1) ?? '';
      args = parts.slice(1);
    } else {
      commandName = 'ask';
      args = splitArgs(messageText);
    }

    const shouldStoreConversation = commandName === 'ask';

    const context: BotCommandContext = {
      senderId,
      recipientId,
      messageText,
      args,
      mongo: this.mongo,
      facebook: this.facebook,
      gemini: this.gemini,
      facebookOptions: this.config.facebook,
      botOptions: this.config.bot,
      weatherOptions: this.config.openWeather,
      logger: console,
      send: async (text: string) => {
        await this.facebook.sendTextMessage(senderId, text);
        if (shouldStoreConversation) {
          try {
            await this.storeOutgoingMessage(text);
          } catch (error) {
            console.warn('Failed to store outgoing bot message', error);
          }
        }
      }
    };

    // Only store user messages for the `ask` command
    if (commandName === 'ask') {
      try {
        await this.storeMessage(senderId, messageText);
      } catch (error) {
        console.warn('Failed to store incoming ask message', error);
      }
    }

    await this.dispatcher.dispatch(commandName, args, context);
  }

  private async storeMessage(senderId: string, messageText: string): Promise<void> {
    if (!this.mongo.isConfigured) {
      return;
    }

    try {
      const senderName = await this.facebook.getUserName(senderId);
      const messages = await this.mongo.getMessagesCollection();
      await messages.insertOne({
        senderId,
        senderName,
        text: messageText,
        createdAt: new Date()
      });
    } catch (error) {
      console.warn('Failed to store incoming message', error);
    }
  }

  private async storeOutgoingMessage(messageText: string): Promise<void> {
    if (!this.mongo.isConfigured) {
      return;
    }

    try {
      const pageId = (await this.facebook.getPageId()) ?? this.config.facebook.pageId ?? 'bot';
      const messages = await this.mongo.getMessagesCollection();
      await messages.insertOne({
        senderId: pageId,
        senderName: null,
        text: messageText,
        createdAt: new Date()
      });
    } catch (error) {
      console.warn('Failed to store outgoing message', error);
    }
  }

  private async isDirectToPage(recipientId: string | undefined): Promise<boolean> {
    if (!recipientId) {
      return false;
    }

    if (this.config.facebook.pageId.trim().length > 0) {
      return recipientId === this.config.facebook.pageId;
    }

    const fetchedPageId = await this.facebook.getPageId();
    return Boolean(fetchedPageId && recipientId === fetchedPageId);
  }
}

function splitArgs(text: string): string[] {
  return text.trim().split(/\s+/u).filter(Boolean);
}
