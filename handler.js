/**
 * Message Handler - Processes incoming messages and executes commands
 */

const config = require('./config');
const database = require('./database');
const { loadCommands } = require('./utils/commandLoader');
const { addMessage } = require('./utils/groupstats');
const { tryAutoLevelUp, formatLevelUpMessage } = require('./utils/economy');
const { jidDecode, jidEncode } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const chatbotCmd = require('./commands/admin/chatbot');
const { containsBadWord } = require('./utils/badwords');
const { writeExifImg } = require('./utils/exif');
const { sendBotContact, sendTextWithBotContact, installBotContactWrapper } = require('./utils/botContact');

// Group metadata cache to prevent rate limiting
const groupMetadataCache = new Map();
const CACHE_TTL = 60000; // 1 minute cache

// Load all commands
const commands = loadCommands();

const ANTIBADWORD_STICKER_PATH = path.join(__dirname, 'utils', 'galimatde.webp');
const ANTIBADWORD_STICKER_AUTHOR = 'GALI MAT DE BSDK';
let antibadwordStickerCache = null;

const getAntibadwordSticker = async () => {
  try {
    if (!antibadwordStickerCache && fs.existsSync(ANTIBADWORD_STICKER_PATH)) {
      const raw = fs.readFileSync(ANTIBADWORD_STICKER_PATH);
      antibadwordStickerCache = await writeExifImg(raw, { packname: ANTIBADWORD_STICKER_AUTHOR });
    }
  } catch (e) {
    console.error('[antibadword] sticker load error:', e.message);
  }
  return antibadwordStickerCache;
};

// Emoji detection regex (covers all Unicode emoji ranges)
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1FA00}-\u{1FA6F}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{3030}\u{303D}\u{3297}\u{3299}\u{00A9}\u{00AE}\u{2122}\u{2139}\u{2194}-\u{2199}\u{21A9}\u{21AA}\u{231A}\u{231B}\u{2328}\u{23CF}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{24C2}\u{25AA}\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{260E}\u{2611}\u{2614}\u{2615}\u{2618}\u{261D}\u{2620}\u{2622}\u{2623}\u{2626}\u{262A}\u{262E}\u{262F}\u{2638}-\u{263A}\u{2640}\u{2642}\u{2648}-\u{2653}\u{265F}\u{2660}\u{2663}\u{2665}\u{2666}\u{2668}\u{267B}\u{267E}\u{267F}\u{2692}-\u{2697}\u{2699}\u{269B}\u{269C}\u{26A0}\u{26A1}\u{26AA}\u{26AB}\u{26B0}\u{26B1}\u{26BD}\u{26BE}\u{26C4}\u{26C5}\u{26C8}\u{26CE}\u{26CF}\u{26D1}\u{26D3}\u{26D4}\u{26E9}\u{26EA}\u{26F0}-\u{26F5}\u{26F7}-\u{26FA}\u{26FD}\u{2702}\u{2705}\u{2708}-\u{270D}\u{270F}\u{2712}\u{2714}\u{2716}\u{271D}\u{2721}\u{2728}\u{2733}\u{2734}\u{2744}\u{2747}\u{274C}\u{274E}\u{2753}-\u{2755}\u{2757}\u{2763}\u{2764}\u{2795}-\u{2797}\u{27A1}\u{27B0}\u{27BF}\u{2934}\u{2935}\u{2B05}-\u{2B07}\u{2B1B}\u{2B1C}\u{2B50}\u{2B55}]/u;

// Unwrap WhatsApp containers (ephemeral, view once, etc.)
const getMessageContent = (msg) => {
  if (!msg || !msg.message) return null;
  
  let m = msg.message;
  
  if (m.ephemeralMessage) m = m.ephemeralMessage.message;
  if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
  if (m.viewOnceMessage) m = m.viewOnceMessage.message;
  if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;
  
  return m;
};

// Cached group metadata getter with rate limit handling (for non-admin checks)
const getCachedGroupMetadata = async (sock, groupId) => {
  try {
    if (!groupId || !groupId.endsWith('@g.us')) {
      return null;
    }
    
    const cached = groupMetadataCache.get(groupId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
    
    const metadata = await sock.groupMetadata(groupId);
    
    groupMetadataCache.set(groupId, {
      data: metadata,
      timestamp: Date.now()
    });
    
    return metadata;
  } catch (error) {
    if (error.message && (
      error.message.includes('forbidden') || 
      error.message.includes('403') ||
      error.statusCode === 403 ||
      error.output?.statusCode === 403 ||
      error.data === 403
    )) {
      groupMetadataCache.set(groupId, {
        data: null,
        timestamp: Date.now()
      });
      return null;
    }
    
    if (error.message && error.message.includes('rate-overlimit')) {
      const cached = groupMetadataCache.get(groupId);
      if (cached) {
        return cached.data;
      }
      return null;
    }
    
    const cached = groupMetadataCache.get(groupId);
    if (cached) {
      return cached.data;
    }
    
    return null;
  }
};

// Live group metadata getter (always fresh, no cache) - for admin checks
const getLiveGroupMetadata = async (sock, groupId) => {
  try {
    const metadata = await sock.groupMetadata(groupId);
    
    groupMetadataCache.set(groupId, {
      data: metadata,
      timestamp: Date.now()
    });
    
    return metadata;
  } catch (error) {
    const cached = groupMetadataCache.get(groupId);
    if (cached) {
      return cached.data;
    }
    return null;
  }
};

const getGroupMetadata = getCachedGroupMetadata;

// Helper functions
const isOwner = (sender, sock = null) => {
  if (!sender) return false;

  if (sock?.user) {
    const runningBotIds = [sock.user.id, sock.user.lid].filter(Boolean);
    const senderVariants = buildComparableIds(sender);
    if (runningBotIds.some(id => buildComparableIds(id).some(v => senderVariants.includes(v)))) {
      return true;
    }
  }
  
  const normalizedSender = normalizeJidWithLid(sender);
  const senderNumber = normalizeJid(normalizedSender);
  
  return config.ownerNumber.some(owner => {
    const normalizedOwner = normalizeJidWithLid(owner.includes('@') ? owner : `${owner}@s.whatsapp.net`);
    const ownerNumber = normalizeJid(normalizedOwner);
    return ownerNumber === senderNumber;
  });
};

const isMod = (sender) => {
  const number = sender.split('@')[0];
  return database.isModerator(number);
};

const lidMappingCache = new Map();

const normalizeJid = (jid) => {
  if (!jid) return null;
  if (typeof jid !== 'string') return null;
  
  if (jid.includes(':')) {
    return jid.split(':')[0];
  }
  if (jid.includes('@')) {
    return jid.split('@')[0];
  }
  return jid;
};

const getLidMappingValue = (user, direction) => {
  if (!user) return null;
  
  const cacheKey = `${direction}:${user}`;
  if (lidMappingCache.has(cacheKey)) {
    return lidMappingCache.get(cacheKey);
  }
  
  const sessionPath = path.join(__dirname, config.sessionName || 'session');
  const suffix = direction === 'pnToLid' ? '.json' : '_reverse.json';
  const filePath = path.join(sessionPath, `lid-mapping-${user}${suffix}`);
  
  if (!fs.existsSync(filePath)) {
    lidMappingCache.set(cacheKey, null);
    return null;
  }
  
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    const value = raw ? JSON.parse(raw) : null;
    lidMappingCache.set(cacheKey, value || null);
    return value || null;
  } catch (error) {
    lidMappingCache.set(cacheKey, null);
    return null;
  }
};

