# Admin portal

For the server's owner: health, deleting Projects and Topics, and moving the service to another host. Beryl has no users; this is the one place a person administers it.

## Access

Set `ADMIN_TOKEN` (at least 16 characters; `openssl rand -hex 24`). Unset, `/admin` and every `/api/admin/*` route answer 404, as if they did not exist.

- **Browser**: `/admin` shows a login form. A correct token sets the `beryl_admin` cookie: HttpOnly, SameSite=Strict, Secure under an https `ORIGIN`, signed with a key derived from the token, valid eight hours. Changing the token ends every session.
- **curl**: `Authorization: Bearer <token>` on any `/api/admin` request.
- **CSRF**: a state-changing request authenticated by cookie must carry a matching `Origin` and the `x-csrf-token` header (the portal gets the value from its page load). Bearer requests are exempt; nothing sends a Bearer header on its own.
- **Brute force**: five failed attempts (login or Bearer) from one address lock it out for 15 minutes (429 with `retry-after`).
- The lockout keys on the client address, so it is only as good as `ADDRESS_HEADER`: behind a proxy that does not set a trustworthy header, every client shares one address (or an attacker picks theirs). A locked address is refused even with the right token. The table of tracked addresses is capped at 10 000.
- The gate matches the path as the router decodes it (percent-decoding to a fixed point, case folded, slashes collapsed); a malformed encoding is a 400. Every admin handler also requires the gate's verdict itself, so a request that slipped past it gets 404 (token unset) or 401.
- The login body is capped at 1 KiB, and every JSON API body at 8 MiB, counted as it streams, whatever `BODY_SIZE_LIMIT` is.
- The token is compared in constant time (sha256 of both sides, `timingSafeEqual`).

## API

All JSON unless noted. 401 without credentials, 403 on a CSRF failure.

| Method | Path                                           | Does                                                                                                             |
| ------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/admin/login`                             | `{token}`; sets the cookie, returns `{ok, csrf}`                                                                 |
| POST   | `/api/admin/logout`                            | clears the cookie                                                                                                |
| GET    | `/api/admin/stats`                             | `{service, appVersion, build, database:{name,bytes}, counts, schema, migrations:[{tag,applied}]}`                |
| GET    | `/api/admin/projects`                          | Projects with their Topics: node, note and event counts, `bytes` (payload held, not disk size), `lastActivityAt` |
| DELETE | `/api/admin/projects/:id`                      | body `{confirm: <exact Project name>, confirmId: <the id>}`; cascades                                            |
| DELETE | `/api/admin/topics/:id`                        | body `{confirm: <exact Topic title>, confirmId: <the id>}`                                                       |
| GET    | `/api/admin/export`                            | streams a Bundle (`application/zip`)                                                                             |
| POST   | `/api/admin/import?confirm=replace-everything` | body is the zip; replaces everything. A Bundle with no Projects is refused unless `&allowEmpty=1`                |

```sh
curl -H "Authorization: Bearer $ADMIN_TOKEN" -o beryl.zip https://old.example.com/api/admin/export
curl -H "Authorization: Bearer $ADMIN_TOKEN" --data-binary @beryl.zip \
  -H 'content-type: application/zip' \
  'https://new.example.com/api/admin/import?confirm=replace-everything'
```

## Bundle

`manifest.json`, the same shape across the sagas, chronicle and beryl services:

```json
{
	"format": 1,
	"service": "beryl",
	"appVersion": "0.1.0",
	"schema": "0001_firebase_owner",
	"createdAt": "2026-11-06T17:00:00.000Z",
	"files": [{ "path": "db.ndjson", "size": 123, "sha256": "…" }]
}
```

`schema` is the latest drizzle migration tag the exporting build knew. `manifest.json` is the last entry in the zip, because the stream knows each file's size and hash only after sending it.

**The database file is `db.ndjson`, not `db.sqlite`.** Beryl runs on Postgres, so there is no file to snapshot. The export opens one `REPEATABLE READ` read-only transaction and streams every table through it, so the dump is a single point in time while writes continue. Each table is a header line `{"table","columns"}` followed by one JSON array per row. Timestamps travel as UTC text (`2026-01-01 12:00:00.000`), JSON columns as their stored text and booleans as `0` or `1`, so a round trip is byte-identical. Bundles exported by MySQL-era builds import unchanged.

Carried: Projects (with the sha256 of each Write key, so every agent's key keeps working, and each owned Project's `owner_uid`), Topics (with their `public` flag), Nodes, Notes, and the event log (so `seq`, and a stream's replay, stay meaningful). Bundles from before sign-in lack `owner_uid` and `public`: those Projects import anonymous and those Topics public. Not carried: **login tokens**, **device codes** and the **users** table (they are untouched by an import), **Sessions** and **Pairing codes**. They are short-lived browser credentials (ten-minute Sessions, five-minute codes); an imported server starts with none, and an import clears the ones it had. The agent mints a new Private link to re-open a board for writing; Share links keep working.

## Import

Replace-everything, in this order:

1. Read the upload into a private temp file, capped at `ADMIN_MAX_BUNDLE_MB` (256).
2. Validate before touching the database: zip structure, entry names (no `..`, absolute paths, backslashes, duplicates; entries are matched against an allowlist and never written to disk by name), declared and actual sizes (total cap `ADMIN_MAX_UNPACKED_MB`, 2048; inflation stops at the declared size, so a lying header cannot expand further), zip CRCs, manifest `format` and `service`, the schema level, and the sha256 and size of every file.
3. Refuse a Bundle whose `schema` is not one this build knows (409, "newer than this build"). Older is accepted, as are the schema levels of MySQL-era builds.
4. Write the current database to a Bundle in `ADMIN_BACKUP_DIR` (default: the OS temp dir; the production compose file mounts a `backups` volume). The newest five are kept. The response names the file.
5. In one Postgres transaction: delete every row, insert the Bundle's rows, commit. Any failure rolls back and the database is as it was. This is the atomic swap; there is no file to rename.
6. After commit, run the slug backfill, then close open streams. A backfill failure does not fail the import: the response carries a `warning`.

Every table must be present in the Bundle, and a Bundle with no Projects is refused (409) unless `allowEmpty=1`, so a rehashed empty file cannot wipe the server.

**Older Bundles.** The server's schema is already current (migrations run at boot), so "migrating" a Bundle means loading its rows into the current tables: columns it lacks take their defaults and columns it has that this build dropped are ignored. A column that is `NOT NULL` with no default and absent from the Bundle makes the import fail, and a future migration that adds one must also teach the loader. Slugs, which `0002` added, are backfilled.

**Open connections.** While an import runs, other `/api` requests, admin routes included, answer 503 with `retry-after` (the import, login, logout and `/api/health` stay open). The connection pool is never replaced, so there are no stale database handles. When it commits, every open Topic stream receives `event: reset` and closes; the board reloads, because its `seq` may not match the restored event log. Deleting a Project or Topic does the same to its streams.

**Size limits.** `BODY_SIZE_LIMIT` (compose: `BERYL_BODY_LIMIT`, default 8M) applies to every request, so importing a larger Bundle needs it raised, and nginx's `client_max_body_size` for `/api/admin/import` too (the example config sets 256m there).

## Moving hosts

1. Old host: sign in at `/admin`, press Download bundle.
2. New host: deploy with `ADMIN_TOKEN`, open `/admin`, choose the file, type `replace-everything`, press Replace everything.
3. Point `BERYL_URL` (and DNS) at the new host. Agents' Write keys are unchanged.
