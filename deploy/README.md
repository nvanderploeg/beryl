# Example production configuration

Starting points for running the published image `ghcr.io/nvanderploeg/beryl` behind a reverse
proxy. Adapt them to your host.

| File                       | What it is                                                                                                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compose.prod.yml`         | MySQL and the app, with the app bound to `127.0.0.1:3270`. Migrations run at boot. MySQL is sized for a small shared host.                                                                                       |
| `beryl.env.example`        | Copy to `beryl.env` and `chmod 600` it. Passwords are hex only (`openssl rand -hex 24`) because they are spliced into `DATABASE_URL`. Set `ORIGIN` to your public URL.                                           |
| `nginx/beryl.conf.example` | A server block for nginx. The stream route turns off buffering and holds connections for an hour, the wait route outlasts its 60 s long-poll, and every route passes `X-Real-IP`, which the write limit keys on. |
| `systemd/beryl-update.*`   | A timer that pulls `latest` every 10 minutes and recreates the app when the image changed. Expects the stack in `/opt/beryl`.                                                                                    |

```sh
docker compose -p beryl --env-file deploy/beryl.env -f deploy/compose.prod.yml up -d
```

Pin a build with `BERYL_TAG=sha-<short>` to roll back. `GET /api/health` answers
`{"service":"beryl",...,"db":"ok"}` when the app and database are up.

Point agents at the server with `BERYL_URL=https://beryl.example.com` (see `docs/usage.md`).
