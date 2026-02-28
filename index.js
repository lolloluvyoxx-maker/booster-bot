const { Client, GatewayIntentBits, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildPresences
  ],
  partials: ["CHANNEL"]
});

// ===== CONFIGURATION =====
const OWNER_ID = "1005237630113419315";
const SOURCE_GUILD_ID = "1463635465222619218";
const TARGET_GUILD_ID = "1425102156125442140";

// Role IDs
const DISCORD_BOOSTER_ROLE_ID = "1475164627808813158";
const CUSTOM_BOOSTER_ROLE_ID = "1474900074185097358";
const ACCESS_ROLE_ID = "1475167075789181122";
const DENIED_ROLE_ID = "1426874194263805992";

// Channel IDs
const PERKS_CHANNEL_ID = "1475125441919455346";

// ===== CUSTOM MESSAGES (persistent via JSON) =====
const MESSAGES_FILE = "./custom_messages.json";

const DEFAULT_MESSAGES = {
  boost: `💜 **Grazie per aver boostato il server!**\n\nIl tuo boost ci aiuta tantissimo e hai sbloccato accesso a contenuti esclusivi. Goditi i tuoi perks! 🚀`,
  unboost: `😔 **Il tuo boost è scaduto.**\n\nSembra che tu abbia smesso di boostare il server. Se si tratta di un errore o vuoi tornare, siamo sempre qui! Reboostando riavrai subito accesso ai tuoi perks. 💜`,
  ping: `<@{user}> hai sbloccato i perks del server grazie al tuo boost! 💜🚀`
};

function loadMessages() {
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      const data = JSON.parse(fs.readFileSync(MESSAGES_FILE, "utf8"));
      return { ...DEFAULT_MESSAGES, ...data };
    }
  } catch (e) {}
  return { ...DEFAULT_MESSAGES };
}

function saveMessages(msgs) {
  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(msgs, null, 2), "utf8");
  } catch (e) {
    log(`Failed to save messages: ${e.message}`, "error");
  }
}

let customMessages = loadMessages();

// ===== VANITY CONFIG =====
const VANITY_CODES = ["vanityteen", "jerkpit", "boytoy"];
const CHECK_INTERVAL = 30 * 1000;
const REQUIRED_404_COUNT = 5;

// ===== TRACKERS =====
const vanity404Counter = {};
const vanityNotified = {};
const recentBoosters = new Set(); // Track recent boosters to prevent premature removal

VANITY_CODES.forEach(v => {
  vanity404Counter[v] = 0;
  vanityNotified[v] = false;
});

// ===== UTILITIES =====
function utcTimestamp() {
  return new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC";
}

function log(message, type = "info") {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = type === "error" ? "❌" : type === "success" ? "✅" : "ℹ️";
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

// ===== FETCH WITH RETRY =====
async function fetchMemberWithRetry(guild, userId, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const member = await guild.members.fetch(userId);
      return member;
    } catch (error) {
      if (i < maxRetries - 1) {
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 500 + (i * 500)));
        log(`Retry ${i + 1}/${maxRetries} fetching member ${userId}...`, "info");
      } else {
        throw error;
      }
    }
  }
  return null;
}

// ===== BOOST DETECTION =====
function isBoosting(member) {
  return member.roles.cache.has(DISCORD_BOOSTER_ROLE_ID) || !!member.premiumSince;
}

async function giveCustomBoosterRole(member) {
  try {
    if (!member.roles.cache.has(CUSTOM_BOOSTER_ROLE_ID)) {
      await member.roles.add(CUSTOM_BOOSTER_ROLE_ID);
      log(`Gave custom booster role to ${member.user.tag}`, "success");
      return true;
    }
  } catch (error) {
    log(`Failed to give custom booster role: ${error.message}`, "error");
  }
  return false;
}

async function removeCustomBoosterRole(member) {
  try {
    if (member.roles.cache.has(CUSTOM_BOOSTER_ROLE_ID)) {
      await member.roles.remove(CUSTOM_BOOSTER_ROLE_ID);
      log(`Removed custom booster role from ${member.user.tag}`, "success");
      return true;
    }
  } catch (error) {
    log(`Failed to remove custom booster role: ${error.message}`, "error");
  }
  return false;
}

