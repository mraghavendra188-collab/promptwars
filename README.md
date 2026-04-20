# SmartStadium AI v2.0

> Real-time crowd management platform for large-scale sporting venues, powered by **Google Cloud** services.

## 🏟️ Live Demo
**Fan App:** https://smartstadium-627052888638.us-central1.run.app/app  
**Admin Dashboard:** https://smartstadium-627052888638.us-central1.run.app/admin

---

## 🏛️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Google Cloud Run                          │
│  Express Server (Node 18 / Alpine Docker)                   │
│                                                             │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐   │
│  │ /app    │  │ /admin   │  │ /api     │  │ WebSocket │   │
│  │ Fan PWA │  │ Dashboard│  │ REST API │  │ Real-time │   │
│  └────┬────┘  └────┬─────┘  └─────┬────┘  └─────┬─────┘   │
└───────┼────────────┼──────────────┼──────────────┼─────────┘
        │            │              │              │
        ▼            ▼              ▼              ▼
   Firebase     Firestore      Gemini 1.5     Crowd Sim
   Auth +        onSnapshot     Flash API      → Pub/Sub
   Google        (real-time)    (streaming)    → BigQuery
   Sign-In
        │                       │
        ▼                       ▼
  Google Maps              Cloud Logging
  JS API +                 (Structured)
  Heat Map +
  Directions
```

## ☁️ Google Services Used

| Service | How It's Used |
|---|---|
| **Cloud Run** | Auto-scaling container host (min 1 instance warm) |
| **Firebase Auth** | Google Sign-In + JWT token verification |
| **Cloud Firestore** | Real-time crowd density (onSnapshot, no polling) |
| **Gemini 1.5 Flash** | Streaming gate recommendations + PA announcements |
| **Google Maps JS API** | Stadium heat map, gate markers, walking directions |
| **Cloud Pub/Sub** | Gate scan event streaming |
| **BigQuery** | Historical crowd analytics (parameterized queries) |
| **Cloud Storage** | Static asset hosting |
| **Secret Manager** | All API keys (never hardcoded in code/env) |
| **Cloud Logging** | Structured audit logs from all services |

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Google Cloud account with billing enabled
- Firebase project

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Fill in your API keys
```

### 3. Set up Google Cloud credentials
```bash
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

### 4. Run locally
```bash
npm run dev
# Open http://localhost:3000/app
```

## 🧪 Testing

```bash
# Run all tests with coverage
npm test

# Unit tests only
npm run test:unit

# Integration tests only  
npm run test:integration

# E2E tests (requires Playwright)
npm run test:e2e

# View coverage report
open tests/coverage-report/index.html
```

### Test Structure

```
tests/
├── unit/
│   ├── crowd_logic.test.js       (28 tests — crowd.js functions)
│   └── gemini_service.test.js    (12 tests — Gemini service)
├── integration/
│   ├── api.test.js               (20 tests — all REST endpoints)
│   └── firebase.test.js          (10 tests — Firestore operations)
└── e2e/
    └── user_journey.spec.js      (Playwright — full user flows)
```

**Coverage target: ≥ 80% lines/functions**

## 🏗️ Deploy to Cloud Run

```bash
# Build and deploy
gcloud run deploy smartstadium \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances 1 \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest

# Or use Cloud Build CI/CD
gcloud builds submit --config infra/cloudbuild.yaml
```

## 📁 Project Structure

```
├── server/
│   ├── index.js              Main Express server
│   ├── simulator.js          Real-time crowd data generator
│   ├── routes/               API endpoint handlers
│   ├── services/             Google Cloud service wrappers
│   ├── middleware/           Auth, rate-limit, validation, security
│   └── utils/                Crowd logic, logger
├── public/
│   ├── app/                  Fan PWA (Maps + Firebase + Gemini)
│   └── admin/                Staff dashboard
├── tests/                    Unit, integration, E2E tests
├── infra/
│   ├── cloudbuild.yaml       CI/CD pipeline
│   └── firestore.rules       Database security rules
├── Dockerfile
├── .env.example
├── SECURITY.md
└── ACCESSIBILITY.md
```

## 🔒 Security

See [SECURITY.md](./SECURITY.md) for full security measures.

## ♿ Accessibility

See [ACCESSIBILITY.md](./ACCESSIBILITY.md) for WCAG 2.1 AA compliance details.
