const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, test } = require('node:test');
const express = require('express');
const { createVictimApp } = require('../../shared/create-victim-app');

const servers = [];

async function startApp(mode = 'vulnerable') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'csrf-test-'));
  const app = createVictimApp({ express, mode, dataPath: path.join(directory, 'accounts.json') });
  const server = app.listen(0, '127.0.0.1');
  servers.push({ server, directory });
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, app, directory };
}

async function register(baseUrl, options = {}) {
  const response = await fetch(`${baseUrl}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: options.username || 'sample_user',
      email: options.email || 'sample@example.test',
      password: options.password || 'testpw',
    }),
  });
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  return { response, cookie };
}

async function login(baseUrl, usernameOrEmail = 'sample_user', password = 'testpw') {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail, password }),
  });
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  return { response, cookie };
}

async function profile(baseUrl, cookie) {
  return fetch(`${baseUrl}/api/profile`, { headers: { Cookie: cookie } });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(({ server, directory }) => new Promise((resolve, reject) => {
    server.close((error) => {
      fs.rmSync(directory, { recursive: true, force: true });
      if (error) reject(error);
      else resolve();
    });
  })));
});

test('registration persists only a password hash and starts a session', async () => {
  const { baseUrl, directory } = await startApp();
  const { response } = await register(baseUrl);
  const cookie = response.headers.get('set-cookie');

  assert.equal(response.status, 201);
  assert.equal((await response.json()).user.email, 'sample@example.test');
  assert.match(cookie, /HttpOnly/i);
  const savedData = fs.readFileSync(path.join(directory, 'accounts.json'), 'utf8');
  assert.doesNotMatch(savedData, /testpw/);
  assert.match(savedData, /passwordHash/);
});

test('dummy account is available in both isolated modes', async () => {
  for (const mode of ['vulnerable', 'protected']) {
    const { baseUrl } = await startApp(mode);
    const { response, cookie } = await login(baseUrl, 'guest', '123456');
    assert.equal(response.status, 200);
    assert.equal((await (await profile(baseUrl, cookie)).json()).user.username, 'guest');
  }
});

test('login accepts username or email and rejects incorrect credentials', async () => {
  const { baseUrl } = await startApp();
  await register(baseUrl);
  const byEmail = await login(baseUrl, 'sample@example.test');
  assert.equal(byEmail.response.status, 200);
  assert.match(byEmail.response.headers.get('set-cookie'), /HttpOnly/i);

  const badLogin = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail: 'sample_user', password: 'wrngpw' }),
  });
  assert.equal(badLogin.status, 401);
});

test('vulnerable GET requires a session and persists the authenticated user email', async () => {
  const { baseUrl, directory } = await startApp();
  const unauthenticated = await fetch(
    `${baseUrl}/api/change-email?email=changed%40example.test`,
    { redirect: 'manual' },
  );
  assert.equal(unauthenticated.status, 401);

  const { cookie } = await register(baseUrl);
  const changeResponse = await fetch(
    `${baseUrl}/api/change-email?email=changed%40example.test`,
    { headers: { Cookie: cookie }, redirect: 'manual' },
  );
  assert.equal(changeResponse.status, 303);

  const profileResponse = await profile(baseUrl, cookie);
  assert.deepEqual((await profileResponse.json()).user, { username: 'sample_user', email: 'changed@example.test' });
  assert.match(fs.readFileSync(path.join(directory, 'accounts.json'), 'utf8'), /changed@example\.test/);
});

test('protected GET rejects and CSRF-token POST persists the new email', async () => {
  const { baseUrl } = await startApp('protected');
  const { cookie } = await register(baseUrl);
  const rejectedGet = await fetch(`${baseUrl}/api/change-email?email=changed%40example.test`, {
    headers: { Cookie: cookie },
    redirect: 'manual',
  });
  assert.equal(rejectedGet.status, 405);
  assert.equal((await (await profile(baseUrl, cookie)).json()).user.email, 'sample@example.test');

  const tokenResponse = await fetch(`${baseUrl}/api/csrf-token`, { headers: { Cookie: cookie } });
  const { csrfToken } = await tokenResponse.json();
  const missingToken = await fetch(`${baseUrl}/api/change-email`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'changed@example.test' }),
  });
  assert.equal(missingToken.status, 403);

  const invalidToken = await fetch(`${baseUrl}/api/change-email`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'changed@example.test', csrfToken: 'invalid' }),
  });
  assert.equal(invalidToken.status, 403);

  const secureChange = await fetch(`${baseUrl}/api/change-email`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'changed@example.test', csrfToken }),
  });
  assert.equal(secureChange.status, 200);
  assert.equal((await (await profile(baseUrl, cookie)).json()).user.email, 'changed@example.test');
});

test('email validation, persistence across app restart, and logout work', async () => {
  const { baseUrl, directory } = await startApp();
  const { cookie } = await register(baseUrl);
  const invalidEmail = await fetch(`${baseUrl}/api/change-email?email=not-an-email`, {
    headers: { Cookie: cookie },
    redirect: 'manual',
  });
  assert.equal(invalidEmail.status, 400);
  const savedEmail = await fetch(`${baseUrl}/api/change-email?email=persist%40example.test`, {
    headers: { Cookie: cookie },
    redirect: 'manual',
  });
  assert.equal(savedEmail.status, 303);

  const newApp = createVictimApp({ express, mode: 'vulnerable', dataPath: path.join(directory, 'accounts.json') });
  const server = newApp.listen(0, '127.0.0.1');
  servers.push({ server, directory: fs.mkdtempSync(path.join(os.tmpdir(), 'csrf-test-extra-')) });
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const newUrl = `http://127.0.0.1:${server.address().port}`;
  const oldSession = await profile(newUrl, cookie);
  assert.equal(oldSession.status, 401);
  const relogin = await login(newUrl);
  assert.equal(relogin.response.status, 200);
  assert.equal((await (await profile(newUrl, relogin.cookie)).json()).user.email, 'persist@example.test');

  const logout = await fetch(`${newUrl}/api/logout`, { method: 'POST', headers: { Cookie: relogin.cookie } });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/i);
  assert.equal((await profile(newUrl, relogin.cookie)).status, 401);
});