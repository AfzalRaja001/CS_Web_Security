# CS_Web_Security — Web Server Security Assignment

**Course:** Cyber Security (IT-30001), Autumn Semester 2026
**Instructor:** Dr. Soumyadev Maity
**Institute:** Indian Institute of Information Technology, Allahabad

A group assignment that **demonstrates, then defends against**, four categories of web server
vulnerabilities covered in class: **SQL Injection, OS Command Injection, Cross-Site Scripting (XSS),
and Cross-Site Request Forgery (CSRF)**. Each member takes one category and implements a variant of
it — a working exploit with evidence, and one implemented mitigation that blocks the same payload —
plus the theory of the other mitigation options.

> All apps are small, **local-only, and intentionally vulnerable** for coursework. Do not deploy
> them or test any shared / third-party infrastructure.

## Ownership (Table 3)

| Member name | Roll number | Category | Variant implemented |
|---|---|---|---|
| Abdul | `<roll>` | SQL Injection | Authentication bypass + UNION-based data extraction (both) |
| Kavyan Hembrom | IIT2024245 | OS Command Injection | In-band (command output returned) |
| Mohammed Afzal Raja | `<roll>` | Cross-Site Scripting (XSS) | Stored XSS |
| Khushi Shorey | `<roll>` | CSRF | GET-based forged action |

_(Group members: please fill in your roll numbers.)_

## Modules

Each category lives in its own folder with a full write-up (vulnerable code path, exact exploit,
root cause, implemented mitigation, and theory of the alternatives).

| Folder | Category | Variant | Local ports (vulnerable / fixed) |
|---|---|---|---|
| [SQL_Injection](SQL_Injection) | SQL Injection | Auth bypass + UNION-based | 3002 / 3003 |
| [OS_Command_Injection](OS_Command_Injection) | OS Command Injection | In-band | 3000 (one server, two pages) |
| [XSS_Vulnerability](XSS_Vulnerability) | Cross-Site Scripting | Stored XSS | 3001 / 3002 |
| [CSRF](CSRF) | CSRF | GET-based forged action | 4310 / 4312 (attacker site: 4311) |

## Running

Each module is independent and needs **Node.js + npm**. Open the module's folder and follow its
README. In general:

```bash
cd <module>/vulnerable && npm install && npm start
cd <module>/protected  && npm install && npm start
```

- **OS_Command_Injection** runs a single server for both pages: `npm install` then
  `node server.js` → <http://localhost:3000> (a Vulnerable page and a Fixed page).
- **CSRF** has a helper launcher — see [CSRF/README.md](CSRF/README.md).

See each folder's README for the exact commands, ports, demo steps, and payloads.

## Deliverables

- Source code of all four modules (this repository).
- A group video demonstration — each member narrates their own variant (exploit + mitigation).
- This ownership declaration (table above).

## Academic integrity

The code and exploits in this repository are our group's own work. The intentionally vulnerable
applications are for local, authorised testing of our own code only.
