# NeedyNeeds - Deployment Guide

This repository contains the NeedyNeeds frontend (Vite + React) and an Express-based API in `server/`.

This guide covers preparing and deploying the frontend to Vercel and options for deploying the backend.

## Required environment variables (set in Vercel/GitHub secrets)

- `VITE_API_BASE` — Frontend runtime API base URL, e.g. `https://api.example.com`
- `MONGODB_URI` — MongoDB Atlas connection string for the backend
- `MONGODB_DB` — Database name (e.g. `needyneeds`)
- `ADMIN_API_KEY` — Shared secret for write operations (set to a strong value)

> Do NOT commit any secrets to the repository. Ensure `.env` is listed in `.gitignore`.

## Frontend (Vercel) setup

1. In the Vercel project settings, add the following Environment Variables for `Production`:
   - `VITE_API_BASE` -> `https://<your-api-host>`

2. Build command: `npm run build`
   Output directory: `dist`

3. Deploy. After deployment, open the site and use browser DevTools → Network to inspect calls to `/api`.

If the frontend shows "no data":

- Confirm the backend API is reachable: `curl -I $VITE_API_BASE/api/health`
- Check Vercel dashboard logs for runtime fetch errors (401, 404, CORS).

## Backend deployment options

You must deploy the `server/` Express API where it can reach MongoDB Atlas and accept requests from the frontend origin.

Options:

- Deploy to a small service like Render, Fly, or a VPS. Set environment variables above.
- Convert `server/` to Vercel Serverless functions under `/api` and set `MONGODB_URI` in Vercel. Warning: cold-starts and connection pooling need tuning.

Example quick test (replace `API_HOST`):

```bash
curl -i https://API_HOST/api/health
```

Expect JSON: `{ "ok": true, "db": "needyneeds" }` when `MONGODB_URI` is correctly configured.

## CI / Optional automatic deploy

A GitHub Actions workflow is included to run `npm run build` on pushes. You can configure it to deploy to Vercel using a `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, and `VERCEL_ORG_ID` secrets.

## Security note

Your `MONGODB_URI` contains credentials — keep it secret. If this credential has been committed anywhere, rotate the user/password immediately in Atlas and update the connection string in the deployment environment.

## Troubleshooting checklist

1. Frontend fetch errors (401): ensure `ADMIN_API_KEY` is set and the frontend is not attempting write-only operations without the header.
2. CORS errors: backend uses `cors()` to allow all origins by default; if you restrict origins, ensure your frontend origin is allowed.
3. Empty dataset: verify your MongoDB Atlas cluster contains data and the `MONGODB_URI` points to the correct DB.
<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/118xlSgrX1utzTx_vWvYTcNTp5mU_26kU

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