async function sendBoostDM(user, boosted) {
  try {
    const msg = boosted ? customMessages.boost : customMessages.unboost;
    await user.send(msg);
    log(`DM sent to ${user.tag} (boosted: ${boosted})`, "success");
  } catch (error) {
    log(`Failed to send DM to ${user.tag}: ${error.message}`, "error");
  }
}

async function pingBoosterInPerksChannel(member) {
  try {
    const sourceGuild = await client.guilds.fetch(SOURCE_GUILD_ID);
    const channel = await sourceGuild.channels.fetch(PERKS_CHANNEL_ID).catch(() => null);
    if (!channel) {
      log(`Perks channel not found: ${PERKS_CHANNEL_ID}`, "error");
      return;
    }
    const pingText = customMessages.ping.replace("{user}", member.id);
    const msg = await channel.send(pingText);
    // Delete the ping after 5 seconds
    setTimeout(() => {
      msg.delete().catch(() => {});
    }, 5000);
    log(`Pinged ${member.user.tag} in perks channel`, "success");
  } catch (error) {
    log(`Failed to ping in perks channel: ${error.message}`, "error");
  }
}

async function updateTargetServerAccess(userId, shouldHaveAccess) {
  try {
    const targetGuild = await client.guilds.fetch(TARGET_GUILD_ID);
    const targetMember = await fetchMemberWithRetry(targetGuild, userId);
    
    if (!targetMember) {
      log(`User ${userId} not found in target server`, "info");
      return false;
    }
    
    if (shouldHaveAccess) {
      await targetMember.roles.add(ACCESS_ROLE_ID);
      await targetMember.roles.remove(DENIED_ROLE_ID).catch(() => {});
      // Add to recent boosters to prevent false removal
      recentBoosters.add(userId);
      log(`Granted access to ${targetMember.user.tag}`, "success");
    } else {
      // Only remove if not in recent boosters
      if (!recentBoosters.has(userId)) {
        await targetMember.roles.remove(ACCESS_ROLE_ID).catch(() => {});
        await targetMember.roles.add(DENIED_ROLE_ID);
        log(`Denied access to ${targetMember.user.tag}`, "success");
      }
    }
    
    return true;
  } catch (error) {
    log(`Failed to update target server access: ${error.message}`, "error");
    return false;
  }
}

