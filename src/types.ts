import type { ObjectId } from 'mongodb';
import type { Collection, Db } from 'mongodb';

export interface AppConfig {
  port: number;
  mongo: {
    connectionString: string;
    databaseName: string;
  };
  facebook: {
    pageAccessToken: string;
    pageId: string;
    graphApiVersion: string;
    groupLink: string;
    pageLink: string;
    discordLink: string;
    websiteLink: string;
    appSecret: string;
  };
  gemini: {
    apiKey: string;
    model: string;
  };
  webhook: {
    verifyToken: string;
  };
  bot: {
    timeZoneId: string;
  };
  openWeather: {
    apiKey: string;
    defaultLocation: string;
    language: string;
    units: 'standard' | 'metric' | 'imperial';
  };
  auth: {
    googleClientId: string;
    googleClientSecret: string;
    oauthRedirect: string;
    frontendBaseUrl: string;
    sessionSecret: string;
  };
}

export interface SessionUser {
  email: string;
  role: string;
}

export interface KnowledgeDocument {
  _id?: ObjectId;
  topic: string;
  content: string;
  keywords: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageDocument {
  _id?: ObjectId;
  senderId: string;
  senderName?: string | null;
  text: string;
  createdAt: Date;
}

export interface AuthorizedUserDocument {
  _id?: ObjectId;
  email: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FacebookWebhookPayload {
  object?: string;
  entry?: FacebookWebhookEntry[];
}

export interface FacebookWebhookEntry {
  id?: string;
  time?: number;
  messaging?: FacebookMessagingEvent[];
}

export interface FacebookMessagingEvent {
  sender?: FacebookMessengerParticipant;
  recipient?: FacebookMessengerParticipant;
  message?: FacebookMessagePayload;
  postback?: FacebookPostbackPayload;
}

export interface FacebookMessengerParticipant {
  id?: string;
}

export interface FacebookMessagePayload {
  mid?: string;
  text?: string;
}

export interface FacebookPostbackPayload {
  title?: string;
  payload?: string;
}

export interface RequestCollections {
  db: Db;
  knowledge: Collection<KnowledgeDocument>;
  messages: Collection<MessageDocument>;
  authorizedUsers: Collection<AuthorizedUserDocument>;
}
