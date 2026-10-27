const express = require('express');
const { createVictimApp } = require('../shared/create-victim-app');

const HOST = '127.0.0.1';
const PORT = 4312;

function createApp() {
  return createVictimApp({ express, mode: 'protected' });
}

if (require.main === module) {
  createApp().listen(PORT, HOST, () => {
    console.log(`Protected CSRF victim running at http://${HOST}:${PORT}`);
  });
}

module.exports = { createApp };