# CloudFusion — Multi-Cloud Encrypted Storage Mesh

CloudFusion is a high-performance, multi-cloud storage aggregation application built with Next.js, Express, TypeScript, and Prisma (PostgreSQL / Supabase). Files uploaded to CloudFusion are encrypted server-side using zero-knowledge **AES-256-GCM** before being balanced across Google Drive, AWS S3, Dropbox, MEGA, and OneDrive.

---

## 🚀 Database Bootstrap & Setup Instructions

Follow these steps to initialize the database schema and start the application:

### 1. Environment Configuration
Copy `.env.example` in the `backend` directory to `backend/.env`:
```bash
cp backend/.env.example backend/.env
```
Ensure both `DATABASE_URL` and `DIRECT_URL` are defined in `backend/.env`:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/cloudfusion?schema=public"
DIRECT_URL="postgresql://postgres:password@localhost:5432/cloudfusion?schema=public"
```
> **Note**: `DIRECT_URL` is required by Prisma for database schema push and migrations (especially when using Supabase or pooled connections).

### 2. Prisma Database Schema Bootstrap
Navigate to the `backend` directory and run:
```bash
cd backend
npx prisma db push && npx prisma generate
```

### 3. Start Development Servers

- **Backend Express API** (port 5000):
  ```bash
  cd backend
  npm run dev
  ```

- **Frontend Next.js App** (port 3000):
  ```bash
  cd frontend
  npm run dev
  ```

---

## 🔒 Security Architecture

- **AES-256-GCM Encryption**: Files are encrypted server-side with a master key before streaming to target cloud APIs.
- **Streaming Decryption**: Downloads use Node.js transform streams (`crypto.createDecipheriv`) to stream decrypted binary contents to the browser on-the-fly.
- **Short-Lived Download Tokens**: Browser retrievals utilize single-use 60-second signed JWT tokens issued via `POST /api/files/:id/download-token`.
- **Integrity Auditing**: SHA-256 checksums are calculated and verified to detect file tampering.