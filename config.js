/**
 * Global Configuration for WhatsApp MD Bot
 */

module.exports = {
    // Bot Owner Configuration
    ownerNumber: ['919641092392'], // Add your number without + or spaces (e.g., 919876543210)
    ownerName: ['𝐏ᴀʙɪᴛʀᴀ - 𝐏ᴀᴜʟ'], // Owner names corresponding to ownerNumber array
    
    // Bot Configuration
    botName: '𝐏ᴀʙɪᴛʀᴀ-𝐁ᴏᴛ',
    developerName: '𝐏ᴀʙɪᴛʀᴀ - 𝐏ᴀᴜʟ',
    telegramGroupId: '-1004364269870',
    pairLink: 'https://t.me/PABITRA_BOTZ',
    prefix: '.',
    sessionName: 'session',
    sessionID: process.env.SESSION_ID || '',
    newsletterJid: '120363411471428911@newsletter', // Newsletter JID for menu forwarding
    updateZipUrl: '', // URL to latest code zip for .update command
    
    // Sticker Configuration
    packname: '© 𝐏ᴀʙɪᴛʀᴀ-𝐁ᴏᴛ ',
    
    // Bot Behavior
    selfMode: false, // Private mode - only owner can use commands
    autoRead: false,
    autoTyping: false,
    autoBio: false,
    autoSticker: false,
    autoReact: false,
    autoReactMode: 'bot',
    autoDownload: false,
    
    // Group Settings Defaults
    defaultGroupSettings: {
      antilink: false,
      antilinkAction: 'delete', // 'delete', 'kick', 'warn'
      antitag: false,
      antitagAction: 'delete',
      antiall: false, // Owner only - blocks all messages from non-admins
      antiviewonce: false,
      antibot: false,
      antibotAction: 'warn', // 'warn' | 'kick'
      anticall: false, // Anti-call feature
      antigroupmention: false, // Anti-group mention feature
      antigroupmentionAction: 'delete', // 'delete', 'kick'
      antigroupstatus: false, // Block group status posts
      antigroupstatusAction: 'delete', // 'delete', 'kick'
      antisticker: false, // Stickers not allowed in group
      antistickerAction: 'delete', // 'delete', 'kick'
      antibadword: false, // Block bad words in group
      antibadwordAction: 'delete', // 'delete', 'kick', 'warn'
      welcome: true,
      welcomeMessage: '🦢 *✧ 𝐇ᴇʏ @user, ✧ আমাদের গ্রুপ @group-এ তোমাকে স্বাগতম!* ✨\n💗🔥 *গ্রুপে তোমার মতো একজনকেই দরকার ছিলো! 🎧..*\n\n🏠 *✧ মোট সদস্য:* #memberCount\n\n🌟 *✧ নিয়ম:* অ্যাক্টিভ থাকো, সবাইকে রেসপেক্ট দাও ও মজা করো!\n\n✧🤖 𝐁𝐨𝐭 𝐎𝐰𝐧ᴇʀ ⎯͢✧🐱 botName\n',
      goodbye: true,
      goodbyeMessage: 'Goodbye @user 👋 We will never miss you!',
      antiSpam: false,
      antidelete: false,
      nsfw: false,
      detect: false,
      chatbot: false,
      autosticker: false // Auto-convert images/videos to stickers
    },
    
    // API Keys (add your own)
    apiKeys: {
      // Add API keys here if needed
      openai: '',
      deepai: '',
      remove_bg: ''
    },
    
    // Message Configuration
    messages: {
      wait: '⏳ Please wait...',
      success: '✅ Success!',
      error: '❌ Error occurred!',
      ownerOnly: '👑 This command is only for bot owner!',
      adminOnly: '🛡️ This command is only for group admins!',
      groupOnly: '👥 This command can only be used in groups!',
      privateOnly: '💬 This command can only be used in private chat!',
      botAdminNeeded: '🤖 Bot needs to be admin to execute this command!',
      invalidCommand: '❓ Invalid command! Type .menu for help'
    },
    
    // Timezone
    timezone: 'Asia/Kolkata',
    
    // Limits
    maxWarnings: 3,
    
    // Social Links (optional)
    social: {
      github: '',
      facebook: 'https://www.facebook.com/majidul.islam.zihad',
      youtube: 'https://t.me/PABITRA_BOTZ'
    }
};