const normalizeJidWithLid = (jid) => {
  if (!jid) return jid;
  
  try {
    const decoded = jidDecode(jid);
    if (!decoded?.user) {
      return `${jid.split(':')[0].split('@')[0]}@s.whatsapp.net`;
    }
    
    let user = decoded.user;
    let server = decoded.server === 'c.us' ? 's.whatsapp.net' : decoded.server;
    
    const mapToPn = () => {
      const pnUser = getLidMappingValue(user, 'lidToPn');
      if (pnUser) {
        user = pnUser;
        server = server === 'hosted.lid' ? 'hosted' : 's.whatsapp.net';
        return true;
      }
      return false;
    };
    
    if (server === 'lid' || server === 'hosted.lid') {
      mapToPn();
    } else if (server === 's.whatsapp.net' || server === 'hosted') {
      mapToPn();
    }
    
    if (server === 'hosted') {
      return jidEncode(user, 'hosted');
    }
    return jidEncode(user, 's.whatsapp.net');
  } catch (error) {
    return jid;
  }
};

const buildComparableIds = (jid) => {
  if (!jid) return [];
  
  try {
    const decoded = jidDecode(jid);
    if (!decoded?.user) {
      return [normalizeJidWithLid(jid)].filter(Boolean);
    }
    
    const variants = new Set();
    const normalizedServer = decoded.server === 'c.us' ? 's.whatsapp.net' : decoded.server;
    
    variants.add(jidEncode(decoded.user, normalizedServer));
    
    const isPnServer = normalizedServer === 's.whatsapp.net' || normalizedServer === 'hosted';
    const isLidServer = normalizedServer === 'lid' || normalizedServer === 'hosted.lid';
    
    if (isPnServer) {
      const lidUser = getLidMappingValue(decoded.user, 'pnToLid');
      if (lidUser) {
        const lidServer = normalizedServer === 'hosted' ? 'hosted.lid' : 'lid';
        variants.add(jidEncode(lidUser, lidServer));
      }
    } else if (isLidServer) {
      const pnUser = getLidMappingValue(decoded.user, 'lidToPn');
      if (pnUser) {
        const pnServer = normalizedServer === 'hosted.lid' ? 'hosted' : 's.whatsapp.net';
        variants.add(jidEncode(pnUser, pnServer));
      }
    }
    
    return Array.from(variants);
  } catch (error) {
    return [jid];
  }
};

const isBotJid = (jid, sock) => {
  if (!jid || !sock?.user) return false;
  const botRefs = [sock.user.id, sock.user.lid].filter(Boolean);
  const targetVariants = buildComparableIds(jid);
  return botRefs.some(botRef =>
    buildComparableIds(botRef).some(botVariant => targetVariants.includes(botVariant))
  );
};

const findParticipant = (participants = [], userIds) => {
  const targets = (Array.isArray(userIds) ? userIds : [userIds])
    .filter(Boolean)
    .flatMap(id => buildComparableIds(id));
  
  if (!targets.length) return null;
  
  return participants.find(participant => {
    if (!participant) return false;
    
    const participantIds = [
      participant.id,
      participant.lid,
      participant.userJid
    ]
      .filter(Boolean)
      .flatMap(id => buildComparableIds(id));
    
    return participantIds.some(id => targets.includes(id));
  }) || null;
};

const isAdmin = async (sock, participant, groupId, groupMetadata = null) => {
  if (!participant) return false;
  
  if (!groupId || !groupId.endsWith('@g.us')) {
    return false;
  }
  
  let liveMetadata = await getLiveGroupMetadata(sock, groupId);
  if (!liveMetadata || !liveMetadata.participants) liveMetadata = groupMetadata;
  if (!liveMetadata || !liveMetadata.participants) return false;
  
  const foundParticipant = findParticipant(liveMetadata.participants, participant);
  if (!foundParticipant) return false;
  
  return foundParticipant.admin === 'admin' || foundParticipant.admin === 'superadmin';
};

const isBotAdmin = async (sock, groupId, groupMetadata = null) => {
  if (!sock.user || !groupId) return false;
  
  if (!groupId.endsWith('@g.us')) {
    return false;
  }
  
  try {
    const botId = sock.user.id;
    const botLid = sock.user.lid;
    
    if (!botId) return false;
    
    const botJids = [botId];
    if (botLid) {
      botJids.push(botLid);
    }
    
    const liveMetadata = await getLiveGroupMetadata(sock, groupId);
    
    if (!liveMetadata || !liveMetadata.participants) return false;
    
    const participant = findParticipant(liveMetadata.participants, botJids);
    if (!participant) return false;
    
    return participant.admin === 'admin' || participant.admin === 'superadmin';
  } catch (error) {
    return false;
  }
};

const isUrl = (text) => {
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  return urlRegex.test(text);
};

const hasGroupLink = (text) => {
  const linkRegex = /chat.whatsapp.com\/([0-9A-Za-z]{20,24})/i;
  return linkRegex.test(text);
};

const isSystemJid = (jid) => {
  if (!jid) return true;
  return jid.includes('@broadcast') || 
         jid.includes('status.broadcast') || 
         jid.includes('@newsletter') ||
         jid.includes('@newsletter.');
};

