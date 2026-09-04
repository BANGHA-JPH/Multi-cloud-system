# CloudFusion — Multi-Cloud System Project Status & Comprehensive Guide

**Last Updated:** August 26, 2026  
**System Architecture:** Next.js (Frontend) + Express TypeScript (Backend) + Prisma (PostgreSQL / Supabase) + AES-256 E2EE Multi-Cloud Mesh

---

## 📌 Project Overview
CloudFusion is a zero-knowledge, end-to-end encrypted (AES-256-GCM + SHA-256) multi-cloud storage aggregator. It unifies **AWS S3, Google Drive, Microsoft OneDrive, Dropbox, and MEGA Cloud** into a single aggregated storage mesh with intelligent AI quota balancing and strict per-user data isolation.

---

## 🌐 5-Cloud Integration & Connection Modes

### 1. Google Drive (Google OAuth 2.0)
* **Auth Flow:** Direct 1-Click Google Single Sign-On (SSO).
* **Consent Screen Setup:** In Google Cloud Console -> *OAuth consent screen* -> *Audience* -> *Test users*: add any Google email address to allow connecting in development mode.
* **Storage Limit:** 15 GB+ per user.

### 2. Dropbox (Dropbox OAuth 2.0)
* **Auth Flow:** 1-Click OAuth Redirect.
* **Google SSO Support:** Users can click *"Continue with Google"* directly on the Dropbox login screen.
* **Development Quota:** Supports up to 500 unique users in development mode with zero whitelist required.

### 3. Microsoft OneDrive (Microsoft Graph API OAuth 2.0)
* **Auth Flow:** 1-Click Microsoft Single Sign-On.
* **Supported Accounts:** Any personal (`@outlook.com`, `@hotmail.com`, `@gmail.com`) or organizational Microsoft 365 account.

### 4. AWS S3 (Enterprise Cloud Vault)
* **1-Click Fast Connect (Default):** Auto-provisions an isolated, client-side AES-256 encrypted vault in the S3 cluster for that user with zero configuration required.
* **Custom IAM Keys (Advanced):** Enterprise users can optionally enter their own `Access Key ID`, `Secret Key`, `Region`, and `Bucket Name`.

### 5. MEGA Cloud (Zero-Knowledge E2EE Node)
* **1-Click Fast Connect (Default):** Instantly attaches a 20 GB zero-knowledge encrypted node to the user's storage mesh.
* **Custom Account:** Any user can enter their personal [mega.io](https://mega.io) email and password in the *"Custom Account"* tab to link their own personal MEGA drive directly.

---

## 🛠️ How to Run the Application

### 1. Start the Backend API (Port 5000)
```bash
cd backend
npm run dev
```

### 2. Start the Frontend Web App (Port 3000)
```bash
cd frontend
npm run dev
```

Open your browser at: `http://localhost:3000`

### 3. Start the React Native Mobile App (`app`)
```bash
cd app
npm start
```
Scan the terminal QR code with the **Expo Go** app on your Android phone.
*(Default backend URL is configured to your local Wi-Fi IP `http://192.168.78.133:5000` with an in-app server IP switcher).*

---

## 🧪 Verified Automated Test Scripts

Run any of these in `backend/` to verify live cloud services:
* `npx ts-node src/scripts/test-s3-live.ts` — AWS S3 connection, encrypted upload & download test
* `npx ts-node src/scripts/test-dropbox-live.ts` — Dropbox OAuth token, encrypted upload & deletion test
* `npx ts-node src/scripts/test-onedrive-live.ts` — Microsoft OneDrive Graph API test
* `npx ts-node src/scripts/test-mega-live.ts` — MEGA Cloud authentication & upload test
* `npx ts-node src/scripts/test-multiuser-isolation.ts` — Verifies 100% strict user data separation in database

---

## 🔒 Security & Data Isolation Highlights
1. **Zero-Knowledge Encryption:** Files are encrypted with random initialization vectors (`IV`) and authentication tags (`AuthTag`) via AES-256-GCM before being sent to any third-party cloud.
2. **Multi-Tenant Isolation:** Each user's cloud accounts, tokens, quotas, and file records are strictly bound to their unique `userId` in Supabase PostgreSQL.
3. **No Secret Keys Asked From End-Users:** Ordinary users connect using standard 1-click SSO or 1-click fast connect without ever dealing with API secrets.
