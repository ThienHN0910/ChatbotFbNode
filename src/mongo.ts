import { MongoClient, type Db } from 'mongodb';

import type { AppConfig, AuthorizedUserDocument, KnowledgeDocument, MessageDocument } from './types.js';

export class MongoDbContext {
  private clientPromise: Promise<MongoClient> | null = null;
  private databasePromise: Promise<Db> | null = null;

  constructor(private readonly config: AppConfig['mongo']) {}

  get isConfigured(): boolean {
    return Boolean(this.config.connectionString);
  }

  async getDatabase(): Promise<Db> {
    if (!this.isConfigured) {
      throw new Error('MongoDB connection string is not configured.');
    }

    if (!this.databasePromise) {
      this.databasePromise = this.getClient().then((client) => client.db(this.config.databaseName));
    }

    return this.databasePromise;
  }

  async getKnowledgeCollection() {
    return (await this.getDatabase()).collection<KnowledgeDocument>('knowledge_base');
  }

  async getMessagesCollection() {
    return (await this.getDatabase()).collection<MessageDocument>('messages');
  }

  async getAuthorizedUsersCollection() {
    return (await this.getDatabase()).collection<AuthorizedUserDocument>('authorized_users');
  }

  async close(): Promise<void> {
    if (!this.clientPromise) {
      return;
    }

    const client = await this.clientPromise;
    await client.close();
    this.clientPromise = null;
    this.databasePromise = null;
  }

  private async getClient(): Promise<MongoClient> {
    if (!this.clientPromise) {
      const client = new MongoClient(this.config.connectionString, {
        serverSelectionTimeoutMS: 10_000
      });
      this.clientPromise = client.connect();
    }

    return this.clientPromise;
  }
}
