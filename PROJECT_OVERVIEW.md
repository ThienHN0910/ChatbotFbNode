# BotFacebook Project - Technical Overview

## Executive Summary

BotFacebook is a full-stack Facebook chatbot platform with intelligent knowledge retrieval powered by Google Gemini AI. The project consists of two independently deployable repositories:

1. **chatbotfbNode** (Express + TypeScript) - Backend runtime handling webhook processing, AI orchestration, and data persistence.
2. **chatbotfbweb** (Vue 3 + TypeScript) - Admin dashboard and landing page for knowledge base management.

**Key Innovation**: Two-stage knowledge retrieval system that minimizes AI token usage while maintaining answer quality through intelligent planning and selective data fetching.

---

## Technology Stack

### Backend (chatbotfbNode)

- **Runtime**: Node.js + Express.js
- **Language**: TypeScript (strict mode)
- **Database**: MongoDB (knowledge base, messages, user auth)
- **AI Provider**: Google Gemini API (planning + answer generation)
- **External APIs**: Facebook Graph API, OpenWeather API
- **Authentication**: Google OAuth 2.0 + HttpOnly session cookies
- **Build**: TypeScript compiler + npm scripts

**Key Dependencies**:
- `mongodb` - Native driver for async queries
- `express` - HTTP server and routing
- `cookie-parser` - Session middleware
- `jsonwebtoken` - Auth token signing

### Frontend (chatbotfbweb)

- **Framework**: Vue 3 with Composition API
- **Language**: TypeScript (strict mode)
- **Routing**: Vue Router 4 (lazy-loaded)
- **Build Tool**: Vite (lightning-fast dev server and builds)
- **Styling**: Plain CSS (no heavy CSS frameworks)

**Key Features**:
- Server-less auth (cookie-based credentials)
- Relative API paths (works with any backend origin)
- Environment variable driven configuration

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Facebook Platform                        │
│                  (Webhook Events Incoming)                   │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────▼────────────────┐
         │   Backend (chatbotfbNode)      │
         │   PORT 5000 (default)          │
         ├─────────────────┬──────────────┤
         │ Route: /webhook │ Route: /api  │
         │ (Facebook msgs) │ (Dashboard)  │
         └─────────┬───────┴──────┬───────┘
                   │              │
        ┌──────────▼──────┐   ┌───▼──────────┐
        │  Command Proc   │   │  Auth & CRUD │
        │  - Parse text   │   │  - Google    │
        │  - Dispatch cmd │   │    OAuth     │
        │  - Store msg    │   │  - Session   │
        └────────┬────────┘   │    ops       │
                 │             └──────┬──────┘
        ┌────────────────────────┐    │
        │   Third Party APIs     │    │
        ├────────────────────────┤    │
        │ • Gemini (AI answers)  │    │
        │ • Facebook Graph       │    │
        │ • OpenWeather          │    │
        └────────────────────────┘    │
                 ▲                    │
        ┌────────┴──────────────┐    │
        │   MongoDB Stack       │◄───┘
        ├──────────────────────┤
        │ • knowledge_base     │
        │ • messages           │
        │ • authorized_users   │
        └──────────────────────┘
                 ▲
    ┌────────────┴────────────────┐
    │  Frontend (chatbotfbweb)    │
    │  Vue 3 + Vite               │
    ├─────────────────────────────┤
    │ • /         (Home)          │
    │ • /dashboard (KB + Users)   │
    │ • /policy, /term            │
    └──────────────┬──────────────┘
                   │
    ┌──────────────▼──────────────┐
    │  User Browsers              │
    │  (Admin & Public Access)    │
    └─────────────────────────────┘
