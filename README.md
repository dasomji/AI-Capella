# LightScore

Shared ensemble score library, synchronized rehearsal and reviewed score transcription.
This production fork runs a persistent Node/Socket.IO web server and separate worker,
with PostgreSQL, private S3 storage and verified email accounts.

Requires Node >=22.22, Docker, python3, libseccomp2 and Poppler (`pdftoppm`).

```sh
npm ci
cp .env.example .env
# Edit placeholders for local-only DB, SMTP and S3; never commit .env.
docker compose up -d
npm run db:migrate
npm run dev
# Separate terminal; paid transcription requires deliberate provider configuration:
npm run worker
```

Local mail is in Mailpit at http://localhost:28025. Use FakeProvider/recorded fixtures
for routine tests; do not configure real provider keys for CI. Run `npm run build`
then `NODE_ENV=test npm start` for built-mode local mail testing.

```sh
npm run typecheck
npm test
npm run build
npm run test:integration
npm run test:browser
npm run test:browser:transcription
npm run check:secrets
npm run test:backup
```

See [development](docs/DEVELOPMENT.md), [architecture](PROJECT.md),
[deployment](docs/DEPLOYMENT.md), [operations/recovery](docs/RUNBOOK.md),
[security](docs/SECURITY.md), [sysadmin](docs/SYSADMIN.md) and [phase plan](docs/PLAN.md).
Legacy Firebase/functions/rules-test/scan sources are retained for migration and
separately authorized retirement; production app CI and images exclude them.
