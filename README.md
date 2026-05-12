# BotFacebook Node

This folder contains the Node.js rewrite of the old ASP.NET Core backend.

## What it does

- Facebook webhook verification and message receive flow.
- Dashboard CRUD for knowledge base and authorized users.
- Google login for the dashboard with HttpOnly cookie session auth.
- Bot command support is split into individual files under `src/botCommands`.
- Current commands: `/ask`, `/about`, `/echo`, `/time`, `/uptime`, `/ping`, `/me`, `/fb`, `/link`, `/random`, `/pick`, `/mem`, `/top`, `/history`, `/help`.

## Command Layout

- `src/commands.ts` keeps the shared `BotCommandContext`, `BotCommandHandler`, and dispatcher.
- `src/botCommands/*.ts` contains one command per file.
- `src/botCommands/shared.ts` contains shared helper functions used by multiple commands.

Useful aliases:

- `/h` for help
- `/gio` and `/keo` for time
- `/up` for uptime
- `/say` for echo
- `/info` for about

## Commands Overview

### `/pick` - Random selection from list

Picks one or more random items from a semicolon-separated list. Useful for group decisions.

**Usage:**
- `/pick -l item1; item2; item3` → picks 1 random item (default)
- `/pick -n 2 -l ăn cơm; ăn bún; ăn chè; uống cà phê` → picks 2 random items without replacement

**Parameters:**
- `-l` (required): List of items separated by semicolons
- `-n` (optional): Number of items to pick (default: 1)

Example: `/pick -n 3 -l A; B; C; D; E` returns 3 random items

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

## Verification

- `npm run check`
- `npm run build`