# Example production configuration

Starting points for running the published image `ghcr.io/nvanderploeg/speculum` behind a reverse
proxy. Adapt them to your host.

| File                          | What it is                                                                                                                                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compose.prod.yml`            | MySQL and the app, with the app bound to `127.0.0.1:3270`. Migrations run at boot. MySQL is sized for a small shared host.                                                                                       |
| `speculum.env.example`        | Copy to `speculum.env` and `chmod 600` it. Passwords are hex only (`openssl rand -hex 24`) because they are spliced into `DATABASE_URL`. Set `ORIGIN` to your public URL.                                        |
| `nginx/speculum.conf.example` | A server block for nginx. The stream route turns off buffering and holds connections for an hour, the wait route outlasts its 60 s long-poll, and every route passes `X-Real-IP`, which the write limit keys on. |
| `systemd/speculum-update.*`   | A timer that pulls `latest` every 10 minutes and recreates the app when the image changed. Expects the stack in `/opt/speculum`.                                                                                 |

```sh
docker compose -p speculum --env-file deploy/speculum.env -f deploy/compose.prod.yml up -d
```

Pin a build with `SPECULUM_TAG=sha-<short>` to roll back. `GET /api/health` answers
`{"service":"speculum",...,"db":"ok"}` when the app and database are up.

Point agents at the server with `SPECULUM_URL=https://speculum.example.com` (see `docs/usage.md`).
