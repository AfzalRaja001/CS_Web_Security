# CSRF Attacker Website

A standalone static prize-notification page for the local GET-based CSRF coursework demonstration. Its button submits a normal HTML GET form, causing a top-level browser navigation to the vulnerable victim endpoint. It does not read cookies, inspect credentials, use cross-origin JavaScript, or contact any non-local host.

## Local URLs

- Attacker: <http://localhost:4311>
- Vulnerable victim: <http://127.0.0.1:4310>
- Protected victim: <http://127.0.0.1:4312>
- Vulnerable change-email endpoint: `GET http://127.0.0.1:4310/api/change-email?email=hacked%40email.com`
- Protected comparison endpoint: `GET http://127.0.0.1:4312/api/change-email?email=hacked%40email.com`
- Target email (configured once in `config.js`): `hacked@email.com`

The two pages use different hostnames (`localhost` and `127.0.0.1`), not merely different ports. This makes them different origins and different sites for the intended local browser setup. Do not open the attacker page as `http://127.0.0.1:4311`; that would use the victim's hostname and would not demonstrate a cross-site request.

## Start Both Sites

Start the victim in one PowerShell window:

```powershell
cd CSRF\victim-site\vulnerable
npm start
```

It must be running at `http://127.0.0.1:4310`. Register using your chosen username, email, and password. The password is hashed before storage and is never displayed or logged.

For a quick local run, the victim also seeds `guest` / `123456` with `guest@example.test`. This six-character password is intentionally weak and only for the local demo. Both apps seed the same credentials independently; each mode has its own user record and email state. Personal accounts must be registered separately in each mode.

For the protected comparison, start `CSRF/victim-site/protected` with its own `npm install` and `npm start`; it runs at `http://127.0.0.1:4312` and uses a separate account store.

Start the static attacker page in a second PowerShell window from this directory:

```powershell
cd CSRF\attacker-site
py -m http.server 4311 --bind 127.0.0.1
```

Open `http://localhost:4311`. Python's built-in HTTP server is used only to serve static files; it adds no project dependency. If `py` is unavailable, use `python -m http.server 4311 --bind 127.0.0.1`.

## Reproduce

1. Open the victim at `http://127.0.0.1:4310` and register or log in with your own local account.
2. Verify and note the email currently displayed in your profile.
3. In a separate tab, open the attacker URL `http://localhost:4311`.
4. Choose **Vulnerable victim (4310)** and click **Claim My Prize**. The browser submits a top-level GET from the attacker page to port 4310. The server identifies the account from the session and persists the email change.
5. Return to the victim profile and refresh. Verify that the current user's profile now shows `hacked@email.com`. A click or navigation alone is not proof that the change succeeded.

Account data persists in a local JSON file under `victim-site/data/` across server restarts. The vulnerable and protected apps use separate data files. Session cookies are in-memory and are invalidated when their server restarts; log in again after a restart.

## Compare Protected Mode

To replay the same request against protected mode, select **Protected victim (4312)** on the attacker page. Register/log in to the protected app and use the same browser profile. Clicking the same button targets port 4312; it returns 405 and must not change the email. Select **Vulnerable victim (4310)** to switch back. The protected app also uses `SameSite=Strict`, but its GET handler rejects state changes regardless of whether the browser sends a cookie.

## Browser Evidence

In DevTools, keep the Network panel open with **Preserve log** enabled before clicking the button. Select the `GET /api/change-email` request and check:

- The request URL contains `email=hacked%40email.com`.
- The initiator/referrer shows the attacker page on `localhost:4311`.
- Request headers include the victim's `csrf_demo_session` cookie. The cookie is `HttpOnly`, so it is intentionally not available to attacker-page JavaScript; DevTools can still display the request header.
- The request returns a redirect to the victim profile, and a refreshed profile actually shows `hacked@email.com` for the logged-in account.

The victim cookie is currently configured `HttpOnly; SameSite=Lax` and has no `Secure` attribute because the local servers use HTTP. `Lax` normally permits cookies on cross-site top-level safe navigations such as this clicked GET, but not on cross-site subresource requests and generally not on cross-site POST requests. Browser privacy settings, local-host handling, cookie policies, extensions, or an incorrect URL can still prevent the cookie from being sent. The browser Network request and resulting profile value are the evidence; do not report the attack as successful if either is absent.

## Troubleshooting and Limits

- If the victim shows a login form after the request, first confirm that you logged in at `127.0.0.1` (not `localhost`) and that the victim is still running. Cookies are scoped to the hostname that issued them.
- If the attacker page cannot load, confirm the Python server is running and browse to `http://localhost:4311`, not the victim hostname.
- If the request is unauthenticated, inspect whether the browser sent `csrf_demo_session`. Do not weaken or edit unrelated cookie settings to force a result; report the observed browser behavior.
- `localhost` and `127.0.0.1` are intended to be different sites here; changing either hostname may change the browser's site calculation.
- This is an intentionally vulnerable, in-memory coursework application bound to loopback, with a synthetic account only. It is not production software and must not be exposed to a network.
- This demonstrates a state-changing GET without CSRF intent verification. It does not steal session cookies or credentials. The protected version is not part of this stage.