// Main message handler
const handleMessage = async (sock, msg, sessionContext = {}) => {
  installBotContactWrapper(sock);
  try {
    if (!msg.message) return;
    
    const from = msg.key.remoteJid;
    const sessionPath = sessionContext.sessionPath;
    const botName = sessionContext.botName || 'Bot';
    
    if (isSystemJid(from)) {
      return;
    }
    
    // Auto-React System
    try {
      delete require.cache[require.resolve('./config')];
      const config = require('./config');

      if (config.autoReact && msg.message && !msg.key.fromMe) {
        const content = msg.message.ephemeralMessage?.message || msg.message;
        const text =
          content.conversation ||
          content.extendedTextMessage?.text ||
          '';

        const jid = msg.key.remoteJid;
        const emojis = ['❤️','🔥','👌','💀','😁','✨','👍','🤨','😎','😂','🤝','💫'];
        
        const mode = config.autoReactMode || 'bot';

        if (mode === 'bot') {
          const prefixList = ['.', '/', '#'];
          if (prefixList.includes(text?.trim()[0])) {
            await sock.sendMessage(jid, {
              react: { text: '⏳', key: msg.key }
            });
          }
        }

        if (mode === 'all') {
          const rand = emojis[Math.floor(Math.random() * emojis.length)];
          await sock.sendMessage(jid, {
            react: { text: rand, key: msg.key }
          });
        }
      }
    } catch (e) {
      console.error('[AutoReact Error]', e.message);
    }
    
    const content = getMessageContent(msg);
    
    let actualMessageTypes = [];
    if (content) {
      const allKeys = Object.keys(content);
      const protocolMessages = ['protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo'];
      actualMessageTypes = allKeys.filter(key => !protocolMessages.includes(key));
    }
    
    const messageType = actualMessageTypes[0];
    
    const sender = msg.key.fromMe ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : msg.key.participant || msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    
    const groupMetadata = isGroup ? await getGroupMetadata(sock, from) : null;

    // Anti-group status (block group status posts)
    if (isGroup && !msg.key.fromMe) {
      try {
        const blocked = await handleAntigroupstatus(sock, msg, groupMetadata, content);
        if (blocked) return;
      } catch (error) {
        console.error('Error in antigroupstatus handler:', error);
      }
    }

    // Anti-sticker (block stickers from non-admins)
    if (isGroup && !msg.key.fromMe) {
      try {
        const blocked = await handleAntisticker(sock, msg, groupMetadata, content);
        if (blocked) return;
      } catch (error) {
        console.error('Error in antisticker handler:', error);
      }
    }

    // Anti-emoji (block emojis from non-admins)
    if (isGroup && !msg.key.fromMe) {
      try {
        const blocked = await handleAntiemoji(sock, msg, groupMetadata, content);
        if (blocked) return;
      } catch (error) {
        console.error('Error in antiemoji handler:', error);
      }
    }

    // Anti-image (block images from non-admins)
    if (isGroup && !msg.key.fromMe) {
      try {
        const blocked = await handleAntiimage(sock, msg, groupMetadata, content);
        if (blocked) return;
      } catch (error) {
        console.error('Error in antiimage handler:', error);
      }
    }

    // Anti-voice (block voice messages from non-admins)
    if (isGroup && !msg.key.fromMe) {
      try {
        const blocked = await handleAntivoice(sock, msg, groupMetadata, content);
        if (blocked) return;
      } catch (error) {
        console.error('Error in antivoice handler:', error);
      }
    }

    // Anti-video (block videos from non-admins)
    if (isGroup && !msg.key.fromMe) {
      try {
        const blocked = await handleAntivideo(sock, msg, groupMetadata, content);
        if (blocked) return;
      } catch (error) {
        console.error('Error in antivideo handler:', error);
      }
    }
    
    // Anti-group mention protection
    if (isGroup) {
      const groupSettings = database.getGroupSettings(from);
      try {
        await handleAntigroupmention(sock, msg, groupMetadata);
      } catch (error) {
        console.error('Error in antigroupmention handler:', error);
      }
    }
    
    // Track group message statistics
    if (isGroup) {
      const ctx = content?.extendedTextMessage?.contextInfo;
      addMessage(from, sender, {
        mentions: ctx?.mentionedJid || [],
        sticker: !!(content?.stickerMessage || msg.message?.stickerMessage),
      });

      if (!msg.key.fromMe) {
        try {
          const levelResult = tryAutoLevelUp(from, sender);
          if (levelResult.leveled) {
            await sock.sendMessage(from, {
              text: formatLevelUpMessage(
                levelResult.before,
                levelResult.after,
                levelResult.role,
                levelResult.diamondsEarned
              ),
              mentions: [sender],
            }, { quoted: msg });
          }
        } catch (e) {
          // ignore autolevel errors
        }
      }
    }
    
    if (!content || actualMessageTypes.length === 0) return;
    
    // Button response
    const btn = content.buttonsResponseMessage || msg.message?.buttonsResponseMessage;
    if (btn) {
      const buttonId = btn.selectedButtonId;
      const displayText = btn.selectedDisplayText;
      
      if (buttonId === 'btn_menu') {
        const menuCmd = commands.get('menu');
        if (menuCmd) {
          await menuCmd.execute(sock, msg, [], {
            from,
            sender,
            isGroup,
            groupMetadata,
            isOwner: isOwner(sender, sock),
            isAdmin: await isAdmin(sock, sender, from, groupMetadata),
            isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
            isMod: isMod(sender),
            reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
            react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
          });
        }
        return;
      } else if (buttonId === 'btn_ping') {
        const pingCmd = commands.get('ping');
        if (pingCmd) {
          await pingCmd.execute(sock, msg, [], {
            from,
            sender,
            isGroup,
            groupMetadata,
            isOwner: isOwner(sender, sock),
            isAdmin: await isAdmin(sock, sender, from, groupMetadata),
            isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
            isMod: isMod(sender),
            reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
            react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
          });
        }
        return;
      } else if (buttonId === 'btn_help') {
        const listCmd = commands.get('list');
        if (listCmd) {
          await listCmd.execute(sock, msg, [], {
            from,
            sender,
            isGroup,
            groupMetadata,
            isOwner: isOwner(sender, sock),
            isAdmin: await isAdmin(sock, sender, from, groupMetadata),
            isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
            isMod: isMod(sender),
            reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
            react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
          });
        }
        return;
      }
    }
    
    // Get message body
    let body = '';
    if (content.conversation) {
      body = content.conversation;
    } else if (content.extendedTextMessage) {
      body = content.extendedTextMessage.text || '';
    } else if (content.imageMessage) {
      body = content.imageMessage.caption || '';
    } else if (content.videoMessage) {
      body = content.videoMessage.caption || '';
    }
    
    body = (body || '').trim();

    // Antilink protection
    if (isGroup && !msg.key.fromMe) {
      try {
        await handleAntilink(sock, msg, groupMetadata);
      } catch (error) {
        console.error('Error in antilink handler:', error);
      }
    }
    
    // Check antiall protection
    if (isGroup) {
      const groupSettings = database.getGroupSettings(from);
      if (groupSettings.antiall) {
        const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
        const senderIsOwner = isOwner(sender, sock);
        
        if (!senderIsAdmin && !senderIsOwner) {
          const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
          const action = (groupSettings.antiallAction || 'delete').toLowerCase();
          
          if (botIsAdmin) {
            try {
              await sock.sendMessage(from, { delete: msg.key });
            } catch (e) {
              console.error('Failed to delete antiall message:', e);
            }
            
            if (action === 'kick') {
              try {
                await sock.groupParticipantsUpdate(from, [sender], 'remove');
                await sock.sendMessage(from, {
                  text: '🔒 *Antiall!* @user was kicked for sending messages.',
                  mentions: [sender]
                });
              } catch (e) {
                console.error('Failed to kick for antiall:', e);
              }
            } else if (action === 'warn') {
              const maxWarnings = config.maxWarnings || 3;
              const result = database.addWarning(from, sender, 'Antiall violation');
              
              if (result.count >= maxWarnings) {
                try {
                  await sock.groupParticipantsUpdate(from, [sender], 'remove');
                  database.clearWarnings(from, sender);
                  await sock.sendMessage(from, {
                    text: `🔒 *Antiall!* @user was kicked after ${maxWarnings} warnings.`,
                    mentions: [sender]
                  });
                } catch (e) {
                  console.error('Failed to kick after antiall warnings:', e);
                }
              } else {
                await sock.sendMessage(from, {
                  text: `⚠️ *Antiall!* @user warning ${result.count}/${maxWarnings}. Group is locked.`,
                  mentions: [sender]
                });
              }
            }
            return;
          }
        }
      }
      
      // Anti-tag protection
      if (groupSettings.antitag && !msg.key.fromMe) {
        const ctx = content.extendedTextMessage?.contextInfo;
        const mentionedJids = ctx?.mentionedJid || [];
        
        const messageText = (
          body ||
          content.imageMessage?.caption ||
          content.videoMessage?.caption ||
          ''
        );
        
        const textMentions = messageText.match(/@[\d+\s\-()~.]+/g) || [];
        const numericMentions = messageText.match(/@\d{10,}/g) || [];
        
        const uniqueNumericMentions = new Set();
        numericMentions.forEach((mention) => {
          const numMatch = mention.match(/@(\d+)/);
          if (numMatch) uniqueNumericMentions.add(numMatch[1]);
        });
        
        const mentionedJidCount = mentionedJids.length;
        const numericMentionCount = uniqueNumericMentions.size;
        const totalMentions = Math.max(mentionedJidCount, numericMentionCount);
        
        if (totalMentions >= 3) {
          try {
            const participants = groupMetadata.participants || [];
            const mentionThreshold = Math.max(3, Math.ceil(participants.length * 0.5));
            const hasManyNumericMentions = numericMentionCount >= 10 ||
              (numericMentionCount >= 5 && numericMentionCount >= mentionThreshold);
            
            if (totalMentions >= mentionThreshold || hasManyNumericMentions) {
              const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
              const senderIsOwner = isOwner(sender, sock);
              
              if (!senderIsAdmin && !senderIsOwner) {
                const action = (groupSettings.antitagAction || 'delete').toLowerCase();
                
                if (action === 'delete') {
                  try {
                    await sock.sendMessage(from, { delete: msg.key });
                    await sock.sendMessage(from, { 
                      text: '⚠️ *Tagall Detected!*',
                      mentions: [sender]
                    }, { quoted: msg });
                  } catch (e) {
                    console.error('Failed to delete tagall message:', e);
                  }
                } else if (action === 'kick') {
                  try {
                    await sock.sendMessage(from, { delete: msg.key });
                  } catch (e) {
                    console.error('Failed to delete tagall message:', e);
                  }
                  
                  const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
                  if (botIsAdmin) {
                    try {
                      await sock.groupParticipantsUpdate(from, [sender], 'remove');
                    } catch (e) {
                      console.error('Failed to kick for antitag:', e);
                    }
                    const usernames = [`@${sender.split('@')[0]}`];
                    await sock.sendMessage(from, {
                      text: `🚫 *Antitag Detected!*\n\n${usernames.join(', ')} has been kicked for tagging all members.`,
                      mentions: [sender],
                    }, { quoted: msg });
                  }
                }
                return;
              }
            }
          } catch (e) {
            console.error('Error during anti-tag enforcement:', e);
          }
        }
      }

      // Antibadword protection
      if (groupSettings.antibadword && !msg.key.fromMe) {
        const messageText = body || content.imageMessage?.caption || content.videoMessage?.caption || '';
        if (messageText) {
          try {
            const blocked = await handleAntibadword(sock, msg, groupMetadata, messageText, sender);
            if (blocked) return;
          } catch (e) {
            console.error('Error in antibadword handler:', e);
          }
        }
      }
    }
    
    // AutoSticker
    if (isGroup) {
      const groupSettings = database.getGroupSettings(from);
      if (groupSettings.autosticker) {
        const mediaMessage = content?.imageMessage || content?.videoMessage;
        
        if (mediaMessage) {
          if (!body.startsWith(config.prefix)) {
            try {
              const stickerCmd = commands.get('sticker');
              if (stickerCmd) {
                await stickerCmd.execute(sock, msg, [], {
                  from,
                  sender,
                  isGroup,
                  groupMetadata,
                  isOwner: isOwner(sender, sock),
                  isAdmin: await isAdmin(sock, sender, from, groupMetadata),
                  isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
                  isMod: isMod(sender),
                  reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
                  react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
                });
                return;
              }
            } catch (error) {
              console.error('[AutoSticker Error]:', error);
            }
          }
        }
      }
    }

    // ========================================
    // ALLSTATUS COMMAND — Manual trigger
    // (backup if command loader fails)
    // ========================================
    if (!msg.key.fromMe && isGroup && body) {
      const allStatusAliases = ['.allstatus', '.gallstatus', '.gs', '.allstatuses'];
      const lowerBody = body.toLowerCase();
      const isAllStatusCmd = allStatusAliases.some(cmd => 
        lowerBody === cmd || lowerBody.startsWith(cmd + ' ')
      );

      // Only run if command loader didn't already find it
      if (isAllStatusCmd && !commands.get('allstatus')) {
        try {
          const allStatusPath = path.join(__dirname, 'commands', 'general', 'allstatus.js');
          if (fs.existsSync(allStatusPath)) {
            delete require.cache[require.resolve(allStatusPath)];
            const allStatusCmd = require(allStatusPath);

            await allStatusCmd.execute(sock, msg, [], {
              from,
              sender,
              isGroup,
              groupMetadata,
              isOwner: isOwner(sender, sock),
              isAdmin: await isAdmin(sock, sender, from, groupMetadata),
              isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
              isMod: isMod(sender),
              reply: (text) => sendTextWithBotContact(sock, from, text),
              react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
            });
            return;
          }
        } catch (e) {
          console.error('Error in allstatus manual trigger:', e);
        }
      }
    }

    // Check for active bomb games
    try {
      const bombModule = require('./commands/fun/bomb');
      if (bombModule.gameState && bombModule.gameState.has(sender)) {
        const bombCommand = commands.get('bomb');
        if (bombCommand && bombCommand.execute) {
          await bombCommand.execute(sock, msg, [], {
            from,
            sender,
            isGroup,
            groupMetadata,
            isOwner: isOwner(sender, sock),
            isAdmin: await isAdmin(sock, sender, from, groupMetadata),
            isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
            isMod: isMod(sender),
            reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
            react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
          });
          return;
        }
      }
    } catch (e) {
      // ignore
    }
    
    // Check for active tictactoe games
    try {
      const tictactoeModule = require('./commands/fun/tictactoe');
      if (tictactoeModule.handleTicTacToeMove) {
        const isInGame = Object.values(tictactoeModule.games || {}).some(room => 
          room.id.startsWith('tictactoe') && 
          [room.game.playerX, room.game.playerO].includes(sender) && 
          room.state === 'PLAYING'
        );
        
        if (isInGame) {
          const handled = await tictactoeModule.handleTicTacToeMove(sock, msg, {
            from,
            sender,
            isGroup,
            groupMetadata,
            isOwner: isOwner(sender, sock),
            isAdmin: await isAdmin(sock, sender, from, groupMetadata),
            isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
            isMod: isMod(sender),
            reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
            react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
          });
          if (handled) return;
        }
      }
    } catch (e) {
      // ignore
    }

    try {
      const { handleGameInput } = require('./utils/funGames');
      const handled = await handleGameInput(sock, msg, {
        from,
        sender,
        isGroup,
        groupMetadata,
        isOwner: isOwner(sender, sock),
        reply: (text) => sock.sendMessage(from, { text }, { quoted: msg }),
      });
      if (handled) return;
    } catch (e) {
      // ignore
    }

    // AFK
    if (!msg.key.fromMe) {
      const afk = require('./utils/afk');
      if (afk.isEnabled() && !isOwner(sender, sock)) {
        let shouldHandleAfk = false;

        if (!isGroup) {
          shouldHandleAfk = true;
        } else {
          const ctx = content.extendedTextMessage?.contextInfo
            || content.imageMessage?.contextInfo
            || content.videoMessage?.contextInfo
            || content.stickerMessage?.contextInfo;
          const mentionedJids = ctx?.mentionedJid || [];
          const isMentioned = mentionedJids.some(jid => isBotJid(jid, sock));
          const isReplyToBot = ctx?.participant && isBotJid(ctx.participant, sock);
          shouldHandleAfk = (isMentioned || isReplyToBot) && !body.startsWith(config.prefix);
        }

        if (shouldHandleAfk) {
          if (afk.shouldNotify(from, sender)) {
            afk.markNotified(from, sender);
            await sock.sendMessage(from, { text: afk.getMessage() }, { quoted: msg });
          }
          return;
        }
      }
    }

    // Chatbot
    if (!msg.key.fromMe && isGroup) {
      const groupSettings = database.getGroupSettings(from);
      if (groupSettings.chatbot) {
        const ctx = content.extendedTextMessage?.contextInfo;
        const mentionedJids = ctx?.mentionedJid || [];
        const isMentioned = mentionedJids.some(jid => isBotJid(jid, sock));
        const isReplyToBot = ctx?.participant && isBotJid(ctx.participant, sock);

        if ((isMentioned || isReplyToBot) && !body.startsWith(config.prefix)) {
          await chatbotCmd.handleChat(sock, msg, body, sender);
          return;
        }
      }
    }

    // Check prefix
    if (!body.startsWith(config.prefix)) return;
    
    const args = body.slice(config.prefix.length).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();
    
    const command = commands.get(commandName);
    if (!command) return;
    
    if (config.selfMode && !isOwner(sender, sock)) {
      return;
    }
    
    if (command.ownerOnly && !isOwner(sender, sock)) {
      return sendTextWithBotContact(sock, from, config.messages.ownerOnly);
    }
    
    if (command.modOnly && !isMod(sender) && !isOwner(sender, sock)) {
      return sendTextWithBotContact(sock, from, '🔒 This command is only for moderators!');
    }
    
    if (command.groupOnly && !isGroup) {
      return sendTextWithBotContact(sock, from, config.messages.groupOnly);
    }
    
    if (command.privateOnly && isGroup) {
      return sendTextWithBotContact(sock, from, config.messages.privateOnly);
    }
    
    if (command.adminOnly && !(await isAdmin(sock, sender, from, groupMetadata)) && !isOwner(sender, sock)) {
      return sendTextWithBotContact(sock, from, config.messages.adminOnly);
    }
    
    if (command.botAdminNeeded) {
      const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
      if (!botIsAdmin) {
        return sendTextWithBotContact(sock, from, config.messages.botAdminNeeded);
      }
    }
    
    if (config.autoTyping) {
      await sock.sendPresenceUpdate('composing', from);
    }
    
    console.log(`Executing command: ${commandName} from ${sender}`);
    await command.execute(sock, msg, args, {
      from,
      sender,
      sessionPath,
      botName,
      isGroup,
      groupMetadata,
      isOwner: isOwner(sender, sock),
      isAdmin: await isAdmin(sock, sender, from, groupMetadata),
      isBotAdmin: await isBotAdmin(sock, from, groupMetadata),
      isMod: isMod(sender),
      reply: (text) => sendTextWithBotContact(sock, from, text),
      react: (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } })
    });

    
  } catch (error) {
    console.error('Error in message handler:', error);
    
    if (error.message && error.message.includes('rate-overlimit')) {
      console.warn('⚠️ Rate limit reached. Skipping error message.');
      return;
    }
    
    try {
      await sendTextWithBotContact(
        sock,
        msg.key.remoteJid,
        `${config.messages.error}\n\n${error.message}`
      );
    } catch (e) {
      if (!e.message || !e.message.includes('rate-overlimit')) {
        console.error('Error sending error message:', e);
      }
    }
  }
};

