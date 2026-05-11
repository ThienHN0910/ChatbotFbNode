import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ObjectId } from 'mongodb';

import { loadConfig } from './config.js';
import { loadDotEnvFiles } from './env.js';
import { createDefaultBotCommandDispatcher } from './commands.js';
import type { FacebookWebhookPayload } from './types.js';
import { MongoDbContext } from './mongo.js';
import { AuthService } from './services/authService.js';
import { FacebookGraphService } from './services/facebookGraphService.js';
import { GeminiService } from './services/geminiService.js';
import { BotMessageProcessor } from './services/botMessageProcessor.js';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

loadDotEnvFiles();

const config = loadConfig();
const mongo = new MongoDbContext(config.mongo);
const authService = new AuthService(config.auth);
const facebookGraphService = new FacebookGraphService(config.facebook);
const geminiService = new GeminiService(config.gemini);
const dispatcher = createDefaultBotCommandDispatcher();
const botMessageProcessor = new BotMessageProcessor(mongo, facebookGraphService, geminiService, dispatcher, config);

const app = express();
app.set('trust proxy', 1);

app.use(cors({ origin: config.auth.frontendBaseUrl, credentials: true }));
app.use(cookieParser());
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buffer) => {
      (req as RawBodyRequest).rawBody = Buffer.from(buffer);
    }
  })
);
app.use(express.urlencoded({ extended: true }));

app.get('/', (_req, res) => {
  res.json({ service: 'BotFacebook.Node', status: 'alive' });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', utc: new Date().toISOString() });
});

app.get('/api/auth', authStartHandler);
app.get('/api/auth/callback', authCallbackHandler);
app.get('/api/logout', logoutHandler);

app.get(['/dashboard', '/api/dashboard'], dashboardGetHandler);
app.post(['/dashboard', '/api/dashboard'], dashboardPostHandler);
app.put(['/dashboard', '/api/dashboard'], dashboardPutHandler);
app.delete(['/dashboard', '/api/dashboard'], dashboardDeleteHandler);

app.get('/webhook', webhookVerifyHandler);
app.post('/webhook', webhookSignatureGuard, webhookReceiveHandler);

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ error: 'Invalid JSON payload' });
    return;
  }

  console.error('Unhandled request error', error);
  res.status(500).json({ error: 'Internal server error' });
});

const port = config.port;
app.listen(port, () => {
  console.log(`BotFacebook Node listening on port ${port}`);
});

async function authStartHandler(_req: Request, res: Response): Promise<void> {
  try {
    const state = AuthService.generateState();
    res.cookie('oauth_state', state, {
      httpOnly: true,
      secure: isSecureRequest(_req),
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60 * 1000
    });

    res.redirect(authService.buildGoogleAuthUrl(state));
  } catch (error) {
    console.error('Auth start failed', error);
    res.status(500).send('Google OAuth is not configured');
  }
}

async function authCallbackHandler(req: Request, res: Response): Promise<void> {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const savedState = req.cookies.oauth_state as string | undefined;

  if (!code || !state || state !== savedState) {
    res.status(400).send('Invalid OAuth state');
    return;
  }

  const accessToken = await authService.exchangeCodeForAccessToken(code);
  if (!accessToken) {
    res.status(500).send('No access token from Google');
    return;
  }

  const userInfo = await authService.getGoogleUserInfo(accessToken);
  if (!userInfo.email) {
    res.status(500).send('Google userinfo missing email');
    return;
  }

  if (!mongo.isConfigured) {
    res.status(500).send('MongoDB is not configured');
    return;
  }

  const authorizedUsers = await mongo.getAuthorizedUsersCollection();
  const found = await authorizedUsers.findOne({ email: userInfo.email });
  if (!found) {
    res.status(403).send('Truy cập bị từ chối - Email không có trong danh sách Admin');
    return;
  }

  const token = authService.createSessionToken(userInfo.email, found.role ?? 'user');
  res.cookie('token', token, sessionCookieOptions(req));

  const frontendBaseUrl = trimTrailingSlash(config.auth.frontendBaseUrl);
  res.redirect(`${frontendBaseUrl}/dashboard`);
}

async function logoutHandler(req: Request, res: Response): Promise<void> {
  res.clearCookie('token', sessionCookieOptions(req));
  res.clearCookie('oauth_state', {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: 'lax',
    path: '/'
  });

  const frontendBaseUrl = trimTrailingSlash(config.auth.frontendBaseUrl);
  res.redirect(`${frontendBaseUrl}/dashboard`);
}

