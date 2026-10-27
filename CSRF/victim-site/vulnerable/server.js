const express = require('express');
const { createVictimApp } = require('../shared/create-victim-app');

const HOST = '127.0.0.1';
const PORT = 4310;
function createApp() {
  return createVictimApp({ express, mode: 'vulnerable' });
}

function startServer() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The vulnerable CSRF demonstration must not run in production.');
  }
  const app = createApp();
  return app.listen(PORT, HOST, () => {
    console.log(`Vulnerable CSRF victim running at http://${HOST}:${PORT}`);
  });
}

if (require.main === module) startServer();

module.exports = { createApp };