# Security Policy — SmartStadium AI v2.0

## 🔐 Secret Management

All API keys are stored in **Google Secret Manager**. At runtime, Cloud Run pulls them via `--set-secrets`. No secrets appear in:
- Source code
- Docker images
- Environment files committed to Git
- CI/CD logs

**Verify:** `gcloud secrets list --project=YOUR_PROJECT`

## 🛡️ Authentication & Authorization

### Firebase Authentication
- Google Sign-In enforced for all write operations
- JWT tokens verified server-side via `firebase-admin.auth().verifyIdToken()`
- Tokens expire after 1 hour (Firebase-managed)

### Role-Based Access Control
| Role | Permissions |
|---|---|
| `attendee` | Read zones/gates, submit check-ins |
| `staff` | + Close gates, generate announcements |
| `admin` | + View audit logs, all operations |

Roles are set as Firebase Custom Claims:
```bash
# Set admin role (run once per admin user)
firebase auth:export users.json
# Then use Admin SDK to set custom claims
```

### Firestore Security Rules
Rules are in `infra/firestore.rules`. Key protections:
- Users can only read their own check-in records
- Zone/gate writes restricted to `staff` and `admin` roles
- Audit logs are server-write-only (can't be tampered with by clients)

**Deploy rules:** `firebase deploy --only firestore:rules`

## 🚦 Rate Limiting

| Endpoint group | Limit |
|---|---|
| All `/api/` routes | 100 req / 15 min / IP |
| `/api/gemini/*` | 20 req / min / IP |
| `/api/auth/*` | 10 req / 15 min / IP |

Implemented via `express-rate-limit` with RFC-compliant `RateLimit-*` headers.

## 🔒 HTTP Security Headers

All responses include (via `helmet`):

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `0` (modern CSP replaces this) |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Content-Security-Policy` | Strict allowlist (see server/index.js) |

## 🧹 Input Validation & Sanitization

- All request bodies validated with `express-validator`
- Gemini queries sanitized (HTML stripped, truncated to 2000 chars)
- BigQuery uses parameterized queries exclusively (no string interpolation)
- JSON body limit: 10 KB

## 🌐 CORS

Origin allowlist configured via `ALLOWED_ORIGINS` environment variable.  
In production: only the Cloud Run domain is whitelisted.

## 🔑 HTTPS

Cloud Run enforces HTTPS on all traffic. HTTP requests are automatically redirected to HTTPS at the infrastructure level.

## 📋 Dependency Security

```bash
# Audit for vulnerabilities
npm audit

# Fix automatically where safe
npm audit fix
```

## 📝 Audit Logging

All admin actions logged to **Google Cloud Logging** with:
- Timestamp
- User ID + role
- Action performed
- Request IP (hashed)

**View logs:**
```bash
gcloud logging read "resource.type=cloud_run_revision AND logName=smartstadium-api" --limit 50
```

## 🐳 Container Security

- Base image: `node:18-alpine` (minimal attack surface)
- Runs as non-root user `appuser`
- Read-only filesystem (no sensitive writes at runtime)
- No shell installed in production image

## 🔍 Vulnerability Disclosure

Report security vulnerabilities to the project maintainer. Do not open public GitHub issues for security bugs.