// Group participant update handler
const handleGroupUpdate = async (sock, update, sessionContext = {}) => {
  const botName = sessionContext.botName || config.botName || 'Bot';
  try {
    const { id, participants = [], action } = update || {};
    
    if (!id || !id.endsWith('@g.us')) {
      return;
    }
    
    const groupSettings = database.getGroupSettings(id);
    
    if (!groupSettings.welcome && !groupSettings.goodbye) return;
    
    const groupMetadata = await getGroupMetadata(sock, id);
    if (!groupMetadata) return;
    
    const getParticipantJid = (participant) => {
      if (typeof participant === 'string') {
        return participant;
      }
      if (participant && participant.id) {
        return participant.id;
      }
      if (participant && typeof participant === 'object') {
        return participant.jid || participant.participant || null;
      }
      return null;
    };
    
    for (const participant of participants) {
      const participantJid = getParticipantJid(participant);
      if (!participantJid) {
        console.warn('Could not extract participant JID:', participant);
        continue;
      }
      
      const participantNumber = participantJid.split('@')[0];
      
      if (action === 'add' && groupSettings.welcome) {
        try {
          let displayName = participantNumber;
          
          const participantInfo = groupMetadata.participants.find(p => {
            const pId = p.id || p.jid || p.participant;
            const pPhone = p.phoneNumber;
            return pId === participantJid || 
                   pId?.split('@')[0] === participantNumber ||
                   pPhone === participantJid ||
                   pPhone?.split('@')[0] === participantNumber;
          });
          
          let phoneJid = null;
          if (participantInfo && participantInfo.phoneNumber) {
            phoneJid = participantInfo.phoneNumber;
          } else {
            try {
              const normalized = normalizeJidWithLid(participantJid);
              if (normalized && normalized.includes('@s.whatsapp.net')) {
                phoneJid = normalized;
              }
            } catch (e) {
              if (participantJid.includes('@s.whatsapp.net')) {
                phoneJid = participantJid;
              }
            }
          }
          
          if (phoneJid) {
            try {
              if (sock.store && sock.store.contacts && sock.store.contacts[phoneJid]) {
                const contact = sock.store.contacts[phoneJid];
                if (contact.notify && contact.notify.trim() && !contact.notify.match(/^\d+$/)) {
                  displayName = contact.notify.trim();
                } else if (contact.name && contact.name.trim() && !contact.name.match(/^\d+$/)) {
                  displayName = contact.name.trim();
                }
              }
              
              if (displayName === participantNumber) {
                try {
                  await sock.onWhatsApp(phoneJid);
                  
                  if (sock.store && sock.store.contacts && sock.store.contacts[phoneJid]) {
                    const contact = sock.store.contacts[phoneJid];
                    if (contact.notify && contact.notify.trim() && !contact.notify.match(/^\d+$/)) {
                      displayName = contact.notify.trim();
                    }
                  }
                } catch (fetchError) {
                  // Silently handle fetch errors
                }
              }
            } catch (contactError) {
              // Silently handle contact errors
            }
          }
          
          if (displayName === participantNumber && participantInfo) {
            if (participantInfo.notify && participantInfo.notify.trim() && !participantInfo.notify.match(/^\d+$/)) {
              displayName = participantInfo.notify.trim();
            } else if (participantInfo.name && participantInfo.name.trim() && !participantInfo.name.match(/^\d+$/)) {
              displayName = participantInfo.name.trim();
            }
          }
          
          let profilePicUrl = '';
          try {
            profilePicUrl = await sock.profilePictureUrl(participantJid, 'image');
          } catch (ppError) {
            profilePicUrl = 'https://img.pyrocdn.com/dbKUgahg.png';
          }
          
          const groupName = groupMetadata.subject || 'the group';
          const groupDesc = groupMetadata.desc || 'No description';
          
          const now = new Date();
          const timeString = now.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
          });
          
          const finalMessage =
            `╔══════════════════════╗\n` +
            `   ✨ 𝗪𝗘𝗟𝗖𝗢𝗠𝗘 ✨\n` +
            `╚══════════════════════╝\n\n` +
            `👋 Hello @${participantNumber}\n\n` +
            `🏠 *Group:* ${groupName}\n` +
            `📊 *Members:* ${groupMetadata.participants.length}\n` +
            `👑 *OWNER:* Rꫝʜɪ Bꫝʜɪ\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📌 *Group Rules:*\n` +
            `  ✦ Respect everyone\n` +
            `  ✦ No spamming\n` +
            `  ✦ Stay active\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `🌸 Thanks for joining us!\n` +
            `💖 Enjoy your stay.`;

          if (profilePicUrl) {
            await sock.sendMessage(id, {
              image: { url: profilePicUrl },
              caption: finalMessage,
              mentions: [participantJid]
            });
          } else {
            await sock.sendMessage(id, {
              text: finalMessage,
              mentions: [participantJid]
            });
          }
        } catch (welcomeError) {
          console.error('Welcome image error:', welcomeError);
          const fallbackMessage =
            `╔══════════════════════╗\n` +
            `   ✨ 𝗪𝗘𝗟𝗖𝗢𝗠𝗘 ✨\n` +
            `╚══════════════════════╝\n\n` +
            `👋 Hello @${participantNumber}\n\n` +
            `🏠 *Group:* ${groupName}\n` +
            `📊 *Members:* ${groupMetadata.participants.length}\n` +
            `👑 *Admin:* ${botName}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📌 *Group Rules:*\n` +
            `  ✦ Respect everyone\n` +
            `  ✦ No spamming\n` +
            `  ✦ Stay active\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `🌸 Thanks for joining us!\n` +
            `💖 Enjoy your stay.`;

          await sock.sendMessage(id, {
            text: fallbackMessage,
            mentions: [participantJid]
          });
        }
      } else if (action === 'remove' && groupSettings.goodbye) {
        try {
          let displayName = participantNumber;
          
          const participantInfo = groupMetadata.participants.find(p => {
            const pId = p.id || p.jid || p.participant;
            const pPhone = p.phoneNumber;
            return pId === participantJid || 
                   pId?.split('@')[0] === participantNumber ||
                   pPhone === participantJid ||
                   pPhone?.split('@')[0] === participantNumber;
          });
          
          let phoneJid = null;
          if (participantInfo && participantInfo.phoneNumber) {
            phoneJid = participantInfo.phoneNumber;
          } else {
            try {
              const normalized = normalizeJidWithLid(participantJid);
              if (normalized && normalized.includes('@s.whatsapp.net')) {
                phoneJid = normalized;
              }
            } catch (e) {
              if (participantJid.includes('@s.whatsapp.net')) {
                phoneJid = participantJid;
              }
            }
          }
          
          if (phoneJid) {
            try {
              if (sock.store && sock.store.contacts && sock.store.contacts[phoneJid]) {
                const contact = sock.store.contacts[phoneJid];
                if (contact.notify && contact.notify.trim() && !contact.notify.match(/^\d+$/)) {
                  displayName = contact.notify.trim();
                } else if (contact.name && contact.name.trim() && !contact.name.match(/^\d+$/)) {
                  displayName = contact.name.trim();
                }
              }
              
              if (displayName === participantNumber) {
                try {
                  await sock.onWhatsApp(phoneJid);
                  
                  if (sock.store && sock.store.contacts && sock.store.contacts[phoneJid]) {
                    const contact = sock.store.contacts[phoneJid];
                    if (contact.notify && contact.notify.trim() && !contact.notify.match(/^\d+$/)) {
                      displayName = contact.notify.trim();
                    }
                  }
                } catch (fetchError) {
                  // Silently handle fetch errors
                }
              }
            } catch (contactError) {
              // Silently handle contact errors
            }
          }
          
          if (displayName === participantNumber && participantInfo) {
            if (participantInfo.notify && participantInfo.notify.trim() && !participantInfo.notify.match(/^\d+$/)) {
              displayName = participantInfo.notify.trim();
            } else if (participantInfo.name && participantInfo.name.trim() && !participantInfo.name.match(/^\d+$/)) {
              displayName = participantInfo.name.trim();
            }
          }
          
          let profilePicUrl = '';
          try {
            profilePicUrl = await sock.profilePictureUrl(participantJid, 'image');
          } catch (ppError) {
            profilePicUrl = 'https://img.pyrocdn.com/dbKUgahg.png';
          }
          
          const groupName = groupMetadata.subject || 'the group';
          const groupDesc = groupMetadata.desc || 'No description';
          
          const now = new Date();
          const timeString = now.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
          });
          
          const finalMessage =
            `╔══════════════════════╗\n` +
            `   💔 𝗚𝗢𝗢𝗗𝗕𝗬𝗘 💔\n` +
            `╚══════════════════════╝\n\n` +
            `👋 *@${participantNumber}* has left the group\n\n` +
            `🏠 *Group:* ${groupName}\n` +
            `📊 *Current Members:* ${groupMetadata.participants.length}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🌙 We will miss you\n` +
            `🕊️ Wishing you all the best\n` +
            `━━━━━━━━━━━━━━━━━━━━━━`;

          await sock.sendMessage(id, {
            text: finalMessage,
            mentions: [participantJid]
          });
        } catch (goodbyeError) {
          console.error('Goodbye error:', goodbyeError);
          await sock.sendMessage(id, {
            text:
              `╔══════════════════════╗\n` +
              `   💔 𝗚𝗢𝗢𝗗𝗕𝗬𝗘 💔\n` +
              `╚══════════════════════╝\n\n` +
              `👋 *@${participantNumber}* has left the group\n\n` +
              `🏠 *Group:* ${groupName}\n` +
              `📊 *Current Members:* ${groupMetadata.participants.length}\n\n` +
              `🌙 We will miss you 💔`,
            mentions: [participantJid]
          });
        }
      }
    }
  } catch (error) {
    if (error.message && (
      error.message.includes('forbidden') || 
      error.message.includes('403') ||
      error.statusCode === 403 ||
      error.output?.statusCode === 403 ||
      error.data === 403
    )) {
      return;
    }
    if (!error.message || !error.message.includes('forbidden')) {
      console.error('Error handling group update:', error);
    }
  }
};

