# Private development preview runtime

Use the existing Vite/Socket.IO development server and worker under host-owned
Lizardtail supervision, with fresh Postgres 17 and per-instance SeaweedFS data.
No production credentials or prototype data are imported. Development explicitly
selects FakeProvider; production rejects that setting.

The installed CLI schema has no arbitrary container service or independent app
secret declaration. Run the pinned Mailpit binary as a supervised native service
with a private SMTP Unix socket and separate HTTPS UI. Its mail database lives in
host state. Better Auth consumes Lizardtail's generated 48-character storage secret
instead of committing a credential. This couples those development credentials;
production provisioning remains separate. A future CLI secret facility can give
the application an independent generated secret.

The managed Caddy Unix route does not provide a usable forwarded client-IP chain.
Use socket-peer accounting for this preview rather than trusting unsanitized
headers; users share loopback rate limits. Cookies follow the configured HTTPS
auth origin, and browser S3 signatures use a separate public endpoint while SDK
operations retain the internal endpoint.
