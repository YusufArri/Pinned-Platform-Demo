# Pinned!

Pinned! is a React/Vite appointment-booking frontend backed by a FastAPI API.
This repository is configured for a portfolio demo, not production use.

## Run locally

In the first VS Code PowerShell terminal, start the API from `backend`:

```powershell
cd .\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Still in that terminal, create the auth secret and set your email and generated
hashes; keep this terminal open because its environment variables are not shared
with other terminals:

```powershell
$env:AUTH_TOKEN_SECRET = python -c 'import secrets; print(secrets.token_urlsafe(48))'
$env:ADMIN_EMAIL = "owner@example.com"
$env:ADMIN_PASSWORD_HASH = '<paste generated password hash>'
$env:ADMIN_PIN_HASH = '<paste generated PIN hash>'
uvicorn main:app --reload
```

In the second VS Code terminal, start the frontend:

```powershell
cd .\frontend
npm ci
npm run dev -- --host 127.0.0.1
```

Open the frontend at `http://localhost:5173`, the backend API docs at
`http://127.0.0.1:8000/docs`, or its health check at
`http://127.0.0.1:8000/health`. Copy `frontend/.env.example`
to `frontend/.env.local` and set `VITE_API_BASE_URL` when the API runs elsewhere;
Vite loads that file automatically. The backend reads environment variables
directly and does not load `.env` files, so set its values in your shell or host
settings using `backend/.env.example` as a reference.

The password and PIN hashes are generated using the command in the Demo Safety
section below. Keep these environment variables private and do not commit them.
The owner portal stays unavailable until they are configured.

## Hosting configuration

- **Netlify:** the root `netlify.toml` builds the `frontend` directory. Set
  `VITE_API_BASE_URL` to the public Render API URL in the Netlify site settings.
- **Render:** the root `render.yaml` describes the FastAPI web service. Set
  `DATABASE_URL` to a Neon PostgreSQL connection string and `FRONTEND_ORIGINS`
  to the exact Netlify site origin (for example, `https://your-site.netlify.app`).
  The service uses Render's free plan; it may sleep while idle. Also configure
  `AUTH_TOKEN_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, and `ADMIN_PIN_HASH`
  in Render's environment settings.
- **Resend:** email is optional. Set `RESEND_API_KEY` in Render and use
  `EMAIL_FROM` with a sender on a verified domain for customer delivery.
  Resend's onboarding/test sender may restrict recipients, and free-plan
  allowances can change. An accepted API request does not guarantee inbox
  delivery.

Render's free web service may sleep when idle, and free-tier service/database
limits can change. This setup is suitable for a showcase, not a production
availability or data-retention promise. SMS is not integrated; the site labels
it as simulated and sends no text messages.

## Demo safety

Do not enter real customer, login, banking, or payment information. This demo
is not a production payment service. Client passwords and PINs are salted and
hashed; client/admin sessions are short-lived and held in memory by the browser.
Admin credentials are configured only on the API host, using a PBKDF2 hash for
the password and PIN. The API returns only appointment times to unauthenticated
visitors; client details and payout settings require an authorized session.
Legacy client credentials are converted to hashes when the API starts. New
bookings do not collect or store the visitor's bank account details.

The local SQLite development database is not encrypted at rest. Keep it private
and use only disposable demo data; never commit it. Rotate any credentials or
payout details that may have been used in earlier development snapshots before
using this demo.

Generate `AUTH_TOKEN_SECRET` with `python -c 'import secrets; print(secrets.token_urlsafe(48))'`.
To produce each admin hash, run this from `backend` and enter the password or PIN
at the prompt; do not put the unhashed value in source code:

```powershell
python -c 'import getpass,hashlib,secrets; value=getpass.getpass("Secret: "); salt=secrets.token_hex(16); digest=hashlib.pbkdf2_hmac("sha256",value.encode(),bytes.fromhex(salt),600000).hex(); print(f"pbkdf2_sha256$600000${salt}${digest}")'
```

Set the generated values and your admin email as Render environment variables.
For local development, set them in the shell before starting the API. Rotate any
credentials that were previously placed in frontend source.