// Detect WhatsApp group status posts
const isGroupStatusPost = (msg, content) => {
  const unwrapped = content || getMessageContent(msg);
  const raw = msg.message || {};

  if (
    unwrapped?.groupStatusMessage ||
    unwrapped?.groupStatusMessageV2 ||
    raw?.groupStatusMessage ||
    raw?.groupStatusMessageV2
  ) {
    return true;
  }

  if (
    unwrapped?.groupStatusMentionMessage ||
    raw?.groupStatusMentionMessage
  ) {
    return true;
  }

  const checkProtocol = (m) => {
    if (!m) return false;
    if (m.protocolMessage && m.protocolMessage.type === 25) return true;
    if (m.ephemeralMessage?.message) return checkProtocol(m.ephemeralMessage.message);
    if (m.viewOnceMessage?.message) return checkProtocol(m.viewOnceMessage.message);
    if (m.viewOnceMessageV2?.message) return checkProtocol(m.viewOnceMessageV2.message);
    return false;
  };

  if (checkProtocol(raw)) return true;

  const ctx =
    raw?.extendedTextMessage?.contextInfo ||
    raw?.imageMessage?.contextInfo ||
    raw?.videoMessage?.contextInfo ||
    raw?.contextInfo;

  if (ctx?.forwardedNewsletterMessageInfo) return true;

  return false;
};

