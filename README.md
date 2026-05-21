# BotFacebook Node

This folder contains the Node.js rewrite of the old ASP.NET Core backend.

## Project Role In 2-Repo Setup

`chatbotfbNode` is the runtime core of the platform:

- Receives Facebook webhook events and sends bot replies.
- Hosts auth and dashboard APIs used by the Vue frontend.
- Stores operational data in MongoDB.
- Calls Gemini for AI answer generation.

The frontend repo (`chatbotfbweb`) does not replace this runtime role. It only consumes backend APIs.

## What it does

- Facebook webhook verification and message receive flow.
- Dashboard CRUD for knowledge base and authorized users.
- Google login for the dashboard with HttpOnly cookie session auth.
- Bot command support is split into individual files under `src/botCommands`.
- Current commands: `/ask`, `/about`, `/echo`, `/time`, `/weather`, `/uptime`, `/ping`, `/me`, `/fb`, `/link`, `/random`, `/pick`, `/mem`, `/top`, `/history`, `/help`.

## Command Layout

- `src/commands.ts` keeps the shared `BotCommandContext`, `BotCommandHandler`, and dispatcher.
- `src/botCommands/*.ts` contains one command per file.
- `src/botCommands/shared.ts` contains shared helper functions used by multiple commands.

Useful aliases:

- `/h` for help
- `/time` for time
- `/up` for uptime
- `/say` for echo
- `/info` for about

## Commands Overview

### `/ask` - Two-stage AI retrieval from MongoDB

`/ask` now runs in 2 phases to reduce token usage and improve context accuracy:

- Bot sends an immediate waiting message: AI is searching for documents.
- Phase 1 (planner): send Gemini the user question, 3 recent user ask messages, and only knowledge metadata (`id`, `topic`, `keywords`).
- If planner says data is enough, bot returns answer immediately.
- If planner requests more context, backend loads only requested knowledge documents from MongoDB and calls Gemini again for the final answer.

This keeps responses fast while still allowing deep answers when needed.

### `/pick` - Random selection from list

Picks one or more random items from a semicolon-separated list. Useful for group decisions.

**Usage:**
- `/pick -l item1; item2; item3` → picks 1 random item (default)
- `/pick -n 2 -l ăn cơm; ăn bún; ăn chè; uống cà phê` → picks 2 random items without replacement

**Parameters:**
- `-l` (required): List of items separated by semicolons
- `-n` (optional): Number of items to pick (default: 1)

Example: `/pick -n 3 -l A; B; C; D; E` returns 3 random items

### `/weather` - Weather by day and location

Shows weather for today or forecast for N days later.

**Usage:**
- `/weather` → today at default location (`Da Nang`)
- `/weather Hue` → today in Hue
- `/weather 3 Hue` → forecast 3 days later in Hue
- `/weather 5` → forecast 5 days later in default location

**Parameters:**
- `day` (optional): day offset from today, default `0`, max `5`
- `location` (optional): city/location, default from `OpenWeather__DefaultLocation`

## Setup

Copy `.env.example` to `.env` and fill in the secrets. The loader also accepts a `.env` file placed in a parent folder, so you can keep the same environment layout you used for the .NET app.

Important environment keys:

- `Mongo__ConnectionString`
- `Mongo__DatabaseName`
- `Facebook__PageAccessToken`
- `Facebook__PageId`
- `Facebook__GraphApiVersion`
- `Facebook__AppSecret`
- `Gemini__ApiKey`
- `OpenWeather__ApiKey`
- `Webhook__VerifyToken`
- `Auth__GoogleClientId`
- `Auth__GoogleClientSecret`
- `Auth__OAuthRedirect`
- `Auth__FrontendBaseUrl`
- `Auth__SessionSecret`

Run locally:

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm start
```

The server listens on `PORT` and defaults to `5000`.

## Notes

- The Node version keeps the original API shape so the Facebook webhook, admin dashboard, and bot commands can be swapped in without changing the external flow.
- The Facebook callback URL can point to either `/webhook` or `/api/webhook`, but it must target the Node backend domain, not the frontend Vercel site.
- Webhook signature verification is supported when `Facebook__AppSecret` is set.
- The app fails fast on weak or missing `Auth__SessionSecret` values instead of silently booting with the old default.
- The dashboard and auth cookies rely on the backend being served behind HTTPS in production.
- Message history persistence is intentionally scoped: only user `/ask` messages and bot replies in `/ask` flow are stored in MongoDB.

## End-to-End Integration Summary

- Facebook users chat with the bot through backend webhook routes.
- Admin users manage knowledge and authorized users through the Vue frontend.
- Frontend calls backend `/api/*` endpoints with cookie-based auth.
- Backend uses MongoDB collections:
	- `knowledge_base`
	- `messages`
	- `authorized_users`

## Verification

- `npm run check`
- `npm run build`