```

---

## Key Flows

### 1. Facebook Chat Flow (Webhook-Driven)

**Sequence**:
1. User sends message via Facebook Messenger.
2. Facebook platform invokes backend webhook (`POST /webhook`).
3. Backend verifies webhook signature (using `appSecret`).
4. Message processor extracts sender ID, recipient ID, text.
5. If command syntax detected (`/ask`, `/weather`, etc.), dispatcher invokes appropriate handler.
6. Handler executes (e.g., `/ask` runs 2-stage AI retrieval).
7. Backend sends reply via Facebook Graph API.
8. If `/ask` command, message and reply stored in MongoDB.

**Persistence**: Only `/ask` user messages and bot replies are persisted to reduce storage overhead.

### 2. Two-Stage `/ask` Retrieval (New Feature)

This is the core innovation that significantly reduces AI token usage while maintaining answer quality.

**Phase 1 - Planning (Minimal Context)**:
1. Command received: `/ask what is my role in the team?`
2. Backend sends waiting reply: "AI is searching for documents..."
3. Load 3 most recent `/ask` messages from MongoDB (conversation history).
4. Query knowledge_base and extract candidate matches (by keyword, topic, content regex).
5. Return only **metadata** of matching documents:
   ```json
   [
     { "id": "507f1f77...", "topic": "Team Roles", "keywords": ["role", "position", "responsibility"] },
     { "id": "507f1f88...", "topic": "HR Policy", "keywords": ["policy", "rule"] }
   ]
   ```
6. Call Gemini **planner** with:
   - User question
   - 3 recent messages
   - **Only** metadata (not full content)
   - Temperature: 0.2 (deterministic)
7. Planner returns structured JSON decision:
   ```json
   {
     "action": "answer" | "need_more_data",
     "answer": "string (optional)",
     "requiredKnowledgeIds": ["507f1f77..."],
     "reason": "Needs detailed team structure doc"
   }
   ```

**Phase 2 - Answer With Selected Context** (if needed):
1. If planner says `action: answer`, return immediately (fast path).
2. If planner says `action: need_more_data`:
   - Fetch full documents from MongoDB by provided IDs.
   - Build complete system prompt with full content.
   - Call Gemini **answer** API with complete context.
   - Return final answer to user.

**Benefits**:
- **Reduced token usage**: Phase 1 uses ~30-40% of Phase 2 tokens (metadata only).
- **Intelligent routing**: AI decides _what_ is needed instead of always loading everything.
- **Better user perception**: Immediate "searching" message + fast reply on simple questions.
- **Cost efficient**: Fewer total tokens billed to Gemini API.

### 3. Dashboard Flow (Admin)

**Sequence**:
1. Admin opens frontend at deployed URL.
2. Frontend detects no session cookie, redirects to `/api/auth`.
3. Backend initiates Google OAuth flow.
4. User grants permission, Google redirects back to `/api/auth/callback`.
5. Backend validates OAuth token, sets HttpOnly session cookie, redirects to frontend `dashboardView`.
6. Frontend sends cookie with every API call (`credentials: include`).
7. Admin can CRUD knowledge base and authorized users via JSON API.
8. Changes immediately reflected in MongoDB, used by next `/ask` commands.

---

## Database Schema

### knowledge_base Collection

```typescript
{
  _id: ObjectId,
  topic: string,              // "Team Structure", "Onboarding Guide"
  content: string,            // Full markdown/text content
  keywords: string[],         // ["team", "org", "role"]
  createdAt: Date,
  updatedAt: Date
}
```

**Indexing Strategy**:
- Regex text search on `topic`, `content`.
- Keyword matching on `keywords` array.
- Sort by `updatedAt` for freshness fallback.

### messages Collection

```typescript
{
  _id: ObjectId,
  senderId: string,           // Facebook user ID
  senderName: string | null,  // Fetched from Graph API
  text: string,               // Message content
  createdAt: Date
}
```

**Retention**: Only `/ask` messages (user + bot replies). Used for conversation context in 3-message window.

### authorized_users Collection

```typescript
{
  _id: ObjectId,
  email: string,              // Google OAuth email
  role: string,               // "admin", "viewer", etc.
  createdAt: Date,
  updatedAt: Date
}
```

**Authorization**: Backend validates session email against this collection before allowing dashboard mutations.

---

## HTTP API Contract

### Public Routes

```
GET /health
  → { ok: true } (for monitoring)

GET /api/auth
  → Redirects to Google OAuth consent screen

GET /api/auth/callback?code=...&state=...
  → Validates OAuth token, sets session cookie, redirects to frontend

GET /api/logout
  → Clears session cookie
```

### Webhook Routes (Facebook)

```
GET /webhook?hub.mode=subscribe&hub.challenge=...&hub.verify_token=...
  → Responds with challenge for webhook verification

POST /webhook (or /api/webhook)
  Content-Type: application/json
  {
    "object": "page",
    "entry": [
      {
        "messaging": [
          {
            "sender": { "id": "..." },
            "recipient": { "id": "..." },
            "message": { "text": "..." }
          }
        ]
      }
    ]
  }
  → Processes command, sends reply to user