// Anti-group status handler (admin/owner exempt)
const handleAntigroupstatus = async (sock, msg, groupMetadata, content) => {
  try {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    const groupSettings = database.getGroupSettings(from);
    if (!groupSettings.antigroupstatus) return false;
    if (!isGroupStatusPost(msg, content)) return false;

    const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
    const senderIsOwner = isOwner(sender, sock);
    if (senderIsAdmin || senderIsOwner) return false;

    const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
    const action = (groupSettings.antigroupstatusAction || 'delete').toLowerCase();

    try {
      await sock.sendMessage(from, { delete: msg.key });
    } catch (e) {
      console.error('Failed to delete group status post:', e);
    }

    if (action === 'kick' && botIsAdmin) {
      try {
        await sock.groupParticipantsUpdate(from, [sender], 'remove');
        await sock.sendMessage(from, {
          text: '📵 *Anti Group Status!* @user was kicked for posting a group status.',
          mentions: [sender]
        }, { quoted: msg });
      } catch (e) {
        console.error('Failed to kick for antigroupstatus:', e);
      }
    } else {
      try {
        await sock.sendMessage(from, {
          text: '📵 *Anti Group Status!* Group status removed.',
          mentions: [sender]
        }, { quoted: msg });
      } catch (e) {
        console.error('Failed to notify antigroupstatus:', e);
      }
    }

    return true;
  } catch (error) {
    console.error('Error in antigroupstatus handler:', error);
    return false;
  }
};

