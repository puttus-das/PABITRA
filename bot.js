const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const {
  startPairing,
  stopPairing,
  getActiveSessions,
  PAIRING_ROOT,
  normalizeNumber
} = require('./pair');

// ===== TOKEN CONFIGURATION =====
const DEFAULT_TOKEN = ''; // Set TELEGRAM_BOT_TOKEN in environment or token.js

let token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;

if (!token) {
  try {
    const tokenConfig = require('./token');
    const configuredToken = typeof tokenConfig === 'string' ? tokenConfig : tokenConfig?.token;
    if (configuredToken && configuredToken !== 'PASTE_TELEGRAM_BOT_TOKEN_HERE') {
      token = configuredToken;
    }
  } catch (err) {
    // token.js ফাইল না থাকলে DEFAULT_TOKEN ব্যবহার করবে
  }
}

if (!token || token === 'PASTE_TELEGRAM_BOT_TOKEN_HERE') {
  token = DEFAULT_TOKEN;
}

if (typeof token === 'string') {
  token = token.trim().replace(/^['"]|['"]$/g, '');
}

// Global Keep-Alive loop to prevent Pterodactyl exit code 0
setInterval(() => {}, 1000 * 60 * 60);

if (!token) {
  console.error('❌ Error: Telegram Bot Token not found!');
  module.exports = null;
} else {
  const bot = new TelegramBot(token, { polling: true });
  const pending = new Map();
  const expiryTimers = new Map();
  const CHANNEL_URL = 'https://whatsapp.com/channel/0029Vb8RL4F1HspsNlYYOE3e';
  const GROUP_URL = 'https://t.me/PABITRA_BOTZ';
  const TELEGRAM_GROUP_ID = '-1004364269870';
  const ADMIN_IDS = new Set(
    String(process.env.TELEGRAM_ADMIN_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );

  // ===== Country Code Mappings =====
  const COUNTRY_DATA = {
    '880': { flag: '🇧🇩', name: 'BD' },
    '91':  { flag: '🇮🇳', name: 'IN' },
    '92':  { flag: '🇵🇰', name: 'PK' },
    '977': { flag: '🇳🇵', name: 'NP' },
    '94':  { flag: '🇱🇰', name: 'LK' },
    '95':  { flag: '🇲🇲', name: 'MM' },
    '62':  { flag: '🇮🇩', name: 'ID' },
    '60':  { flag: '🇲🇾', name: 'MY' },
    '65':  { flag: '🇸🇬', name: 'SG' },
    '66':  { flag: '🇹🇭', name: 'TH' },
    '63':  { flag: '🇵🇭', name: 'PH' },
    '84':  { flag: '🇻🇳', name: 'VN' },
    '93':  { flag: '🇦🇫', name: 'AF' },
    '960': { flag: '🇲🇻', name: 'MV' },
    '975': { flag: '🇧🇹', name: 'BT' },
    '86':  { flag: '🇨🇳', name: 'CN' },
    '852': { flag: '🇭🇰', name: 'HK' },
    '853': { flag: '🇲🇴', name: 'MO' },
    '886': { flag: '🇹🇼', name: 'TW' },
    '81':  { flag: '🇯🇵', name: 'JP' },
    '82':  { flag: '🇰🇷', name: 'KR' },
    '1':   { flag: '🇺🇸', name: 'US' },
    '44':  { flag: '🇬🇧', name: 'GB' },
    '49':  { flag: '🇩🇪', name: 'DE' },
    '33':  { flag: '🇫🇷', name: 'FR' },
    '39':  { flag: '🇮🇹', name: 'IT' },
    '34':  { flag: '🇪🇸', name: 'ES' },
    '31':  { flag: '🇳🇱', name: 'NL' },
    '32':  { flag: '🇧🇪', name: 'BE' },
    '41':  { flag: '🇨🇭', name: 'CH' },
    '43':  { flag: '🇦🇹', name: 'AT' },
    '48':  { flag: '🇵🇱', name: 'PL' },
    '90':  { flag: '🇹🇷', name: 'TR' },
    '7':   { flag: '🇷🇺', name: 'RU' },
    '380': { flag: '🇺🇦', name: 'UA' },
    '55':  { flag: '🇧🇷', name: 'BR' },
    '52':  { flag: '🇲🇽', name: 'MX' },
    '54':  { flag: '🇦🇷', name: 'AR' },
    '57':  { flag: '🇨🇴', name: 'CO' },
    '966': { flag: '🇸🇦', name: 'SA' },
    '971': { flag: '🇦🇪', name: 'AE' },
    '974': { flag: '🇶🇦', name: 'QA' },
    '965': { flag: '🇰🇼', name: 'KW' },
    '973': { flag: '🇧🇭', name: 'BH' },
    '968': { flag: '🇴🇲', name: 'OM' },
    '964': { flag: '🇮🇶', name: 'IQ' },
    '98':  { flag: '🇮🇷', name: 'IR' },
    '962': { flag: '🇯🇴', name: 'JO' },
    '20':  { flag: '🇪🇬', name: 'EG' },
    '234': { flag: '🇳🇬', name: 'NG' },
    '27':  { flag: '🇿🇦', name: 'ZA' },
    '254': { flag: '🇰🇪', name: 'KE' },
    '233': { flag: '🇬🇭', name: 'GH' },
    '251': { flag: '🇪🇹', name: 'ET' },
    '255': { flag: '🇹🇿', name: 'TZ' },
    '256': { flag: '🇺🇬', name: 'UG' },
    '252': { flag: '🇸🇴', name: 'SO' },
    '61':  { flag: '🇦🇺', name: 'AU' },
    '64':  { flag: '🇳🇿', name: 'NZ' },
    '46':  { flag: '🇸🇪', name: 'SE' },
    '47':  { flag: '🇳🇴', name: 'NO' },
    '45':  { flag: '🇩🇰', name: 'DK' },
    '358': { flag: '🇫🇮', name: 'FI' },
    '353': { flag: '🇮🇪', name: 'IE' },
    '351': { flag: '🇵🇹', name: 'PT' },
    '30':  { flag: '🇬🇷', name: 'GR' },
    '972': { flag: '🇮🇱', name: 'IL' },
    '961': { flag: '🇱🇧', name: 'LB' },
    '967': { flag: '🇾🇪', name: 'YE' },
    '249': { flag: '🇸🇩', name: 'SD' },
    '218': { flag: '🇱🇾', name: 'LY' },
    '216': { flag: '🇹🇳', name: 'TN' },
    '213': { flag: '🇩🇿', name: 'DZ' },
    '212': { flag: '🇲🇦', name: 'MA' },
    '56':  { flag: '🇨🇱', name: 'CL' },
    '51':  { flag: '🇵🇪', name: 'PE' },
    '58':  { flag: '🇻🇪', name: 'VE' },
    '593': { flag: '🇪🇨', name: 'EC' },
    '591': { flag: '🇧🇴', name: 'BO' },
    '595': { flag: '🇵🇾', name: 'PY' },
    '598': { flag: '🇺🇾', name: 'UY' },
    '1809': { flag: '🇩🇴', name: 'DO' },
    '1829': { flag: '🇩🇴', name: 'DO' },
    '1849': { flag: '🇩🇴', name: 'DO' },
    '1876': { flag: '🇯🇲', name: 'JM' },
    '1868': { flag: '🇹🇹', name: 'TT' },
    '36':  { flag: '🇭🇺', name: 'HU' },
    '420': { flag: '🇨🇿', name: 'CZ' },
    '421': { flag: '🇸🇰', name: 'SK' },
    '40':  { flag: '🇷🇴', name: 'RO' },
    '359': { flag: '🇧🇬', name: 'BG' },
    '381': { flag: '🇷🇸', name: 'RS' },
    '385': { flag: '🇭🇷', name: 'HR' },
    '387': { flag: '🇧🇦', name: 'BA' },
    '386': { flag: '🇸🇮', name: 'SI' },
    '355': { flag: '🇦🇱', name: 'AL' },
    '389': { flag: '🇲🇰', name: 'MK' },
    '382': { flag: '🇲🇪', name: 'ME' },
    '383': { flag: '🇽🇰', name: 'XK' },
    '373': { flag: '🇲🇩', name: 'MD' },
    '375': { flag: '🇧🇾', name: 'BY' },
    '372': { flag: '🇪🇪', name: 'EE' },
    '371': { flag: '🇱🇻', name: 'LV' },
    '370': { flag: '🇱🇹', name: 'LT' },
    '995': { flag: '🇬🇪', name: 'GE' },
    '374': { flag: '🇦🇲', name: 'AM' },
    '994': { flag: '🇦🇿', name: 'AZ' },
    '998': { flag: '🇺🇿', name: 'UZ' },
    '996': { flag: '🇰🇬', name: 'KG' },
    '992': { flag: '🇹🇯', name: 'TJ' },
    '993': { flag: '🇹🇲', name: 'TM' },
    '855': { flag: '🇰🇭', name: 'KH' },
    '856': { flag: '🇱🇦', name: 'LA' },
    '976': { flag: '🇲🇳', name: 'MN' },
    '850': { flag: '🇰🇵', name: 'KP' },
    '670': { flag: '🇹🇱', name: 'TL' },
    '673': { flag: '🇧🇳', name: 'BN' },
    '675': { flag: '🇵🇬', name: 'PG' },
    '679': { flag: '🇫🇯', name: 'FJ' },
    '677': { flag: '🇸🇧', name: 'SB' },
    '678': { flag: '🇻🇺', name: 'VU' },
    '685': { flag: '🇼🇸', name: 'WS' },
    '676': { flag: '🇹🇴', name: 'TO' },
    '686': { flag: '🇰🇮', name: 'KI' },
    '688': { flag: '🇹🇻', name: 'TV' },
    '674': { flag: '🇳🇷', name: 'NR' },
    '680': { flag: '🇵🇼', name: 'PW' },
    '692': { flag: '🇲🇭', name: 'MH' },
    '691': { flag: '🇫🇲', name: 'FM' },
    '682': { flag: '🇨🇰', name: 'CK' },
    '683': { flag: '🇳🇺', name: 'NU' },
    '689': { flag: '🇵🇫', name: 'PF' },
    '687': { flag: '🇳🇨', name: 'NC' },
    '1787': { flag: '🇵🇷', name: 'PR' },
    '1939': { flag: '🇵🇷', name: 'PR' },
    '1340': { flag: '🇻🇮', name: 'VI' },
    '1671': { flag: '🇬🇺', name: 'GU' },
    '1345': { flag: '🇰🇾', name: 'KY' },
    '1242': { flag: '🇧🇸', name: 'BS' },
    '1246': { flag: '🇧🇧', name: 'BB' },
    '1473': { flag: '🇬🇩', name: 'GD' },
    '1758': { flag: '🇱🇨', name: 'LC' },
    '1784': { flag: '🇻🇨', name: 'VC' },
    '1268': { flag: '🇦🇬', name: 'AG' },
    '1767': { flag: '🇩🇲', name: 'DM' },
    '1869': { flag: '🇰🇳', name: 'KN' },
    '599':  { flag: '🇨🇼', name: 'CW' },
    '297':  { flag: '🇦🇼', name: 'AW' },
    '501':  { flag: '🇧🇿', name: 'BZ' },
    '502':  { flag: '🇬🇹', name: 'GT' },
    '503':  { flag: '🇸🇻', name: 'SV' },
    '504':  { flag: '🇭🇳', name: 'HN' },
    '505':  { flag: '🇳🇮', name: 'NI' },
    '506':  { flag: '🇨🇷', name: 'CR' },
    '507':  { flag: '🇵🇦', name: 'PA' },
    '509':  { flag: '🇭🇹', name: 'HT' },
    '53':   { flag: '🇨🇺', name: 'CU' },
  };

  const detectCountryCode = (cleanNumber) => {
    const candidates = [3, 2, 1];
    for (const len of candidates) {
      const prefix = cleanNumber.slice(0, len);
      if (COUNTRY_DATA[prefix]) {
        return prefix;
      }
    }
    return null;
  };

  function isGroupChat(msg) {
    return msg.chat?.type === 'group' || msg.chat?.type === 'supergroup';
  }

  function groupOnlyMarkup() {
    return {
      inline_keyboard: [
        [{ text: '𝐏ᴀʙɪᴛʀᴀ-𝐁ᴏᴛ Telegram', url: GROUP_URL }],
        [{ text: '📢 𝐏ᴀʙɪᴛʀᴀ-𝐁ᴏᴛ Channel', url: CHANNEL_URL }]
      ]
    };
  }

  function sendGroupOnlyMessage(msg) {
    return bot.sendMessage(
      msg.chat.id,
      '🌸 <b>𝐆ʀᴏᴜᴘ ᴏɴʟʏ ғᴇᴀᴛᴜʀᴇ</b>\n\n👉 Tʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴡᴏʀᴋs ᴏɴʟʏ ɪɴ ᴛʜᴇ ᴏғғɪᴄɪᴀʟ ɢʀᴏᴜᴘ.\nᑕʟɪᴄᴋ ʙᴇʟᴏᴡ ᴛᴏ ᴊᴏɪɴ ᴀɴᴅ ᴜsᴇ <code>/pair</code> ᴛʜᴇʀᴇ.',
      replyOptions(msg, { reply_markup: groupOnlyMarkup() })
    );
  }

  function isAdmin(msg) {
    if (!ADMIN_IDS.size) return true;
    return ADMIN_IDS.has(String(msg.from?.id)) || ADMIN_IDS.has(String(msg.chat?.id));
  }

  function replyOptions(msg, extra = {}) {
    return {
      reply_to_message_id: msg.message_id,
      parse_mode: 'HTML',
      ...extra
    };
  }

  function channelMarkup(includeCopyCode = false, code = '') {
    const rows = [];
    if (includeCopyCode && code) {
      rows.push([{ text: `✅ Copy Pairing Code: ${code}`, copy_text: { text: code } }]);
    }
    rows.push([{ text: '📢 𝐏ᴀʙɪᴛʀᴀ-𝐁ᴏᴛ Channel', url: CHANNEL_URL }]);
    rows.push([{ text: '💬 Telegram Group', url: GROUP_URL }]);
    return { inline_keyboard: rows };
  }

  function cleanNumber(value) {
    return normalizeNumber(value);
  }

  function sessionDir(number) {
    return path.join(PAIRING_ROOT, `${number}@s.whatsapp.net`);
  }

  function uptimeText() {
    const total = Math.floor(process.uptime());
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  bot.onText(/^\/start(?:@\w+)?$/i, (msg) => {
    if (!isGroupChat(msg)) return sendGroupOnlyMessage(msg);
    const text =
      '✨ <b>𝐏ᴀʙɪᴛʀᴀ-𝐁ᴏᴛ</b>\n\n' +
      '🍉 𝐅ᴀsᴛ ᴀɴᴅ sᴇᴄᴜʀᴇ ᴡʜᴀᴛsᴀᴘᴘ ᴘᴀɪʀɪɴɢ ʙᴏᴛ.\n\n' +
      '📌 ᑌsᴇ: <code>/pair 919641092392</code>\n' +
      '📊 𝐂ʜᴇᴄᴋ ʙᴏᴛ sᴛᴀᴛᴜs: <code>/status</code>\n' +
      '🏓 𝐂ʜᴇᴄᴋ ʟᴀᴛᴇɴᴄʏ: <code>/ping</code>';
    return bot.sendMessage(msg.chat.id, text, replyOptions(msg, {
      reply_markup: channelMarkup()
    }));
  });

  bot.onText(/^\/ping(?:@\w+)?$/i, async (msg) => {
    const startedAt = Date.now();
    const sent = await bot.sendMessage(msg.chat.id, '🏓 <b>Pᴏɴɢ!</b>', replyOptions(msg));
    const latency = Date.now() - startedAt;
    try {
      await bot.editMessageText(
        `🏓 <b>Pᴏɴɢ!</b>\n⚡ <b>${latency}ms</b>`,
        {
          chat_id: msg.chat.id,
          message_id: sent.message_id,
          parse_mode: 'HTML',
          reply_markup: channelMarkup()
        }
      );
    } catch {
      await bot.sendMessage(msg.chat.id, `🏓 <b>Pᴏɴɢ!</b>\n⚡ <b>${latency}ms</b>`, replyOptions(msg, {
        reply_markup: channelMarkup()
      }));
    }
  });

  bot.onText(/^\/status(?:@\w+)?$/i, async (msg) => {
    const sessions = getActiveSessions();
    const memory = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const statusText =
      '📊 <b>𝐁ᴏᴛ Տᴛᴀᴛᴜs</b>\n' +
      '⚡ <b>𝐏ᴏᴡᴇʀᴇᴅ ʙʏ 𝐑ᴀʜɪ♡</b>\n\n' +
      `⏱️ <b>𝐔ᴘᴛɪᴍᴇ:</b> ${uptimeText()}\n` +
      `💾 <b>𝐌ᴇᴍᴏʀʏ:</b> ${memory} MB\n` +
      `📡 <b>𝐀ᴄᴛɪᴠᴇ Տᴇssɪᴏɴs:</b> ${sessions.length}\n` +
      '🟢 <b>Oɴʟɪɴᴇ</b>\n' +
      `🖥️ <b>𝐏ʟᴀᴛғᴏʀᴍ:</b> ${process.platform}\n` +
      `📦 <b>𝐍ᴏᴅᴇ.ᴊs:</b> ${process.version}`;
    return bot.sendMessage(msg.chat.id, statusText, replyOptions(msg, {
      reply_markup: channelMarkup()
    }));
  });

  bot.onText(/^\/pair(?:@\w+)?(?:\s+(.+)|([+0-9][0-9\s-]*))?$/i, async (msg, match) => {
    if (!isGroupChat(msg)) return sendGroupOnlyMessage(msg);
    if (!isAdmin(msg)) {
      return bot.sendMessage(msg.chat.id, '⛔ You are not allowed to pair sessions.', replyOptions(msg));
    }

    const raw = (match?.[1] || match?.[2])?.trim();
    if (!raw) {
      return bot.sendMessage(
        msg.chat.id,
        '📱 <b>𝐏ʟᴇᴀsᴇ ᴘʀᴏᴠɪᴅᴇ ᴀ ᴘʜᴏɴᴇ ɴᴜᴍʙᴇʀ.</b>\n\n𝐄xᴀᴍᴘʟᴇ: <code>/pair 919641092392</code>\nIɴᴄʟᴜᴅᴇ ᴛʜᴇ ᴄᴏᴜɴᴛʀʏ ᴄᴏᴅᴇ ᴡɪᴛʜᴏᴜᴛ ᴛʜᴇ ʟᴏᴀᴅɪɴɢ ᴢᴇʀᴏ.',
        replyOptions(msg, { reply_markup: channelMarkup() })
      );
    }

    const digitsOnly = String(raw).replace(/\D/g, '');
    if (digitsOnly.startsWith('0')) {
      return bot.sendMessage(msg.chat.id, '❌ <b>Do not start with 0.</b>\n\nInclude your country code, for example: <code>/pair 9196XXXXXXXXX</code>', replyOptions(msg, { reply_markup: channelMarkup() }));
    }
    if (!/^\d{7,15}$/.test(digitsOnly)) {
      return bot.sendMessage(msg.chat.id, '❌ <b>Invalid number format.</b>\n\nExample: <code>/pair +919641092392</code>\nInclude your country code.', replyOptions(msg, { reply_markup: channelMarkup() }));
    }

    let number;
    try {
      number = cleanNumber(raw);
    } catch {
      return bot.sendMessage(msg.chat.id, '❌ Invalid phone number. Use country code and digits only.', replyOptions(msg));
    }

    const countryCode = detectCountryCode(number) || number.slice(0, 3);
    const countryInfo = COUNTRY_DATA[countryCode] || { flag: '🌍', name: 'UNKNOWN' };
    if (pending.has(number) || fs.existsSync(path.join(sessionDir(number), 'creds.json'))) {
      return bot.sendMessage(
        msg.chat.id,
        `✅ <b>𝐀ʟʀᴇᴀᴅʏ ᴄᴏɴɴᴇᴄᴛᴇᴅ!</b>\n\n📱 <b>𝐍ᴜᴍʙᴇʀ:</b> +${number}\n${countryInfo.flag} <b>${countryInfo.name}</b> (+${countryCode})\n\n🤖 𝐓ʜɪs ɴᴜᴍʙᴇʀ ᴀʟʀᴇᴀᴅʏ ʜᴀs ᴀ sᴇssɪᴏɴ. ᑌsᴇ <code>/unpair ${number}</code> ᖴɪʀsᴛ ɪғ ʏᴏᴜ ɴᴇᴇᴅ ᴛᴏ ʀᴇᴘʟᴀᴄᴇ ɪᴛ.`,
        replyOptions(msg, { reply_markup: channelMarkup() })
      );
    }

    pending.set(number, { chatId: msg.chat.id, messageId: msg.message_id, createdAt: Date.now(), countryCode });
    let pairMessageId = null;
    try {
      const waiting = await bot.sendMessage(
        msg.chat.id,
        `⌛ <b>𝐑ᴇǫᴜᴇsᴛɪɴɢ ᴘᴀɪʀɪɴɢ...</b>\n\n📱 <b>𝐍ᴜᴍʙᴇʀ:</b> +${number}\n${countryInfo.flag} ${countryInfo.name} (+${countryCode})\n\n🔒 𝐏ʟᴇᴀsᴇ ᴡᴀɪᴛ ᴀ ᴍᴏᴍᴇɴᴛs...`,
        replyOptions(msg)
      );

      await startPairing(number, {
        onPairingCode: async (code) => {
          const pairText =
            '🔐 <b>𝐏ᴀɪʀ ᴄᴏᴅᴇ ʀᴇᴀᴅʏ</b>\n' +
            `📱 <b>𝐍ᴜᴍʙᴇʀ:</b> +${number}\n${countryInfo.flag} ${countryInfo.name} (+${countryCode})\n\n` +
            `╭────〔 🛡️ᑕᴏᴅᴇ 〕────╮\n│ <code>${code}</code>\n╰────────────────────╯\n\n` +
            '📌 <b>𝐇ᴏᴡ ᴛᴏ ᴜsᴇ:</b>\n' +
            '1. 𝐖ʜᴀᴛsᴀᴘᴘ → Տᴇᴛᴛɪɴɢs → ᒪɪɴᴋᴇᴅ ᗪᴇᴠɪᴄᴇs\n' +
            '2. ᒪɪɴᴋ ᴀ ᗪᴇᴠɪᴄᴇ → ᗴɴᴛᴇʀ ᑕᴏᴅᴇ\n\n' +
            '⏰ 𝐄ɴᴛᴇʀ Tʜᴇ ᑕᴏᴅᴇ ᗩs Տᴏᴏɴ ᗩs 𝐏ᴏssɪʙʟᴇ.';
          await bot.deleteMessage(msg.chat.id, waiting.message_id).catch(() => {});
          const pairMessage = await bot.sendMessage(msg.chat.id, pairText, replyOptions(msg, {
            reply_markup: channelMarkup(true, code)
          }));
          pairMessageId = pairMessage.message_id;
          const timer = setTimeout(async () => {
            expiryTimers.delete(number);
            if (!getActiveSessions().some((session) => session.number === number && session.connected)) {
              await bot.deleteMessage(msg.chat.id, pairMessage.message_id).catch(() => {});
              await stopPairing(number, true).catch(() => {});
              pending.delete(number);
              await bot.sendMessage(msg.chat.id, `⌛ <b>𝐏ᴀɪʀɪɴɢ ᴛɪᴍᴇᴅ 𝐎ᴜᴛ</b>\n\n📱 <b>𝐍ᴜᴍʙᴇʀ:</b> +${number}\n\n🔐 𝐓ʜᴇ ᴘᴀɪʀ ᴄᴏᴅᴇ ᴇxᴘɪʀᴇᴅ ᗩғᴛᴇʀ 1 ᴍɪɴᴜᴛᴇ ᗷᴇᴄᴀᴜsᴇ ᴛʜᴇ ɴᴜᴍʙᴇʀ ᴡᴀs ɴᴏᴛ ᑕᴏɴɴᴇᴄᴛᴇᴅ ɪɴ ᴛɪᴍᴇ.\n\n🔄 Տᴇɴᴅ <code>/pair ${number}</code> ᗩɢᴀɪɴ ᴛᴏ 𝐑ᴇǫᴜᴇsᴛ ᴀ 𝐍ᴇᴡ ᑕᴏᴅᴇ.`, replyOptions(msg, { reply_markup: channelMarkup() })).catch(() => {});
            }
          }, 60 * 1000);
          expiryTimers.set(number, timer);
        },
        onConnected: async () => {
          pending.delete(number);
          if (pairMessageId) {
            await bot.deleteMessage(msg.chat.id, pairMessageId).catch(() => {});
            pairMessageId = null;
          }
          const expiryTimer = expiryTimers.get(number);
          if (expiryTimer) clearTimeout(expiryTimer);
          expiryTimers.delete(number);
          await bot.sendMessage(
            msg.chat.id,
            '❤️‍🔥 <b>BOT CONNECTED!</b>\n\n' +
            '🪄 <b>THIS NUMBER IS NOW CONNECTED!</b>\n\n' +
            `📱 <b>NUMBER:</b> +${number}\n${countryInfo.flag} <b>${countryInfo.name}</b> (+${countryCode})`,
            replyOptions(msg, { reply_markup: channelMarkup() })
          );
        },
        onLoggedOut: async () => {
          pending.delete(number);
          if (pairMessageId) {
            await bot.deleteMessage(msg.chat.id, pairMessageId).catch(() => {});
            pairMessageId = null;
          }
          const expiryTimer = expiryTimers.get(number);
          if (expiryTimer) clearTimeout(expiryTimer);
          expiryTimers.delete(number);
          await bot.sendMessage(
            msg.chat.id,
            `⚠️ <b>${number}</b> logged out or has an invalid session.`,
            replyOptions(msg, { reply_markup: channelMarkup() })
          );
        }
      });
    } catch (error) {
      pending.delete(number);
      if (pairMessageId) await bot.deleteMessage(msg.chat.id, pairMessageId).catch(() => {});
      const expiryTimer = expiryTimers.get(number);
      if (expiryTimer) clearTimeout(expiryTimer);
      expiryTimers.delete(number);
      await bot.sendMessage(msg.chat.id, `❌ <b>Pairing failed:</b> ${error.message}`, replyOptions(msg));
    }
  });

  bot.onText(/^\/unpair(?:@\w+)?(?:\s+(.+))?$/i, async (msg, match) => {
    if (!isAdmin(msg)) return bot.sendMessage(msg.chat.id, '⛔ Not allowed.', replyOptions(msg));
    let number;
    try {
      number = cleanNumber(match?.[1]);
    } catch {
      return bot.sendMessage(msg.chat.id, 'ᑌsᴀɢᴇ: <code>/unpair 9196XXXXXXXXX</code>', replyOptions(msg));
    }
    try {
      await stopPairing(number, true);
      pending.delete(number);
      return bot.sendMessage(msg.chat.id, `✅ Session <b>${number}</b> removed.`, replyOptions(msg, {
        reply_markup: channelMarkup()
      }));
    } catch (error) {
      return bot.sendMessage(msg.chat.id, `❌ Unpair failed: ${error.message}`, replyOptions(msg));
    }
  });

  bot.onText(/^\/(?:sessions|session)(?:@\w+)?$/i, async (msg) => {
    if (!isAdmin(msg)) return bot.sendMessage(msg.chat.id, '⛔ Not allowed.', replyOptions(msg));
    const sessions = getActiveSessions();
    const text = sessions.length
      ? sessions.map((session) => `• ${session.number} — ${session.connected ? 'connected' : 'starting'}`).join('\n')
      : 'No active sessions.';
    return bot.sendMessage(msg.chat.id, `📡 <b>ACTIVE SESSIONS</b>\n\n${text}`, replyOptions(msg, {
      reply_markup: channelMarkup()
    }));
  });

  bot.on('polling_error', (error) => console.error('[telegram polling]', error.message));
  console.log('✅ Telegram pairing control-plane started.');
  module.exports = bot;
}
