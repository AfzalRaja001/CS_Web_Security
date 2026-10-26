/**
 * PROTECTED SQL SERVER
 * Same two routes as the vulnerable version, fixed with the same
 * mitigation: parameterized queries (prepared statements).
 *
 * User input is passed as a bound parameter (?), never concatenated
 * into the SQL string, so it is always treated as DATA, not SQL
 * syntax — injected quotes/operators can no longer alter the query.
 */
const express = require('express');
const path = require('path');
const initSqlJs = require('sql.js');

const app = express();
const PORT = 3003;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let db;

// Runs `sql` with bound `params` and returns rows as plain objects.
// Params are bound via Statement#bind, never string-concatenated.
function runParamQuery(sql, params) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
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

  // FIXED Variant 1: parameterized query — the ? placeholders are bound
  // to username/password, so injected SQL syntax is treated as a
  // literal string and never changes the WHERE clause.
  app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    console.log('[protected login] params:', username, password);

    try {
      const rows = runParamQuery(
        'SELECT id, username, role FROM users WHERE username = ? AND password = ?',
        [username, password]
      );
      if (rows.length > 0) return res.json({ ok: true, user: rows[0] });
      // Safe, generic error: does not reveal whether the username exists.
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  // FIXED Variant 2: parameterized LIKE clause. The search term is bound
  // as data, so a UNION SELECT typed into the search box is matched
  // literally against product names (and simply returns no rows) instead
  // of being parsed as a second SELECT statement.
  app.get('/api/search', (req, res) => {
    const q = req.query.q || '';
    console.log('[protected search] param:', q);

    try {
      const rows = runParamQuery(
        'SELECT name, description, price FROM products WHERE name LIKE ?',
        [`%${q}%`]
      );
      return res.json({ ok: true, rows });
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'Internal error' });
    }
  });

  app.listen(PORT, () => {
    console.log(`Protected SQL injection demo running at http://localhost:${PORT}`);
  });
});
