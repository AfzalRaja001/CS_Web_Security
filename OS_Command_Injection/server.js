//  COMBINED demo server — OS Command Injection (in-band)
//  IT-30001 Cyber Security assignment
//
//  ONE server, ONE port, TWO pages:
//    /vulnerable  -> the flaw (exec + string concatenation)
//    /fixed       -> the fix  (/api/fixed = execFile + allow-list)
//                            (/api/fixed-weak = bad blacklist, bypassable)
//
//  Run:  node server.js   then open http://localhost:3000

const express = require("express");
const { exec, execFile } = require("child_process");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// clean page URLs
app.get("/vulnerable", (req, res) => res.sendFile(__dirname + "/public/vulnerable.html"));
app.get("/fixed",      (req, res) => res.sendFile(__dirname + "/public/fixed.html"));

const sendOut = (res, err, stdout, stderr) =>
  res.type("text/plain").send((stdout || "") + (stderr || "") +
    (err ? "\n[exit] " + err.message : ""));

//  VULNERABLE  — the line you point at in the viva.
//  User input is concatenated into a command string and run
//  through a shell (/bin/sh -c), so ; | & $() are operators.

app.post("/api/vuln", (req, res) => {
  const host = req.body.host || "";
  const cmd = "ping -c 1 " + host;              // <-- THE SIN
  console.log("[vuln] running:", cmd);
  exec(cmd, { timeout: 10000 }, (err, stdout, stderr) => sendOut(res, err, stdout, stderr));
});

//  WEAK FIX (demo only) — blacklist ';'. Still uses the shell,
//  so $(...) or | bypass it. Show this failing in the video.

app.post("/api/fixed-weak", (req, res) => {
  const host = req.body.host || "";
  if (host.includes(";"))
    return res.type("text/plain").send("[blocked] ';' is not allowed");
  exec("ping -c 1 " + host, { timeout: 10000 }, (err, stdout, stderr) => sendOut(res, err, stdout, stderr));
});

//  REAL FIX — two layers:
//   1) allow-list: letters/digits/dot/hyphen, must start alnum
//      (the leading-alnum rule also blocks argument injection
//       like "-f" / "--help").
//   2) execFile (NOT exec): no shell, argv array, so the host
//      is one literal argument and metacharacters are inert.

const HOST_RE = /^[a-zA-Z0-9][a-zA-Z0-9.-]*$/;

app.post("/api/fixed", (req, res) => {
  const host = req.body.host || "";
  if (!HOST_RE.test(host) || host.length > 255)
    return res.type("text/plain").send("[rejected] invalid host");
  execFile("ping", ["-c", "1", host], { timeout: 10000 }, (err, stdout, stderr) => sendOut(res, err, stdout, stderr));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log("Server started on http://localhost:" + PORT)
);