// ===== CHECK ALL MEMBERS FUNCTION =====
async function checkAllTargetMembers() {
  try {
    log("Starting check of ALL members in target server...", "info");
    
    const sourceGuild = await client.guilds.fetch(SOURCE_GUILD_ID);
    const targetGuild = await client.guilds.fetch(TARGET_GUILD_ID);
    
    // Fetch all members from target server
    const targetMembers = await targetGuild.members.fetch();
    log(`Found ${targetMembers.size} members in target server`, "info");
    
    let updatedCount = 0;
    let errorCount = 0;
    
    // Process each member
    for (const targetMember of targetMembers.values()) {
      try {
        // Skip bots
        if (targetMember.user.bot) continue;
        
        // Skip recent boosters for 10 minutes to avoid race conditions
        const isRecentBooster = recentBoosters.has(targetMember.id);
        
        // Fetch from source server with retry
        const sourceMember = await fetchMemberWithRetry(sourceGuild, targetMember.id).catch(() => null);
        
        if (sourceMember) {
          const isBoostingMember = isBoosting(sourceMember);
          const hasAccessRole = targetMember.roles.cache.has(ACCESS_ROLE_ID);
          const hasDeniedRole = targetMember.roles.cache.has(DENIED_ROLE_ID);
          
          // Update custom booster role in source server
          if (isBoostingMember) {
            await giveCustomBoosterRole(sourceMember);
          } else {
            await removeCustomBoosterRole(sourceMember);
          }
          
          // Check if roles need updating in target server
          if (isBoostingMember) {
            if (!hasAccessRole || hasDeniedRole) {
              // Should have access but doesn't
              await targetMember.roles.add(ACCESS_ROLE_ID);
              await targetMember.roles.remove(DENIED_ROLE_ID).catch(() => {});
              log(`Fixed: ${targetMember.user.tag} - Added access role (boosting)`, "success");
              updatedCount++;
            }
            // Mark as recent booster
            recentBoosters.add(targetMember.id);
          } else if (!isRecentBooster) {
            // Only remove if not a recent booster
            if (hasAccessRole || !hasDeniedRole) {
              // Should NOT have access but does
              await targetMember.roles.remove(ACCESS_ROLE_ID).catch(() => {});
              await targetMember.roles.add(DENIED_ROLE_ID);
              log(`Fixed: ${targetMember.user.tag} - Added denied role (not boosting)`, "success");
              updatedCount++;
            }
          }
        } else if (!isRecentBooster) {
          // Member not in source server - should have denied role
          if (!targetMember.roles.cache.has(DENIED_ROLE_ID)) {
            await targetMember.roles.add(DENIED_ROLE_ID);
            await targetMember.roles.remove(ACCESS_ROLE_ID).catch(() => {});
            log(`Fixed: ${targetMember.user.tag} - Added denied role (not in source)`, "success");
            updatedCount++;
          }
        }
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (memberError) {
        errorCount++;
        log(`Error processing ${targetMember.user.tag}: ${memberError.message}`, "error");
      }
    }
    
    log(`✅ Check complete! Updated ${updatedCount} members, ${errorCount} errors`, "success");
    return { updated: updatedCount, errors: errorCount, total: targetMembers.size };
    
  } catch (error) {
    log(`Failed to check all members: ${error.message}`, "error");
    return { updated: 0, errors: 1, total: 0 };
  }
}

// ===== BOT EVENTS =====
client.once("ready", async () => {
  log(`Logged in as ${client.user.tag}`, "success");
  
  try {
    const sourceGuild = await client.guilds.fetch(SOURCE_GUILD_ID);
    const targetGuild = await client.guilds.fetch(TARGET_GUILD_ID);
    
    log(`Connected to: ${sourceGuild.name} and ${targetGuild.name}`);
    
    // Run initial check on startup (optional)
    log("Running initial member check...", "info");
    await checkAllTargetMembers();
    
  } catch (error) {
    log(`Startup error: ${error.message}`, "error");
  }
  
  startVanityMonitor();
});

// ===== MEMBER JOINS TARGET SERVER =====
client.on("guildMemberAdd", async (member) => {
  if (member.guild.id !== TARGET_GUILD_ID) return;
  
  log(`${member.user.tag} joined TARGET server`, "info");
  
  try {
    const sourceGuild = await client.guilds.fetch(SOURCE_GUILD_ID);
    
    // Add delay to let boost status sync
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Fetch with retry to ensure we get the latest data
    const sourceMember = await fetchMemberWithRetry(sourceGuild, member.id).catch(() => null);
    
    if (sourceMember && isBoosting(sourceMember)) {
      log(`${member.user.tag} IS boosting!`, "success");
      recentBoosters.add(member.id);
      await updateTargetServerAccess(member.id, true);
      await giveCustomBoosterRole(sourceMember);
    } else {
      log(`${member.user.tag} is NOT boosting`, "info");
      await updateTargetServerAccess(member.id, false);
    }
  } catch (error) {
    log(`Error processing join: ${error.message}`, "error");
    try {
      await member.roles.add(DENIED_ROLE_ID);
    } catch (roleError) {
      log(`Failed to add denied role: ${roleError.message}`, "error");
    }
  }
});

// ===== BOOST STATUS CHANGES =====
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  if (newMember.guild.id !== SOURCE_GUILD_ID) return;
  
  const wasBoosting = isBoosting(oldMember);
  const isNowBoosting = isBoosting(newMember);
  
  if (wasBoosting === isNowBoosting) return;
  
  log(`Boost change: ${newMember.user.tag} - ${wasBoosting ? 'Was' : 'Not'} -> ${isNowBoosting ? 'Now' : 'Not'}`, "info");
  
  try {
    if (isNowBoosting) {
      recentBoosters.add(newMember.id);
      await giveCustomBoosterRole(newMember);
      await sendBoostDM(newMember.user, true);
      await pingBoosterInPerksChannel(newMember);
    } else {
      // Wait 30 seconds before removing in case user is rejoining
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      // Check if still not boosting
      const refreshedMember = await newMember.guild.members.fetch(newMember.id).catch(() => null);
      if (refreshedMember && !isBoosting(refreshedMember)) {
        await removeCustomBoosterRole(refreshedMember);
        await sendBoostDM(newMember.user, false);
      }
    }
    
    await updateTargetServerAccess(newMember.id, isNowBoosting);
  } catch (error) {
    log(`Error updating boost: ${error.message}`, "error");
  }
});