// Antibadword handler
const handleAntibadword = async (sock, msg, groupMetadata, userMessage, sender) => {
  try {
    const from = msg.key.remoteJid;
    const groupSettings = database.getGroupSettings(from);
    if (!groupSettings.antibadword) return false;
    if (!containsBadWord(userMessage)) return false;

    const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
    const senderIsOwner = isOwner(sender, sock);
    if (senderIsAdmin || senderIsOwner) return false;

    const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
    if (!botIsAdmin) return false;

    try {
      await sock.sendMessage(from, { delete: msg.key });
    } catch (e) {
      console.error('Failed to delete badword message:', e);
      return false;
    }

    const action = (groupSettings.antibadwordAction || 'delete').toLowerCase();
    const maxWarnings = config.maxWarnings || 3;

    if (action === 'kick') {
      try {
        await sock.groupParticipantsUpdate(from, [sender], 'remove');
        await sock.sendMessage(from, {
          text: '🚫 *Antibadword!* @user was kicked for using bad words.',
          mentions: [sender],
        }, { quoted: msg });
      } catch (e) {
        console.error('Failed to kick for antibadword:', e);
      }
    } else if (action === 'warn') {
      const result = database.addWarning(from, sender, 'Bad words');
      if (result.count >= maxWarnings) {
        try {
          await sock.groupParticipantsUpdate(from, [sender], 'remove');
          database.clearWarnings(from, sender);
          await sock.sendMessage(from, {
            text: `🚫 *Antibadword!* @user was kicked after ${maxWarnings} warnings.`,
            mentions: [sender],
          }, { quoted: msg });
        } catch (e) {
          console.error('Failed to kick after antibadword warnings:', e);
        }
      } else {
        await sock.sendMessage(from, {
          text: `⚠️ *Antibadword!* @user warning ${result.count}/${maxWarnings} for bad words.`,
          mentions: [sender],
        }, { quoted: msg });
      }
    } else {
      const sticker = await getAntibadwordSticker();
      if (sticker) {
        await sock.sendMessage(from, { sticker }, { quoted: msg });
      }
    }

    return true;
  } catch (error) {
    console.error('Error in antibadword handler:', error);
    return false;
  }
};

// Antisticker handler
const handleAntisticker = async (sock, msg, groupMetadata, content) => {
  try {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    const groupSettings = database.getGroupSettings(from);
    if (!groupSettings.antisticker) return false;

    const unwrapped = content || getMessageContent(msg);
    const isSticker = !!(unwrapped?.stickerMessage || msg.message?.stickerMessage);
    if (!isSticker) return false;

    const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
    const senderIsOwner = isOwner(sender, sock);
    if (senderIsAdmin || senderIsOwner) return false;

    const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
    const action = (groupSettings.antistickerAction || 'delete').toLowerCase();

    try {
      await sock.sendMessage(from, { delete: msg.key });
    } catch (e) {
      console.error('Failed to delete sticker for antisticker:', e);
    }

    if (action === 'kick' && botIsAdmin) {
      try {
        await sock.groupParticipantsUpdate(from, [sender], 'remove');
      } catch (e) {
        console.error('Failed to kick for antisticker:', e);
      }
    }

    return true;
  } catch (error) {
    console.error('Error in antisticker handler:', error);
    return false;
  }
};

// Antiemoji handler (admin/owner exempt)
const handleAntiemoji = async (sock, msg, groupMetadata, content) => {
  try {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    const groupSettings = database.getGroupSettings(from);
    if (!groupSettings.antiemoji) return false;

    const unwrapped = content || getMessageContent(msg);

    const messageText =
      unwrapped?.conversation ||
      unwrapped?.extendedTextMessage?.text ||
      unwrapped?.imageMessage?.caption ||
      unwrapped?.videoMessage?.caption ||
      '';

    if (!messageText) return false;
    if (!EMOJI_REGEX.test(messageText)) return false;

    const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
    const senderIsOwner = isOwner(sender, sock);
    if (senderIsAdmin || senderIsOwner) return false;

    const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
    const action = (groupSettings.antiemojiAction || 'delete').toLowerCase();

    try {
      await sock.sendMessage(from, { delete: msg.key });
    } catch (e) {
      console.error('Failed to delete emoji message:', e);
    }

    if (action === 'kick' && botIsAdmin) {
      try {
        await sock.groupParticipantsUpdate(from, [sender], 'remove');
        await sock.sendMessage(from, {
          text: '😀 *Antiemoji!* @user was kicked for sending emojis.',
          mentions: [sender]
        }, { quoted: msg });
      } catch (e) {
        console.error('Failed to kick for antiemoji:', e);
      }
    } else {
      await sock.sendMessage(from, {
        text: '😀 *Antiemoji!* Emoji removed.',
        mentions: [sender]
      }, { quoted: msg });
    }

    return true;
  } catch (error) {
    console.error('Error in antiemoji handler:', error);
    return false;
  }
};

// Antiimage handler
const handleAntiimage = async (sock, msg, groupMetadata, content) => {
  try {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    const groupSettings = database.getGroupSettings(from);
    if (!groupSettings.antiimage) return false;

    const unwrapped = content || getMessageContent(msg);
    const isImage = !!(unwrapped?.imageMessage || msg.message?.imageMessage);
    if (!isImage) return false;

    const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
    const senderIsOwner = isOwner(sender, sock);
    if (senderIsAdmin || senderIsOwner) return false;

    const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
    const action = (groupSettings.antiimageAction || 'delete').toLowerCase();

    try {
      await sock.sendMessage(from, { delete: msg.key });
    } catch (e) {
      console.error('Failed to delete image for antiimage:', e);
    }

    if (action === 'kick' && botIsAdmin) {
      try {
        await sock.groupParticipantsUpdate(from, [sender], 'remove');
        await sock.sendMessage(from, {
          text: '🖼️ *Antiimage!* @user was kicked for sending images.',
          mentions: [sender]
        }, { quoted: msg });
      } catch (e) {
        console.error('Failed to kick for antiimage:', e);
      }
    } else {
      await sock.sendMessage(from, {
        text: '🖼️ *Antiimage!* Image removed.',
        mentions: [sender]
      }, { quoted: msg });
    }

    return true;
  } catch (error) {
    console.error('Error in antiimage handler:', error);
    return false;
  }
};

// Antivoice handler
const handleAntivoice = async (sock, msg, groupMetadata, content) => {
  try {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    const groupSettings = database.getGroupSettings(from);
    if (!groupSettings.antivoice) return false;

    const unwrapped = content || getMessageContent(msg);
    const audio = unwrapped?.audioMessage || msg.message?.audioMessage;
    if (!audio) return false;

    if (audio.ptt === false) return false;

    const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
    const senderIsOwner = isOwner(sender, sock);
    if (senderIsAdmin || senderIsOwner) return false;

    const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
    const action = (groupSettings.antivoiceAction || 'delete').toLowerCase();

    try {
      await sock.sendMessage(from, { delete: msg.key });
    } catch (e) {
      console.error('Failed to delete voice for antivoice:', e);
    }

    if (action === 'kick' && botIsAdmin) {
      try {
        await sock.groupParticipantsUpdate(from, [sender], 'remove');
        await sock.sendMessage(from, {
          text: '🎤 *Antivoice!* @user was kicked for sending voice messages.',
          mentions: [sender]
        }, { quoted: msg });
      } catch (e) {
        console.error('Failed to kick for antivoice:', e);
      }
    } else {
      await sock.sendMessage(from, {
        text: '🎤 *Antivoice!* Voice message removed.',
        mentions: [sender]
      }, { quoted: msg });
    }

    return true;
  } catch (error) {
    console.error('Error in antivoice handler:', error);
    return false;
  }
};

