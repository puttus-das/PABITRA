'use strict';

const { autoLoadPairs } = require('./autoload');
require('./bot');

let shuttingDown = false;

async function main() {
  console.log('🤖 𝐏ᴀʙɪᴛʀᴀ-𝐁ᴏᴛ Mini multi-session runtime starting...');
  const result = await autoLoadPairs({ batchSize: 5, concurrent: false });
  console.log(`✅ Session autoload complete: ${result.successful || 0}/${result.total || 0} connected.`);
  if (!process.env.TELEGRAM_BOT_TOKEN && !process.env.BOT_TOKEN) {
    console.warn('⚠️ Telegram pairing is disabled because TELEGRAM_BOT_TOKEN/BOT_TOKEN is not set.');
  }
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`🛑 ${signal}: shutting down.`);
  setTimeout(() => process.exit(0), 100);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', error => console.error('[uncaughtException]', error));
process.on('unhandledRejection', error => console.error('[unhandledRejection]', error));

main().catch(error => {
  console.error('❌ Startup failed:', error);
  process.exitCode = 1;
});

module.exports = { main };
