# Example production configuration

Starting points for running the published image `ghcr.io/nvanderploeg/beryl` behind a reverse
proxy. Adapt them to your host.

| File                       | What it is                                                                                                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compose.prod.yml`         | Postgres and the app, with the app bound to `127.0.0.1:3270`. Migrations run at boot.                                                                                                                            |
| `beryl.env.example`        | Copy to `beryl.env` and `chmod 600` it. Passwords are hex only (`openssl rand -hex 24`) because they are spliced into `DATABASE_URL`. Set `ORIGIN` to your public URL.                                           |
| `nginx/beryl.conf.example` | A server block for nginx. The stream route turns off buffering and holds connections for an hour, the wait route outlasts its 60 s long-poll, and every route passes `X-Real-IP`, which the write limit keys on. |
| `systemd/beryl-update.*`   | A timer that pulls `latest` every 10 minutes and recreates the app when the image changed. Expects the stack in `/opt/beryl`.                                                                                    |

```sh
docker compose -p beryl --env-file deploy/beryl.env -f deploy/compose.prod.yml up -d
```

Pin a build with `BERYL_TAG=sha-<short>` to roll back. `GET /api/health` answers
`{"service":"beryl",...,"db":"ok"}` when the app and database are up.

## Moving to another host

Set `ADMIN_TOKEN` in `beryl.env`, open `/admin`, and download a bundle. Bring up the new host
the same way, open its `/admin`, and import the bundle. Write keys keep working because the
bundle carries their hashes; browser Sessions and Pairing codes are not carried, so the agent
mints a new Private link. To import more than `BERYL_BODY_LIMIT` (8M by default), raise
`BERYL_BODY_LIMIT` for the import and lower it again. Pre-import backups land in the `backups`
volume (`ADMIN_BACKUP_DIR`), the newest five kept. See `docs/admin.md`.

Bundles exported by MySQL-era builds import unchanged.

## External Postgres (Kubernetes and shared servers)

Set `DATABASE_URL=postgres://user:pw@host:5432/beryl?sslmode=verify-full` and leave out the `db`
service. The user and password are spliced into the URL unencoded, so use hex-only passwords.

- **TLS.** The `pg` driver (8.23) reads `sslmode=require`, `prefer` and `verify-ca` as full
  certificate and hostname verification, not as libpq does. `sslmode=no-verify` turns verification
  off. Add `uselibpqcompat=true` to get libpq semantics (`require` encrypts without verifying,
  `verify-ca` skips the hostname check). Prefer `verify-full`. For a private CA, add
  `sslrootcert=/path/ca.pem` and mount the file into the container.
- **Role.** The migration creates its tables in schema `public` and a `drizzle` schema for its
  bookkeeping, so the role must own the database. Postgres 15 and later deny `CREATE` on `public`
  to non-owners.
- **One replica.** Run a single app pod. Streams and `beryl wait` are fanned out in process, and
  the Bundle import lock and `ADMIN_BACKUP_DIR` are per pod. Rolling updates may overlap two pods
  briefly; migrations take an advisory lock, so that is safe.

Point agents at the server with `BERYL_URL=https://beryl.example.com` (see `docs/usage.md`).