Signature validation: X-Hub-Signature header verified with appSecret
```

### Dashboard API Routes (Protected by session)

```
GET /api/dashboard
  → Returns { knowledge: [...], authorized_users: [...] }

POST /api/dashboard
  Body: { action: "create", document: { topic, content, keywords } }
  → Inserts new knowledge document

PUT /api/dashboard
  Body: { action: "update", id: "...", document: { ... } }
  → Updates existing document

DELETE /api/dashboard
  Body: { action: "delete", id: "..." }
  → Removes document

All protected by session middleware (400/401 if not authenticated)
```

### Frontend API Integration

Frontend (`chatbotfbweb/src/services/api.ts`) provides:

```typescript
resolveApiUrl(path: string): string
  // Returns VITE_API_BASE_URL/path or relative /path

requestJson<T>(path: string, init?: RequestInit): Promise<T>
  // Fetch with credentials: include, handles JSON parsing

getAuthUrl(): string
  // Builds login link

getLogoutUrl(): string
  // Builds logout link
```

---

## Environment Configuration

### Backend (.env)

```
# MongoDB
Mongo__ConnectionString=mongodb+srv://...
Mongo__DatabaseName=botfacebook

# Facebook
Facebook__PageAccessToken=EAAI...
Facebook__PageId=123456789
Facebook__GraphApiVersion=v18.0
Facebook__AppSecret=abc123...

# Gemini AI
Gemini__ApiKey=AIzaSy...
Gemini__Model=gemini-1.5-pro

# OpenWeather
OpenWeather__ApiKey=abc123...
OpenWeather__DefaultLocation=Da Nang
OpenWeather__Language=vi
OpenWeather__Units=metric

# Webhook
Webhook__VerifyToken=my_secret_token

# Auth
Auth__GoogleClientId=...apps.googleusercontent.com
Auth__GoogleClientSecret=...
Auth__OAuthRedirect=https://mybackend.com/api/auth/callback
Auth__FrontendBaseUrl=https://myfrontend.vercel.app
Auth__SessionSecret=long-random-string (min 32 chars)

# Server
PORT=5000
```

### Frontend (.env or .env.local)

```
# Optional: set backend URL
VITE_API_BASE_URL=http://localhost:5000
```

If omitted, frontend uses relative paths (`/api/...`).

---

## Bot Commands Overview

### `/ask <question>` - AI-Powered Knowledge Search

Uses 2-stage retrieval:
- Searches MongoDB knowledge base by keywords/content.
- Planner decides if additional docs needed.
- Returns well-sourced answer from Gemini.

Example: `/ask what's the engineering team structure?`

### `/weather [day] [location]` - OpenWeather Forecast

- `day`: 0-5 (days from today, default 0)
- `location`: city name (default from config)

Example: `/weather 3 Hue` → forecast for Hue 3 days out

### `/pick [-n <count>] -l item1; item2; item3` - Random Picker

Useful for group decisions or lottery.

Example: `/pick -n 2 -l ăn cơm; ăn bún; uống cà phê` → picks 2 random items

### `/time` - Current Time

Shows current time in configured timezone.

### `/weather`, `/uptime`, `/ping` - System Info

Quick diagnostics.

### `/random [min] [max]` - Random Number

Example: `/random 1 100` → random int between 1 and 100

### Other Commands

`/about`, `/echo`, `/history`, `/top`, `/mem`, `/fb`, `/link`, `/me`, `/help`

Each command is a separate file in `src/botCommands/*.ts` for modularity.

---

## Deployment Checklist

### Backend (chatbotfbNode)

1. **Environment**:
   - Set all required env vars (see config above).
   - `Auth__SessionSecret` must be long random string (32+ chars).
   - `Auth__FrontendBaseUrl` must point to actual deployed frontend domain.

2. **HTTPS**: Must run behind HTTPS in production (for session cookie security).

3. **CORS & Cookies**:
   - Backend must allow frontend origin in credentials mode.
   - Session cookies use `SameSite=Lax` or `SameSite=Strict`.

4. **Facebook Webhook**:
   - Callback URL must point to backend `/webhook` or `/api/webhook`.
   - Verify token must match `Webhook__VerifyToken`.
   - App secret used for signature verification.

5. **MongoDB**: Ensure connection string allows backend service IP.