// Antivideo handler
const handleAntivideo = async (sock, msg, groupMetadata, content) => {
  try {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    const groupSettings = database.getGroupSettings(from);
    if (!groupSettings.antivideo) return false;

    const unwrapped = content || getMessageContent(msg);
    const isVideo = !!(unwrapped?.videoMessage || msg.message?.videoMessage);
    if (!isVideo) return false;

    const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
    const senderIsOwner = isOwner(sender, sock);
    if (senderIsAdmin || senderIsOwner) return false;

    const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
    const action = (groupSettings.antivideoAction || 'delete').toLowerCase();

    try {
      await sock.sendMessage(from, { delete: msg.key });
    } catch (e) {
      console.error('Failed to delete video for antivideo:', e);
    }

    if (action === 'kick' && botIsAdmin) {
      try {
        await sock.groupParticipantsUpdate(from, [sender], 'remove');
        await sock.sendMessage(from, {
          text: '🎬 *Antivideo!* @user was kicked for sending videos.',
          mentions: [sender]
        }, { quoted: msg });
      } catch (e) {
        console.error('Failed to kick for antivideo:', e);
      }
    } else {
      await sock.sendMessage(from, {
        text: '🎬 *Antivideo!* Video removed.',
        mentions: [sender]
      }, { quoted: msg });
    }

    return true;
  } catch (error) {
    console.error('Error in antivideo handler:', error);
    return false;
  }
};

// Antilink handler
const handleAntilink = async (sock, msg, groupMetadata) => {
  try {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    
    const groupSettings = database.getGroupSettings(from);
    if (!groupSettings.antilink) return;
    
    const content = getMessageContent(msg) || msg.message;
    const body = content?.conversation || 
                  content?.extendedTextMessage?.text || 
                  content?.imageMessage?.caption || 
                  content?.videoMessage?.caption || '';
    
    const linkPattern = /(https?:\/\/)?([a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.)+[a-zA-Z]{2,}(\/[^\s]*)?/i;
    
    if (linkPattern.test(body)) {
      const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
      const senderIsOwner = isOwner(sender, sock);
      
      if (senderIsAdmin || senderIsOwner) return;
      
      const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
      const action = (groupSettings.antilinkAction || 'delete').toLowerCase();
      
      if (action === 'kick' && botIsAdmin) {
        try {
          await sock.sendMessage(from, { delete: msg.key });
          await sock.groupParticipantsUpdate(from, [sender], 'remove');
          await sock.sendMessage(from, { 
            text: `🔗 Anti-link triggered. Link removed.`,
            mentions: [sender]
          }, { quoted: msg });
        } catch (e) {
          console.error('Failed to kick for antilink:', e);
        }
      } else {
        try {
          await sock.sendMessage(from, { delete: msg.key });
          await sock.sendMessage(from, { 
            text: `🔗 Anti-link triggered. Link removed.`,
            mentions: [sender]
          }, { quoted: msg });
        } catch (e) {
          console.error('Failed to delete message for antilink:', e);
        }
      }
    }
  } catch (error) {
    console.error('Error in antilink handler:', error);
  }
};


// Anti-group mention handler
const handleAntigroupmention = async (sock, msg, groupMetadata) => {
  try {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    
    const groupSettings = database.getGroupSettings(from);
    
    if (!groupSettings.antigroupmention) return;
    
    let isForwardedStatus = false;
    
    if (msg.message) {
      isForwardedStatus = isForwardedStatus || !!msg.message.groupStatusMentionMessage;
      isForwardedStatus = isForwardedStatus || !!msg.message.groupStatusMessage;
      isForwardedStatus = isForwardedStatus || !!msg.message.groupStatusMessageV2;
      
      isForwardedStatus = isForwardedStatus || 
        (msg.message.protocolMessage && msg.message.protocolMessage.type === 25);
      
      isForwardedStatus = isForwardedStatus || 
        (msg.message.extendedTextMessage && msg.message.extendedTextMessage.contextInfo && 
         msg.message.extendedTextMessage.contextInfo.forwardedNewsletterMessageInfo);
      isForwardedStatus = isForwardedStatus || 
        (msg.message.conversation && msg.message.contextInfo && 
         msg.message.contextInfo.forwardedNewsletterMessageInfo);
      isForwardedStatus = isForwardedStatus || 
        (msg.message.imageMessage && msg.message.imageMessage.contextInfo && 
         msg.message.imageMessage.contextInfo.forwardedNewsletterMessageInfo);
      isForwardedStatus = isForwardedStatus || 
        (msg.message.videoMessage && msg.message.videoMessage.contextInfo && 
         msg.message.videoMessage.contextInfo.forwardedNewsletterMessageInfo);
      isForwardedStatus = isForwardedStatus || 
        (msg.message.contextInfo && msg.message.contextInfo.forwardedNewsletterMessageInfo);
      
      if (msg.message.contextInfo) {
        const ctx = msg.message.contextInfo;
        isForwardedStatus = isForwardedStatus || !!ctx.isForwarded;
        isForwardedStatus = isForwardedStatus || !!ctx.forwardingScore;
        isForwardedStatus = isForwardedStatus || !!ctx.quotedMessageTimestamp;
      }
      
      if (msg.message.extendedTextMessage && msg.message.extendedTextMessage.contextInfo) {
        const extCtx = msg.message.extendedTextMessage.contextInfo;
        isForwardedStatus = isForwardedStatus || !!extCtx.isForwarded;
        isForwardedStatus = isForwardedStatus || !!extCtx.forwardingScore;
      }
    }
    
    if (isForwardedStatus) {
      const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
      const senderIsOwner = isOwner(sender, sock);
      
      if (senderIsAdmin || senderIsOwner) return;
      
      const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
      const action = (groupSettings.antigroupmentionAction || 'delete').toLowerCase();
      
      if (action === 'kick' && botIsAdmin) {
        try {
          await sock.sendMessage(from, { delete: msg.key });
          await sock.groupParticipantsUpdate(from, [sender], 'remove');
        } catch (e) {
          console.error('Failed to kick for antigroupmention:', e);
        }
      } else {
        try {
          await sock.sendMessage(from, { delete: msg.key });
        } catch (e) {
          console.error('Failed to delete message for antigroupmention:', e);
        }
      }
    }
  } catch (error) {
    console.error('Error in antigroupmention handler:', error);
  }
};


// Anti-call feature initializer
const initializeAntiCall = (sock) => {
  sock.ev.on('call', async (calls) => {
    try {
      delete require.cache[require.resolve('./config')];
      const config = require('./config');
      
      if (!config.defaultGroupSettings.anticall) return;

      for (const call of calls) {
        if (call.status === 'offer') {
          await sock.rejectCall(call.id, call.from);
          await sock.updateBlockStatus(call.from, 'block');
          await sock.sendMessage(call.from, {
            text: '🚫 Calls are not allowed. You have been blocked.'
          });
        }
      }
    } catch (err) {
      console.error('[ANTICALL ERROR]', err);
    }
  });
};

module.exports = {
  handleMessage,
  handleGroupUpdate,
  handleAntilink,
  handleAntibadword,
  handleAntisticker,
  handleAntiemoji,
  handleAntiimage,
  handleAntivoice,
  handleAntivideo,
  handleAntigroupstatus,
  handleAntigroupmention,
  initializeAntiCall,
  isOwner,
  isAdmin,
  isBotAdmin,
  isMod,
  getGroupMetadata,
  findParticipant
};
