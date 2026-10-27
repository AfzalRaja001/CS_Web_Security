# CSRF Demonstration

This folder contains an independently runnable, local-only demonstration of the assignment's GET-based CSRF variant. It uses Express, static browser files, and a shared victim implementation without depending on the SQL injection or XSS modules.

## Stage status

- `victim-site/vulnerable/`: state-changing GET demonstration, local only.
- `victim-site/protected/`: GET rejected; email changes require a session CSRF token on POST.
- `victim-site/shared/`: registration/authentication, persistence, sessions, and minimal shared UI.
- `attacker-site/`: independent fake-prize page. The target address is configured once in `attacker-site/config.js`.

## Start Everything

On Windows, run this single command from the repository root:

```powershell
.\CSRF\start-all.ps1
```

The script opens separate terminal windows for the vulnerable victim, protected victim, and static attacker site. It leaves any service already listening on its port alone and prints all local URLs. Prerequisites are Node.js/npm and the Python launcher (`py`); install each victim app's dependencies once with `npm install` in its folder.

## Dummy Account

Both modes seed this local-only account automatically:

| Username | Email | Password |
|---|---|---|
| `guest` | `guest@example.test` | `123456` |

The login form is prefilled with these synthetic credentials. The password is six characters to match the requested limit. It is intentionally weak and must never be reused for a real account. New registrations accept passwords of 1-6 characters, also for this local assignment demo only.

The vulnerable and protected apps use separate persistent account files. Their dummy credentials are the same, but account records and sessions are independent. You can use the dummy account on both; to use a personal account in both modes, register it once on port 4310 and again on port 4312. A change to one store does not affect the other.

## Steps for Demonstration

1. Start all three services with `.\CSRF\start-all.ps1` from the repository root. Open the victim at `http://127.0.0.1:4310` and log in with the prefilled dummy account. If it has already been registered or changed, its data persists; you can register a fresh disposable account instead.
2. Record the current email shown in the profile. The profile only shows username, email, and a masked password; it has no manual email-change control.
3. Open `http://localhost:4311` in the same browser profile. These are different sites because the hosts differ (`localhost` vs `127.0.0.1`), not because the ports differ.
4. Open DevTools Network, enable **Preserve log**, and click **Claim My Prize**. Show the top-level `GET /api/change-email?email=hacked%40email.com`, its attacker-page referrer, and whether `csrf_vulnerable_session` was sent. The vulnerable cookie is `HttpOnly; SameSite=Lax`; a cross-site top-level GET can carry it when browser policy permits.
5. After the redirect, refresh the victim profile. The current user's email should be `hacked@email.com`. This confirms server-side persistence, not just a page change.
6. For the defense comparison, select **Protected victim (4312)** in the attacker page. Log in to the protected app in the same browser profile, note its email, click the same prize button, then return to and refresh the protected profile. The same GET reaches port 4312, responds 405, and leaves the email unchanged. The protected cookie is `SameSite=Strict`, so the cross-site request should not carry it either; the method rejection is independently enforced.
7. To show the legitimate protected operation, keep the protected profile open and run this in that page's DevTools Console. It requests a session-bound token and sends a same-origin POST; it prints only the response status, not the token:

```js
(async () => {
	const { csrfToken } = await (await fetch('/api/csrf-token')).json();
	const response = await fetch('/api/change-email', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: 'ta-demo-update@example.test', csrfToken }),
	});
	console.log('Protected update status:', response.status);
})();
```

The valid request should return 200. A POST without a token or with a wrong token returns 403; automated tests cover both cases. The attacker page defaults to the vulnerable victim. Never claim the forged request succeeded without checking the Network request and refreshed profile value.

## Vulnerable victim app

From `CSRF/victim-site/vulnerable`, install the app's dependency and start it:

```powershell
npm install
npm start
```

Open <http://127.0.0.1:4310> and register your own account. The app binds only to loopback. Usernames, email addresses, salts, and scrypt password hashes persist in ignored local JSON files under `victim-site/data/`; plaintext passwords are not stored. Sessions are server-managed in memory and expire after 30 minutes or when the server restarts. This intentionally vulnerable app refuses to start when `NODE_ENV=production`.

Run the focused API tests with:

```powershell
npm test
```

## Protected victim app

From `CSRF/victim-site/protected`, install dependencies and start the protected mode in its own terminal:

```powershell
npm install
npm start
```

It runs at <http://127.0.0.1:4312>. It has a separate account file and session cookie namespace. The UI has no email-update form. The protected GET endpoint returns 405; the legitimate change operation is `POST /api/change-email` with a valid session-bound token from `GET /api/csrf-token`.

## Attacker website

Start the static attacker site in another terminal:

