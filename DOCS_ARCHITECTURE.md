# BotFacebook Node Architecture

## Overview

`chatbotfbNode` is an Express + TypeScript backend that handles:

- Facebook webhook verification and event processing
- Bot command dispatch (`src/botCommands`)
- MongoDB persistence (knowledge, messages, authorized users)
- Google OAuth session auth for dashboard access
- JSON APIs for dashboard CRUD

Main entrypoint: `src/index.ts`

## Boundary With Frontend Repo

- Backend repository (`chatbotfbNode`) owns webhook, AI pipeline, auth/session issuance, and database access.
- Frontend repository (`chatbotfbweb`) only consumes backend APIs and renders UI.
- Any `/ask` behavior changes are implemented in backend command/services, not frontend code.

## Runtime Components

- `src/index.ts`
: Bootstraps config, MongoDB context, services, auth flow, dashboard API routes, and webhook routes.
- `src/services/botMessageProcessor.ts`
: Parses incoming webhook messages, resolves command, dispatches handler, and controls message persistence.
- `src/commands.ts`
: Defines `BotCommandContext`, `BotCommandHandler`, and `BotCommandDispatcher`.
- `src/botCommands/*.ts`
: One file per command (`ask`, `weather`, `pick`, `history`, etc.).
- `src/services/facebookGraphService.ts`
: Facebook Graph API integration for send/get profile/page id.
- `src/services/geminiService.ts`
: Gemini planner + answer generation.
- `src/mongo.ts`
: MongoDB connection/context provider.

## Command Set

Current commands (primary):

- `/ask <question>`
- `/weather [day] [location]` (today or max 5-day forecast)
- `/pick [-n <count>] -l item1; item2; ...`
- `/random [min] [max]`
- `/time`, `/uptime`, `/ping`
- `/about`, `/echo`, `/fb`, `/link`, `/me`
- `/mem`, `/top`, `/history`
- `/help` (`/h`)

Useful aliases include `/gio`, `/keo`, `/up`, `/say`, `/info`.

## Message Persistence Rules

Current persistence behavior in `src/services/botMessageProcessor.ts`:

- Only user messages for `/ask` are stored.
- Only bot replies produced in `/ask` flow are stored.
- Other commands do not write to `messages` collection.

## `/ask` Two-Stage Retrieval Flow

`/ask` command (`src/botCommands/ask.ts`) uses a staged Mongo + Gemini flow:

1. Send a waiting message to user (AI is searching docs).
2. Load 3 recent ask messages from `messages` collection.
3. Load candidate knowledge metadata from `knowledge_base` (`_id`, `topic`, `keywords`) based on token matching.
4. Ask Gemini planner to decide:
	- answer immediately, or
	- request additional knowledge by id/topic.
5. If requested, load full knowledge documents by selected ids and call Gemini again for the final response.

This architecture minimizes unnecessary context payload while preserving deep-answer capability when extra knowledge is needed.

## Weather Flow

`/weather` command (`src/botCommands/weather.ts`):

- Current weather: `GET /data/2.5/weather?q=...`
- Forecast: `GET /data/2.5/forecast?q=...`
- Day offset limit: max `5`
- Default location from `OpenWeather__DefaultLocation`

## HTTP Surface

Public/auth routes:

- `GET /health`
- `GET /api/auth`
- `GET /api/auth/callback`
- `GET /api/logout`

Dashboard routes:

- `GET /api/dashboard`
- `POST /api/dashboard`
- `PUT /api/dashboard`
- `DELETE /api/dashboard`

Webhook routes:

- `GET /webhook` and `GET /api/webhook`
- `POST /webhook` and `POST /api/webhook`

## Environment Configuration

Core variables:

- `Mongo__ConnectionString`
- `Mongo__DatabaseName`
- `Facebook__PageAccessToken`
- `Facebook__PageId`
- `Facebook__GraphApiVersion`
- `Facebook__AppSecret`
- `Gemini__ApiKey`
- `Gemini__Model`
- `OpenWeather__ApiKey`
- `OpenWeather__DefaultLocation`
- `OpenWeather__Language`
- `OpenWeather__Units`
- `Webhook__VerifyToken`
- `Auth__GoogleClientId`
- `Auth__GoogleClientSecret`
- `Auth__OAuthRedirect`
- `Auth__FrontendBaseUrl`
- `Auth__SessionSecret`

See `.env.example` for template values.

## Build and Run

```bash
npm install
npm run dev
npm run build
npm start
```
