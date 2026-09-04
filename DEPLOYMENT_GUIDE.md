# 🚀 CloudFusion Deployment Guide: Vercel (Frontend) & Render (Backend)

This step-by-step guide explains how to deploy CloudFusion with **Render** hosting the Express/Prisma API and **Vercel** hosting the Next.js frontend.

---

## Architecture Overview

```
 ┌──────────────────────────────────────────────┐
 │             Vercel (Frontend)                │
 │    https://your-app.vercel.app               │
 └──────────────────────┬───────────────────────┘
                        │
                        │ HTTPS (NEXT_PUBLIC_API_URL)
                        ▼
 ┌──────────────────────────────────────────────┐
 │              Render (Backend)                │
 │    https://your-backend.onrender.com         │
 └──────────┬─────────────────────────┬─────────┘
            │                         │
            ▼                         ▼
   ┌─────────────────┐      ┌─────────────────────────────┐
   │ PostgreSQL / DB │      │ Multi-Cloud Storage Mesh    │
   │   (Supabase)    │      │ Google Drive, OneDrive,     │
   └─────────────────┘      │ Dropbox, AWS S3, MEGA       │
                            └─────────────────────────────┘
```

---

## Part 1: Deploy Backend on Render

1. Log into your [Render Dashboard](https://dashboard.render.com/) and click **New +** -> **Web Service**.
2. Connect your GitHub repository: `BANGHA-JPH/Multi-cloud-system`.
3. Configure the service settings:
   - **Name**: `cloudfusion-backend` (or your preferred name)
   - **Region**: Choose the region closest to you (e.g., Frankfurt / Oregon)
   - **Root Directory**: `backend` *(CRITICAL)*
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
   - **Plan**: `Free`

4. Scroll down to **Environment Variables** and add the following keys:
   | Key | Recommended Value | Notes |
   | :--- | :--- | :--- |
   | `NODE_ENV` | `production` | Enables production optimizations & cross-site cookies |
   | `PORT` | `10000` | Render standard port |
   | `DATABASE_URL` | `postgresql://...` | Your Supabase or PostgreSQL connection string |
   | `DIRECT_URL` | `postgresql://...` | (If using Supabase) Direct connection string |
   | `JWT_SECRET` | *(Generate a 32+ char secret)* | Used to sign auth session tokens |
   | `ENCRYPTION_MASTER_KEY` | *(32-byte hex string)* | Used for AES-256-GCM file encryption |
   | `SERVER_URL` | `https://your-backend.onrender.com` | Your Render web service URL |
   | `CLIENT_URL` | `https://your-app.vercel.app` | Your frontend Vercel URL (add once deployed) |
   | `GOOGLE_CLIENT_ID` | `your_google_client_id` | Google Cloud OAuth Client ID |
   | `GOOGLE_CLIENT_SECRET` | `your_google_client_secret` | Google Cloud OAuth Client Secret |
   | `ONEDRIVE_CLIENT_ID` | `your_microsoft_client_id` | Microsoft Azure App Registration ID |
   | `ONEDRIVE_CLIENT_SECRET`| `your_microsoft_secret` | Microsoft Azure Client Secret |
   | `DROPBOX_APP_KEY` | `your_dropbox_app_key` | Dropbox Developer App Key |
   | `DROPBOX_APP_SECRET` | `your_dropbox_app_secret`| Dropbox Developer App Secret |
   | `AWS_REGION` | `eu-north-1` | AWS S3 region |
   | `AWS_ACCESS_KEY_ID` | `your_aws_key_id` | AWS IAM User Key |
   | `AWS_SECRET_ACCESS_KEY` | `your_aws_secret` | AWS IAM Secret |
   | `AWS_S3_BUCKET_NAME` | `your_bucket_name` | S3 Bucket Name |

5. Click **Deploy Web Service**.
6. Once deployed, verify health by visiting: `https://your-backend.onrender.com/api/health`.

---

## Part 2: Deploy Frontend on Vercel

1. Log into your [Vercel Dashboard](https://vercel.com/) and click **Add New...** -> **Project**.
2. Import the `BANGHA-JPH/Multi-cloud-system` repository.
3. Configure the project:
   - **Framework Preset**: `Next.js`
   - **Root Directory**: Click *Edit* and select `frontend` *(CRITICAL)*
   - **Build Command**: `next build` (default)
   - **Output Directory**: `.next` (default)

4. In the **Environment Variables** section, add:
   | Key | Value |
   | :--- | :--- |
   | `NEXT_PUBLIC_API_URL` | `https://your-backend.onrender.com` |

   *(Replace with the actual Render backend URL obtained in Part 1).*

5. Click **Deploy**.
6. Vercel will build and assign your domain: `https://your-app.vercel.app`.

---

## Part 3: Final Link & OAuth Redirects

1. Go back to your **Render Web Service** -> **Environment** and update:
   - `CLIENT_URL` = `https://your-app.vercel.app`

2. If you are using Google OAuth, Microsoft Graph, or Dropbox OAuth, add the Render redirect URIs in the respective developer portals:
   - **Google Cloud Console**:
     - `https://your-backend.onrender.com/api/auth/google/callback`
     - `https://your-backend.onrender.com/api/storage/gdrive/callback`
   - **Microsoft Azure Portal**:
     - `https://your-backend.onrender.com/api/storage/onedrive/callback`
   - **Dropbox Developer Console**:
     - `https://your-backend.onrender.com/api/storage/dropbox/callback`

---

## Part 4: Verification Checklist

- [ ] Open `https://your-app.vercel.app/login`.
- [ ] Register a new account or log in.
- [ ] Confirm storage quota reflects live on the dashboard without manual page refreshes.
- [ ] Connect a cloud provider (Google Drive, OneDrive, Dropbox, AWS S3, or MEGA).
- [ ] Test uploading, downloading, and deleting an encrypted file.