```powershell
cd CSRF\attacker-site
py -m http.server 4311 --bind 127.0.0.1
```

Open <http://localhost:4311>. Register/log in to the vulnerable app at `http://127.0.0.1:4310` in the same browser profile first, then click the prize button. The one source of the target address and victim origin is `attacker-site/config.js`; it currently targets `http://127.0.0.1:4310` and `hacked@email.com`.

To replay against protected mode, change only `victimOrigin` in `attacker-site/config.js` to `http://127.0.0.1:4312`, register/log in to the protected app in the same browser profile, and click the same button. The protected GET must not change the email. Restore the origin to port 4310 for the vulnerable demonstration. The protected cookie uses `SameSite=Strict`, so cross-site navigation also does not send that cookie; the GET rejection is still enforced by method, independent of authentication.

## Routes and modes

- `POST /api/register` creates a local account and session; `POST /api/login` accepts username or email and creates a server-side session.
- `POST /api/logout` removes the session and expires its cookie.
- `GET /api/profile` returns only the current username and email.
- Vulnerable: `GET /api/change-email?email=...` requires the session and validates the email, then persists it without verifying user intent. The victim identifies the user only from the session.
- Protected: `GET /api/change-email` returns 405. `POST /api/change-email` requires a valid session-bound token from `GET /api/csrf-token`.

The login identity comes only from the credential check; client-supplied user IDs are never trusted. Session cookies are HttpOnly. On local HTTP, the vulnerable app uses `SameSite=Lax`, which permits cross-site top-level safe navigations in browsers that allow the cookie; the protected app uses `SameSite=Strict`. `localhost:4311` and `127.0.0.1:4310` are distinct sites, not just distinct ports. Verify the request cookie and persisted profile value in the browser before claiming the exploit succeeded. The browser-visible password field is always a fixed mask; the real password is never returned by the API or stored in plaintext.

## CSRF Mitigation (Implemented)

**Implemented mitigation:** the protected app does not allow GET to change account data. `GET /api/change-email` returns 405. A legitimate email change must use `POST /api/change-email` and include the synchronizer token generated for that user's server-side session. The server compares the submitted token with the session token before changing or saving the email. A missing or incorrect token returns 403. This combination is the primary defense shown in this project: the HTTP method expresses a state change, and the token proves the request came through the legitimate same-origin workflow.

**Additional cookie defense used:** the protected session cookie is `SameSite=Strict`, which tells the browser not to attach it to cross-site requests. This helps prevent the browser from authenticating a forged request. The vulnerable demo uses `SameSite=Lax` so a clicked cross-site top-level GET can carry its cookie in browsers that permit it. SameSite is defense in depth; it does not replace rejecting state-changing GETs and validating a CSRF token.

## Other Mitigations (Theory Only)

- **Re-authentication for sensitive actions:** ask the user to confirm their password or complete another step-up check immediately before a high-impact change. A third-party page cannot normally provide that fresh proof, so the forged request is denied. Use this for sensitive operations; it adds friction and does not replace CSRF tokens for ordinary state changes.
- **Avoid state-changing GET requests:** GET should retrieve data only. Browsers and other tools can follow links or load URLs automatically, so changing state through GET makes accidental or forged actions easy. The protected app implements this by returning 405 for the email-changing GET and moving legitimate changes to POST.
- **Synchronizer CSRF tokens:** generate an unpredictable token tied to the authenticated server session, include it explicitly in the legitimate request, and compare it server-side. A cross-site page can cause a browser request but cannot normally read the token from the victim origin due to the same-origin policy. This is implemented on the protected POST endpoint.
- **SameSite cookies:** `Strict` withholds the session cookie on cross-site requests; `Lax` generally allows it on top-level safe navigations such as GET but excludes many cross-site subrequests and POSTs. This project uses Strict as an additional protected-mode layer and Lax for the vulnerable demonstration. Browser behavior should be verified in DevTools.

## Vulnerability and safety

The vulnerable email-changing route uses GET even though it mutates account state. Browsers can attach a valid session cookie to top-level navigations initiated by other sites, depending on cookie policy. Authentication proves which user is logged in, not that they intended the change. The protected implementation rejects GET and requires a session-bound synchronizer token on POST.

Use only local coursework accounts. Do not expose this app to a network or deploy the intentionally vulnerable app. Passwords are hashed with Node's scrypt; local JSON files contain password hashes, not plaintext credentials. The protected app uses a separate account file so its behavior and state are unambiguous.

## Ownership

Implemented by: Khushi Shorey - CSRF


GET-Based variant - attacker (attacker-site/), exploit (victim-site/vulnerable/) and mitigation (victim-site/protected/) as above.