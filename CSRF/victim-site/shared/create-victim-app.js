const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const SESSION_TTL_MS = 30 * 60 * 1000;
const PASSWORD_KEY_LENGTH = 64;
const DUMMY_ACCOUNT = Object.freeze({
  id: 'csrf-demo-guest',
  username: 'guest',
  email: 'guest@example.test',
  password: '123456',
});

function readCookie(cookieHeader, name) {
  for (const entry of (cookieHeader || '').split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 0) continue;
    if (entry.slice(0, separator).trim() === name) {
      return entry.slice(separator + 1).trim();
    }
  }
  return undefined;
}

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validEmail(email) {
  return typeof email === 'string'
    && email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function readAccounts(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(data.users) ? data.users : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function writeAccounts(filePath, users) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify({ users }, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

function ensureDummyAccount(filePath, users) {
  const existingUser = users.find((user) => user.id === DUMMY_ACCOUNT.id);
  if (!existingUser && users.some((user) => user.username === DUMMY_ACCOUNT.username
      || user.email === DUMMY_ACCOUNT.email)) {
    throw new Error('The local dummy account conflicts with an existing account. Rename that account before starting the demo.');
  }
  if (users.some((user) => user.id !== DUMMY_ACCOUNT.id && user.email === DUMMY_ACCOUNT.email)) {
    throw new Error('The local dummy email conflicts with an existing account. Change that account email before starting the demo.');
  }
  const salt = crypto.randomBytes(16);
  const passwordHash = crypto.scryptSync(DUMMY_ACCOUNT.password, salt, PASSWORD_KEY_LENGTH);
  const user = existingUser || {
    id: DUMMY_ACCOUNT.id,
    email: DUMMY_ACCOUNT.email,
  };
  user.username = DUMMY_ACCOUNT.username;
  user.email = DUMMY_ACCOUNT.email;
  user.passwordSalt = salt.toString('base64');
  user.passwordHash = passwordHash.toString('base64');
  const seededUsers = existingUser ? users : [...users, user];
  writeAccounts(filePath, seededUsers);
  return seededUsers;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function publicUser(user) {
  return { username: user.username, email: user.email };
}

function createVictimApp({ express, mode, dataPath }) {
  if (!['vulnerable', 'protected'].includes(mode)) {
    throw new Error('mode must be vulnerable or protected');
  }

  const app = express();
  const usersPath = dataPath || path.join(__dirname, '..', 'data', `${mode}-accounts.json`);
  const sessions = new Map();
  let users = ensureDummyAccount(usersPath, readAccounts(usersPath));
  const cookieName = `csrf_${mode}_session`;
  const publicPath = path.join(__dirname, 'public');

  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const sessionId = readCookie(req.headers.cookie, cookieName);
    const session = sessionId && sessions.get(sessionId);
    if (session && session.expiresAt > Date.now()) {
      req.sessionId = sessionId;
      req.user = users.find((user) => user.id === session.userId);
      req.session = session;
    } else if (sessionId) {
      sessions.delete(sessionId);
    }
    next();
  });
  app.use(express.static(publicPath));

  function setSession(req, res, user) {
    if (req.sessionId) sessions.delete(req.sessionId);
    const sessionId = crypto.randomBytes(32).toString('base64url');
    const session = {
      userId: user.id,
      csrfToken: crypto.randomBytes(32).toString('base64url'),
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
    sessions.set(sessionId, session);
    res.cookie(cookieName, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: mode === 'vulnerable' ? 'lax' : 'strict',
      path: '/',
      maxAge: SESSION_TTL_MS,
    });
  }

  function findAccounts(identifier) {
    const normalized = normalizeUsername(identifier);
    return users.filter((user) => user.username === normalized || user.email === normalizeEmail(identifier));
  }

  function emailInUse(email, excludingId) {
    return users.some((user) => user.id !== excludingId && user.email === email);
  }

  async function verifyPassword(user, password) {
    if (!user || typeof password !== 'string') return false;
    const candidate = await scrypt(password, Buffer.from(user.passwordSalt, 'base64'), PASSWORD_KEY_LENGTH);
    return safeEqual(candidate, Buffer.from(user.passwordHash, 'base64'));
  }

  app.get('/api/mode', (req, res) => res.json({ mode }));

  app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body || {};
    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = normalizeEmail(email);
    if (!/^[a-z0-9_.-]{3,32}$/.test(normalizedUsername)) {
      return res.status(400).json({ ok: false, error: 'Username must be 3-32 letters, numbers, dots, underscores, or hyphens.' });
    }
    if (!validEmail(normalizedEmail)) {
      return res.status(400).json({ ok: false, error: 'Enter a valid email address.' });
    }
    if (typeof password !== 'string' || password.length < 1 || password.length > 6) {
      return res.status(400).json({ ok: false, error: 'Password must be 1-6 characters.' });
    }
    if (users.some((user) => user.username === normalizedUsername)) {
      return res.status(409).json({ ok: false, error: 'Username is already registered.' });
    }
    if (emailInUse(normalizedEmail)) {
      return res.status(409).json({ ok: false, error: 'Email is already registered.' });
    }

    const salt = crypto.randomBytes(16);
    const passwordHash = await scrypt(password, salt, PASSWORD_KEY_LENGTH);
    const user = {
      id: crypto.randomUUID(),
      username: normalizedUsername,
      email: normalizedEmail,
      passwordSalt: salt.toString('base64'),
      passwordHash: Buffer.from(passwordHash).toString('base64'),
    };
    users.push(user);
    writeAccounts(usersPath, users);
    setSession(req, res, user);
    return res.status(201).json({ ok: true, user: publicUser(user) });
  });

  app.post('/api/login', async (req, res) => {
    const { usernameOrEmail, password } = req.body || {};
    if (typeof usernameOrEmail !== 'string' || usernameOrEmail.length > 254
        || typeof password !== 'string' || password.length > 6) {
      return res.status(400).json({ ok: false, error: 'Username or email and password are required.' });
    }
    let user;
    for (const candidate of findAccounts(usernameOrEmail)) {
      if (await verifyPassword(candidate, password)) {
        user = candidate;
        break;
      }
    }
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Invalid username/email or password.' });
    }
    setSession(req, res, user);
    return res.json({ ok: true, user: publicUser(user) });
  });

  app.post('/api/logout', (req, res) => {
    if (req.sessionId) sessions.delete(req.sessionId);
    res.clearCookie(cookieName, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: mode === 'vulnerable' ? 'lax' : 'strict',
      path: '/',
    });
    return res.json({ ok: true });
  });

  app.get('/api/profile', (req, res) => {
    if (!req.user) return res.status(401).json({ ok: false, error: 'Log in to view the profile.' });
    return res.json({ ok: true, user: publicUser(req.user) });
  });

  app.get('/api/csrf-token', (req, res) => {
    if (!req.user || !req.session) return res.status(401).json({ ok: false, error: 'Log in to access a CSRF token.' });
    if (mode !== 'protected') return res.status(404).json({ ok: false, error: 'Not found.' });
    return res.json({ ok: true, csrfToken: req.session.csrfToken });
  });

  if (mode === 'vulnerable') {
    // VULNERABLE PATH: this authenticated GET intentionally has no CSRF intent check.
    app.get('/api/change-email', (req, res) => {
      if (!req.user) return res.status(401).json({ ok: false, error: 'Log in to change the email.' });
      const email = normalizeEmail(req.query.email);
      if (!validEmail(email)) return res.status(400).json({ ok: false, error: 'Provide a valid email address.' });
      if (mode === 'protected' && emailInUse(email, req.user.id)) {
        return res.status(409).json({ ok: false, error: 'Email is already registered.' });
      }

      // VULNERABILITY: a cross-site top-level GET can carry the victim's Lax session cookie and mutate persistent email state.
      req.user.email = email;
      writeAccounts(usersPath, users);
      return res.redirect(303, '/');
    });
  } else {
    // MITIGATION: state-changing GETs are rejected; GET must never update the email.
    app.get('/api/change-email', (req, res) => {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ ok: false, error: 'Email changes require POST.' });
    });

    // MITIGATION: only POST with the session-bound synchronizer token can update the email.
    app.post('/api/change-email', (req, res) => {
      if (!req.user || !req.session) return res.status(401).json({ ok: false, error: 'Log in to change the email.' });
      const token = req.body && req.body.csrfToken;
      if (typeof token !== 'string' || !safeEqual(token, req.session.csrfToken)) {
        return res.status(403).json({ ok: false, error: 'Invalid CSRF token.' });
      }
      const email = normalizeEmail(req.body.email);
      if (!validEmail(email)) return res.status(400).json({ ok: false, error: 'Provide a valid email address.' });
      if (emailInUse(email, req.user.id)) return res.status(409).json({ ok: false, error: 'Email is already registered.' });
      req.user.email = email;
      writeAccounts(usersPath, users);
      return res.json({ ok: true, user: publicUser(req.user) });
    });
  }

  return app;
}

module.exports = { createVictimApp };