# BotFacebook Architecture Notes

## Overview

This repository is split into two active application surfaces:

- Vue 3 SPA frontend at `BotFacebook.Api/BotFacebook.Web`
- ASP.NET Core 8.0 backend at `BotFacebook.Api/BotFacebook.Api`

The original Node/Express source tree was removed from the repo root.

## Frontend responsibilities

- Render the landing page, dashboard, policy page, and term page.
- Call backend endpoints with `fetch` and `credentials: include`.
- Use `VITE_API_BASE_URL` to point at the backend host.
- If `VITE_API_BASE_URL` is omitted, the frontend uses relative `/api/...` URLs, which only works when the frontend is served from the same origin as the backend.
- Redirect login/logout actions through backend auth endpoints.

Key routes:

- `/` - product landing page
- `/dashboard` - admin dashboard
- `/policy` - privacy policy
- `/term` - terms of service

## Backend responsibilities

- Facebook webhook verification and event intake.
- Bot message processing and command dispatch.
- MongoDB access for knowledge base and authorized users.
- Google OAuth callback and cookie session creation.
- JSON CRUD API used by the Vue dashboard.

Key backend endpoints:

- `GET /webhook` - Facebook verification
- `POST /webhook` - Facebook message receive
- `GET /api/auth` - start Google OAuth
- `GET /api/auth/callback` - OAuth callback
- `GET /api/dashboard` - dashboard data
- `POST /api/dashboard` - create dashboard records
- `PUT /api/dashboard` - update dashboard records
- `DELETE /api/dashboard` - delete dashboard records
- `GET /api/logout` - clear cookies and redirect back to the frontend

## Configuration

Backend config is split between `appsettings.json` and environment variables.

Important values:

- `Mongo__ConnectionString`
- `Mongo__DatabaseName`
- `Facebook__PageAccessToken`
- `Facebook__PageId`
- `Facebook__GraphApiVersion`
- `Gemini__ApiKey`
- `Webhook__VerifyToken`
- `Auth__GoogleClientId`
- `Auth__GoogleClientSecret`
- `Auth__OAuthRedirect`
- `Auth__FrontendBaseUrl`
- `Auth__SessionSecret`

Frontend config:

- `VITE_API_BASE_URL`
- See `BotFacebook.Api/BotFacebook.Web/.env.example` for the frontend sample file.

## Runtime flow

1. User opens the Vue app.
2. Dashboard calls backend JSON endpoints.
3. If the session is missing, the frontend shows a Google login button.
4. Google OAuth returns to the backend callback.
5. Backend validates the email against MongoDB, sets the cookie session, and redirects to the Vue `/dashboard` route.
6. The Vue dashboard reloads data using the authenticated cookie.

## Build checks

- Backend: `dotnet build BotFacebook.Api/BotFacebook.Api.sln -c Release`
- Frontend: `cd BotFacebook.Api/BotFacebook.Web && npm run build`

## Deployment notes

- Keep the frontend origin in `Auth__FrontendBaseUrl` so login redirects and CORS stay aligned.
- If the backend and frontend are deployed separately, the Vue app must point `VITE_API_BASE_URL` at the backend host.
- The frontend does not replace the webhook endpoint. The webhook still lives in ASP.NET Core.
- Current production hosts:
	- Frontend: `https://chat-bot-fb-lime.vercel.app`
	- Backend: `https://chatbotfb-production.up.railway.app`
- Smoke test after deploy:
	- `GET /` on Railway should return the API health payload.
	- `GET /api/auth` on Railway should redirect to Google, not 404.
	- `GET /api/dashboard` without a cookie should return 401, not 404.