async function dashboardGetHandler(req: Request, res: Response): Promise<void> {
  const sessionUser = getSessionUser(req);
  const acceptHeader = String(req.headers.accept ?? '');
  const requestedType = typeof req.query.type === 'string' ? req.query.type : '';

  if (!requestedType && acceptHeader.includes('text/html')) {
    const html = sessionUser
      ? loadTemplate('dashboard.html').replace('__EMAIL__', escapeHtml(sessionUser.email))
      : loadTemplate('login.html');

    res.type('html').send(html);
    return;
  }

  if (!sessionUser) {
    res.sendStatus(401);
    return;
  }

  if (!mongo.isConfigured) {
    res.status(500).send('MongoDB is not configured');
    return;
  }

  if (requestedType.toLowerCase() === 'users') {
    const users = await mongo
      .getAuthorizedUsersCollection()
      .then((collection) => collection.find({}).sort({ createdAt: -1 }).toArray());
    res.json(users.map(serializeMongoDocument));
    return;
  }

  const knowledge = await mongo
    .getKnowledgeCollection()
    .then((collection) => collection.find({}).sort({ createdAt: -1 }).toArray());
  res.json(knowledge.map(serializeMongoDocument));
}

async function dashboardPostHandler(req: Request, res: Response): Promise<void> {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) {
    res.sendStatus(401);
    return;
  }

  if (!mongo.isConfigured) {
    res.status(500).send('MongoDB is not configured');
    return;
  }

  const payload = parseBody(req.body);
  const type = payload.type;
  if (!type) {
    res.status(400).send('Missing type');
    return;
  }

  if (type === 'users') {
    const email = payload.email;
    if (!email) {
      res.status(400).send('Missing email');
      return;
    }

    const role = normalizeRole(payload.role) ?? 'user';
    const createdAt = new Date();
    const created = {
      email,
      role,
      createdAt,
      updatedAt: createdAt
    };

    const collection = await mongo.getAuthorizedUsersCollection();
    const result = await collection.insertOne(created);
    res.status(201).json({ _id: result.insertedId.toString(), ...created });
    return;
  }

  const topic = payload.topic;
  const content = payload.content;
  if (!topic || !content) {
    res.status(400).send('Missing fields');
    return;
  }

  const createdAt = new Date();
  const created = {
    topic,
    content,
    keywords: parseKeywords(payload.keywords),
    createdAt,
    updatedAt: createdAt
  };

  const collection = await mongo.getKnowledgeCollection();
  const result = await collection.insertOne(created);
  res.status(201).json({ _id: result.insertedId.toString(), ...created });
}

async function dashboardPutHandler(req: Request, res: Response): Promise<void> {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) {
    res.sendStatus(401);
    return;
  }

  if (!mongo.isConfigured) {
    res.status(500).send('MongoDB is not configured');
    return;
  }

  const payload = parseBody(req.body);
  const type = payload.type;
  const id = payload._id;
  if (!type) {
    res.status(400).send('Missing type');
    return;
  }

  if (!id) {
    res.status(400).send('Missing id');
    return;
  }

  if (type === 'users') {
    const collection = await mongo.getAuthorizedUsersCollection();
    const updatedAt = new Date();
    const objectId = parseObjectId(id);
    if (!objectId) {
      res.status(400).send('Invalid id');
      return;
    }

    const update = {
      $set: {
        role: normalizeRole(payload.role) ?? 'user',
        updatedAt
      }
    };

    const result = await collection.findOneAndUpdate({ _id: objectId }, update, { returnDocument: 'after' });
    if (!result) {
      res.sendStatus(404);
      return;
    }

    res.json(serializeMongoDocument(result));
    return;
  }

  const topic = payload.topic;
  const content = payload.content;
  if (!topic || !content) {
    res.status(400).send('Missing fields');
    return;
  }

  const collection = await mongo.getKnowledgeCollection();
  const updatedAt = new Date();
  const objectId = parseObjectId(id);
  if (!objectId) {
    res.status(400).send('Invalid id');
    return;
  }

  const update = {
    $set: {
      topic,
      content,
      keywords: parseKeywords(payload.keywords),
      updatedAt
    }
  };

  const result = await collection.findOneAndUpdate({ _id: objectId }, update, { returnDocument: 'after' });
  if (!result) {
    res.sendStatus(404);
    return;
  }

  res.json(serializeMongoDocument(result));
}

