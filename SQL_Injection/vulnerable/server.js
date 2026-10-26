/**
 * VULNERABLE SQL SERVER
 * Demonstrates two SQL injection variants:
 *   1. Authentication bypass (login)
 *   2. UNION-based data extraction (product search)
 *
 * Root cause (both routes): user input is concatenated directly into the
 * SQL string instead of being passed as a bound parameter, so an attacker
 * can inject SQL syntax that changes the query's logic/shape.
 *
 * FOR LAB/CLASSROOM USE ONLY. Do not deploy.
 */
const express = require('express');
const path = require('path');
const initSqlJs = require('sql.js');

const app = express();
const PORT = 3002;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let db;

function runQuery(sql) {
  const res = db.exec(sql); // may throw on malformed SQL
  if (res.length === 0) return [];
  const { columns, values } = res[0];
  return values.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
}

initSqlJs().then((SQL) => {
  db = new SQL.Database();
  db.run(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, password TEXT, role TEXT);
    CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, description TEXT, price REAL);
    INSERT INTO users (username, password, role) VALUES
      ('admin', 'S3cretAdminPass!', 'admin'),
      ('alice', 'alicepw123', 'customer'),
      ('bob', 'bobpw456', 'customer');
    INSERT INTO products (name, description, price) VALUES
      ('USB Cable', 'Durable braided USB-C cable', 7.99),
      ('Wireless Mouse', 'Ergonomic 2.4GHz mouse', 15.49),
      ('Mechanical Keyboard', 'RGB backlit, hot-swappable', 59.99);
  `);

  // ---------------------------------------------------------------
  // Variant 1: Authentication bypass
  // VULNERABLE: username/password are concatenated straight into the
  // SQL string. Injecting SQL syntax (e.g. ' OR '1'='1' --) changes the
  // WHERE clause so the query matches regardless of the real password.
  // ---------------------------------------------------------------
  app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    const sql = `SELECT id, username, role FROM users WHERE username = '${username}' AND password = '${password}'`;
    console.log('[vulnerable login] SQL:', sql);

    try {
      const rows = runQuery(sql);
      if (rows.length > 0) return res.json({ ok: true, user: rows[0] });
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ---------------------------------------------------------------
  // Variant 2: UNION-based data extraction
  // VULNERABLE: the search term is concatenated into a LIKE clause.
  // Because the response renders every returned column, an attacker can
  // append a UNION SELECT that pulls rows from an unrelated table
  // (users) into the same result shape (3 columns).
  // ---------------------------------------------------------------
  app.get('/api/search', (req, res) => {
    const q = req.query.q || '';

    const sql = `SELECT name, description, price FROM products WHERE name LIKE '%${q}%'`;
    console.log('[vulnerable search] SQL:', sql);

    try {
      const rows = runQuery(sql);
      return res.json({ ok: true, rows });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.listen(PORT, () => {
    console.log(`Vulnerable SQL injection demo running at http://localhost:${PORT}`);
  });
});
