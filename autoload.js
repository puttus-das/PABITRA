'use strict';

const fs = require('fs');
const path = require('path');
const { PAIRING_ROOT, startPairing } = require('./pair');

let running = false;
let shuttingDown = false;

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function autoLoadPairs({ batchSize = 5, concurrent = false } = {}) {
  if (running || shuttingDown) return { success: false, message: 'autoload already running or shutting down' };
  running = true;
  try {
    if (!fs.existsSync(PAIRING_ROOT)) return { success: true, total: 0, successful: 0, failed: 0 };
    const users = fs.readdirSync(PAIRING_ROOT, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && /@s\.whatsapp\.net$/.test(entry.name))
      .map(entry => entry.name.replace(/@s\.whatsapp\.net$/, ''));
    let successful = 0;
    let failed = 0;
    const connect = async (number) => {
      try { await startPairing(number); successful += 1; }
      catch (error) { failed += 1; console.error(`[autoload ${number}]`, error.message); }
    };
    if (concurrent) {
      await Promise.all(users.map(connect));
    } else {
      for (let i = 0; i < users.length; i += batchSize) {
        if (shuttingDown) break;
        await Promise.all(users.slice(i, i + batchSize).map(connect));
        if (i + batchSize < users.length) await delay(1000);
      }
    }
    return { success: true, total: users.length, successful, failed };
  } finally {
    running = false;
  }
}

process.on('SIGINT', () => { shuttingDown = true; });
process.on('SIGTERM', () => { shuttingDown = true; });

module.exports = { autoLoadPairs, isRunning: () => running, isShuttingDown: () => shuttingDown };