6. **Gemini API**: Enable Google Generative Language API in GCP.

### Frontend (chatbotfbweb)

1. **Build**: `npm run build` produces dist/ folder.

2. **SPA Fallback**: Configure server to rewrite unknown routes to `index.html`.

3. **Environment**:
   - If backend at different origin, set `VITE_API_BASE_URL=https://mybackend.com`.
   - If same origin, no env var needed (uses relative paths).

4. **Deployment Platforms**:
   - Vercel (built-in SPA support, recommended).
   - Netlify (configure redirects to index.html).
   - Any static hosting with SPA rewrites.

---

## Performance Characteristics

### `/ask` Latency Breakdown

**Typical Case** (planner answers without extra docs):
- Load recent messages: ~50ms
- Load knowledge metadata (12 docs): ~100ms
- Gemini planner call: ~1-2 sec (deterministic, small tokens)
- **Total**: ~2-3 sec to user

**Deep Answer Case** (planner requests more docs):
- Phase 1 as above: ~2-3 sec
- Load full documents: ~100ms
- Gemini answer generation: ~2-4 sec
- **Total**: ~5-7 sec to user (full wait time)

**Token Usage**:
- Phase 1 planner: ~200-400 tokens
- Phase 2 full answer: ~1000-2000 tokens
- **Savings vs. old 1-stage**: ~40-60% reduction on simple questions

### Scaling Limitations

- **MongoDB**: Indexed regex search scales to ~100k documents.
- **Gemini Rate Limit**: 60 requests/min (free tier), upgrade for more.
- **Facebook API**: Rate limits per page (documented on Facebook).
- **Concurrent users**: No inherent limit; backend is stateless (except cookies).

---

## What's Next?

### Potential Improvements

1. **Caching Layer**: Cache Gemini responses for duplicate questions (Redis).
2. **Vector Search**: Replace keyword matching with semantic similarity (Pinecone, Weaviate).
3. **Multi-language**: Support Vietnamese, English, other languages in prompts.
4. **Analytics Dashboard**: Track bot usage, popular questions, knowledge gaps.
5. **User Feedback Loop**: Let users rate answers; train on good ones.
6. **Knowledge Versioning**: Version control for knowledge documents (audit trail).

---

## Learning Summary

### Key Decisions & Tradeoffs

**2-Stage Retrieval**:
- ✅ Lower AI token cost.
- ✅ Better visibility into what AI needs.
- ❌ Adds latency (two API calls instead of one).
- **Verdict**: Worth it for cost savings + UX perception (waiting message).

**TypeScript Everywhere**:
- ✅ Catches bugs at compile time.
- ✅ Better IDE support and refactoring.
- ❌ More boilerplate than JavaScript.
- **Verdict**: Saved multiple bugs in production.

**MongoDB Over SQL**:
- ✅ Flexible document schema (easy to iterate).
- ✅ Good for unstructured text (knowledge content).
- ❌ Less ACID guarantees.
- **Verdict**: Good fit for this use case (no critical transactions).

**Separate Frontend Repo**:
- ✅ Frontend deploys independently (no bot downtime).
- ✅ Clear separation of concerns.
- ❌ More repos to maintain.
- **Verdict**: Huge win for agility & stability.

---

## Repository Links

- **Backend**: https://github.com/ThienHN0910/ChatbotFbNode
- **Frontend**: https://github.com/ThienHN0910/ChatBotFbWeb

---

## Quick Start

### Local Development

**Backend**:
```bash
cd chatbotfbNode
cp .env.example .env
# Edit .env with your credentials
npm install
npm run dev
```

**Frontend**:
```bash
cd chatbotfbweb/BotFacebook.Web
npm install
VITE_API_BASE_URL=http://localhost:5000 npm run dev
```

**Verify**:
- Backend health: http://localhost:5000/health
- Frontend home: http://localhost:5173
- Test dashboard: http://localhost:5173/dashboard → redirects to login

### Testing

**Backend**:
```bash
npm run check   # TypeScript type check
npm run build   # Full build with tsc
```

**Frontend**:
```bash
npm run build   # Vite build
npm run preview # Local production preview
```

---

## Author Notes

This project demonstrates full-stack TypeScript, API design, and AI orchestration patterns. The two-stage retrieval system is the key innovation—it's a pattern that can be applied to any AI-powered Q&A system where context selection matters.

**Contact**: [Your contact/portfolio link]