async function dashboardDeleteHandler(req: Request, res: Response): Promise<void> {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) {
    res.sendStatus(401);
    return;
  }

  if (!mongo.isConfigured) {
    res.status(500).send('MongoDB is not configured');
    return;
  }

  const payload = parseBody(req.body);
  const type = payload.type;
  const id = payload._id;
  if (!type || !id) {
    res.status(400).send('Missing id');
    return;
  }

  if (type === 'users') {
    const collection = await mongo.getAuthorizedUsersCollection();
    const objectId = parseObjectId(id);
    if (!objectId) {
      res.status(400).send('Invalid id');
      return;
    }

    await collection.deleteOne({ _id: objectId });
    res.send('deleted');
    return;
  }

  const collection = await mongo.getKnowledgeCollection();
  const objectId = parseObjectId(id);
  if (!objectId) {
    res.status(400).send('Invalid id');
    return;
  }

  await collection.deleteOne({ _id: objectId });
  res.send('deleted');
}

function webhookVerifyHandler(req: Request, res: Response): void {
  const mode = typeof req.query['hub.mode'] === 'string' ? req.query['hub.mode'] : '';
  const verifyToken = typeof req.query['hub.verify_token'] === 'string' ? req.query['hub.verify_token'] : '';
  const challenge = typeof req.query['hub.challenge'] === 'string' ? req.query['hub.challenge'] : '';

  if (mode.toLowerCase() === 'subscribe' && verifyToken === config.webhook.verifyToken) {
    res.status(200).send(challenge);
    return;
  }

  res.sendStatus(403);
}

function webhookSignatureGuard(req: Request, res: Response, next: NextFunction): void {
  const appSecret = config.facebook.appSecret.trim();
  if (!appSecret) {
    next();
    return;
  }

  const signature256 = String(req.get('x-hub-signature-256') ?? '');
  const signatureSha1 = String(req.get('x-hub-signature') ?? '');
  const rawBody = (req as RawBodyRequest).rawBody;
  if ((!signature256 && !signatureSha1) || !rawBody) {
    res.sendStatus(403);
    return;
  }

  if (signature256) {
    const expectedSignature = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
    if (!timingSafeEquals(signature256, expectedSignature)) {
      res.sendStatus(403);
      return;
    }

    next();
    return;
  }

  const expectedSignature = `sha1=${crypto.createHmac('sha1', appSecret).update(rawBody).digest('hex')}`;
  if (!timingSafeEquals(signatureSha1, expectedSignature)) {
    res.sendStatus(403);
    return;
  }

  next();
}

function webhookReceiveHandler(req: Request, res: Response): void {
  const payload = req.body as FacebookWebhookPayload | undefined;
  if (!payload) {
    res.sendStatus(400);
    return;
  }

  if (String(payload.object ?? '').toLowerCase() !== 'page') {
    res.sendStatus(404);
    return;
  }

  setImmediate(() => {
    void botMessageProcessor.process(payload).catch((error) => {
      console.error('Webhook background processing error', error);
    });
  });

  res.status(200).send('EVENT_RECEIVED');
}

function getSessionUser(req: Request) {
  return authService.validateSessionToken(req.cookies.token as string | undefined);
}

function sessionCookieOptions(req: Request) {
  return {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: isSecureRequest(req) ? ('none' as const) : ('lax' as const),
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
  };
}

function loadTemplate(fileName: string): string {
  const templatePath = path.resolve(process.cwd(), 'src', 'templates', fileName);
  if (fs.existsSync(templatePath)) {
    return fs.readFileSync(templatePath, 'utf8');
  }

  return `Missing template: ${fileName}`;
}

function parseBody(body: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return result;
  }

  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    result[key.toLowerCase()] = normalizeValue(value);
  }

  return result;
}

function normalizeValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : item == null ? '' : String(item)))
      .map((item) => item.trim())
      .filter(Boolean)
      .join(',');
  }

  if (value == null) {
    return '';
  }

  return String(value).trim();
}

function parseKeywords(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseObjectId(value: string): ObjectId | null {
  if (!ObjectId.isValid(value)) {
    return null;
  }

  return new ObjectId(value);
}

function serializeMongoDocument(document: unknown) {
  const record = document as { _id?: unknown; [key: string]: unknown };
  return {
    ...record,
    _id: record._id ? String(record._id) : undefined
  };
}

function normalizeRole(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const role = value.trim().toLowerCase();
  if (role === 'admin' || role === 'user') {
    return role;
  }

  return null;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, '');
}

function isSecureRequest(req: Request): boolean {
  if (req.secure) {
    return true;
  }

  const forwardedProto = String(req.headers['x-forwarded-proto'] ?? '').toLowerCase();
  return forwardedProto === 'https';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function timingSafeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