// ===== ADMIN COMMANDS =====
client.on("messageCreate", async (message) => {
  if (message.author.id !== OWNER_ID) return;
  if (!message.content.startsWith("!")) return;
  
  const args = message.content.slice(1).split(" ");
  const command = args[0].toLowerCase();
  
  // !resetvanity command
  if (command === "resetvanity") {
    const arg = args[1];
    
    if (!arg) {
      return message.reply("Usage: `!resetvanity <name | all>`");
    }
    
    if (arg === "all") {
      VANITY_CODES.forEach(v => {
        vanity404Counter[v] = 0;
        vanityNotified[v] = false;
      });
      return message.reply("✅ All vanity monitors reset.");
    }
    
    if (!VANITY_CODES.includes(arg)) {
      return message.reply("❌ Vanity not found.");
    }
    
    vanity404Counter[arg] = 0;
    vanityNotified[arg] = false;
    return message.reply(`✅ Vanity **${arg}** reset.`);
  }
  
  // !checkall command
  if (command === "checkall") {
    log(`Owner requested check of all members`, "info");
    message.reply("🔍 Checking ALL members in target server... This may take a minute.");
    
    const result = await checkAllTargetMembers();
    
    const embed = {
      color: result.errors > 0 ? 0xff9900 : 0x00ff00,
      title: "Member Check Complete",
      fields: [
        { name: "Total Members", value: `${result.total}`, inline: true },
        { name: "Updated", value: `${result.updated}`, inline: true },
        { name: "Errors", value: `${result.errors}`, inline: true }
      ],
      description: result.updated > 0 ? 
        `Fixed role assignments for ${result.updated} members` : 
        'All roles are already correct!',
      timestamp: new Date()
    };
    
    message.reply({ embeds: [embed] });
  }
  
  // !fixuser command
  if (command === "fixuser") {
    const userId = args[1] || message.mentions.users.first()?.id;
    
    if (!userId) {
      return message.reply("Usage: `!fixuser <userid|@mention>`");
    }
    
    try {
      const sourceGuild = await client.guilds.fetch(SOURCE_GUILD_ID);
      const targetGuild = await client.guilds.fetch(TARGET_GUILD_ID);
      
      const sourceMember = await fetchMemberWithRetry(sourceGuild, userId).catch(() => null);
      const targetMember = await fetchMemberWithRetry(targetGuild, userId).catch(() => null);
      
      if (!targetMember) {
        return message.reply("❌ User not found in target server.");
      }
      
      let response = `**Fixing roles for ${targetMember.user.tag}**\n`;
      
      if (sourceMember) {
        const boosting = isBoosting(sourceMember);
        response += `Source server: ${boosting ? '✅ Boosting' : '❌ Not boosting'}\n`;
        
        // Update custom role
        if (boosting) {
          await giveCustomBoosterRole(sourceMember);
          response += `Custom role: ✅ Added\n`;
          recentBoosters.add(userId);
        } else {
          await removeCustomBoosterRole(sourceMember);
          response += `Custom role: ✅ Removed\n`;
        }
        
        // Update target access
        await updateTargetServerAccess(userId, boosting);
        response += `Target access: ${boosting ? '✅ Granted' : '❌ Denied'}`;
      } else {
        response += `User not in source server\n`;
        await updateTargetServerAccess(userId, false);
        response += `Target access: ❌ Denied`;
      }
      
      message.reply(response);
    } catch (error) {
      message.reply(`Error: ${error.message}`);
    }
  }
  
  // !setmsg command — set custom boost/unboost/ping messages
  // Usage: !setmsg boost <testo> | !setmsg unboost <testo> | !setmsg ping <testo>
  // Nel ping usa {user} come placeholder per il mention dell'utente
  if (command === "setmsg") {
    const type = args[1]?.toLowerCase();
    if (!type || !["boost", "unboost", "ping"].includes(type)) {
      return message.reply("Usage: `!setmsg <boost|unboost|ping> <testo>`\nNel ping usa `{user}` come placeholder per il mention (es: `Ciao {user}!`).");
    }
    const text = args.slice(2).join(" ");
    if (!text) {
      return message.reply(`❌ Devi scrivere il testo del messaggio dopo il tipo.`);
    }
    customMessages[type] = text;
    saveMessages(customMessages);
    return message.reply(`✅ Messaggio **${type}** aggiornato!\n\nAnteprima:\n${text.replace("{user}", `@${message.author.username}`)}`);
  }

  // !viewmsg command — mostra i messaggi attuali
  if (command === "viewmsg") {
    const embed = {
      color: 0x9b59b6,
      title: "📨 Messaggi attuali",
      fields: [
        { name: "💜 DM Boost", value: customMessages.boost.substring(0, 1024) },
        { name: "😔 DM Unboost", value: customMessages.unboost.substring(0, 1024) },
        { name: "📣 Ping canale perks", value: customMessages.ping }
      ],
      footer: { text: "Modifica con !setmsg boost/unboost/ping <testo> • Resetta con !resetmsg" }
    };
    return message.reply({ embeds: [embed] });
  }

  // !resetmsg command — ripristina i messaggi di default
  if (command === "resetmsg") {
    const type = args[1]?.toLowerCase();
    if (type && ["boost", "unboost", "ping"].includes(type)) {
      customMessages[type] = DEFAULT_MESSAGES[type];
      saveMessages(customMessages);
      return message.reply(`✅ Messaggio **${type}** ripristinato al default.`);
    } else {
      customMessages = { ...DEFAULT_MESSAGES };
      saveMessages(customMessages);
      return message.reply("✅ Tutti i messaggi ripristinati ai default.");
    }
  }


  if (command === "stats") {
    try {
      const sourceGuild = await client.guilds.fetch(SOURCE_GUILD_ID);
      const targetGuild = await client.guilds.fetch(TARGET_GUILD_ID);
      
      const sourceMembers = await sourceGuild.members.fetch();
      const targetMembers = await targetGuild.members.fetch();
      
      let boosters = 0;
      sourceMembers.forEach(member => {
        if (isBoosting(member)) boosters++;
      });
      
      let withAccess = 0;
      let withDenied = 0;
      targetMembers.forEach(member => {
        if (member.roles.cache.has(ACCESS_ROLE_ID)) withAccess++;
        if (member.roles.cache.has(DENIED_ROLE_ID)) withDenied++;
      });
      
      const embed = {
        color: 0x0099ff,
        title: "Bot Statistics",
        fields: [
          { name: "Source Server", value: `Members: ${sourceMembers.size}\nBoosters: ${boosters}`, inline: true },
          { name: "Target Server", value: `Members: ${targetMembers.size}\nWith Access: ${withAccess}\nWith Denied: ${withDenied}`, inline: true },
          { name: "Bot Uptime", value: `${Math.floor(process.uptime() / 60)} minutes`, inline: true }
        ],
        timestamp: new Date()
      };
      
      message.reply({ embeds: [embed] });
    } catch (error) {
      message.reply(`Error: ${error.message}`);
    }
  }
});

// ===== VANITY MONITOR =====
function startVanityMonitor() {
  setInterval(async () => {
    for (const vanity of VANITY_CODES) {
      if (vanityNotified[vanity]) continue;
      
      try {
        const response = await fetch(
