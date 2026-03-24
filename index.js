const { Client, GatewayIntentBits, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType } = require("discord.js");
const fs = require("fs");
const path = require("path");

// ===================================================
// ===== PERSISTENCE SYSTEM (Discord-backed) =========
// ===================================================
// Saves config to a Discord channel so it survives Railway restarts
const CONFIG_CHANNEL_ID = "1482107392463474921";
const CONFIG_MESSAGE_TAG = "SENSATIONAL_CONFIG_V1";
let _configMessageId = null; // cached message ID

// Serializer — handles Map and Set
function serialize(data) {
  return JSON.stringify(data, (key, value) => {
    if (value instanceof Set) return { __type: "Set", values: [...value] };
    if (value instanceof Map) return { __type: "Map", entries: [...value.entries()] };
    return value;
  });
}

function deserialize(raw) {
  return JSON.parse(raw, (key, value) => {
    if (value?.__type === "Set") return new Set(value.values || []);
    if (value?.__type === "Map") return new Map(value.entries || []);
    return value;
  });
}

// Build config snapshot to save
function buildConfigSnapshot() {
  return {
    antiMinorsConfig,
    antinukeConfig,
    antiraidConfig,
    autoroles,
    welcomeConfig,
    goodbyeConfig,
    ticketConfig,
    filterConfig,
    modlogChannel,
    levelingEnabled,
    vanityLock,
    muteRole,
    birthdayChannel,
    logEvents,
    reactionRoles,
    customCommands,
    disabledCommands,
    aliases,
    reactionTriggers,
    counters,
    automodExempt,
    warnThresholds,
    userTimezones,
  };
}

// Save all configs to Discord channel
async function saveAllConfigs() {
  try {
    const ch = client.channels.cache.get(CONFIG_CHANNEL_ID);
    if (!ch) return;

    const content = `\`\`\`json\n${CONFIG_MESSAGE_TAG}\n${serialize(buildConfigSnapshot())}\n\`\`\``;

    if (_configMessageId) {
      // Edit existing message
      const msg = await ch.messages.fetch(_configMessageId).catch(() => null);
      if (msg) {
        await msg.edit(content).catch(() => {});
        return;
      }
    }

    // No existing message — find it or create new one
    const messages = await ch.messages.fetch({ limit: 20 }).catch(() => null);
    if (messages) {
      const existing = messages.find(m => m.author.id === client.user.id && m.content.includes(CONFIG_MESSAGE_TAG));
      if (existing) {
        _configMessageId = existing.id;
        await existing.edit(content).catch(() => {});
        return;
      }
    }

    // Create new message
    const sent = await ch.send(content).catch(() => null);
    if (sent) _configMessageId = sent.id;
  } catch (e) {
    console.error("[Config] Failed to save:", e.message);
  }
}

// Load configs from Discord channel on startup
async function loadAllConfigs() {
  try {
    const ch = client.channels.cache.get(CONFIG_CHANNEL_ID);
    if (!ch) { console.log("[Config] Config channel not found, starting fresh"); return; }

    const messages = await ch.messages.fetch({ limit: 20 }).catch(() => null);
    if (!messages) return;

    const configMsg = messages.find(m => m.author.id === client.user.id && m.content.includes(CONFIG_MESSAGE_TAG));
    if (!configMsg) { console.log("[Config] No saved config found, starting fresh"); return; }

    _configMessageId = configMsg.id;

    // Extract JSON from codeblock
    const match = configMsg.content.match(/```json\n[^\n]+\n([\s\S]+)\n```/);
    if (!match) return;

    const data = deserialize(match[1]);

    // Restore each config — ensure Sets/Maps are valid
    function restoreMap(saved, defaultVal) {
      if (!saved) return defaultVal;
      if (saved instanceof Map) return saved;
      return defaultVal;
    }

    function ensureSetInMap(map) {
      for (const [key, val] of map.entries()) {
        if (val && typeof val === 'object') {
          if (val.channels && !(val.channels instanceof Set)) val.channels = new Set(Array.isArray(val.channels) ? val.channels : []);
          if (val.requireAttach && !(val.requireAttach instanceof Set)) val.requireAttach = new Set(Array.isArray(val.requireAttach) ? val.requireAttach : []);
          if (val.whitelist && !(val.whitelist instanceof Set)) val.whitelist = new Set(Array.isArray(val.whitelist) ? val.whitelist : []);
        }
      }
      return map;
    }

    if (data.antiMinorsConfig instanceof Map) { antiMinorsConfig.clear(); ensureSetInMap(data.antiMinorsConfig).forEach((v,k) => antiMinorsConfig.set(k,v)); }
    if (data.antinukeConfig instanceof Map) { antinukeConfig.clear(); ensureSetInMap(data.antinukeConfig).forEach((v,k) => antinukeConfig.set(k,v)); }
    if (data.antiraidConfig instanceof Map) { antiraidConfig.clear(); data.antiraidConfig.forEach((v,k) => antiraidConfig.set(k,v)); }
    if (data.autoroles instanceof Map) { autoroles.clear(); data.autoroles.forEach((v,k) => autoroles.set(k,v)); }
    if (data.welcomeConfig instanceof Map) { welcomeConfig.clear(); data.welcomeConfig.forEach((v,k) => welcomeConfig.set(k,v)); }
    if (data.goodbyeConfig instanceof Map) { goodbyeConfig.clear(); data.goodbyeConfig.forEach((v,k) => goodbyeConfig.set(k,v)); }
    if (data.ticketConfig instanceof Map) { ticketConfig.clear(); data.ticketConfig.forEach((v,k) => ticketConfig.set(k,v)); }
    if (data.filterConfig instanceof Map) { filterConfig.clear(); data.filterConfig.forEach((v,k) => filterConfig.set(k,v)); }
    if (data.modlogChannel instanceof Map) { modlogChannel.clear(); data.modlogChannel.forEach((v,k) => modlogChannel.set(k,v)); }
    if (data.levelingEnabled instanceof Map) { levelingEnabled.clear(); data.levelingEnabled.forEach((v,k) => levelingEnabled.set(k,v)); }
    if (data.vanityLock instanceof Map) { vanityLock.clear(); data.vanityLock.forEach((v,k) => vanityLock.set(k,v)); }
    if (data.muteRole instanceof Map) { muteRole.clear(); data.muteRole.forEach((v,k) => muteRole.set(k,v)); }
    if (data.birthdayChannel instanceof Map) { birthdayChannel.clear(); data.birthdayChannel.forEach((v,k) => birthdayChannel.set(k,v)); }
    if (data.logEvents instanceof Map) { logEvents.clear(); data.logEvents.forEach((v,k) => logEvents.set(k,v)); }
    if (data.reactionRoles instanceof Map) { reactionRoles.clear(); data.reactionRoles.forEach((v,k) => reactionRoles.set(k,v)); }
    if (data.customCommands instanceof Map) { customCommands.clear(); data.customCommands.forEach((v,k) => customCommands.set(k,v)); }
    if (data.disabledCommands instanceof Map) { disabledCommands.clear(); data.disabledCommands.forEach((v,k) => disabledCommands.set(k,v)); }
    if (data.aliases instanceof Map) { aliases.clear(); data.aliases.forEach((v,k) => aliases.set(k,v)); }
    if (data.reactionTriggers instanceof Map) { reactionTriggers.clear(); data.reactionTriggers.forEach((v,k) => reactionTriggers.set(k,v)); }
    if (data.counters instanceof Map) { counters.clear(); data.counters.forEach((v,k) => counters.set(k,v)); }
    if (data.automodExempt instanceof Map) { automodExempt.clear(); data.automodExempt.forEach((v,k) => automodExempt.set(k,v)); }
    if (data.warnThresholds instanceof Map) { warnThresholds.clear(); data.warnThresholds.forEach((v,k) => warnThresholds.set(k,v)); }
    if (data.userTimezones instanceof Map) { userTimezones.clear(); data.userTimezones.forEach((v,k) => userTimezones.set(k,v)); }

    console.log("[Config] ✅ All configs restored from Discord");
  } catch (e) {
    console.error("[Config] Failed to load:", e.message);
  }
}

// Auto-save every 2 minutes as backup
setInterval(() => saveAllConfigs(), 2 * 60 * 1000);


// ===================================================
// ===== GREED-STYLE RESPONSE SYSTEM =================
// ===================================================

const PINK = 0xFF69B4;  // Hot pink color for all embeds

// ✅ Success response — pink embed, no title, inline style
function ok(message, text) {
  return message.reply({
    embeds: [{
      color: PINK,
      description: `🌸 ${message.author} ${text}`
    }]
  });
}

// ❌ Error response
function err(message, text) {
  return message.reply({
    embeds: [{
      color: PINK,
      description: `✖ ${message.author} ${text}`
    }]
  });
}

// ℹ️ Info response
function info(message, text) {
  return message.reply({
    embeds: [{
      color: PINK,
      description: `🌸 ${message.author} ${text}`
    }]
  });
}

// 📊 Data embed with fields
function embed(title, fields, color = PINK) {
  return {
    embeds: [{
      color,
      title,
      fields,
      footer: { text: "greed • pink edition" },
      timestamp: new Date()
    }]
  };
}

// 🔒 Confirm button (for dangerous actions like nuke, unbanall, etc.)
async function confirm(message, text, onConfirm) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("confirm_yes").setLabel("Approve").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("confirm_no").setLabel("Decline").setStyle(ButtonStyle.Danger)
  );
  const msg = await message.reply({
    embeds: [{ color: PINK, description: `🌸 ${text}` }],
    components: [row]
  });
  const collector = msg.createMessageComponentCollector({ filter: () => true });
  collector.on("collect", async i => {
    try {
      if (i.user.id !== message.author.id) {
        return i.reply({ embeds: [{ color: PINK, description: "✖ This menu belongs to someone else." }], ephemeral: true });
      }
      if (i.customId === "confirm_yes") {
        await i.update({ embeds: [{ color: PINK, description: "🌸 Executing..." }], components: [] });
        await onConfirm();
      } else {
        await i.update({ embeds: [{ color: PINK, description: "✖ Action cancelled." }], components: [] });
      }
    } catch (e) {
      msg.edit({ components: [] }).catch(() => {});
    }
  });
}

// banStats[guildId][modId] = { tag, actions, bans, ignores }
const banStats = {};

async function loadBanStatsFromAuditLogs(guild) {
  const stats = {};
  try {
    let before = undefined;
    let fetched;

    // Fetch all ban audit log entries (100 at a time)
    do {
      fetched = await guild.fetchAuditLogs({ type: 22, limit: 100, before });
      if (fetched.entries.size === 0) break;

      for (const entry of fetched.entries.values()) {
        if (!entry.executor) continue;
        const modId = entry.executor.id;
        const modTag = entry.executor.username || entry.executor.username;

        if (!stats[modId]) {
          stats[modId] = { tag: modTag, actions: 0, bans: 0, ignores: 0 };
        }
        stats[modId].username = modTag;
        stats[modId].actions += 1;
        stats[modId].bans += 1;
      }

      before = fetched.entries.last()?.id;
    } while (fetched.entries.size === 100);

  } catch (e) {
    log(`Failed to load audit logs for ${guild.name}: ${e.message}`, "error");
  }
  return stats;
}

process.setMaxListeners(20);
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildModeration,
  ],
  partials: ["CHANNEL"]
});

// ===== CONFIGURATION =====
const OWNER_ID = "1005237630113419315";
const SOURCE_GUILD_ID = "1463635465222619218";
const TARGET_GUILD_ID = "1425102156125442140";

// Role IDs
const DISCORD_BOOSTER_ROLE_ID = "1475164627808813158";

// ===== BOOSTER PROTECTION (by role ID) =====
const PROTECTED_ROLE_IDS = new Set([
  "1475164627808813158", // Discord booster role
  "1474900074185097358", // Custom booster server role
]);

function isProtectedBooster(member) {
  if (!member) return false;
  return member.roles.cache.some(r => PROTECTED_ROLE_IDS.has(r.id));
}

const CUSTOM_BOOSTER_ROLE_ID = "1474900074185097358";
const ACCESS_ROLE_ID = "1475167075789181122";
const DENIED_ROLE_ID = "1426874194263805992";

// Channel IDs
const PERKS_CHANNEL_ID = "1475125441919455346";

// ===== CUSTOM MESSAGES (in-memory, editable with !setmsg) =====
const customMessages = {
  boost:`<:SENSATIONAL:1475072755467550781>  {user}  Boosting grants you __access to our locked vault__  a space reserved for boosters. Inside, you’ll find all creator channels listed under *perks*.

The *invite link* is private — **sharing it is forbidden** and will get you **blacklisted**. If you ever **remove your boost**, you’ll be **automatically removed** from the vault.

[Ი𐑼](https://discord.com/channels/1463635465222619218/1475125441919455346)`,
  unboost: `We regret that you’ve __withdrawn your boost__ {user} . From this point on, **your access** to our **exclusive server** will be __revoked__. If **boost again**, you’ll __regain entry__ without issue.`,
  ping: `{user}`
};

// ===== VANITY CONFIG =====
const VANITY_CODES = ["vanityteen", "jerkpit", "boytoy"];
const CHECK_INTERVAL = 30 * 1000;
const REQUIRED_404_COUNT = 5;

// ===== TRACKERS =====
const vanity404Counter = {};
const vanityNotified = {};
const recentBoosters = new Set();

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
      log(`Gave custom booster role to ${member.user.username}`, "success");
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
      log(`Removed custom booster role from ${member.user.username}`, "success");
      return true;
    }
  } catch (error) {
    log(`Failed to remove custom booster role: ${error.message}`, "error");
  }
  return false;
}

// ===== DM ON BOOST/UNBOOST =====
async function sendBoostDM(user, boosted) {
  try {
    const template = boosted ? customMessages.boost : customMessages.unboost;
    const msg = template.replace("{user}", `<@${user.id}>`);
    await user.send(msg);
    log(`DM sent to ${user.username} (boosted: ${boosted})`, "success");
  } catch (error) {
    log(`Failed to send DM to ${user.username}: ${error.message}`, "error");
  }
}

// ===== PING IN PERKS CHANNEL ON BOOST =====
async function pingBoosterInPerksChannel(member) {
  try {
    const sourceGuild = await client.guilds.fetch(SOURCE_GUILD_ID);
    const channel = await sourceGuild.channels.fetch(PERKS_CHANNEL_ID).catch(() => null);
    if (!channel) {
      log(`Perks channel not found: ${PERKS_CHANNEL_ID}`, "error");
      return;
    }
    const pingText = customMessages.ping.replace("{user}", `<@${member.id}>`);
    const msg = await channel.send(pingText);
    setTimeout(() => { msg.delete().catch(() => {}); }, 5000);
    log(`Pinged ${member.user.username} in perks channel`, "success");
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
      recentBoosters.add(userId);
      log(`Granted access to ${targetMember.user.username}`, "success");
    } else {
      if (!recentBoosters.has(userId)) {
        await targetMember.roles.remove(ACCESS_ROLE_ID).catch(() => {});
        await targetMember.roles.add(DENIED_ROLE_ID);
        log(`Denied access to ${targetMember.user.username}`, "success");
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

    const targetMembers = await targetGuild.members.fetch();
    log(`Found ${targetMembers.size} members in target server`, "info");

    let updatedCount = 0;
    let errorCount = 0;

    for (const targetMember of targetMembers.values()) {
      try {
        if (targetMember.user.bot) continue;

        const isRecentBooster = recentBoosters.has(targetMember.id);
        const sourceMember = await fetchMemberWithRetry(sourceGuild, targetMember.id).catch(() => null);

        if (sourceMember) {
          const isBoostingMember = isBoosting(sourceMember);
          const hasAccessRole = targetMember.roles.cache.has(ACCESS_ROLE_ID);
          const hasDeniedRole = targetMember.roles.cache.has(DENIED_ROLE_ID);

          if (isBoostingMember) {
            await giveCustomBoosterRole(sourceMember);
          } else {
            await removeCustomBoosterRole(sourceMember);
          }

          if (isBoostingMember) {
            if (!hasAccessRole || hasDeniedRole) {
              await targetMember.roles.add(ACCESS_ROLE_ID);
              await targetMember.roles.remove(DENIED_ROLE_ID).catch(() => {});
              log(`Fixed: ${targetMember.user.username} - Added access role (boosting)`, "success");
              updatedCount++;
            }
            recentBoosters.add(targetMember.id);
          } else if (!isRecentBooster) {
            if (hasAccessRole || !hasDeniedRole) {
              await targetMember.roles.remove(ACCESS_ROLE_ID).catch(() => {});
              await targetMember.roles.add(DENIED_ROLE_ID);
              log(`Fixed: ${targetMember.user.username} - Added denied role (not boosting)`, "success");
              updatedCount++;
            }
          }
        } else if (!isRecentBooster) {
          if (!targetMember.roles.cache.has(DENIED_ROLE_ID)) {
            await targetMember.roles.add(DENIED_ROLE_ID);
            await targetMember.roles.remove(ACCESS_ROLE_ID).catch(() => {});
            log(`Fixed: ${targetMember.user.username} - Added denied role (not in source)`, "success");
            updatedCount++;
          }
        }

        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (memberError) {
        errorCount++;
        log(`Error processing ${targetMember.user.username}: ${memberError.message}`, "error");
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
client.once("clientReady", async () => {
  log(`Logged in as ${client.user.username}`, "success");

  // Load all configs from Discord backup channel
  await loadAllConfigs();

  // Re-register any open tickets from before restart
  setTimeout(() => rehydrateTickets(), 3000);

  try {
    const sourceGuild = await client.guilds.fetch(SOURCE_GUILD_ID);
    const targetGuild = await client.guilds.fetch(TARGET_GUILD_ID);

    log(`Connected to: ${sourceGuild.name} and ${targetGuild.name}`);

    // Load ban history in background (non-blocking) so bot starts instantly
    (async () => {
      for (const guild of [sourceGuild, targetGuild]) {
        log(`Loading ban history from audit logs for ${guild.name}...`, "info");
        banStats[guild.id] = await loadBanStatsFromAuditLogs(guild);
        const total = Object.values(banStats[guild.id]).reduce((sum, m) => sum + m.bans, 0);
        log(`Loaded ${total} historical bans for ${guild.name}`, "success");
      }
    })();

    log("Running initial member check...", "info");
    await checkAllTargetMembers();

  } catch (error) {
    log(`Startup error: ${error.message}`, "error");
  }

  startVanityMonitor();

  // Set Twitch streaming status (purple dot)
  client.user.setPresence({
    status: "online",
    activities: [{
      name: "ugh, this is so /sensational",
      type: ActivityType.Streaming,
      url: "https://www.twitch.tv/sensational"
    }]
  });

  // Auto-save all configs every 60 seconds
  // Also save immediately on startup in case of new defaults
  setTimeout(saveAllConfigs, 5000);
});

// ===== MEMBER JOINS TARGET SERVER =====
client.on("guildMemberAdd", async (member) => {
  if (member.guild.id !== TARGET_GUILD_ID) return;

  log(`${member.user.username} joined TARGET server`, "info");

  try {
    const sourceGuild = await client.guilds.fetch(SOURCE_GUILD_ID);

    await new Promise(resolve => setTimeout(resolve, 2000));

    const sourceMember = await fetchMemberWithRetry(sourceGuild, member.id).catch(() => null);

    if (sourceMember && isBoosting(sourceMember)) {
      log(`${member.user.username} IS boosting!`, "success");
      recentBoosters.add(member.id);
      await updateTargetServerAccess(member.id, true);
      await giveCustomBoosterRole(sourceMember);
    } else {
      log(`${member.user.username} is NOT boosting`, "info");
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

  log(`Boost change: ${newMember.user.username} - ${wasBoosting ? "Was" : "Not"} -> ${isNowBoosting ? "Now" : "Not"}`, "info");

  try {
    if (isNowBoosting) {
      recentBoosters.add(newMember.id);
      await giveCustomBoosterRole(newMember);
      await sendBoostDM(newMember.user, true);
      await pingBoosterInPerksChannel(newMember);
    } else {
      await new Promise(resolve => setTimeout(resolve, 30000));

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


  // !setmsg boost/unboost/ping <text>
  if (command === "setmsg") {
    const type = args[1]?.toLowerCase();
    if (!type || !["boost", "unboost", "ping"].includes(type)) {
      return err(message, "usage: `,setmsg <boost|unboost|ping> <text>` — use `{user}` as placeholder.");

    }
    const text = args.slice(2).join(" ");
    if (!text) return err(message, "Please write the message text after the type.");
    customMessages[type] = text;
    return ok(message, `**${type}** message updated! Preview: ${text.replace("{user}", "@"+message.author.username)}`);
  }

  // !viewmsg
  if (command === "viewmsg") {
    const embed = {
      color: PINK,
      title: "📨 Current Messages",
      fields: [
        { name: "💜 Boost DM", value: customMessages.boost.substring(0, 1024) },
        { name: "😔 Unboost DM", value: customMessages.unboost.substring(0, 1024) },
        { name: "📣 Perks channel ping", value: customMessages.ping }
      ],
      footer: { text: "Edit with !setmsg boost/unboost/ping <text>" }
    };
    return message.reply({ embeds: [embed] });
  }

  // !resetvanity
  if (command === "resetvanity") {
    const arg = args[1];

    if (!arg) {
      return err(message, "missing required argument");

    }

    if (arg === "all") {
      VANITY_CODES.forEach(v => {
        vanity404Counter[v] = 0;
        vanityNotified[v] = false;
      });
      return ok(message, "All vanity monitors reset.");
    }

    if (!VANITY_CODES.includes(arg)) {
      return err(message, "Vanity not found.");
    }

    vanity404Counter[arg] = 0;
    vanityNotified[arg] = false;
    return ok(message, `Vanity **${arg}** reset.`);
  }

  // !checkall
  if (command === "checkall") {
    log(`Owner requested check of all members`, "info");
    ok(message, "checking all members in target server...");

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
        "All roles are already correct!",
      timestamp: new Date()
    };

    message.reply({ embeds: [embed] });
  }

  // !fixuser
  if (command === "fixuser") {
    const userId = args[1] || message.mentions.users.first()?.id;

    if (!userId) {
      return err(message, "missing required argument");

    }

    try {
      const sourceGuild = await client.guilds.fetch(SOURCE_GUILD_ID);
      const targetGuild = await client.guilds.fetch(TARGET_GUILD_ID);

      const sourceMember = await fetchMemberWithRetry(sourceGuild, userId).catch(() => null);
      const targetMember = await fetchMemberWithRetry(targetGuild, userId).catch(() => null);

      if (!targetMember) {
        return err(message, "User not found in target server.");
      }

      let response = `**Fixing roles for ${targetMember.user.username}**\n`;

      if (sourceMember) {
        const boosting = isBoosting(sourceMember);
        response += `Source server: ${boosting ? "✅ Boosting" : "❌ Not boosting"}\n`;

        if (boosting) {
          await giveCustomBoosterRole(sourceMember);
          response += `Custom role: ✅ Added\n`;
          recentBoosters.add(userId);
        } else {
          await removeCustomBoosterRole(sourceMember);
          response += `Custom role: ✅ Removed\n`;
        }

        await updateTargetServerAccess(userId, boosting);
        response += `Target access: ${boosting ? "✅ Granted" : "❌ Denied"}`;
      } else {
        response += `User not in source server\n`;
        await updateTargetServerAccess(userId, false);
        response += `Target access: ❌ Denied`;
      }

      message.reply(response);
    } catch (error) {
      message.reply({ embeds: [{ color: PINK, description: `✖ Error: ${error.message}` }] });
    }
  }

  // !stats
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
        color: PINK,
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
      message.reply({ embeds: [{ color: PINK, description: `✖ Error: ${error.message}` }] });
    }
  }
});

// ===== TRACK BANS (guildBanAdd) =====
client.on("guildBanAdd", async (ban) => {
  try {
    const guild = ban.guild;
    const auditLogs = await guild.fetchAuditLogs({ type: 22 /* BAN */, limit: 5 });
    const entry = auditLogs.entries.find(e => e.target?.id === ban.user.id);
    if (!entry) return;

    const modId = entry.executor.id;
    const modTag = entry.executor.username || entry.executor.username;
    const guildId = guild.id;

    if (!banStats[guildId]) banStats[guildId] = {};
    if (!banStats[guildId][modId]) {
      banStats[guildId][modId] = { tag: modTag, actions: 0, bans: 0, ignores: 0 };
    }

    banStats[guildId][modId].username = modTag;
    banStats[guildId][modId].actions += 1;
    banStats[guildId][modId].bans += 1;
    log(`Ban tracked: ${modTag} banned ${ban.user.username}`, "info");

    log(`Ban tracked: ${modTag} banned ${ban.user.username}`, "info");
  } catch (error) {
    log(`Failed to track ban: ${error.message}`, "error");
  }
});

// ===== TRACK IGNORES (guildBanRemove = unban used as "ignore"/pardon) =====
// If you want to track "ignores" as manual increments, use ,addignore <userId> command
// Otherwise ignores = 0 by default unless explicitly tracked

// ===== MODSTATS COMMAND =====
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(",modstats")) return;
  if (!message.guild) return;
  if (!message.member) return;

  // Send typing indicator while loading
  await message.channel.sendTyping().catch(() => {});
  // Load fresh from audit logs
  const freshStats = await loadBanStatsFromAuditLogs(message.guild);
  banStats[message.guild.id] = freshStats;

  // Filter out bots
  const members = await message.guild.members.fetch().catch(() => null);
  const botIds = members ? new Set(members.filter(m => m.user.bot).map(m => m.id)) : new Set();

  const allEntries = Object.entries(banStats[message.guild.id] || {})
    .filter(([modId]) => !botIds.has(modId))
    .sort((a, b) => b[1].bans - a[1].bans || b[1].actions - a[1].actions);

  if (allEntries.length === 0) {
    return info(message, "No moderation stats recorded yet.");
  }

  const PER_PAGE = 5;
  const totalPages = Math.ceil(allEntries.length / PER_PAGE);
  let page = 0;

  function buildEmbed(p) {
    const slice = allEntries.slice(p * PER_PAGE, p * PER_PAGE + PER_PAGE);
    const lines = slice.map(([modId, data]) => {
      const banPct = data.actions > 0 ? ((data.bans / data.actions) * 100).toFixed(1) : "0.0";
      return `<@${modId}>\nactions: ${data.actions} | bans: ${data.bans} (${banPct}%) | ignores: ${data.ignores}`;
    });
    return {
      color: PINK,
      title: "📊 Mod Stats",
      description: lines.join("\n\n"),
      footer: { text: `Page ${p + 1}/${totalPages} • ${message.guild.name}` },
      timestamp: new Date()
    };
  }

  function buildRow(p) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("modstats_prev")
        .setLabel("◀")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(p === 0),
      new ButtonBuilder()
        .setCustomId("modstats_next")
        .setLabel("▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(p >= totalPages - 1)
    );
  }

  const msg = await message.channel.send({
    embeds: [buildEmbed(page)],
    components: totalPages > 1 ? [buildRow(page)] : []
  });

  if (totalPages <= 1) return;

  const collector = msg.createMessageComponentCollector({ filter: () => true });

  collector.on("collect", async i => {
    try {
      if (i.user.id !== message.author.id) {
        return i.reply({ embeds: [{ color: PINK, description: "✖ This menu belongs to someone else." }], ephemeral: true });
      }
      if (i.customId === "modstats_prev" && page > 0) page--;
      else if (i.customId === "modstats_next" && page < totalPages - 1) page++;
      await i.update({ embeds: [buildEmbed(page)], components: [buildRow(page)] });
    } catch (e) {
      msg.edit({ components: [] }).catch(() => {});
    }
  });
});


function startVanityMonitor() {
  setInterval(async () => {
    for (const vanity of VANITY_CODES) {
      if (vanityNotified[vanity]) continue;

      try {
        const response = await fetch(`https://discord.com/api/v10/invites/${vanity}`, {
          headers: { Authorization: `Bot ${process.env.TOKEN}` }
        });

        if (response.status === 404) {
          vanity404Counter[vanity]++;
        } else {
          vanity404Counter[vanity] = 0;
        }

        if (vanity404Counter[vanity] >= REQUIRED_404_COUNT) {
          vanityNotified[vanity] = true;

          const owner = await client.users.fetch(OWNER_ID);
          await owner.send(
            `🚨 **VANITY AVAILABLE** 🚨\n\n` +
            `Vanity: **discord.gg/${vanity}**\n` +
            `Time: **${utcTimestamp()}**`
          );

          log(`Vanity ${vanity} available!`, "success");
        }
      } catch (error) {
        // Silent fail
      }
    }
  }, CHECK_INTERVAL);
}

// ===== CLEAR RECENT BOOSTERS CACHE =====
setInterval(() => {
  log(`Clearing recent boosters cache (${recentBoosters.size} entries)`, "info");
  recentBoosters.clear();
}, 10 * 60 * 1000);

// ===== AUTO-CHECK SCHEDULER =====
setInterval(async () => {
  if (client.isReady()) {
    log("Running scheduled check of all members...", "info");
    await checkAllTargetMembers();
  }
}, 6 * 60 * 60 * 1000);

// ===== IN-MEMORY STORAGE =====
const warns = new Map();
const xpData = new Map();
const economy = new Map();
const remindersData = new Map();
const giveaways = new Map();
const autoroles = new Map();
const welcomeConfig = new Map();
const goodbyeConfig = new Map();
const starboardConfig = new Map();
const starboardSent = new Set();
const sniped = new Map();
const editSniped = new Map();
const lastfmUsers = new Map();
const afkUsers = new Map();
const ticketConfig = new Map();
const openTickets = new Map();

// ===== SNIPE EVENTS =====
client.on("messageDelete", (message) => {
  if (message.author?.bot || !message.content) return;
  sniped.set(message.channel.id, {
    content: message.content,
    author: message.author?.username || "Unknown",
    avatarURL: message.author?.displayAvatarURL(),
    time: new Date()
  });
});
client.on("messageUpdate", (oldMsg, newMsg) => {
  if (oldMsg.author?.bot || !oldMsg.content || oldMsg.content === newMsg.content) return;
  editSniped.set(oldMsg.channel.id, {
    before: oldMsg.content,
    after: newMsg.content,
    author: oldMsg.author?.username || "Unknown",
    avatarURL: oldMsg.author?.displayAvatarURL(),
    time: new Date()
  });
});

// ===== XP SYSTEM (disabled by default — enable with ,leveling on) =====
const levelingEnabled = new Map();

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild || message.content.startsWith(",")) return;
  if (!levelingEnabled.get(message.guild.id)) return; // Only run if enabled
  const key = `${message.guild.id}-${message.author.id}`;
  const data = xpData.get(key) || { xp: 0, level: 0 };
  data.xp += Math.floor(Math.random() * 10) + 5;
  const needed = (data.level + 1) * 100;
  if (data.xp >= needed) {
    data.level += 1;
    data.xp = 0;
    message.channel.send({ embeds: [{ color: PINK, description: `🌸 ${message.author} reached level **${data.level}**! 🎉` }] }).catch(() => {});
  }
  xpData.set(key, data);
});

// ===== WELCOME / GOODBYE / AUTOROLE =====
client.on("guildMemberAdd", async (member) => {
  if (member.guild.id === TARGET_GUILD_ID) return;
  const roleId = autoroles.get(member.guild.id);
  if (roleId) await member.roles.add(roleId).catch(() => {});
  const wc = welcomeConfig.get(member.guild.id);
  if (wc) {
    const ch = member.guild.channels.cache.get(wc.channelId);
    if (ch) ch.send(wc.message.replace("{user}", `<@${member.id}>`).replace("{server}", member.guild.name).replace("{count}", member.guild.memberCount)).catch(() => {});
  }
});
client.on("guildMemberRemove", async (member) => {
  const gc = goodbyeConfig.get(member.guild.id);
  if (gc) {
    const ch = member.guild.channels.cache.get(gc.channelId);
    if (ch) ch.send(gc.message.replace("{user}", member.user.username).replace("{server}", member.guild.name).replace("{count}", member.guild.memberCount)).catch(() => {});
  }
});

// ===== STARBOARD =====
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});
  if (reaction.emoji.name !== "⭐") return;
  const config = starboardConfig.get(reaction.message.guild?.id);
  if (!config || starboardSent.has(reaction.message.id)) return;
  if (reaction.count >= config.threshold) {
    const ch = reaction.message.guild.channels.cache.get(config.channelId);
    if (!ch) return;
    const msg = reaction.message;
    await ch.send({ embeds: [{ color: PINK, author: { name: msg.author.username, icon_url: msg.author.displayAvatarURL() }, description: msg.content || null, image: msg.attachments.first() ? { url: msg.attachments.first().url } : null, footer: { text: `⭐ ${reaction.count} | #${msg.channel.name}` }, timestamp: msg.createdAt }] });
    starboardSent.add(reaction.message.id);
  }
});

// ===== AFK CHECK =====
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  // Remove AFK if user sends a message
  if (afkUsers.has(`${message.guild.id}-${message.author.id}`)) {
    afkUsers.delete(`${message.guild.id}-${message.author.id}`);
    message.reply({ embeds: [{ color: PINK, description: `👋 ${message.author} **Welcome back**, your AFK has been removed.` }] }).catch(() => {});
  }
  // Notify if mentioning an AFK user
  for (const mentioned of message.mentions.users.values()) {
    const afk = afkUsers.get(`${message.guild.id}-${mentioned.id}`);
    if (afk) message.reply({ embeds: [{ color: PINK, description: `🌸 **${mentioned.username}** is currently AFK: **${afk}**` }] }).catch(() => {});
  }
});

// ===== REMINDER CHECKER =====
setInterval(() => {
  const now = Date.now();
  for (const [userId, rems] of remindersData.entries()) {
    const remaining = rems.filter(r => {
      if (r.time <= now) {
        client.users.fetch(userId).then(u => u.send(`⏰ Reminder: **${r.text}**`)).catch(() => {});
        return false;
      }
      return true;
    });
    if (remaining.length === 0) remindersData.delete(userId);
    else remindersData.set(userId, remaining);
  }
}, 10000);

// ===== GIVEAWAY CHECKER =====
setInterval(async () => {
  const now = Date.now();
  for (const [msgId, gw] of giveaways.entries()) {
    if (gw.ended || gw.endTime > now) continue;
    gw.ended = true;
    giveaways.set(msgId, gw);
    try {
      const guild = await client.guilds.fetch(gw.guildId);
      const channel = await guild.channels.fetch(gw.channelId);
      const msg = await channel.messages.fetch(msgId);
      if (gw.entries.length === 0) {
        await channel.send(`🎉 Giveaway ended! No valid entries for **${gw.prize}**.`);
      } else {
        const winner = gw.entries[Math.floor(Math.random() * gw.entries.length)];
        await channel.send(`🎉 Congratulations <@${winner}>! You won **${gw.prize}**!`);
        await msg.edit({ embeds: [{ color: PINK, title: "🎉 GIVEAWAY ENDED", description: `**Prize:** ${gw.prize}\n**Winner:** <@${winner}>` }] });
      }
    } catch {}
  }
}, 15000);

// ===== GLOBAL COMMAND SCHEMA (usage + required args for ALL 450 commands) =====
const CMD_SCHEMA = {
  // Moderation
  ban: { usage: ",ban <user> [reason]", args: ["user"] },
  unban: { usage: ",unban <userId>", args: ["userId"] },
  kick: { usage: ",kick <user> [reason]", args: ["user"] },
  mute: { usage: ",mute <user> [mins] [reason]", args: ["user"] },
  unmute: { usage: ",unmute <user>", args: ["user"] },
  timeout: { usage: ",timeout <user> <time> [reason]", args: ["user", "time"] },
  untimeout: { usage: ",untimeout <user>", args: ["user"] },
  tempban: { usage: ",tempban <user> <mins> [reason]", args: ["user", "mins"] },
  softban: { usage: ",softban <user> [reason]", args: ["user"] },
  hardban: { usage: ",hardban <user> [reason]", args: ["user"] },
  hackban: { usage: ",hackban <userId> [reason]", args: ["userId"] },
  massban: { usage: ",massban <id1> <id2> ...", args: ["id1"] },
  masskick: { usage: ",masskick @user1 @user2 ...", args: ["user"] },
  warn: { usage: ",warn <user> <reason>", args: ["user", "reason"] },
  warnings: { usage: ",warnings <user>", args: [] },
  warns: { usage: ",warnings <user>", args: [] },
  clearwarns: { usage: ",clearwarns <user>", args: ["user"] },
  delwarn: { usage: ",delwarn <user> <number>", args: ["user", "number"] },
  jail: { usage: ",jail <user> [reason]", args: ["user"] },
  unjail: { usage: ",unjail <user>", args: ["user"] },
  imute: { usage: ",imute <user>", args: ["user"] },
  iunmute: { usage: ",iunmute <user>", args: ["user"] },
  reactionmute: { usage: ",reactionmute <user>", args: ["user"] },
  reactionunmute: { usage: ",reactionunmute <user>", args: ["user"] },
  strip: { usage: ",strip <user>", args: ["user"] },
  purge: { usage: ",purge <amount>", args: [] },
  clear: { usage: ",clear <amount>", args: [] },
  lock: { usage: ",lock [#channel]", args: [] },
  unlock: { usage: ",unlock [#channel]", args: [] },
  hide: { usage: ",hide [#channel]", args: [] },
  unhide: { usage: ",unhide [#channel]", args: [] },
  lockall: { usage: ",lockall", args: [] },
  unlockall: { usage: ",unlockall", args: [] },
  hideall: { usage: ",hideall", args: [] },
  unhideall: { usage: ",unhideall", args: [] },
  lockdown: { usage: ",lockdown [reason]", args: [] },
  unlockdown: { usage: ",unlockdown", args: [] },
  slowmode: { usage: ",slowmode <seconds>", args: ["seconds"] },
  slowmodeall: { usage: ",slowmodeall <seconds>", args: ["seconds"] },
  nick: { usage: ",nick <user> <nickname>", args: ["user"] },
  nickname: { usage: ",nick <user> <nickname>", args: ["user"] },
  resetnick: { usage: ",resetnick <user>", args: ["user"] },
  resetallnicks: { usage: ",resetallnicks", args: [] },
  dehoist: { usage: ",dehoist", args: [] },
  dehoistall: { usage: ",dehoistall", args: [] },
  decancer: { usage: ",decancer <user>", args: ["user"] },
  nuke: { usage: ",nuke", args: [] },
  role: { usage: ",role <add|remove> <user> <role>", args: ["action"] },
  giverole: { usage: ",giverole <user> <role>", args: ["user", "role"] },
  addrole: { usage: ",addrole <user> <role>", args: ["user", "role"] },
  takerole: { usage: ",takerole <user> <role>", args: ["user", "role"] },
  removerole: { usage: ",removerole <user> <role>", args: ["user", "role"] },
  temprole: { usage: ",temprole <user> <role> <time>", args: ["user", "role", "time"] },
  massrole: { usage: ",massrole <add|remove> <role>", args: ["action", "role"] },
  massnick: { usage: ",massnick <nickname>", args: ["nickname"] },
  banwave: { usage: ",banwave [reason]", args: [] },
  prune: { usage: ",prune <days>", args: ["days"] },
  prunedry: { usage: ",prunedry <days>", args: ["days"] },
  note: { usage: ",note <user> <text>", args: ["user", "text"] },
  notes: { usage: ",notes <user>", args: ["user"] },
  clearnotes: { usage: ",clearnotes <user>", args: ["user"] },
  move: { usage: ",move <user> #channel", args: ["user"] },
  report: { usage: ",report <user> <reason>", args: ["user", "reason"] },
  history: { usage: ",history <user>", args: ["user"] },
  clearhistory: { usage: ",clearhistory <user>", args: ["user"] },
  case: { usage: ",case <id>", args: ["id"] },
  cases: { usage: ",cases <user>", args: [] },
  editcase: { usage: ",editcase <id> <reason>", args: ["id", "reason"] },
  deletecase: { usage: ",deletecase <id>", args: ["id"] },
  modlogs: { usage: ",modlogs [user]", args: [] },
  mutehistory: { usage: ",mutehistory <user>", args: ["user"] },
  baninfo: { usage: ",baninfo <userId>", args: ["userId"] },
  banreason: { usage: ",banreason <userId> <reason>", args: ["userId", "reason"] },
  hackban2: { usage: ",hackban2 <id1> <id2> ...", args: ["id1"] },
  modnick: { usage: ",modnick <user> <nick>", args: ["user", "nick"] },
  // Info
  userinfo: { usage: ",userinfo [user]", args: [] }, ui: { usage: ",userinfo [user]", args: [] },
  serverinfo: { usage: ",serverinfo", args: [] }, si: { usage: ",serverinfo", args: [] },
  avatar: { usage: ",avatar [user]", args: [] }, av: { usage: ",avatar [user]", args: [] },
  banner: { usage: ",banner [user]", args: [] },
  roleinfo: { usage: ",roleinfo <role>", args: [] }, ri: { usage: ",roleinfo <role>", args: [] },
  channelinfo: { usage: ",channelinfo [#channel]", args: [] }, ci: { usage: ",channelinfo [#channel]", args: [] },
  memberinfo: { usage: ",memberinfo [user]", args: [] }, mi: { usage: ",memberinfo [user]", args: [] },
  whois: { usage: ",whois [user]", args: [] },
  botinfo: { usage: ",botinfo", args: [] },
  ping: { usage: ",ping", args: [] },
  uptime: { usage: ",uptime", args: [] },
  membercount: { usage: ",membercount", args: [] }, mc: { usage: ",membercount", args: [] },
  bans: { usage: ",bans", args: [] },
  banlist: { usage: ",banlist", args: [] },
  inviteinfo: { usage: ",inviteinfo <code>", args: ["code"] },
  invites: { usage: ",invites [user]", args: [] },
  listinvites: { usage: ",listinvites", args: [] },
  createinvite: { usage: ",createinvite [maxUses] [hours]", args: [] },
  deleteinvite: { usage: ",deleteinvite <code>", args: ["code"] },
  deleteallinvites: { usage: ",deleteallinvites", args: [] },
  invitecheck: { usage: ",invitecheck", args: [] },
  newmembers: { usage: ",newmembers [count]", args: [] },
  oldmembers: { usage: ",oldmembers [count]", args: [] },
  inrole: { usage: ",inrole <role>", args: [] },
  boosters: { usage: ",boosters", args: [] }, boostinfo: { usage: ",boosters", args: [] },
  serverstats: { usage: ",serverstats", args: [] },
  servericon: { usage: ",servericon", args: [] }, sicon: { usage: ",servericon", args: [] },
  serverbanner: { usage: ",serverbanner", args: [] },
  boostgoal: { usage: ",boostgoal", args: [] },
  serverfeatures: { usage: ",serverfeatures", args: [] },
  serverrules: { usage: ",serverrules rule1 | rule2", args: ["rules"] },
  identify: { usage: ",identify <userId>", args: ["userId"] }, lookup: { usage: ",identify <userId>", args: ["userId"] },
  find: { usage: ",find <name>", args: ["name"] }, search: { usage: ",find <name>", args: ["name"] },
  admins: { usage: ",admins", args: [] },
  mods: { usage: ",mods", args: [] },
  bots: { usage: ",bots", args: [] },
  stafflist: { usage: ",stafflist", args: [] },
  rolecount: { usage: ",rolecount <role>", args: [] },
  snowflake: { usage: ",snowflake <id>", args: ["id"] },
  discrim: { usage: ",discrim <0000>", args: ["discriminator"] },
  permissions: { usage: ",permissions [user]", args: [] }, perms: { usage: ",permissions [user]", args: [] },
  id: { usage: ",id [user/role/channel]", args: [] },
  icon: { usage: ",icon [user]", args: [] },
  shared: { usage: ",shared [userId]", args: [] },
  joined: { usage: ",joined [user]", args: [] },
  created: { usage: ",created [user]", args: [] },
  mutual: { usage: ",mutual <user>", args: [] },
  accountage: { usage: ",accountage [user]", args: [] },
  serverage: { usage: ",serverage", args: [] },
  memberpos: { usage: ",memberpos [user]", args: [] },
  firstmessage: { usage: ",firstmessage [#channel]", args: [] },
  // Config
  setup: { usage: ",setup", args: [] },
  setupmute: { usage: ",setupmute", args: [] },
  autorole: { usage: ",autorole <@role|off>", args: [] },
  welcome: { usage: ",welcome <#channel> <message>", args: [] },
  goodbye: { usage: ",goodbye <#channel> <message>", args: [] },
  starboard: { usage: ",starboard <#channel> [threshold]", args: [] },
  bumpchannel: { usage: ",bumpchannel <#channel>", args: [] },
  jointocreate: { usage: ",jointocreate <#vc>", args: [] }, jtc: { usage: ",jointocreate <#vc>", args: [] },
  confessions: { usage: ",confessions <#channel|off>", args: [] },
  confess: { usage: ",confess <message>", args: ["message"] },
  modlog: { usage: ",modlog <#channel|off>", args: [] },
  messagelog: { usage: ",messagelog <#channel|off>", args: [] },
  joinlog: { usage: ",joinlog <#channel|off>", args: [] },
  voicelog: { usage: ",voicelog <#channel|off>", args: [] },
  log: { usage: ",log <event> <#channel|off>", args: [] },
  logging: { usage: ",logging <#channel|off>", args: [] },
  verification: { usage: ",verification <none|low|medium|high|highest>", args: ["level"] },
  contentfilter: { usage: ",contentfilter <disabled|members|all>", args: ["level"] },
  setname: { usage: ",setname <name>", args: ["name"] },
  setdesc: { usage: ",setdesc <text>", args: [] }, setdescription: { usage: ",setdesc <text>", args: [] },
  vanity: { usage: ",vanity", args: [] },
  vanitylock: { usage: ",vanitylock <on|off|status>", args: [] },
  vanitytransfer: { usage: ",vanitytransfer <code>", args: ["code"] },
  muterole: { usage: ",muterole <@role>", args: [] },
  pingrole: { usage: ",pingrole <@role>", args: [] },
  rolecreate: { usage: ",rolecreate <name> [color]", args: ["name"] },
  roledelete: { usage: ",roledelete <@role>", args: [] },
  rolecolor: { usage: ",rolecolor <@role> <#hex>", args: [] },
  rolehoist: { usage: ",rolehoist <@role>", args: [] },
  rolemention: { usage: ",rolemention <@role>", args: [] },
  roleicon: { usage: ",roleicon <@role> <emoji>", args: [] },
  roleperms: { usage: ",roleperms <@role>", args: [] },
  rolepos: { usage: ",rolepos <@role> <position>", args: [] },
  roleall: { usage: ",roleall", args: [] }, roles: { usage: ",roles", args: [] }, rolelist: { usage: ",roles", args: [] },
  channelcreate: { usage: ",channelcreate <name> [text|voice]", args: ["name"] },
  channeldelete: { usage: ",channeldelete [#channel]", args: [] },
  channelclone: { usage: ",channelclone [#channel]", args: [] },
  channelpos: { usage: ",channelpos [#channel] <position>", args: [] },
  categorycreate: { usage: ",categorycreate <name>", args: ["name"] },
  ticket: { usage: ",ticket <setup|create|close|add|remove>", args: [] },
  cc: { usage: ",cc <add|remove|list>", args: [] },
  alias: { usage: ",alias <add|remove|list>", args: [] },
  disable: { usage: ",disable <command>", args: ["command"] },
  enable: { usage: ",enable <command>", args: ["command"] },
  disabled: { usage: ",disabled", args: [] },
  autorespond: { usage: ",ar <add|remove|list>", args: [] }, ar: { usage: ",ar <add|remove|list>", args: [] },
  reactiontrigger: { usage: ",rt <add|remove|list>", args: [] }, rt: { usage: ",rt <add|remove|list>", args: [] },
  reactionrole: { usage: ",rr <msgId> <emoji> <@role>", args: [] }, rr: { usage: ",rr <msgId> <emoji> <@role>", args: [] },
  sticky: { usage: ",sticky <message|off>", args: [] },
  counter: { usage: ",counter <create|delete|list>", args: [] },
  warnthreshold: { usage: ",warnthreshold <count> <mute|kick|ban>", args: ["count", "action"] },
  warnthresholds: { usage: ",warnthresholds", args: [] },
  birthday: { usage: ",birthday <set|remove|channel|list|today>", args: [] },
  fakeperm: { usage: ",fakeperm <add|remove|list> <@role> <perm>", args: [] },
  ignore: { usage: ",ignore <@user>", args: [] },
  unignore: { usage: ",unignore <@user>", args: [] },
  ignorelist: { usage: ",ignorelist", args: [] },
  staffrole: { usage: ",staffrole <@role>", args: [] },
  blacklist: { usage: ",blacklist <add|remove|list|clear>", args: [] },
  censor: { usage: ",censor <add|remove|list>", args: [] },
  filter: { usage: ",filter <on|off|add|remove|list|...>", args: [] },
  filterexempt: { usage: ",filterexempt <add|remove> <@role|#channel>", args: [] },
  antilinks: { usage: ",antilinks", args: [] },
  antiinvites: { usage: ",antiinvites", args: [] },
  antispam: { usage: ",antispam", args: [] },
  anticaps: { usage: ",anticaps", args: [] },
  antinuke: { usage: ",antinuke <on|off|punishment|threshold|whitelist|status>", args: [] },
  antiraid: { usage: ",antiraid <on|off|action|threshold|window|unlock|status>", args: [] },
  bind: { usage: ",bind staff <@role>", args: [] },
  whitelistcheck: { usage: ",whitelistcheck", args: [] },
  modconfig: { usage: ",modconfig", args: [] },
  // Security
  vcmute: { usage: ",vcmute <user>", args: ["user"] },
  vcunmute: { usage: ",vcunmute <user>", args: ["user"] },
  vcdeafen: { usage: ",vcdeafen <user>", args: ["user"] },
  vcundeafen: { usage: ",vcundeafen <user>", args: ["user"] },
  vckick: { usage: ",vckick <user>", args: ["user"] },
  vcmove: { usage: ",vcmove <user> #channel", args: ["user"] },
  vcmuteall: { usage: ",vcmuteall", args: [] },
  vcunmuteall: { usage: ",vcunmuteall", args: [] },
  vclimit: { usage: ",vclimit #channel <limit>", args: [] },
  vcname: { usage: ",vcname #channel <name>", args: [] },
  vclock: { usage: ",vclock [#channel]", args: [] },
  vcunlock: { usage: ",vcunlock [#channel]", args: [] },
  vcrename: { usage: ",vcrename <name>", args: ["name"] },
  vcinfo: { usage: ",vcinfo [#channel]", args: [] },
  voicelist: { usage: ",voicelist", args: [] }, vc: { usage: ",voicelist", args: [] },
  setbitrate: { usage: ",setbitrate #channel <kbps>", args: [] },
  // Messaging
  say: { usage: ",say <text>", args: ["text"] },
  say2: { usage: ",say2 #channel <text>", args: [] },
  embed: { usage: ",embed <title> | <description>", args: ["title"] },
  announce: { usage: ",announce #channel <message>", args: [] },
  dm: { usage: ",dm <user> <message>", args: ["user", "message"] },
  topic: { usage: ",topic [text]", args: [] },
  rename: { usage: ",rename [#channel] <name>", args: ["name"] },
  pin: { usage: ",pin <messageId>", args: ["messageId"] },
  unpin: { usage: ",unpin <messageId>", args: ["messageId"] },
  pins: { usage: ",pins", args: [] },
  movepin: { usage: ",movepin <messageId> #channel", args: ["messageId"] },
  react: { usage: ",react <messageId> <emoji>", args: ["messageId", "emoji"] },
  unreact: { usage: ",unreact <messageId>", args: ["messageId"] },
  clearreactions: { usage: ",clearreactions <messageId>", args: ["messageId"] },
  editbot: { usage: ",editbot <text>", args: ["text"] },
  deletebot: { usage: ",deletebot", args: [] },
  cleanup: { usage: ",cleanup", args: [] },
  export: { usage: ",export", args: [] },
  copycat: { usage: ",copycat <user> <message>", args: ["user", "message"] },
  nsfw: { usage: ",nsfw", args: [] }, nsfwcheck: { usage: ",nsfwcheck", args: [] },
  archive: { usage: ",archive", args: [] }, unarchive: { usage: ",unarchive", args: [] },
  thread: { usage: ",thread <create|close|open|lock|unlock|rename|add|remove>", args: [] },
  // Fun
  coinflip: { usage: ",coinflip", args: [] }, cf: { usage: ",coinflip", args: [] }, toss: { usage: ",toss", args: [] },
  "8ball": { usage: ",8ball <question>", args: ["question"] },
  roll: { usage: ",roll [sides]", args: [] },
  dice: { usage: ",dice <NdN>", args: [] },
  choose: { usage: ",choose opt1 | opt2 | ...", args: [] },
  decide: { usage: ",decide opt1 | opt2 | ...", args: [] },
  number: { usage: ",number [min] [max]", args: [] },
  yesno: { usage: ",yesno", args: [] },
  poll: { usage: ",poll <question>", args: [] },
  rps: { usage: ",rps <rock|paper|scissors>", args: ["choice"] },
  tictactoe: { usage: ",ttt <@user>", args: [] }, ttt: { usage: ",ttt <@user>", args: [] },
  slots: { usage: ",slots", args: [] },
  numberguess: { usage: ",numberguess", args: [] }, guess: { usage: ",numberguess", args: [] },
  ship: { usage: ",ship [@user1] [@user2]", args: [] },
  rate: { usage: ",rate <thing>", args: ["thing"] },
  pp: { usage: ",pp [user]", args: [] },
  howgay: { usage: ",howgay [user]", args: [] },
  howdumb: { usage: ",howdumb [user]", args: [] },
  hack: { usage: ",hack <user>", args: ["user"] },
  wanted: { usage: ",wanted [user]", args: [] },
  wyr: { usage: ",wyr", args: [] },
  nhie: { usage: ",nhie", args: [] }, neverhaveiever: { usage: ",nhie", args: [] },
  tod: { usage: ",tod", args: [] }, truthordare: { usage: ",tod", args: [] },
  compliment: { usage: ",compliment [user]", args: [] },
  insult: { usage: ",insult [user]", args: [] },
  meme: { usage: ",meme", args: [] },
  joke: { usage: ",joke", args: [] },
  fact: { usage: ",fact", args: [] },
  quote: { usage: ",quote", args: [] },
  catfact: { usage: ",catfact", args: [] }, dogfact: { usage: ",dogfact", args: [] },
  cat: { usage: ",cat", args: [] }, dog: { usage: ",dog", args: [] },
  fox: { usage: ",fox", args: [] }, duck: { usage: ",duck", args: [] }, panda: { usage: ",panda", args: [] },
  team: { usage: ",team <size> @u1 @u2 ...", args: ["size"] },
  shuffle: { usage: ",shuffle item1 | item2 | ...", args: ["items"] },
  countdown: { usage: ",countdown <1-10>", args: ["number"] },
  ascii: { usage: ",ascii <text>", args: ["text"] },
  emojify: { usage: ",emojify <text>", args: ["text"] },
  mock: { usage: ",mock <text>", args: ["text"] },
  leet: { usage: ",leet <text>", args: ["text"] },
  vaporwave: { usage: ",vaporwave <text>", args: ["text"] },
  zalgo: { usage: ",zalgo <text>", args: ["text"] },
  reverse: { usage: ",reverse <text>", args: ["text"] },
  clap: { usage: ",clap <text>", args: ["text"] },
  spoiler: { usage: ",spoiler <text>", args: ["text"] },
  bold: { usage: ",bold <text>", args: ["text"] },
  italic: { usage: ",italic <text>", args: ["text"] },
  strikethrough: { usage: ",strikethrough <text>", args: ["text"] },
  underline: { usage: ",underline <text>", args: ["text"] },
  codeblock: { usage: ",codeblock <text>", args: ["text"] },
  repeat: { usage: ",repeat <n> <text>", args: ["n", "text"] },
  tinytext: { usage: ",tinytext <text>", args: ["text"] },
  uppercase: { usage: ",uppercase <text>", args: ["text"] },
  lowercase: { usage: ",lowercase <text>", args: ["text"] },
  // Economy
  balance: { usage: ",balance [user]", args: [] }, bal: { usage: ",balance [user]", args: [] },
  daily: { usage: ",daily", args: [] },
  weekly: { usage: ",weekly", args: [] },
  monthly: { usage: ",monthly", args: [] },
  work: { usage: ",work", args: [] },
  crime: { usage: ",crime", args: [] },
  rob: { usage: ",rob <user>", args: ["user"] },
  pay: { usage: ",pay <user> <amount>", args: ["user", "amount"] },
  bet: { usage: ",bet <amount>", args: ["amount"] },
  blackjack: { usage: ",blackjack <amount>", args: ["amount"] }, bj: { usage: ",blackjack <amount>", args: ["amount"] },
  richlist: { usage: ",richlist", args: [] },
  give: { usage: ",give <user> <amount>", args: ["user", "amount"] },
  take: { usage: ",take <user> <amount>", args: ["user", "amount"] },
  setbal: { usage: ",setbal <user> <amount>", args: ["user", "amount"] },
  resetbal: { usage: ",resetbal <user>", args: ["user"] },
  shop: { usage: ",shop", args: [] },
  // Leveling
  rank: { usage: ",rank [user]", args: [] },
  leaderboard: { usage: ",leaderboard", args: [] }, lb: { usage: ",leaderboard", args: [] },
  setlevel: { usage: ",setlevel <user> <level>", args: ["user", "level"] },
  resetxp: { usage: ",resetxp <user>", args: ["user"] },
  // Utility
  remind: { usage: ",remind <time> <text>", args: ["time", "text"] }, reminder: { usage: ",remind <time> <text>", args: ["time", "text"] },
  reminders: { usage: ",reminders", args: [] },
  afk: { usage: ",afk [reason]", args: [] },
  afklist: { usage: ",afklist", args: [] },
  removeafk: { usage: ",removeafk <user>", args: ["user"] },
  todo: { usage: ",todo <add|done|remove|list|clear>", args: [] },
  tag: { usage: ",tag <name|create|delete|list|edit|info>", args: [] },
  highlight: { usage: ",hl <add|remove|list|clear>", args: [] }, hl: { usage: ",hl <add|remove|list|clear>", args: [] },
  snipe: { usage: ",snipe", args: [] },
  editsnipe: { usage: ",editsnipe", args: [] }, esnipe: { usage: ",editsnipe", args: [] },
  clearsnipe: { usage: ",clearsnipe", args: [] },
  weather: { usage: ",weather <city>", args: ["city"] },
  math: { usage: ",math <expression>", args: ["expression"] }, calc: { usage: ",calc <expression>", args: ["expression"] },
  urban: { usage: ",urban <word>", args: ["word"] },
  define: { usage: ",define <word>", args: ["word"] },
  translate: { usage: ",translate <lang> <text>", args: ["lang", "text"] },
  qr: { usage: ",qr <text>", args: ["text"] },
  color: { usage: ",color <#hex>", args: ["hex"] },
  hex: { usage: ",hex <color>", args: ["color"] },
  encode: { usage: ",encode <text>", args: ["text"] },
  decode: { usage: ",decode <base64>", args: ["base64"] },
  binary: { usage: ",binary <text>", args: ["text"] },
  timestamp: { usage: ",timestamp [date]", args: [] },
  charinfo: { usage: ",charinfo <text>", args: ["text"] },
  google: { usage: ",google <query>", args: ["query"] },
  youtube: { usage: ",youtube <query>", args: ["query"] }, yt: { usage: ",youtube <query>", args: ["query"] },
  spotify: { usage: ",spotify <query>", args: ["query"] },
  screenshot: { usage: ",screenshot <url>", args: ["url"] },
  password: { usage: ",password [length]", args: [] },
  token: { usage: ",token", args: [] },
  invitebot: { usage: ",invitebot", args: [] },
  support: { usage: ",support", args: [] },
  source: { usage: ",source", args: [] },
  shards: { usage: ",shards", args: [] },
  news: { usage: ",news", args: [] },
  // Last.fm
  np: { usage: ",np [user]", args: [] }, nowplaying: { usage: ",np [user]", args: [] },
  fm: { usage: ",fm <set|unset>", args: [] },
  fmprofile: { usage: ",fmprofile [user]", args: [] }, fmp: { usage: ",fmprofile [user]", args: [] },
  topartists: { usage: ",topartists", args: [] }, ta: { usage: ",topartists", args: [] },
  toptracks: { usage: ",toptracks", args: [] }, tt: { usage: ",toptracks", args: [] },
  topalbums: { usage: ",topalbums", args: [] }, tal: { usage: ",topalbums", args: [] },
  // Booster roles
  boosterrole: { usage: ",boosterrole <create|color|rename|delete|icon>", args: [] },
  // Giveaway
  gcreate: { usage: ",gcreate <time> <prize>", args: ["time", "prize"] }, gstart: { usage: ",gcreate <time> <prize>", args: ["time", "prize"] },
  gend: { usage: ",gend <messageId>", args: ["messageId"] },
  greroll: { usage: ",greroll <messageId>", args: ["messageId"] },
  giveaway: { usage: ",giveaway <list>", args: [] },
  // Webhook
  webhook: { usage: ",webhook <create|delete|list>", args: [] },
  // Emoji
  emojis: { usage: ",emojis", args: [] },
  emoji: { usage: ",emoji <add|remove|rename|list>", args: [] },
  emojiinfo: { usage: ",emojiinfo <emoji>", args: [] },
  stealemoji: { usage: ",stealemoji <emoji> <name>", args: [] },
  deleteemoji: { usage: ",deleteemoji <emoji>", args: [] },
  stickers: { usage: ",stickers", args: [] },
  stickerinfo: { usage: ",stickerinfo <name>", args: [] },
  jumbo: { usage: ",jumbo <emoji>", args: ["emoji"] },
  // Misc
  modstats: { usage: ",modstats", args: [] },
  help: { usage: ",help", args: [] },
  botperms: { usage: ",botperms", args: [] },
  channellist: { usage: ",channellist", args: [] },
  serverage: { usage: ",serverage", args: [] },
  joincount: { usage: ",joincount", args: [] },
  boostcount: { usage: ",boostcount", args: [] },
  onlinecount: { usage: ",onlinecount", args: [] },
  userperms: { usage: ",userperms [user]", args: [] },
  permissions2: { usage: ",permissions2 [user]", args: [] },
  channelpermissions: { usage: ",channelpermissions [user] [#channel]", args: [] },
  guildicon: { usage: ",guildicon", args: [] },
  guildbanner: { usage: ",guildbanner", args: [] },
  guildsplash: { usage: ",guildsplash", args: [] },
  audit: { usage: ",audit", args: [] },
  appeal: { usage: ",appeal <reason>", args: ["reason"] },
  roleaddall: { usage: ",roleaddall <@role>", args: [] },
  roleremoveall: { usage: ",roleremoveall <@role>", args: [] },
  tempchannel: { usage: ",tempchannel <mins> <name>", args: ["mins"] },
  staffrole: { usage: ",staffrole <@role>", args: [] },
  // Owner
  eval: { usage: ",eval <code>", args: ["code"] },
  status: { usage: ",status <online|idle|dnd|invisible>", args: ["status"] },
  activity: { usage: ",activity <type> <text>", args: ["type", "text"] },
  guilds: { usage: ",guilds", args: [] },
  leave: { usage: ",leave", args: [] },
  setmsg: { usage: ",setmsg <boost|unboost|ping> <text>", args: ["type", "text"] },
  viewmsg: { usage: ",viewmsg", args: [] },
  resetvanity: { usage: ",resetvanity <name|all>", args: [] },
  checkall: { usage: ",checkall", args: [] },
  fixuser: { usage: ",fixuser <userId|@user>", args: [] },
  stats: { usage: ",stats", args: [] },
  s: { usage: ",s", args: [] },
  cs: { usage: ",cs", args: [] },
  es: { usage: ",es", args: [] },
  tz: { usage: ",tz [user]", args: [] },
  settz: { usage: ",settz <timezone>", args: ["timezone"] },
  tzlist: { usage: ",tzlist", args: [] },
};

// Track which messages have already been replied to (prevents duplicate responses)

// (global handler removed — see per-handler arg checks below)

// ===== 50 MOST USED COMMANDS =====
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (!message.content.startsWith(",")) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args[0].toLowerCase();
  if (ignoreList.get(message.guild?.id)?.has(message.author.id)) return;
  // Arg check
  const _s = CMD_SCHEMA[command];
  if (_s && _s.args.length > 0 && args.length === 1) {
    return err(message, `missing required argument: **${_s.args[0]}**\nusage: \`${_s.usage}\``);
  }


  // ── MODERATION ──────────────────────────────────────────

  // ,ban <user> [reason]
  if (command === "ban") {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return err(message, "You don't have permission to ban.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    const reason = args.slice(2).join(" ") || "No reason provided";

    // Block banning boosters by role ID (unless owner)
    if (isProtectedBooster(target) && message.author.id !== OWNER_ID) {
      return err(message, `**${target.user.username}** is a booster and cannot be banned.`);
    }

    const banSuccess = await target.ban({ reason }).catch(() => null);
    if (!banSuccess) return err(message, `failed to ban **${target.user.username}** — check my role hierarchy`);
    addCase(message.guild.id, "ban", target.id, message.author.id, reason);
    target.user.send({ embeds: [{ color: PINK, description: `🔨 You have been banned from **${message.guild.name}**\nReason: ${reason}` }] }).catch(() => {});
    return ok(message, `banned **${target.user.username}** | ${reason}`);
  }

  // ,unban <userId>
  if (command === "unban") {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return err(message, "Missing permissions.");
    const userId = args[1];
    if (!userId) return err(message, "missing required argument: **userId**");

    await message.guild.bans.remove(userId).catch(() => null);
    return ok(message, `unbanned user **${userId}**`);
  }

  // ,kick <user> [reason]
  if (command === "kick") {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    // Block action on boosters by role ID (unless owner)
    if (isProtectedBooster(target) && message.author.id !== OWNER_ID) return err(message, `**${target.user.username}** is a booster and cannot be punished.`);
    const reason = args.slice(2).join(" ") || "No reason provided";
    target.send({ embeds: [{ color: PINK, description: `👢 You have been kicked from **${message.guild.name}**\nReason: ${reason}` }] }).catch(() => {});
    const kickSuccess = await target.kick(reason).catch(() => null);
    if (!kickSuccess) return err(message, `failed to kick **${target.user.username}** — check my role hierarchy`);
    addCase(message.guild.id, 'kick', target.id, message.author.id, reason);
    return ok(message, `kicked **${target.user.username}** | ${reason}`);
  }

  // ,mute <user> [duration in minutes] [reason]
  if (command === "mute") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    // Block action on boosters by role ID (unless owner)
    if (isProtectedBooster(target) && message.author.id !== OWNER_ID) return err(message, `**${target.user.username}** is a booster and cannot be punished.`);
    const minutes = parseInt(args[2]) || 10;
    const reason = args.slice(3).join(" ") || "No reason provided";
    const muteResult = await target.timeout(minutes * 60 * 1000, reason).catch(() => null);
    if (!muteResult) return err(message, `failed to mute **${target.user.username}** — check my role hierarchy`);
    target.send({ embeds: [{ color: PINK, description: `🔇 You have been muted in **${message.guild.name}** for **${minutes} minutes**\nReason: ${reason}` }] }).catch(() => {});
    return ok(message, `muted **${target.user.username}** for **${minutes}min** | ${reason}`);
  }

  // ,unmute <user>
  if (command === "unmute") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    await target.timeout(null).catch(() => null);
    return ok(message, `unmuted **${target.user.username}**`);
  }

  // ,purge <amount>
  if (command === "purge" || command === "clear") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const amount = Math.min(parseInt(args[1]) || 10, 100);
    const deleted = await message.channel.bulkDelete(amount + 1, true).catch(() => null);
    const actualCount = deleted ? deleted.size - 1 : amount;
    const msg = await message.channel.send({ embeds: [{ color: PINK, description: `🌸 deleted **${actualCount}** messages` }] });
    setTimeout(() => msg.delete().catch(() => {}), 3000);
  }

  // ,slowmode <seconds>
  if (command === "slowmode") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const seconds = parseInt(args[1]);
    if (isNaN(seconds) && args[1] !== undefined) return err(message, 'invalid slowmode value');
    const secs = isNaN(seconds) ? 0 : seconds;
    await message.channel.setRateLimitPerUser(secs).catch(() => null);
    return ok(message, secs === 0 ? 'slowmode disabled' : `slowmode set to **${secs}s**`);
  }

  // ,lock [channel]
  if (command === "lock") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const channel = message.mentions.channels.first() || message.channel;
    await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }).catch(() => null);
    return ok(message, `locked ${channel}`);
  }

  // ,unlock [channel]
  if (command === "unlock") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const channel = message.mentions.channels.first() || message.channel;
    await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null }).catch(() => null);
    return ok(message, `unlocked ${channel}`);
  }

  // ,hide [channel]
  if (command === "hide") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const channel = message.mentions.channels.first() || message.channel;
    await channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: false }).catch(() => null);
    return ok(message, `hidden ${channel}`);
  }

  // ,unhide [channel]
  if (command === "unhide") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const channel = message.mentions.channels.first() || message.channel;
    await channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: null }).catch(() => null);
    return ok(message, `unhidden ${channel}`);
  }

  // ,hider @role — removes ViewChannel perm for a role from ALL channels/categories/vcs
  if (command === "hider") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const role = message.mentions.roles.first();
    if (!role) return err(message, "missing required argument: **role**\nusage: `,hider @role`");
    await message.channel.sendTyping().catch(() => {});
    const channels = message.guild.channels.cache;
    let count = 0;
    for (const ch of channels.values()) {
      // Check if this channel has an explicit allow for ViewChannel for this role
      const overwrite = ch.permissionOverwrites.cache.get(role.id);
      if (overwrite && overwrite.allow.has(PermissionFlagsBits.ViewChannel)) {
        await ch.permissionOverwrites.edit(role, { ViewChannel: null }).catch(() => {});
        count++;
      }
    }
    if (count === 0) return info(message, `**${role.name}** had no explicit ViewChannel permissions to remove`);
    return ok(message, `removed ViewChannel from **${role.name}** in **${count}** channels`);
  }

  // ,unhider @role — restores ViewChannel perm for a role in ALL channels (resets to default)
  if (command === "unhider") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const role = message.mentions.roles.first();
    if (!role) return err(message, "missing required argument: **role**\nusage: `,unhider @role`");
    await message.channel.sendTyping().catch(() => {});
    const channels = message.guild.channels.cache;
    let count = 0;
    for (const ch of channels.values()) {
      const overwrite = ch.permissionOverwrites.cache.get(role.id);
      if (overwrite) {
        await ch.permissionOverwrites.edit(role, { ViewChannel: null }).catch(() => {});
        count++;
      }
    }
    return ok(message, `reset ViewChannel for **${role.name}** in **${count}** channels`);
  }

  // ,warn <user> <reason>

  // ,nickname <user> <nick>
  if (command === "nickname" || command === "nick") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageNicknames)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    const nick = args.slice(2).join(" ") || null;
    await target.setNickname(nick).catch(() => null);
    return ok(message, `nickname ${nick ? `set to **${nick}**` : "removed"} for **${target.user.username}**`);
  }

  // ── ROLE MANAGEMENT ─────────────────────────────────────

  // ,role add <user> <role>
  // ,role remove <user> <role>
  if (command === "role") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return err(message, "Missing permissions.");
    const action = args[1]?.toLowerCase();
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[2]).catch(() => null);
    const role = message.mentions.roles.first() || message.guild.roles.cache.find(r => r.name.toLowerCase() === args.slice(3).join(" ").toLowerCase());
    if (!target || !role) return err(message, "missing required argument");

    if (action === "add") {
      await target.roles.add(role).catch(() => null);
      return ok(message, `Added **${role.name}** to **${target.user.username}**`);
    } else if (action === "remove") {
      await target.roles.remove(role).catch(() => null);
      return ok(message, `Removed **${role.name}** from **${target.user.username}**`);
    }
    return err(message, "missing required argument");

  }

  // ── INFO COMMANDS ────────────────────────────────────────

  // ,userinfo [user]
  if (command === "userinfo" || command === "ui") {
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null) || message.member;
    const user = target.user;
    const embed = {
      color: target.displayColor || PINK,
      title: `${user.username}`,
      thumbnail: { url: user.displayAvatarURL({ size: 256 }) },
      fields: [
        { name: "ID", value: user.id, inline: true },
        { name: "Nickname", value: target.nickname || "None", inline: true },
        { name: "Joined Server", value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`, inline: true },
        { name: "Account Created", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: `Roles [${target.roles.cache.size - 1}]`, value: target.roles.cache.filter(r => r.id !== message.guild.id).map(r => `<@&${r.id}>`).slice(0, 10).join(", ") || "None" },
      ],
      footer: { text: `Boosting: ${target.premiumSince ? "Yes" : "No"}` }
    };
    return message.reply({ embeds: [embed] });
  }

  // ,serverinfo
  if (command === "serverinfo" || command === "si") {
    const g = message.guild;
    const embed = {
      color: PINK,
      title: g.name,
      thumbnail: { url: g.iconURL({ size: 256 }) },
      fields: [
        { name: "Owner", value: `<@${g.ownerId}>`, inline: true },
        { name: "Members", value: `${g.memberCount}`, inline: true },
        { name: "Channels", value: `${g.channels.cache.size}`, inline: true },
        { name: "Roles", value: `${g.roles.cache.size}`, inline: true },
        { name: "Boosts", value: `${g.premiumSubscriptionCount}`, inline: true },
        { name: "Created", value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
      ]
    };
    return message.reply({ embeds: [embed] });
  }

  // ,avatar [user]
  if (command === "avatar" || command === "av") {
    const target = message.mentions.users.first() || await client.users.fetch(args[1]).catch(() => null) || message.author;
    const embed = {
      color: PINK,
      title: `${target.username}'s Avatar`,
      image: { url: target.displayAvatarURL({ size: 1024 }) }
    };
    return message.reply({ embeds: [embed] });
  }

  // ,roleinfo <role>
  if (command === "roleinfo" || command === "ri") {
    const role = message.mentions.roles.first() || message.guild.roles.cache.find(r => r.name.toLowerCase() === args.slice(1).join(" ").toLowerCase());
    if (!role) return err(message, "missing required argument: **role**");
    const embed = {
      color: role.color || PINK,
      title: role.name,
      fields: [
        { name: "ID", value: role.id, inline: true },
        { name: "Color", value: role.hexColor, inline: true },
        { name: "Members", value: `${role.members.size}`, inline: true },
        { name: "Mentionable", value: `${role.mentionable}`, inline: true },
        { name: "Hoisted", value: `${role.hoist}`, inline: true },
        { name: "Created", value: `<t:${Math.floor(role.createdTimestamp / 1000)}:R>`, inline: true },
      ]
    };
    return message.reply({ embeds: [embed] });
  }

  // ,channelinfo [channel]
  if (command === "channelinfo" || command === "ci") {
    const channel = message.mentions.channels.first() || message.channel;
    const embed = {
      color: PINK,
      title: `#${channel.name}`,
      fields: [
        { name: "ID", value: channel.id, inline: true },
        { name: "Type", value: `${channel.type}`, inline: true },
        { name: "Created", value: `<t:${Math.floor(channel.createdTimestamp / 1000)}:R>`, inline: true },
        { name: "Topic", value: channel.topic || "None" },
      ]
    };
    return message.reply({ embeds: [embed] });
  }

  // ,botinfo
  if (command === "botinfo") {
    const embed = {
      color: PINK,
      title: client.user.username,
      thumbnail: { url: client.user.displayAvatarURL() },
      fields: [
        { name: "Servers", value: `${client.guilds.cache.size}`, inline: true },
        { name: "Uptime", value: `${Math.floor(process.uptime() / 60)} minutes`, inline: true },
        { name: "Ping", value: `${client.ws.ping}ms`, inline: true },
      ]
    };
    return message.reply({ embeds: [embed] });
  }

  // ,ping
  if (command === "ping") {
    return info(message, `Pong! **${client.ws.ping}ms**`);
  }

  // ,membercount
  if (command === "membercount" || command === "mc") {
    return info(message, `**${message.guild.memberCount}** members`);
  }

  // ── FUN COMMANDS ─────────────────────────────────────────

  // ,coinflip
  if (command === "coinflip" || command === "cf") {
    return info(message, `**${Math.random() < 0.5 ? "Heads" : "Tails"}!**`);
  }

  // ,8ball <question>
  if (command === "8ball") {
    const responses = ["Yes.", "No.", "Definitely.", "Absolutely not.", "Maybe.", "Ask again later.", "Without a doubt.", "Very doubtful.", "Signs point to yes.", "Don't count on it."];
    return info(message, responses[Math.floor(Math.random() * responses.length)]);
  }

  // ,roll [sides]
  if (command === "roll") {
    const sides = parseInt(args[1]) || 6;
    return info(message, `You rolled a **${Math.floor(Math.random() * sides) + 1}** (d${sides})`);
  }

  // ,choose <option1> | <option2> | ...
  if (command === "choose") {
    const options = args.slice(1).join(" ").split("|").map(o => o.trim()).filter(Boolean);
    if (options.length < 2) return err(message, "missing required argument");

    return info(message, `I choose: **${options[Math.floor(Math.random() * options.length)]}**`);
  }

  // ,poll <question>
  if (command === "poll") {
    const question = args.slice(1).join(" ");
    if (!question) return err(message, "missing required argument");

    const embed = { color: PINK, title: "📊 Poll", description: question, footer: { text: `Asked by ${message.author.username}` } };
    const msg = await message.channel.send({ embeds: [embed] });
    await msg.react("👍");
    await msg.react("👎");
    message.delete().catch(() => {});
  }

  // ,say <text>
  if (command === "say") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const text = args.slice(1).join(" ");
    if (!text) return err(message, "missing required argument");

    message.delete().catch(() => {});
    return message.channel.send(text);
  }

  // ,embed <title> | <description>
  if (command === "embed") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const parts = args.slice(1).join(" ").split("|");
    const title = parts[0]?.trim();
    const description = parts[1]?.trim();
    if (!title) return err(message, "missing required argument");

    message.delete().catch(() => {});
    return message.channel.send({ embeds: [{ color: PINK, title, description }] });
  }

  // ── UTILITY ──────────────────────────────────────────────

  // ,announce <#channel> <message>
  if (command === "announce") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const channel = message.mentions.channels.first();
    if (!channel) return err(message, "missing required argument");

    const text = args.slice(2).join(" ");
    if (!text) return err(message, "Please provide a message.");
    const sent = await channel.send({ embeds: [{ color: PINK, description: text, footer: { text: `announced by ${message.author.username}` }, timestamp: new Date() }] }).catch(() => null);
    if (!sent) return err(message, `failed to send to ${channel}`);
    return ok(message, `announced in ${channel}`);
  }

  // ,dm <user> <message>
  if (command === "dm") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const target = message.mentions.users.first() || await client.users.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    const text = args.slice(2).join(" ");
    if (!text) return err(message, "Please provide a message.");
    await target.send(`📨 Message from **${message.guild.name}**:\n${text}`).catch(() => null);
    return ok(message, `DM sent to **${target.username}**`);
  }

  // ,topic <text>
  if (command === "topic") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const topic = args.slice(1).join(" ") || null;
    await message.channel.setTopic(topic).catch(() => null);
    return ok(message, `channel topic ${topic ? `set to: **${topic}**` : "cleared"}`);
  }

  // ,rename <#channel> <name>
  if (command === "rename") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const channel = message.mentions.channels.first() || message.channel;
    const name = args.slice(message.mentions.channels.first() ? 2 : 1).join("-").toLowerCase();
    if (!name) return err(message, "missing required argument");

    await channel.setName(name).catch(() => null);
    return ok(message, `Renamed channel to **${name}**`);
  }

  // ,nuke
  if (command === "nuke") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    await confirm(message,
      `Are you sure you want to **nuke** this channel?\n\nThis action is **irreversable** and will delete the channel!`,
      async () => {
        const channel = message.channel;
        const newChannel = await channel.clone().catch(() => null);
        if (newChannel) {
          await newChannel.setPosition(channel.position);
          await channel.delete().catch(() => null);
          newChannel.send({ embeds: [{ color: PINK, description: "💥 Channel has been nuked." }] });
        }
      }
    );
  }

  // ,setprefix — note: this bot uses , hardcoded, just inform user
  if (command === "setprefix") {
    return info(message, "This bot uses `,` as a fixed prefix.");
  }

  // ,inviteinfo <invite code>
  if (command === "inviteinfo") {
    const code = args[1];
    if (!code) return err(message, "missing required argument");

    const invite = await client.fetchInvite(code).catch(() => null);
    if (!invite) return err(message, "Invalid invite.");
    const embed = {
      color: PINK,
      title: `Invite: ${code}`,
      fields: [
        { name: "Server", value: invite.guild?.name || "Unknown", inline: true },
        { name: "Inviter", value: invite.inviter?.username || "Unknown", inline: true },
        { name: "Uses", value: `${invite.uses ?? "?"}`, inline: true },
        { name: "Channel", value: invite.channel?.name || "Unknown", inline: true },
      ]
    };
    return message.reply({ embeds: [embed] });
  }

  // ,bans — list all bans
  if (command === "bans") {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return err(message, "Missing permissions.");
    const bans = await message.guild.bans.fetch().catch(() => null);
    if (!bans || bans.size === 0) return ok(message, "No banned users.");
    const list = bans.map(b => `${b.user.username} — ${b.reason || "No reason"}`).slice(0, 20).join("\n");
    return message.reply({ embeds: [{ color: PINK, title: `Banned Users (${bans.size})`, description: `\`\`\`${list}\`\`\`` }] });
  }

  // ,banlist (alias)
  if (command === "banlist") {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return err(message, "Missing permissions.");
    const bans = await message.guild.bans.fetch().catch(() => null);
    if (!bans || bans.size === 0) return ok(message, "No banned users.");
    const list = bans.map(b => `${b.user.username} — ${b.reason || "No reason"}`).slice(0, 20).join("\n");
    return message.reply({ embeds: [{ color: PINK, title: `Banned Users (${bans.size})`, description: `\`\`\`${list}\`\`\`` }] });
  }

  // ,help
  if (command === "help") {
    const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require("discord.js");

    const categories = {
      moderation: {
        label: "Moderation",
        emoji: "🛡️",
        description: "Ban, kick, mute, jail and more",
        commands: [
          [",ban <user> [reason]", "Ban a user from the server"],
          [",unban <userId>", "Unban a user"],
          [",kick <user> [reason]", "Kick a user"],
          [",mute <user> [mins] [reason]", "Mute a user"],
          [",unmute <user>", "Unmute a user"],
          [",timeout <user> <time> [reason]", "Timeout a user (e.g. 10m, 1h)"],
          [",untimeout <user>", "Remove timeout"],
          [",tempban <user> <mins> [reason]", "Temporarily ban a user"],
          [",softban <user> [reason]", "Ban then unban (clears messages)"],
          [",hardban <user> [reason]", "Permanent ban with message deletion"],
          [",hackban <userId> [reason]", "Ban a user not in the server"],
          [",massban <id1> <id2> ...", "Ban multiple users at once"],
          [",masskick @u1 @u2 ...", "Kick multiple users"],
          [",warn <user> <reason>", "Warn a user"],
          [",warnings <user>", "View user warnings"],
          [",clearwarns <user>", "Clear all warnings"],
          [",delwarn <user> <#>", "Delete a specific warning"],
          [",jail <user> [reason]", "Jail a user"],
          [",unjail <user>", "Unjail a user"],
          [",imute <user>", "Image mute a user"],
          [",iunmute <user>", "Remove image mute"],
          [",reactionmute <user>", "Reaction mute a user"],
          [",reactionunmute <user>", "Remove reaction mute"],
          [",strip <user>", "Remove all roles from user"],
          [",purge <amount>", "Delete messages"],
          [",purge bots/images/links/user/contains ...", "Filtered purge"],
          [",lock [#channel]", "Lock a channel"],
          [",unlock [#channel]", "Unlock a channel"],
          [",hide [#channel]", "Hide a channel"],
          [",unhide [#channel]", "Unhide a channel"],
          [",lockall", "Lock all channels"],
          [",unlockall", "Unlock all channels"],
          [",lockdown [reason]", "Full server lockdown"],
          [",unlockdown", "Lift lockdown"],
          [",slowmode <secs>", "Set slowmode"],
          [",slowmodeall <secs>", "Set slowmode in all channels"],
          [",nuke", "Clone and delete a channel"],
          [",nick <user> <name>", "Change a user's nickname"],
          [",resetnick <user>", "Reset nickname"],
          [",dehoist", "Remove hoisted characters"],
          [",decancer <user>", "Clean special chars from nick"],
          [",role add/remove <user> <role>", "Add or remove a role"],
          [",temprole <user> <role> <time>", "Give a role temporarily"],
          [",massrole add/remove <role>", "Add/remove role from everyone"],
          [",massnick <nick>", "Set nickname for everyone"],
          [",banwave", "Ban all users who joined in last 5 min"],
          [",prune <days>", "Kick inactive members"],
          [",dehoist / ,dehoistall", "Dehoist member nicknames"],
        ]
      },
      security: {
        label: "Security",
        emoji: "🔒",
        description: "AntiNuke, AntiRaid, AutoMod",
        commands: [
          [",antinuke on/off", "Enable/disable AntiNuke"],
          [",antinuke punishment <ban|kick|strip>", "Set punishment"],
          [",antinuke threshold <n>", "Set action threshold"],
          [",antinuke whitelist <user>", "Whitelist a user"],
          [",antinuke status", "View AntiNuke config"],
          [",antiraid on/off", "Enable/disable AntiRaid"],
          [",antiraid action <ban|kick|mute>", "Set raid action"],
          [",antiraid threshold <n>", "Set join threshold"],
          [",antiraid window <secs>", "Set detection window"],
          [",antiraid unlock", "Manually unlock server"],
          [",antiraid status", "View AntiRaid config"],
          [",vanitylock on/off/status", "Lock your vanity URL"],
          [",vanitytransfer <code>", "Transfer a vanity URL"],
          [",filter on/off", "Toggle AutoMod filter"],
          [",filter add/remove <word>", "Add/remove banned word"],
          [",filter links/invites/caps/spam/mentions", "Toggle filter types"],
          [",filter status", "View filter config"],
          [",blacklist add/remove/list/clear <word>", "Word blacklist"],
          [",antilinks / ,antiinvites", "Toggle link/invite filter"],
          [",antispam / ,anticaps", "Toggle spam/caps filter"],
          [",filterexempt add/remove @role/#channel", "Exempt from filter"],
          [",bind staff <role>", "Set a staff role"],
          [",fakeperm add/remove/list <role> <perm>", "Fake permissions"],
          [",ignore <user>", "Bot ignores all cmds from user"],
          [",ignorelist", "List ignored users"],
        ]
      },
      info: {
        label: "Information",
        emoji: "📊",
        description: "User, server, role info and more",
        commands: [
          [",userinfo [user]", "Detailed user information"],
          [",serverinfo", "Server information"],
          [",avatar [user]", "Get user avatar"],
          [",banner [user]", "Get user banner"],
          [",roleinfo <role>", "Role information"],
          [",channelinfo [#channel]", "Channel information"],
          [",botinfo", "Bot information"],
          [",ping", "Bot latency"],
          [",uptime", "Bot uptime"],
          [",membercount", "Server member count"],
          [",bans", "List all bans"],
          [",baninfo <userId>", "Info on a ban"],
          [",inviteinfo <code>", "Invite information"],
          [",invites [user]", "User invite count"],
          [",listinvites", "List all invites"],
          [",createinvite [maxUses] [hours]", "Create invite"],
          [",whois [user]", "Detailed member info"],
          [",memberinfo [user]", "Member information"],
          [",newmembers [n]", "Recently joined members"],
          [",oldmembers [n]", "Oldest members"],
          [",inrole <role>", "Members with a role"],
          [",boosters", "List server boosters"],
          [",servericon", "Server icon"],
          [",serverbanner", "Server banner"],
          [",serverstats", "Detailed server stats"],
          [",onlinecount", "Online member counts"],
          [",admins", "List server admins"],
          [",mods", "List moderators"],
          [",bots", "List bots"],
          [",stafflist", "List all staff"],
          [",find <query>", "Search members by name"],
          [",rolecount <role>", "Members in a role"],
          [",id [user/role/channel]", "Get a Discord ID"],
          [",snowflake <id>", "Decode Discord snowflake"],
          [",discrim <0000>", "Find users by discriminator"],
          [",permissions [user]", "Check permissions"],
          [",shared [userId]", "Mutual servers"],
          [",joined [user]", "When user joined"],
          [",created [user]", "Account creation date"],
          [",accountage [user]", "Account age"],
          [",serverage", "How old the server is"],
          [",serverfeatures", "Server feature flags"],
          [",boostgoal", "Boost tier progress"],
          [",vanity", "Server vanity URL"],
          [",modlogs [user]", "Recent mod actions"],
          [",history <user>", "User mod history"],
          [",cases <user>", "User mod cases"],
          [",case <id>", "View a mod case"],
          [",audit", "Recent audit log"],
        ]
      },
      config: {
        label: "Server Config",
        emoji: "⚙️",
        description: "Setup, welcome, roles, tickets...",
        commands: [
          [",setup", "Create jail/log channels & roles"],
          [",setupmute", "Create muted roles"],
          [",autorole <@role|off>", "Set autorole for new members"],
          [",welcome #channel <msg>", "Set welcome message"],
          [",goodbye #channel <msg>", "Set goodbye message"],
          [",starboard #channel [threshold]", "Setup starboard"],
          [",bumpchannel #channel", "Set bump reminder channel"],
          [",jointocreate #vc", "Setup Join to Create VC"],
          [",confessions #channel", "Setup confessions channel"],
          [",modlog #channel", "Set mod log channel"],
          [",messagelog #channel", "Log deleted/edited messages"],
          [",joinlog #channel", "Log joins and leaves"],
          [",voicelog #channel", "Log voice activity"],
          [",log <event> #channel", "Configure specific log events"],
          [",verification <level>", "Set verification level"],
          [",contentfilter <level>", "Set content filter"],
          [",setname <name>", "Rename the server"],
          [",setdesc <text>", "Set server description"],
          [",serverrules rule1 | rule2", "Post server rules"],
          [",muterole <@role>", "Set custom mute role"],
          [",pingrole <@role>", "Toggle role mentionable"],
          [",rolecreate <name> [color]", "Create a role"],
          [",roledelete <@role>", "Delete a role"],
          [",rolecolor <@role> <hex>", "Change role color"],
          [",rolehoist <@role>", "Toggle role hoist"],
          [",rolemention <@role>", "Toggle role mentionable"],
          [",rolepos <@role> <pos>", "Change role position"],
          [",channelcreate <name> [text|voice]", "Create a channel"],
          [",channeldelete [#channel]", "Delete a channel"],
          [",channelclone [#channel]", "Clone a channel"],
          [",categorycreate <name>", "Create a category"],
          [",ticket setup/create/close/add/remove", "Ticket system"],
          [",cc add/remove/list", "Custom commands"],
          [",alias add/remove/list", "Command aliases"],
          [",disable/enable <command>", "Disable a command"],
          [",autorespond add/remove/list", "Auto responders"],
          [",reactiontrigger add/remove/list", "Reaction triggers"],
          [",reactionrole <msgId> <emoji> <@role>", "Reaction roles"],
          [",sticky <message|off>", "Sticky message"],
          [",counter create/delete/list", "Member counters"],
          [",warnthreshold <n> <action>", "Auto punish on warns"],
          [",birthday channel #channel", "Birthday announcements"],
          [",antinuke / ,antiraid / ,vanitylock", "Security systems"],
        ]
      },
      economy: {
        label: "Economy",
        emoji: "💰",
        description: "Coins, gambling, work and more",
        commands: [
          [",balance [user]", "Check coin balance"],
          [",daily", "Claim daily reward (500 coins)"],
          [",weekly", "Claim weekly reward (2500 coins)"],
          [",monthly", "Claim monthly reward (10000 coins)"],
          [",work", "Work to earn coins (1h cooldown)"],
          [",crime", "Commit a crime for coins (risky)"],
          [",rob <user>", "Rob another user"],
          [",pay <user> <amount>", "Pay someone coins"],
          [",bet <amount>", "Coinflip for coins"],
          [",blackjack <amount>", "Play blackjack"],
          [",slots", "Spin the slot machine"],
          [",dice <NdN>", "Roll dice (e.g. 2d6)"],
          [",richlist", "Top 10 richest users"],
          [",give <user> <amount>", "Admin: give coins"],
          [",take <user> <amount>", "Admin: take coins"],
          [",setbal <user> <amount>", "Admin: set balance"],
          [",resetbal <user>", "Admin: reset balance"],
        ]
      },
      fun: {
        label: "Fun",
        emoji: "🎮",
        description: "Games, generators and more",
        commands: [
          [",coinflip", "Flip a coin"],
          [",8ball <question>", "Ask the magic 8ball"],
          [",roll [sides]", "Roll a dice"],
          [",dice <NdN>", "Roll multiple dice"],
          [",choose opt1 | opt2 | ...", "Choose between options"],
          [",decide opt1 | opt2 | ...", "Let the bot decide"],
          [",number <min> <max>", "Random number"],
          [",yesno", "Random yes or no"],
          [",poll <question>", "Create a quick poll"],
          [",poll create q | opt1 | opt2", "Advanced poll with options"],
          [",rps <rock|paper|scissors>", "Rock paper scissors"],
          [",ttt <@user>", "Tic tac toe"],
          [",slots", "Slot machine"],
          [",numberguess", "Number guessing game"],
          [",ship [@u1] [@u2]", "Ship two users"],
          [",rate <thing>", "Rate something"],
          [",pp [user]", "Check pp size"],
          [",howgay [user]", "How gay are you"],
          [",howdumb [user]", "How dumb are you"],
          [",hack <user>", "Fake hack someone"],
          [",wanted [user]", "Wanted poster"],
          [",wyr", "Would you rather"],
          [",nhie", "Never have I ever"],
          [",tod", "Truth or dare"],
          [",compliment [user]", "Send a compliment"],
          [",insult [user]", "Silly insult"],
          [",meme", "Random meme"],
          [",joke", "Random joke"],
          [",fact", "Random fact"],
          [",quote", "Random quote"],
          [",catfact / ,dogfact", "Animal facts"],
          [",cat / ,dog / ,fox / ,duck / ,panda", "Animal images"],
          [",team <size> @u1 @u2 ...", "Split into teams"],
          [",shuffle item1 | item2", "Shuffle items"],
          [",countdown <n>", "Countdown in chat"],
          [",ascii <text>", "ASCII text"],
          [",emojify <text>", "Emojify text"],
          [",mock <text>", "SpOnGeBoB mock text"],
          [",leet <text>", "L33t speak"],
          [",vaporwave <text>", "Vaporwave text"],
          [",zalgo <text>", "Zalgo text"],
          [",reverse <text>", "Reverse text"],
          [",clap <text>", "Add 👏 claps"],
        ]
      },
      utility: {
        label: "Utility",
        emoji: "🔧",
        description: "Useful tools and helpers",
        commands: [
          [",remind <time> <text>", "Set a reminder (e.g. 30m, 1h)"],
          [",reminders", "View your reminders"],
          [",afk [reason]", "Set AFK status"],
          [",todo add/done/remove/list", "Personal todo list"],
          [",tag create/delete/list/<name>", "Server tags"],
          [",highlight add/remove/list <word>", "Word highlights"],
          [",snipe", "Snipe last deleted message"],
          [",editsnipe", "Snipe last edited message"],
          [",pin/unpin <messageId>", "Pin/unpin a message"],
          [",pins", "List pinned messages count"],
          [",weather <city>", "Weather info"],
          [",math / ,calc <expr>", "Calculate an expression"],
          [",urban <word>", "Urban Dictionary"],
          [",define <word>", "Dictionary definition"],
          [",translate <lang> <text>", "Translate text"],
          [",qr <text>", "Generate QR code"],
          [",color <#hex>", "Color info"],
          [",encode/decode <text>", "Base64 encode/decode"],
          [",binary <text>", "Text to binary"],
          [",timestamp [date]", "Discord timestamp"],
          [",charinfo <text>", "Unicode character info"],
          [",google/youtube/spotify <query>", "Search links"],
          [",password [length]", "Generate secure password"],
          [",token", "Generate random token"],
          [",invitebot", "Get bot invite link"],
          [",copycat <user> <msg>", "Send message as user"],
          [",say / ,say2 #channel <msg>", "Say something"],
          [",embed <title> | <desc>", "Send an embed"],
          [",announce #channel <msg>", "Announce a message"],
          [",react <msgId> <emoji>", "React to a message"],
          [",export", "Export last 100 chat messages"],
          [",nsfwcheck / ,nsfw", "Check/toggle NSFW"],
          [",firstmessage", "Jump to first message"],
          [",serverage / ,accountage", "Age info"],
          [",news", "Discord status"],
          [",source", "Bot tech info"],
        ]
      },
      lastfm: {
        label: "Last.fm",
        emoji: "🎵",
        description: "Music tracking with Last.fm",
        commands: [
          [",fm set <username>", "Link your Last.fm account"],
          [",fm unset", "Unlink Last.fm"],
          [",np [user]", "Now playing / last track"],
          [",fmprofile [user]", "Last.fm profile stats"],
          [",topartists", "Your top artists"],
          [",toptracks", "Your top tracks"],
          [",topalbums", "Your top albums"],
        ]
      },
      leveling: {
        label: "Leveling",
        emoji: "📈",
        description: "XP and level system",
        commands: [
          [",rank [user]", "View your rank and XP"],
          [",leaderboard", "Server XP leaderboard"],
          [",setlevel <user> <level>", "Admin: set user level"],
          [",resetxp <user>", "Admin: reset user XP"],
        ]
      },
      nsfw: {
        label: "NSFW (Owner Only)",
        emoji: "🔞",
        description: "Anti-minors system — owner only",
        commands: [
          [",addc #channel", "Add channel to minor monitoring"],
          [",delc #channel", "Remove channel from monitoring"],
          [",list", "Show all monitored channels & config"],
          [",reqattach #channel", "Require media — deletes text-only messages"],
          [",unreqattach #channel", "Remove media requirement"],
          [",modr @role", "Role pinged on minor detections"],
          [",logs #channel", "Channel where minor warnings are sent"],
          ["", ""],
          ["Detection:", ""],
          ["• Ages 10–17", "Deleted + warning logged"],
          ["• Reversed bypass (61 reversed)", "Deleted + warning logged"],
          ["• Emoji numbers (1️⃣5️⃣)", "Normalized + detected"],
          ["• underage / minor / still in hs", "Instant flag"],
          ["• No 18+ age mentioned", "Silently deleted"],
          ["• Suspiciously high age (99m)", "Flagged as bypass"],
        ]
      }
    };

    const { StringSelectMenuBuilder: SMB, StringSelectMenuOptionBuilder: SMOB } = require("discord.js");

    const selectMenu = new ActionRowBuilder().addComponents(
      new SMB()
        .setCustomId("help_category")
        .setPlaceholder("Choose a category...")
        .addOptions(
          Object.entries(categories)
            .filter(([key]) => key !== 'nsfw' || message.author.id === OWNER_ID)
            .map(([key, cat]) =>
              new SMOB()
                .setLabel(cat.label)
                .setDescription(cat.description)
                .setValue(key)
                .setEmoji(cat.emoji)
            )
        )
    );

    const mainEmbed = {
      color: PINK,
      author: { name: message.guild.name, icon_url: message.guild.iconURL() },
      title: "Command Help",
      description: [
        "**information**",
        "[ ] = optional, < > = required",
        "",
        "**Invite**",
        `[invite](https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot) • [support](https://discord.gg/) • view on web`,
        "",
        "Select a category from the dropdown menu below to view commands."
      ].join("\n"),
      thumbnail: { url: client.user.displayAvatarURL() },
      footer: { text: `${client.user.username} • ${Object.values(categories).reduce((a, c) => a + c.commands.length, 0)}+ commands` }
    };

    const msg = await message.reply({ embeds: [mainEmbed], components: [selectMenu] });

    // Single collector handles BOTH select menu and nav buttons
    let currentCategory = null;
    let currentPage = 0;
    let currentPages = [];

    function buildCatEmbed(cat, p) {
      return {
        color: PINK,
        author: { name: `${cat.emoji} ${cat.label}`, icon_url: message.guild.iconURL() },
        description: currentPages[p].map(([cmd, desc]) => `\`${cmd}\`\n${desc}`).join("\n\n"),
        footer: { text: `Page ${p + 1}/${currentPages.length} • ${cat.commands.length} commands` }
      };
    }

    function buildNavRow(p) {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("help_back").setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
        new ButtonBuilder().setCustomId("help_home").setLabel("Home").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("help_next").setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(p >= currentPages.length - 1)
      );
    }

    const collector = msg.createMessageComponentCollector({ filter: () => true });

    collector.on("collect", async i => {
      try {
        if (i.user.id !== message.author.id) {
          return i.reply({ embeds: [{ color: PINK, description: "✖ This menu belongs to someone else." }], ephemeral: true });
        }
        // Handle select menu
        if (i.isStringSelectMenu()) {
          const cat = categories[i.values[0]];
          if (!cat) return;
          currentCategory = cat;
          currentPage = 0;
          currentPages = [];
          const PER_PAGE = 10;
          for (let p = 0; p < cat.commands.length; p += PER_PAGE) {
            currentPages.push(cat.commands.slice(p, p + PER_PAGE));
          }
          await i.update({
            embeds: [buildCatEmbed(cat, 0)],
            components: currentPages.length > 1 ? [buildNavRow(0), selectMenu] : [selectMenu]
          });
          return;
        }
        // Handle buttons
        if (i.isButton()) {
          if (i.customId === "help_home") {
            currentCategory = null;
            currentPage = 0;
            currentPages = [];
            return await i.update({ embeds: [mainEmbed], components: [selectMenu] });
          }
          if (!currentCategory) return;
          if (i.customId === "help_back" && currentPage > 0) currentPage--;
          if (i.customId === "help_next" && currentPage < currentPages.length - 1) currentPage++;
          await i.update({
            embeds: [buildCatEmbed(currentCategory, currentPage)],
            components: [buildNavRow(currentPage), selectMenu]
          });
        }
      } catch (e) {
        msg.edit({ components: [] }).catch(() => {});
      }
    });
    return;
  }
});

// ===== EXTENDED COMMANDS =====
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(",")) return;
  const args = message.content.slice(1).trim().split(/ +/);
  const command = args[0].toLowerCase();
  if (ignoreList.get(message.guild?.id)?.has(message.author.id)) return;


  // ── ADVANCED MODERATION ─────────────────────────────────

  // ,tempban <user> <minutes> [reason]
  if (command === "tempban") {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    // Block action on boosters by role ID (unless owner)
    if (isProtectedBooster(target) && message.author.id !== OWNER_ID) return err(message, `**${target.user.username}** is a booster and cannot be punished.`);
    const minutes = parseInt(args[2]) || 60;
    const reason = args.slice(3).join(" ") || "Temporary ban";
    await target.ban({ reason }).catch(() => null);
    ok(message, `✅ Tempbanned **${target.user.username}** for ${minutes} minutes | ${reason}`);
    setTimeout(async () => {
      await message.guild.bans.remove(target.id).catch(() => {});
      message.channel.send(`🔓 **${target.user.username}**'s tempban has expired.`).catch(() => {});
    }, minutes * 60 * 1000);
  }

  // ,softban <user> [reason] — ban then immediately unban to delete messages
  if (command === "softban") {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    // Block action on boosters by role ID (unless owner)
    if (isProtectedBooster(target) && message.author.id !== OWNER_ID) return err(message, `**${target.user.username}** is a booster and cannot be punished.`);
    const reason = args.slice(2).join(" ") || "Softban";
    recentBoosters.delete(target.id);
    await target.ban({ reason, deleteMessageSeconds: 604800 }).catch(() => null);
    await message.guild.bans.remove(target.id).catch(() => null);
    return ok(message, `softbanned **${target.user.username}** (messages deleted) | ${reason}`);
  }

  // ,hardban <user> [reason] — ban + blacklist (stored in memory)
  if (command === "hardban") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    // Block action on boosters by role ID (unless owner)
    if (isProtectedBooster(target) && message.author.id !== OWNER_ID) return err(message, `**${target.user.username}** is a booster and cannot be punished.`);
    const reason = args.slice(2).join(" ") || "Hardban";
    recentBoosters.delete(target.id);
    await target.ban({ reason, deleteMessageSeconds: 604800 }).catch(() => null);
    addCase(message.guild.id, 'hardban', target.id, message.author.id, reason);
    return ok(message, `hardbanned **${target.user.username}** | ${reason}`);
  }

  // ,jail <user> [reason]
  if (command === "jail") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    // Block action on boosters by role ID (unless owner)
    if (isProtectedBooster(target) && message.author.id !== OWNER_ID) return err(message, `**${target.user.username}** is a booster and cannot be punished.`);
    const reason = args.slice(2).join(" ") || "No reason";
    const jailRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === "jailed");
    if (!jailRole) return err(message, "No role named `jailed` found. Create it first.");
    await target.roles.add(jailRole).catch(() => null);
    try { await target.user.send(`🔒 You have been jailed in **${message.guild.name}**: ${reason}`); } catch {}
    return ok(message, `jailed **${target.user.username}** | ${reason}`);
  }

  // ,unjail <user>
  if (command === "unjail") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    const jailRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === "jailed");
    if (!jailRole) return err(message, "No role named `jailed` found.");
    await target.roles.remove(jailRole).catch(() => null);
    return ok(message, `unjailed **${target.user.username}**`);
  }

  // ,imute <user> [reason] — image mute
  if (command === "imute") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === "image muted");
    if (!role) return err(message, "No role named `image muted` found.");
    await target.roles.add(role).catch(() => null);
    return ok(message, `image muted **${target.user.username}**`);
  }

  // ,iunmute <user>
  if (command === "iunmute") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === "image muted");
    if (!role) return err(message, "No role named `image muted` found.");
    await target.roles.remove(role).catch(() => null);
    return ok(message, `Image unmuted **${target.user.username}**`);
  }

  // ,strip <user> — removes all roles
  if (command === "strip") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    // Block action on boosters by role ID (unless owner)
    if (isProtectedBooster(target) && message.author.id !== OWNER_ID) return err(message, `**${target.user.username}** is a booster and cannot be punished.`);
    const roles = target.roles.cache.filter(r => r.id !== message.guild.id && r.position < message.guild.members.me.roles.highest.position);
    let stripped = 0;
    for (const role of roles.values()) { await target.roles.remove(role).catch(() => {}); stripped++; }
    return ok(message, `stripped **${stripped}** roles from **${target.user.username}**`);
  }

  // ,warnings <user>
  if (command === "warnings" || command === "warns") {
    const target = message.mentions.users.first() || await client.users.fetch(args[1]).catch(() => null) || message.author;
    const key = `${message.guild.id}-${target.id}`;
    const list = warns.get(key) || [];
    if (list.length === 0) return ok(message, `**${target.username}** has no warnings.`);
    const embed = {
      color: PINK,
      title: `⚠️ Warnings for ${target.username}`,
      description: list.map((w, i) => `**${i + 1}.** ${w.reason} — by ${w.mod} (${w.date})`).join("\n")
    };
    return message.reply({ embeds: [embed] });
  }

  // ,clearwarns <user>
  if (command === "clearwarns") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.users.first() || await client.users.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    warns.delete(`${message.guild.id}-${target.id}`);
    return ok(message, `Cleared all warnings for **${target.username}**`);
  }

  // ,delwarn <user> <index>
  if (command === "delwarn") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.users.first() || await client.users.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    const index = parseInt(args[2]) - 1;
    const key = `${message.guild.id}-${target.id}`;
    const list = warns.get(key) || [];
    if (index < 0 || index >= list.length) return err(message, "Invalid warning number.");
    list.splice(index, 1);
    warns.set(key, list);
    return ok(message, `Deleted warning **#${index + 1}** for **${target.username}**`);
  }

  // ,case <number> — show a moderation case from audit logs

  // ── WARN (update existing to store) ─────────────────────
  // (overrides the one in 50 commands to actually store warns)
  if (command === "warn") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.users.first() || await client.users.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    const reason = args.slice(2).join(" ") || "No reason provided";
    const key = `${message.guild.id}-${target.id}`;
    const list = warns.get(key) || [];
    list.push({ reason, mod: message.author.username, date: new Date().toLocaleDateString() });
    warns.set(key, list);
    ok(message, `warned **${target.username}** (${list.length} warns) | ${reason}`);
    target.send({ embeds: [{ color: PINK, title: "⚠️ Warning", description: `You have been warned in **${message.guild.name}**\nReason: ${reason}`, footer: { text: `Warn #${list.length}` } }] }).catch(() => {});
    return;
  }

  // ── LEVELING ─────────────────────────────────────────────

  // ,leveling <on|off|status>
  if (command === "leveling" || command === "levels") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const sub = args[1]?.toLowerCase();
    if (sub === "on" || sub === "enable") {
      levelingEnabled.set(message.guild.id, true);
      saveAllConfigs();
      return ok(message, "leveling system **enabled** — XP will now be tracked.");
    }
    if (sub === "off" || sub === "disable") {
      levelingEnabled.set(message.guild.id, false);
      saveAllConfigs();
      return ok(message, "leveling system **disabled**.");
    }
    const enabled = levelingEnabled.get(message.guild.id) || false;
    return info(message, `leveling is currently **${enabled ? "enabled" : "disabled"}** — use \`,leveling on/off\` to toggle.`);
  }

  // ,rank [user]
  if (command === "rank") {
    const target = message.mentions.members.first() || message.member;
    const key = `${message.guild.id}-${target.id}`;
    const data = xpData.get(key) || { xp: 0, level: 0 };
    const needed = (data.level + 1) * 100;
    return message.reply({ embeds: [{ color: PINK,
      title: `${target.user.username}'s Rank`,
      thumbnail: { url: target.user.displayAvatarURL() },
      fields: [
        { name: "Level", value: `${data.level}`, inline: true },
        { name: "XP", value: `${data.xp} / ${needed}`, inline: true },
      ],
      footer: { text: `${message.guild.name}` }, timestamp: new Date()
    }] });
  }

  // ,leaderboard / ,lb
  if (command === "leaderboard" || command === "lb") {
    const guildEntries = [...xpData.entries()]
      .filter(([k]) => k.startsWith(message.guild.id))
      .sort((a, b) => (b[1].level * 1000 + b[1].xp) - (a[1].level * 1000 + a[1].xp))
      .slice(0, 10);
    if (guildEntries.length === 0) return message.reply("📊 No XP data yet.");
    const lines = guildEntries.map(([k, d], i) => {
      const userId = k.split("-")[1];
      return `**${i + 1}.** <@${userId}> — Level ${d.level} (${d.xp} XP)`;
    });
    return message.reply({ embeds: [{ color: PINK, title: "🏆 XP Leaderboard", description: lines.join("\n") }] });
  }

  // ,setlevel <user> <level>
  if (command === "setlevel") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    const level = parseInt(args[2]);
    if (isNaN(level)) return err(message, "Invalid level.");
    const key = `${message.guild.id}-${target.id}`;
    xpData.set(key, { xp: 0, level });
    return ok(message, `Set **${target.user.username}**'s level to **${level}**`);
  }

  // ,resetxp <user>
  if (command === "resetxp") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    xpData.delete(`${message.guild.id}-${target.id}`);
    return ok(message, `Reset XP for **${target.user.username}**`);
  }

  // ── ECONOMY ──────────────────────────────────────────────

  // ,balance / ,bal [user]
  if (command === "balance" || command === "bal") {
    const target = message.mentions.users.first() || message.author;
    const bal = economy.get(target.id) || 0;
    return message.reply({ embeds: [{ color: PINK, title: `💰 ${target.username}'s Balance`, description: `**${bal}** coins` }] });
  }

  // ,daily
  if (command === "daily") {
    const key = `daily-${message.author.id}`;
    const last = economy.get(key);
    const now = Date.now();
    if (last && now - last < 86400000) {
      const remaining = Math.ceil((86400000 - (now - last)) / 3600000);
      return info(message, `⏰ You already claimed your daily. Come back in **${remaining}h**.`);
    }
    const current = economy.get(message.author.id) || 0;
    economy.set(message.author.id, current + 500);
    economy.set(key, now);
    return ok(message, `You claimed your daily **500 coins**! Balance: **${current + 500}**`);
  }

  // ,pay <user> <amount>
  if (command === "pay") {
    const target = message.mentions.users.first();
    if (!target) return err(message, "missing required argument");

    const amount = parseInt(args[2]);
    if (isNaN(amount) || amount <= 0) return err(message, "Invalid amount.");
    const senderBal = economy.get(message.author.id) || 0;
    if (senderBal < amount) return err(message, "Insufficient funds.");
    economy.set(message.author.id, senderBal - amount);
    economy.set(target.id, (economy.get(target.id) || 0) + amount);
    return ok(message, `Paid **${amount} coins** to **${target.username}**`);
  }

  // ,coinflip bet <amount>
  if (command === "bet") {
    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount <= 0) return err(message, "missing required argument");

    const bal = economy.get(message.author.id) || 0;
    if (bal < amount) return err(message, "Insufficient funds.");
    const win = Math.random() < 0.5;
    economy.set(message.author.id, win ? bal + amount : bal - amount);
    return message.reply(win ? `🎉 You won **${amount} coins**! Balance: **${bal + amount}**` : `😔 You lost **${amount} coins**. Balance: **${bal - amount}**`);
  }

  // ,blackjack / ,bj <amount>
  if (command === "blackjack" || command === "bj") {
    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount <= 0) return err(message, "missing required argument");

    const bal = economy.get(message.author.id) || 0;
    if (bal < amount) return err(message, "Insufficient funds.");
    const card = () => Math.min(Math.floor(Math.random() * 13) + 1, 10);
    const playerTotal = card() + card();
    const dealerTotal = card() + card();
    const win = playerTotal > dealerTotal && playerTotal <= 21;
    const bust = playerTotal > 21;
    economy.set(message.author.id, win ? bal + amount : bal - amount);
    return info(message, `🃏 You: **${playerTotal}** | Dealer: **${dealerTotal}** — ${bust ? "bust!" : win ? `you win **${amount} coins**!` : `dealer wins. -${amount} coins`}`);
  }

  // ,richlist
  if (command === "richlist") {
    const entries = [...economy.entries()]
      .filter(([k]) => !k.startsWith("daily-"))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    if (entries.length === 0) return message.reply("📊 No economy data yet.");
    const lines = entries.map(([id, bal], i) => `**${i + 1}.** <@${id}> — **${bal}** coins`);
    return message.reply({ embeds: [{ color: PINK, title: "💰 Rich List", description: lines.join("\n"), footer: { text: message.guild.name }, timestamp: new Date() }] });
  }

  // ── REMINDERS ────────────────────────────────────────────

  // ,remind <time> <text> (e.g. ,remind 30m take a break)
  if (command === "remind" || command === "reminder") {
    const timeStr = args[1];
    const text = args.slice(2).join(" ");
    return err(message, "missing required argument");


    const match = timeStr.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return err(message, "Invalid time. Use format: `30s`, `5m`, `2h`, `1d`");
    const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const ms = parseInt(match[1]) * units[match[2]];
    const list = remindersData.get(message.author.id) || [];
    list.push({ time: Date.now() + ms, text, channelId: message.channel.id });
    remindersData.set(message.author.id, list);
    return info(message, `⏰ I'll remind you in **${timeStr}**: ${text}`);
  }

  // ,reminders
  if (command === "reminders") {
    const list = remindersData.get(message.author.id) || [];
    if (list.length === 0) return message.reply("📋 You have no active reminders.");
    const lines = list.map((r, i) => `**${i + 1}.** ${r.text} — <t:${Math.floor(r.time / 1000)}:R>`);
    return message.reply({ embeds: [{ color: PINK, title: "⏰ Your Reminders", description: lines.join("\n"), footer: { text: message.guild.name }, timestamp: new Date() }] });
  }

  // ── GIVEAWAYS ────────────────────────────────────────────

  // ,gcreate <duration> <prize> (e.g. ,gcreate 1h iPhone 15)
  if (command === "gcreate" || command === "gstart") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const timeStr = args[1];
    const prize = args.slice(2).join(" ");
    if (!timeStr || !prize) return err(message, "missing required argument");

    const match = timeStr.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return err(message, "Invalid time.");
    const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const ms = parseInt(match[1]) * units[match[2]];
    const endTime = Date.now() + ms;
    const embed = { color: PINK, title: "🎉 GIVEAWAY", description: `**Prize:** ${prize}\n\nReact with 🎉 to enter!\n\nEnds: <t:${Math.floor(endTime / 1000)}:R>`, footer: { text: `Hosted by ${message.author.username}` } };
    const msg = await message.channel.send({ embeds: [embed] });
    await msg.react("🎉");
    giveaways.set(msg.id, { prize, endTime, entries: [], channelId: message.channel.id, guildId: message.guild.id, ended: false });
    message.delete().catch(() => {});
  }

  // ,gend <messageId>
  if (command === "gend") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const msgId = args[1];
    if (!msgId) return err(message, "missing required argument");

    const gw = giveaways.get(msgId);
    if (!gw) return err(message, "Giveaway not found.");
    gw.endTime = 0;
    giveaways.set(msgId, gw);
    return ok(message, "Giveaway will end shortly.");
  }

  // ,greroll <messageId>
  if (command === "greroll") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const msgId = args[1];
    if (!msgId) return err(message, "missing required argument");

    const gw = giveaways.get(msgId);
    if (!gw || !gw.ended || gw.entries.length === 0) return err(message, "Giveaway not found or no entries.");
    const winner = gw.entries[Math.floor(Math.random() * gw.entries.length)];
    return ok(message, `New winner: <@${winner}>! Congratulations!`);
  }

  // ── SERVER CONFIG ────────────────────────────────────────

  // ,autorole <@role | off>
  if (command === "autorole") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    if (args[1] === "off") {
      autoroles.delete(message.guild.id);
      saveAllConfigs();return ok(message, "Autorole disabled.");
    }
    const role = message.mentions.roles.first();
    if (!role) return err(message, "missing required argument");

    autoroles.set(message.guild.id, role.id);
    saveAllConfigs();return ok(message, `Autorole set to **${role.name}**`);
  }

  // ,welcome <#channel> <message> (use {user}, {server}, {count})
  if (command === "welcome") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    if (args[1] === "off") { welcomeConfig.delete(message.guild.id); return ok(message, "Welcome messages disabled."); }
    const channel = message.mentions.channels.first();
    if (!channel) return err(message, "missing required argument");

    const msg = args.slice(2).join(" ");
    if (!msg) return err(message, "Please provide a message. Use `{user}`, `{server}`, `{count}`");
    welcomeConfig.set(message.guild.id, { channelId: channel.id, message: msg });
    saveAllConfigs();return ok(message, `Welcome messages set in ${channel}`);
  }

  // ,goodbye <#channel> <message>
  if (command === "goodbye") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    if (args[1] === "off") { goodbyeConfig.delete(message.guild.id); return ok(message, "Goodbye messages disabled."); }
    const channel = message.mentions.channels.first();
    if (!channel) return err(message, "missing required argument");

    const msg = args.slice(2).join(" ");
    if (!msg) return err(message, "Please provide a message.");
    goodbyeConfig.set(message.guild.id, { channelId: channel.id, message: msg });
    saveAllConfigs();return ok(message, `Goodbye messages set in ${channel}`);
  }

  // ,starboard <#channel> [threshold]
  if (command === "starboard") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    if (args[1] === "off") { starboardConfig.delete(message.guild.id); return ok(message, "Starboard disabled."); }
    const channel = message.mentions.channels.first();
    if (!channel) return err(message, "missing required argument");

    const threshold = parseInt(args[2]) || 3;
    starboardConfig.set(message.guild.id, { channelId: channel.id, threshold });
    return ok(message, `Starboard set to ${channel} with threshold **${threshold}** ⭐`);
  }

  // ,setup — creates jail-log channel and jailed role
  if (command === "setup") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    await message.channel.sendTyping().catch(() => {});

    const results = [];

    // Create Jailed role if it doesn't exist
    let jailedRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === "jailed");
    if (!jailedRole) {
      jailedRole = await message.guild.roles.create({ name: "Jailed", color: "#808080", reason: "Setup by bot" }).catch(() => null);
      results.push(jailedRole ? `✅ Created role **Jailed**` : `❌ Failed to create Jailed role`);
    } else {
      results.push(`ℹ️ Role **Jailed** already exists`);
    }

    // Create jail-log channel if it doesn't exist
    let jailLog = message.guild.channels.cache.find(c => c.name === "jail-log");
    if (!jailLog) {
      jailLog = await message.guild.channels.create({
        name: "jail-log", type: 0,
        permissionOverwrites: [
          { id: message.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
          { id: message.guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
        ]
      }).catch(() => null);
      results.push(jailLog ? `✅ Created channel **#jail-log**` : `❌ Failed to create jail-log`);
    } else {
      results.push(`ℹ️ Channel **#jail-log** already exists`);
    }

    // Create jail channel if it doesn't exist
    let jailChannel = message.guild.channels.cache.find(c => c.name === "jail");
    if (!jailChannel) {
      jailChannel = await message.guild.channels.create({
        name: "jail", type: 0,
        permissionOverwrites: [
          { id: message.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          ...(jailedRole ? [{ id: jailedRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
          { id: message.guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
        ]
      }).catch(() => null);
      results.push(jailChannel ? `✅ Created channel **#jail**` : `❌ Failed to create jail channel`);
    } else {
      results.push(`ℹ️ Channel **#jail** already exists`);
    }

    // Apply Jailed role perms to ALL existing channels (deny send + view)
    if (jailedRole) {
      let applied = 0;
      const channels = message.guild.channels.cache.filter(c => c.type === 0 && c.id !== jailChannel?.id);
      for (const ch of channels.values()) {
        await ch.permissionOverwrites.edit(jailedRole, {
          SendMessages: false,
          AddReactions: false,
          CreatePublicThreads: false,
          CreatePrivateThreads: false,
        }).catch(() => {});
        applied++;
      }
      results.push(`✅ Applied Jailed perms to **${applied}** channels`);
    }

    return message.reply({ embeds: [{ color: PINK, title: "⚙️ Setup Complete", description: results.join("\n"), footer: { text: message.guild.name }, timestamp: new Date() }] });
  }

  // ,setupmute — creates muted roles with proper channel overwrites
  if (command === "setupmute") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    await message.channel.sendTyping().catch(() => {});

    const results = [];
    const roleConfigs = [
      { name: "Muted", deny: { SendMessages: false, CreatePublicThreads: false, CreatePrivateThreads: false } },
      { name: "Image Muted", deny: { AttachFiles: false, EmbedLinks: false } },
      { name: "Reaction Muted", deny: { AddReactions: false } },
    ];

    for (const cfg of roleConfigs) {
      let role = message.guild.roles.cache.find(r => r.name === cfg.name);
      if (!role) {
        role = await message.guild.roles.create({ name: cfg.name, color: "#808080", reason: "Setupmute by bot" }).catch(() => null);
        if (!role) { results.push(`❌ Failed to create **${cfg.name}** role`); continue; }
        results.push(`✅ Created role **${cfg.name}**`);
      } else {
        results.push(`ℹ️ Role **${cfg.name}** already exists`);
      }
      // Apply to all text channels
      let applied = 0;
      for (const ch of message.guild.channels.cache.filter(c => c.type === 0).values()) {
        await ch.permissionOverwrites.edit(role, cfg.deny).catch(() => {});
        applied++;
      }
      results.push(`  └ Applied to **${applied}** channels`);
    }

    return message.reply({ embeds: [{ color: PINK, title: "⚙️ Mute Setup Complete", description: results.join("\n"), footer: { text: message.guild.name }, timestamp: new Date() }] });
  }

  // ── SNIPE ────────────────────────────────────────────────

  // ,snipe
  if (command === "snipe" || command === "s") {
    const s = sniped.get(message.channel.id);
    if (!s) return info(message, "nothing to snipe");
    return message.reply({ embeds: [{ color: PINK, author: { name: s.author, icon_url: s.avatarURL }, description: s.content, footer: { text: `🌸 deleted at ${s.time.toLocaleTimeString()} • ${message.guild.name}` }, timestamp: new Date() }] });
  }

  // ,editsnipe
  if (command === "editsnipe" || command === "esnipe" || command === "es") {
    const s = editSniped.get(message.channel.id);
    if (!s) return info(message, "nothing to snipe");
    return message.reply({ embeds: [{ color: PINK, author: { name: s.author, icon_url: s.avatarURL }, fields: [{ name: "Before", value: s.before }, { name: "After", value: s.after }], footer: { text: `🌸 edited at ${s.time.toLocaleTimeString()} • ${message.guild.name}` }, timestamp: new Date() }] });
  }

  // ── AFK ──────────────────────────────────────────────────

  // ,afk [reason]
  if (command === "afk") {
    const reason = args.slice(1).join(" ") || "AFK";
    afkUsers.set(`${message.guild.id}-${message.author.id}`, reason);
    return info(message, `you're now **afk** with the status: **${reason}**`);
  }

  // ── LAST.FM ──────────────────────────────────────────────

  // ,fm set <username>
  if (command === "fm") {
    const sub = args[1]?.toLowerCase();
    if (sub === "set") {
      const username = args[2];
      if (!username) return err(message, "missing required argument");

      lastfmUsers.set(message.author.id, username);
      return ok(message, `Last.fm username set to **${username}**`);
    }
    if (sub === "unset") {
      lastfmUsers.delete(message.author.id);
      return ok(message, "Last.fm username removed.");
    }
    return err(message, "missing required argument");

  }

  // ,nowplaying / ,np
  if (command === "nowplaying" || command === "np") {
    const target = message.mentions.users.first() || message.author;
    const username = lastfmUsers.get(target.id);
    if (!username) return err(message, `No Last.fm username set. Use \`,fm set <username>\``);
    try {
      const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${username}&api_key=YOUR_LASTFM_KEY&format=json&limit=1`);
      const data = await res.json();
      const track = data.recenttracks?.track?.[0];
      if (!track) return err(message, "No recent tracks found.");
      const isPlaying = track["@attr"]?.nowplaying === "true";
      return message.reply({ embeds: [{ color: PINK, author: { name: `${isPlaying ? "▶️ Now Playing" : "⏹️ Last Played"} — ${username}`, icon_url: target.displayAvatarURL() }, title: track.name, description: `by **${track.artist["#text"]}** on *${track.album["#text"]}*`, thumbnail: { url: track.image?.[2]?.["#text"] || "" } }] });
    } catch {
      return err(message, "Could not fetch Last.fm data. Make sure to add a Last.fm API key.");
    }
  }

  // ,topartists / ,ta
  if (command === "topartists" || command === "ta") {
    const username = lastfmUsers.get(message.author.id);
    if (!username) return err(message, "Set your Last.fm username first with `,fm set <username>`");
    try {
      const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.gettopartists&user=${username}&api_key=YOUR_LASTFM_KEY&format=json&limit=10`);
      const data = await res.json();
      const artists = data.topartists?.artist;
      if (!artists) return err(message, "No data found.");
      const lines = artists.map((a, i) => `**${i + 1}.** ${a.name} — ${a.playcount} plays`);
      return message.reply({ embeds: [{ color: PINK, title: `🎵 Top Artists for ${username}`, description: lines.join("\n") }] });
    } catch { return err(message, "Could not fetch Last.fm data."); }
  }

  // ,toptracks / ,tt
  if (command === "toptracks" || command === "tt") {
    const username = lastfmUsers.get(message.author.id);
    if (!username) return err(message, "Set your Last.fm username first with `,fm set <username>`");
    try {
      const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.gettoptracks&user=${username}&api_key=YOUR_LASTFM_KEY&format=json&limit=10`);
      const data = await res.json();
      const tracks = data.toptracks?.track;
      if (!tracks) return err(message, "No data found.");
      const lines = tracks.map((t, i) => `**${i + 1}.** ${t.name} by ${t.artist.name} — ${t.playcount} plays`);
      return message.reply({ embeds: [{ color: PINK, title: `🎵 Top Tracks for ${username}`, description: lines.join("\n") }] });
    } catch { return err(message, "Could not fetch Last.fm data."); }
  }

  // ,topalbums / ,tal
  if (command === "topalbums" || command === "tal") {
    const username = lastfmUsers.get(message.author.id);
    if (!username) return err(message, "Set your Last.fm username first with `,fm set <username>`");
    try {
      const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.gettopalbums&user=${username}&api_key=YOUR_LASTFM_KEY&format=json&limit=10`);
      const data = await res.json();
      const albums = data.topalbums?.album;
      if (!albums) return err(message, "No data found.");
      const lines = albums.map((a, i) => `**${i + 1}.** ${a.name} by ${a.artist.name} — ${a.playcount} plays`);
      return message.reply({ embeds: [{ color: PINK, title: `🎵 Top Albums for ${username}`, description: lines.join("\n") }] });
    } catch { return err(message, "Could not fetch Last.fm data."); }
  }

  // ,fmprofile / ,fmp
  if (command === "fmprofile" || command === "fmp") {
    const target = message.mentions.users.first() || message.author;
    const username = lastfmUsers.get(target.id);
    if (!username) return err(message, "No Last.fm username set.");
    try {
      const res = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${username}&api_key=YOUR_LASTFM_KEY&format=json`);
      const data = await res.json();
      const user = data.user;
      if (!user) return err(message, "missing required argument: **user**");
      return message.reply({ embeds: [{ color: PINK, title: user.name, url: user.url, thumbnail: { url: user.image?.[2]?.["#text"] || "" }, fields: [{ name: "Scrobbles", value: user.playcount, inline: true }, { name: "Artists", value: user.artist_count || "N/A", inline: true }, { name: "Registered", value: `<t:${user.registered?.unixtime}:R>`, inline: true }] }] });
    } catch { return err(message, "Could not fetch Last.fm data."); }
  }

  // ── TICKETS ──────────────────────────────────────────────

  // ,ticket setup <#log-channel>
});

// ===== TICKET INACTIVITY MONITOR =====
const TICKET_CATEGORY_ID = "1409003502826557560";
const ticketActivity = new Map();    // channelId => { creatorId, guildId, lastActivity, closing }
const ticketWarnings = new Map();

async function closeInactiveTicket(channelId, activity, reason = "1 hour of inactivity") {
  if (activity.closing) return;
  activity.closing = true;
  ticketActivity.set(channelId, activity);

  try {
    const guild = client.guilds.cache.get(activity.guildId);
    if (!guild) { ticketActivity.delete(channelId); return; }
    const ch = guild.channels.cache.get(channelId);
    if (!ch) { ticketActivity.delete(channelId); return; }

    // DM creator
    const creator = await client.users.fetch(activity.creatorId).catch(() => null);
    if (creator) {
      creator.send({ embeds: [{ color: PINK, title: "⚠️ Troll Ticket", description: `Your ticket in **${guild.name}** was closed after **${reason}** of inactivity.\n\nPlease do not open troll tickets.`, footer: { text: guild.name }, timestamp: new Date() }] }).catch(() => {});
    }

    // Warn in channel
    await ch.send({ embeds: [{ color: PINK, title: "⚠️ Troll Ticket", description: `<@${activity.creatorId}> This ticket has been inactive for **${reason}** and will be deleted in **10 seconds**.`, footer: { text: guild.name } }] }).catch(() => {});

    // Log to configured channel
    const cfg = ticketConfig.get(guild.id);
    if (cfg?.logChannelId) {
      const logCh = guild.channels.cache.get(cfg.logChannelId);
      if (logCh) logCh.send({ embeds: [{ color: PINK, title: "🎫 Ticket Auto-Closed", description: `**${ch.name}** closed after **${reason}** of inactivity.\nCreator: <@${activity.creatorId}>`, footer: { text: guild.name }, timestamp: new Date() }] }).catch(() => {});
    }

    // Cleanup
    ticketActivity.delete(channelId);
    ticketWarnings.delete(channelId);
    for (const [key, chId] of openTickets.entries()) {
      if (chId === channelId) { openTickets.delete(key); break; }
    }

    setTimeout(() => ch.delete().catch(() => {}), 10000);
    log(`[Tickets] Auto-closed ${ch.name} (${reason})`, "info");
  } catch (e) {
    log(`[Tickets] Error closing ${channelId}: ${e.message}`, "error");
    ticketActivity.delete(channelId);
  }
}

// On startup: scan ticket category and re-register open tickets
async function rehydrateTickets() {
  try {
    for (const guild of client.guilds.cache.values()) {
      const ticketChannels = guild.channels.cache.filter(c => c.parentId === TICKET_CATEGORY_ID && c.type === 0);
      for (const ch of ticketChannels.values()) {
        if (ticketActivity.has(ch.id)) continue;
        // Find creator from openTickets map
        let creatorId = null;
        for (const [key, chId] of openTickets.entries()) {
          if (chId === ch.id) { creatorId = key.split('-')[1]; break; }
        }
        // Fallback: first non-bot message author
        if (!creatorId) {
          const msgs = await ch.messages.fetch({ limit: 50 }).catch(() => null);
          if (msgs) {
            const firstHuman = [...msgs.values()].reverse().find(m => !m.author.bot);
            if (firstHuman) creatorId = firstHuman.author.id;
          }
        }
        if (!creatorId) continue;

        // lastActivity = last message FROM CREATOR only
        const msgs = await ch.messages.fetch({ limit: 50 }).catch(() => null);
        const lastCreatorMsg = msgs ? [...msgs.values()].find(m => m.author.id === creatorId) : null;
        const lastActivity = lastCreatorMsg ? lastCreatorMsg.createdTimestamp : ch.createdTimestamp;

        ticketActivity.set(ch.id, { creatorId, guildId: guild.id, lastActivity, closing: false });
        log(`[Tickets] Re-registered ${ch.name} (last activity: ${new Date(lastActivity).toLocaleTimeString()})`, "info");
      }
    }
    log(`[Tickets] Rehydrated ${ticketActivity.size} tickets`, "info");
  } catch (e) {
    log(`[Tickets] Rehydration error: ${e.message}`, "error");
  }
}

// Reset timer ONLY when CREATOR sends a message
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  const activity = ticketActivity.get(message.channel.id);
  if (!activity || activity.closing) return;
  if (message.author.id !== activity.creatorId) return; // only creator resets timer
  activity.lastActivity = Date.now();
  ticketActivity.set(message.channel.id, activity);
});

// Check every minute
setInterval(async () => {
  const now = Date.now();
  for (const [channelId, activity] of [...ticketActivity.entries()]) {
    if (activity.closing) continue;
    const elapsed = now - activity.lastActivity;
    if (elapsed >= 3600000) { // 1 hour
      log(`[Tickets] ${channelId} inactive for ${Math.floor(elapsed/60000)}min — closing`, "info");
      closeInactiveTicket(channelId, activity);
    }
  }
}, 60 * 1000);

// ===== TICKET + EXTRA COMMANDS =====
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(",")) return;
  if (ignoreList.get(message.guild?.id)?.has(message.author.id)) return;
  const args = message.content.slice(1).trim().split(/ +/);
  const command = args[0].toLowerCase();

  // ,tc — close ticket (usable by creator, mods with ManageChannels, or configured mod role)
  if (command === "tc") {
    const _cfg = ticketConfig.get(message.guild.id);
    const _act = ticketActivity.get(message.channel.id);
    if (!_act) return err(message, "this channel is not a ticket");
    const _isCreator = _act.creatorId === message.author.id;
    const _hasPerm = message.member.permissions.has(PermissionFlagsBits.ManageChannels);
    const _hasRole = _cfg?.modRoleId && message.member.roles.cache.has(_cfg.modRoleId);
    if (!_isCreator && !_hasPerm && !_hasRole) return err(message, "you don't have permission to close this ticket");
    if (_cfg?.logChannelId) {
      const _logCh = message.guild.channels.cache.get(_cfg.logChannelId);
      if (_logCh) _logCh.send({ embeds: [{ color: PINK, description: `🎫 Ticket **${message.channel.name}** closed by **${message.author.username}**`, timestamp: new Date() }] }).catch(() => {});
    }
    ticketActivity.delete(message.channel.id);
    ticketWarnings.delete(message.channel.id);
    for (const [k, chId] of openTickets.entries()) {
      if (chId === message.channel.id) { openTickets.delete(k); break; }
    }
    await message.channel.send({ embeds: [{ color: PINK, description: "🔒 Closing ticket in 3 seconds..." }] });
    setTimeout(() => message.channel.delete().catch(() => {}), 3000);
    return;
  }

  if (command === "ticket") {
    const sub = args[1]?.toLowerCase();
    if (sub === "setup") {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
      const logCh = message.mentions.channels.first();
      if (!logCh) return err(message, "missing required argument");
      ticketConfig.set(message.guild.id, { logChannelId: logCh.id });
      saveAllConfigs();
      return ok(message, `ticket system set up. logs → ${logCh}`);
    }
    if (sub === "create" || !sub) {
      const existing = openTickets.get(`${message.guild.id}-${message.author.id}`);
      if (existing) return err(message, `you already have an open ticket: <#${existing}>`);
      const cfg = ticketConfig.get(message.guild.id);
      const permOverwrites = [
        { id: message.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: message.author.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: message.guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ];
      // Add mod role to ticket if configured
      if (cfg?.modRoleId) {
        permOverwrites.push({ id: cfg.modRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
      }
      const ticketChannel = await message.guild.channels.create({
        name: `ticket-${message.author.username}`,
        type: 0,
        parent: TICKET_CATEGORY_ID,
        permissionOverwrites: permOverwrites
      }).catch(() => null);
      if (!ticketChannel) return err(message, "could not create ticket channel — check my permissions");
      openTickets.set(`${message.guild.id}-${message.author.id}`, ticketChannel.id);
      ticketActivity.set(ticketChannel.id, {
        creatorId: message.author.id,
        guildId: message.guild.id,
        lastActivity: Date.now(),
        closing: false
      });
      await ticketChannel.send({ embeds: [{ color: PINK, title: "🎫 Ticket Created", description: `Hello ${message.author}, support will be with you shortly.\n\nUse \`,ticket close\` to close this ticket.\n\n⚠️ This ticket will be **automatically closed** if you don't respond within **1 hour**.`, footer: { text: message.guild.name }, timestamp: new Date() }] });
      return ok(message, `ticket created: ${ticketChannel}`);
    }
    if (sub === "close") {
      // Allow: ticket creator, mods with ManageChannels, or the configured mod role
      const config = ticketConfig.get(message.guild.id);
      const activity = ticketActivity.get(message.channel.id);
      const isCreator = activity?.creatorId === message.author.id;
      const hasPerm = message.member.permissions.has(PermissionFlagsBits.ManageChannels);
      const hasModRole = config?.modRoleId && message.member.roles.cache.has(config.modRoleId);
      if (!isCreator && !hasPerm && !hasModRole) return err(message, "You don't have permission to close this ticket.");

      if (config?.logChannelId) {
        const logCh = message.guild.channels.cache.get(config.logChannelId);
        if (logCh) logCh.send({ embeds: [{ color: PINK, description: `🎫 Ticket **${message.channel.name}** closed by **${message.author.username}**`, timestamp: new Date() }] }).catch(() => {});
      }
      ticketActivity.delete(message.channel.id);
      ticketWarnings.delete(message.channel.id);
      for (const [key, chId] of openTickets.entries()) {
        if (chId === message.channel.id) { openTickets.delete(key); break; }
      }
      await message.channel.send({ embeds: [{ color: PINK, description: "🔒 Closing ticket in 3 seconds..." }] });
      setTimeout(() => message.channel.delete().catch(() => {}), 3000);
      return;
    }
    if (sub === "add") {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
      const target = message.mentions.members.first();
      if (!target) return err(message, "missing required argument");
      await message.channel.permissionOverwrites.edit(target, { ViewChannel: true, SendMessages: true }).catch(() => null);
      return ok(message, `added ${target} to the ticket`);
    }
    if (sub === "remove") {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
      const target = message.mentions.members.first();
      if (!target) return err(message, "missing required argument");

      await message.channel.permissionOverwrites.delete(target).catch(() => null);
      return ok(message, `Removed ${target} from the ticket.`);
    }
  }

  // ── FUN EXTRAS ───────────────────────────────────────────

  // ,rps <rock|paper|scissors>
  if (command === "rps") {
    const choices = ["rock", "paper", "scissors"];
    const userChoice = args[1]?.toLowerCase();
    if (!choices.includes(userChoice)) return err(message, "missing required argument");

    const botChoice = choices[Math.floor(Math.random() * 3)];
    let result;
    if (userChoice === botChoice) result = "🤝 It's a tie!";
    else if ((userChoice === "rock" && botChoice === "scissors") || (userChoice === "paper" && botChoice === "rock") || (userChoice === "scissors" && botChoice === "paper")) result = "🎉 You win!";
    else result = "😔 You lose!";
    return info(message, `You: **${userChoice}** | Me: **${botChoice}** — ${result}`);
  }

  // ,tictactoe / ,ttt <@user>
  if (command === "tictactoe" || command === "ttt") {
    const target = message.mentions.users.first();
    if (!target || target.bot || target.id === message.author.id) return err(message, "missing required argument");

    const board = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
    const players = [message.author.id, target.id];
    let turn = 0;
    const render = () => `${board[0]}|${board[1]}|${board[2]}\n-+-+-\n${board[3]}|${board[4]}|${board[5]}\n-+-+-\n${board[6]}|${board[7]}|${board[8]}`;
    const checkWin = () => {
      const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
      return wins.some(([a,b,c]) => board[a] === board[b] && board[b] === board[c] && ["X","O"].includes(board[a]));
    };
    const msg = await message.channel.send(`🎮 TicTacToe: <@${players[0]}> vs <@${players[1]}>\n<@${players[turn]}>'s turn (${turn === 0 ? "X" : "O"})\n\`\`\`${render()}\`\`\``);
    const collector = message.channel.createMessageCollector({ filter: m => players.includes(m.author.id) && /^[1-9]$/.test(m.content), time: 60000 });
    collector.on("collect", async m => {
      if (m.author.id !== players[turn]) return;
      const pos = parseInt(m.content) - 1;
      if (["X","O"].includes(board[pos])) return;
      board[pos] = turn === 0 ? "X" : "O";
      m.delete().catch(() => {});
      if (checkWin()) { collector.stop(); return msg.edit(`🎮 TicTacToe\n\`\`\`${render()}\`\`\`\n🎉 <@${players[turn]}> wins!`); }
      if (!board.includes(...["1","2","3","4","5","6","7","8","9"].filter(n => board.includes(n)))) { collector.stop(); return msg.edit(`🎮 TicTacToe\n\`\`\`${render()}\`\`\`\n🤝 It's a draw!`); }
      turn = turn === 0 ? 1 : 0;
      msg.edit(`🎮 TicTacToe: <@${players[0]}> vs <@${players[1]}>\n<@${players[turn]}>'s turn (${turn === 0 ? "X" : "O"})\n\`\`\`${render()}\`\`\``);
    });
    collector.on("end", (_, reason) => { if (reason === "time") msg.edit(`⏰ Game timed out.\n\`\`\`${render()}\`\`\``); });
  }

  // ,hack <@user> — joke command
  if (command === "hack") {
    const target = message.mentions.users.first();
    if (!target) return err(message, "missing required argument");

    const steps = [
      { color: PINK, description: `🔍 Finding IP of **${target.username}**...` },
      { color: PINK, description: `💻 Accessing mainframe...` },
      { color: PINK, description: `🔓 Bypassing firewall...` },
      { color: PINK, description: `📁 Stealing data...` },
      { color: PINK, description: `✅ Successfully hacked **${target.username}**!\nPassword: \`password123\` | Email: \`${target.username}@gmail.com\`` },
    ];
    let i = 0;
    const m = await message.reply({ embeds: [steps[0]] });
    const interval = setInterval(() => {
      i++;
      if (i >= steps.length) { clearInterval(interval); return; }
      m.edit({ embeds: [steps[i]] }).catch(() => clearInterval(interval));
    }, 1500);
  }

  // ,ship <@user1> [@user2]
  if (command === "ship") {
    const u1 = message.mentions.users.first() || message.author;
    const u2 = [...message.mentions.users.values()][1] || message.author;
    const score = Math.floor(Math.random() * 101);
    const bar = "█".repeat(Math.floor(score / 10)) + "░".repeat(10 - Math.floor(score / 10));
    return message.reply({ embeds: [{ color: PINK, title: "💕 Ship", description: `**${u1.username}** 💕 **${u2.username}**\n\n${bar} **${score}%**`, footer: { text: message.guild.name } }] });
  }

  // ,pp [user]
  if (command === "pp") {
    const target = message.mentions.users.first() || message.author;
    const size = Math.floor(Math.random() * 15);
    return info(message, `**${target.username}**'s pp: 8${"=".repeat(size)}D`);
  }

  // ,rate <thing>
  if (command === "rate") {
    const thing = args.slice(1).join(" ");
    if (!thing) return err(message, "missing required argument");

    const score = Math.floor(Math.random() * 11);
    return info(message, `I rate **${thing}** a **${score}/10**`);
  }

  // ,howgay [user]
  if (command === "howgay") {
    const target = message.mentions.users.first() || message.author;
    const score = Math.floor(Math.random() * 101);
    return info(message, `**${target.username}** is **${score}%** gay`);
  }

  // ,howdumb [user]
  if (command === "howdumb") {
    const target = message.mentions.users.first() || message.author;
    const score = Math.floor(Math.random() * 101);
    return info(message, `**${target.username}** is **${score}%** dumb`);
  }

  // ,wanted [user]
  if (command === "wanted") {
    const target = message.mentions.users.first() || message.author;
    return info(message, `**WANTED**\n${target.displayAvatarURL()}\nReward: $${Math.floor(Math.random() * 1000000)}`);
  }

  // ── UTILITY EXTRAS ───────────────────────────────────────

  // ,uptime
  if (command === "uptime") {
    const s = Math.floor(process.uptime());
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return info(message, `uptime **${d}d ${h}h ${m}m ${sec}s**`);
  }

  // ,firstmessage [#channel]
  if (command === "firstmessage") {
    await message.channel.sendTyping().catch(() => {});
    const channel = message.mentions.channels.first() || message.channel;
    const msgs = await channel.messages.fetch({ limit: 1, after: "0" }).catch(() => null);
    if (!msgs || msgs.size === 0) return err(message, "Could not fetch messages.");
    const first = msgs.first();
    return info(message, `first message in ${channel}: https://discord.com/channels/${message.guild.id}/${channel.id}/${first.id}`);
  }

  // ,jumbo <emoji>
  if (command === "jumbo") {
    const emoji = args[1];
    if (!emoji) return err(message, "missing required argument");

    const match = emoji.match(/<a?:[^:]+:(\d+)>/);
    if (match) return message.reply({ embeds: [{ image: { url: `https://cdn.discordapp.com/emojis/${match[1]}.${emoji.startsWith("<a:") ? "gif" : "png"}?size=256` } }] });
    return err(message, "Please use a custom Discord emoji.");
  }

  // ,stealemoji <emoji> <name>
  if (command === "stealemoji") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageEmojisAndStickers)) return err(message, "Missing permissions.");
    const emoji = args[1];
    const name = args[2];
    if (!emoji || !name) return err(message, "missing required argument");

    const match = emoji.match(/<a?:[^:]+:(\d+)>/);
    if (!match) return err(message, "Invalid emoji.");
    const url = `https://cdn.discordapp.com/emojis/${match[1]}.${emoji.startsWith("<a:") ? "gif" : "png"}`;
    const created = await message.guild.emojis.create({ attachment: url, name }).catch(() => null);
    if (!created) return err(message, "Failed to add emoji.");
    return ok(message, `Added emoji ${created}`);
  }

  // ,deleteemoji <emoji>
  if (command === "deleteemoji") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageEmojisAndStickers)) return err(message, "Missing permissions.");
    const emoji = message.guild.emojis.cache.find(e => args[1]?.includes(e.id));
    if (!emoji) return err(message, "Emoji not found.");
    await emoji.delete().catch(() => null);
    return ok(message, `Deleted emoji **${emoji.name}**`);
  }

  // ,emojis
  if (command === "emojis") {
    const emojis = message.guild.emojis.cache;
    if (emojis.size === 0) return message.reply("No custom emojis.");
    const list = emojis.map(e => `${e}`).slice(0, 50).join(" ");
    return message.reply({ embeds: [{ color: PINK, title: `Emojis (${emojis.size})`, description: list }] });
  }

  // ,invites [user]
  if (command === "invites") {
    const target = message.mentions.members.first() || message.member;
    const invites = await message.guild.invites.fetch().catch(() => null);
    if (!invites) return err(message, "Could not fetch invites.");
    const count = invites.filter(i => i.inviter?.id === target.id).reduce((sum, i) => sum + (i.uses || 0), 0);
    return info(message, `**${target.user.username}** has **${count}** invite uses.`);
  }

  // ,createinvite [maxUses] [expiresIn hours]
  if (command === "createinvite") {
    if (!message.member.permissions.has(PermissionFlagsBits.CreateInstantInvite)) return err(message, "Missing permissions.");
    const maxUses = parseInt(args[1]) || 0;
    const hours = parseInt(args[2]) || 0;
    const invite = await message.channel.createInvite({ maxUses, maxAge: hours * 3600 }).catch(() => null);
    if (!invite) return err(message, "Could not create invite.");
    return ok(message, `invite created: **discord.gg/${invite.code}**${maxUses ? ` (${maxUses} uses)` : ""}${hours ? ` (expires in ${hours}h)` : ""}`);
  }

  // ,listinvites
  if (command === "listinvites") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const invites = await message.guild.invites.fetch().catch(() => null);
    if (!invites || invites.size === 0) return message.reply("No active invites.");
    const list = invites.map(i => `**discord.gg/${i.code}** — ${i.inviter?.username || "Unknown"} (${i.uses} uses)`).slice(0, 15).join("\n");
    return message.reply({ embeds: [{ color: PINK, title: `Invites (${invites.size})`, description: list }] });
  }

  // ,weather <city> — requires no API key, uses wttr.in
  if (command === "weather") {
    await message.channel.sendTyping().catch(() => {});
    const city = args.slice(1).join("+");
    if (!city) return err(message, "missing required argument");

    try {
      const res = await fetch(`https://wttr.in/${city}?format=j1`);
      const data = await res.json();
      const current = data.current_condition[0];
      const area = data.nearest_area[0];
      const name = area.areaName[0].value + ", " + area.country[0].value;
      return message.reply({ embeds: [{ color: PINK, title: `🌤️ Weather in ${name}`, fields: [{ name: "Condition", value: current.weatherDesc[0].value, inline: true }, { name: "Temp", value: `${current.temp_C}°C / ${current.temp_F}°F`, inline: true }, { name: "Humidity", value: `${current.humidity}%`, inline: true }, { name: "Wind", value: `${current.windspeedKmph} km/h`, inline: true }] }] });
    } catch { return err(message, "Could not fetch weather data."); }
  }

  // ,math <expression>
  if (command === "math") {
    const expr = args.slice(1).join(" ");
    if (!expr) return err(message, "missing required argument");

    try {
      const result = Function(`"use strict"; return (${expr.replace(/[^0-9+\-*/().\s%]/g, "")})`)();
      return info(message, `**${expr}** = **${result}**`);
    } catch { return err(message, "Invalid expression."); }
  }

  // ,urban <word>
  if (command === "urban") {
    await message.channel.sendTyping().catch(() => {});
    const word = args.slice(1).join(" ");
    if (!word) return err(message, "missing required argument");

    try {
      const res = await fetch(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(word)}`);
      const data = await res.json();
      const def = data.list?.[0];
      if (!def) return err(message, "No definition found.");
      return message.reply({ embeds: [{ color: PINK, title: def.word, url: def.permalink, description: def.definition.substring(0, 1024), fields: [{ name: "Example", value: def.example.substring(0, 512) || "None" }], footer: { text: `👍 ${def.thumbs_up} | 👎 ${def.thumbs_down}` } }] });
    } catch { return err(message, "Could not fetch definition."); }
  }

  // ,updated help command
  // help is handled in the 50 MOST USED COMMANDS handler
});

// ===================================================
// ===== ANTINUKE & ANTIRAID SYSTEM ==================
// ===================================================

// ── CONFIG STORAGE ──────────────────────────────────
const antinukeConfig = new Map();
const antiraidConfig = new Map();
const recentJoins = new Map();     // guildId => [{ userId, time }]
const recentActions = new Map();   // guildId-modId-actionType => [timestamps]
const lockedGuilds = new Set();    // guildIds currently under raid lockdown

function getAntiNuke(guildId) {
  if (!antinukeConfig.has(guildId)) {
    antinukeConfig.set(guildId, {
      enabled: false,
      punishment: "ban",       // ban | kick | strip
      threshold: 3,            // actions before triggering
      whitelist: new Set(),    // whitelisted user IDs
    });
  }
  return antinukeConfig.get(guildId);
}

function getAntiRaid(guildId) {
  if (!antiraidConfig.has(guildId)) {
    antiraidConfig.set(guildId, {
      enabled: false,
      action: "kick",          // kick | ban | mute
      joinThreshold: 10,       // joins in window
      joinWindow: 10000,       // ms
    });
  }
  return antiraidConfig.get(guildId);
}

async function punishUser(guild, userId, punishment, reason) {
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    if (punishment === "ban") await guild.members.ban(userId, { reason });
    else if (punishment === "kick") await member.kick(reason);
    else if (punishment === "strip") {
      const roles = member.roles.cache.filter(r => r.id !== guild.id);
      for (const r of roles.values()) await member.roles.remove(r).catch(() => {});
    }
    log(`AntiNuke: ${punishment} applied to ${member.user.username} | ${reason}`, "success");
  } catch (e) {
    log(`AntiNuke punishment failed: ${e.message}`, "error");
  }
}

function trackAction(guildId, userId, actionType, threshold) {
  const key = `${guildId}-${userId}-${actionType}`;
  const now = Date.now();
  const times = (recentActions.get(key) || []).filter(t => now - t < 10000);
  times.push(now);
  recentActions.set(key, times);
  return times.length >= threshold;
}

// ── ANTINUKE EVENTS ─────────────────────────────────

// Detect mass bans
client.on("guildBanAdd", async (ban) => {
  const cfg = getAntiNuke(ban.guild.id);
  if (!cfg.enabled) return;
  try {
    const logs = await ban.guild.fetchAuditLogs({ type: 22, limit: 1 });
    const entry = logs.entries.first();
    if (!entry || !entry.executor) return;
    if (entry.executor.id === client.user.id) return;
    if (cfg.whitelist.has(entry.executor.id)) return;
    if (trackAction(ban.guild.id, entry.executor.id, "ban", cfg.threshold)) {
      await punishUser(ban.guild, entry.executor.id, cfg.punishment, `[AntiNuke] Mass ban detected`);
      notifyOwner(ban.guild, `🚨 **AntiNuke** triggered!\n**User:** <@${entry.executor.id}>\n**Action:** Mass Ban\n**Punishment:** ${cfg.punishment}`);
    }
  } catch {}
});

// Detect mass kicks
client.on("guildMemberRemove", async (member) => {
  const cfg = getAntiNuke(member.guild.id);
  if (!cfg.enabled) return;
  try {
    const logs = await member.guild.fetchAuditLogs({ type: 20, limit: 1 });
    const entry = logs.entries.first();
    if (!entry || !entry.executor) return;
    if (entry.executor.id === client.user.id) return;
    if (cfg.whitelist.has(entry.executor.id)) return;
    if (entry.target?.id !== member.id) return;
    if (trackAction(member.guild.id, entry.executor.id, "kick", cfg.threshold)) {
      await punishUser(member.guild, entry.executor.id, cfg.punishment, `[AntiNuke] Mass kick detected`);
      notifyOwner(member.guild, `🚨 **AntiNuke** triggered!\n**User:** <@${entry.executor.id}>\n**Action:** Mass Kick\n**Punishment:** ${cfg.punishment}`);
    }
  } catch {}
});

// Detect mass channel delete
client.on("channelDelete", async (channel) => {
  if (!channel.guild) return;
  const cfg = getAntiNuke(channel.guild.id);
  if (!cfg.enabled) return;
  try {
    const logs = await channel.guild.fetchAuditLogs({ type: 12, limit: 1 });
    const entry = logs.entries.first();
    if (!entry || !entry.executor) return;
    if (entry.executor.id === client.user.id) return;
    if (cfg.whitelist.has(entry.executor.id)) return;
    if (trackAction(channel.guild.id, entry.executor.id, "channelDelete", cfg.threshold)) {
      await punishUser(channel.guild, entry.executor.id, cfg.punishment, `[AntiNuke] Mass channel delete`);
      notifyOwner(channel.guild, `🚨 **AntiNuke** triggered!\n**User:** <@${entry.executor.id}>\n**Action:** Mass Channel Delete\n**Punishment:** ${cfg.punishment}`);
    }
  } catch {}
});

// Detect mass role delete
client.on("roleDelete", async (role) => {
  const cfg = getAntiNuke(role.guild.id);
  if (!cfg.enabled) return;
  try {
    const logs = await role.guild.fetchAuditLogs({ type: 32, limit: 1 });
    const entry = logs.entries.first();
    if (!entry || !entry.executor) return;
    if (entry.executor.id === client.user.id) return;
    if (cfg.whitelist.has(entry.executor.id)) return;
    if (trackAction(role.guild.id, entry.executor.id, "roleDelete", cfg.threshold)) {
      await punishUser(role.guild, entry.executor.id, cfg.punishment, `[AntiNuke] Mass role delete`);
      notifyOwner(role.guild, `🚨 **AntiNuke** triggered!\n**User:** <@${entry.executor.id}>\n**Action:** Mass Role Delete\n**Punishment:** ${cfg.punishment}`);
    }
  } catch {}
});

// Detect webhook creation
client.on("webhooksUpdate", async (channel) => {
  const cfg = getAntiNuke(channel.guild.id);
  if (!cfg.enabled) return;
  try {
    const logs = await channel.guild.fetchAuditLogs({ type: 50, limit: 1 });
    const entry = logs.entries.first();
    if (!entry || !entry.executor) return;
    if (entry.executor.id === client.user.id) return;
    if (cfg.whitelist.has(entry.executor.id)) return;
    if (trackAction(channel.guild.id, entry.executor.id, "webhook", 1)) {
      await punishUser(channel.guild, entry.executor.id, cfg.punishment, `[AntiNuke] Unauthorized webhook`);
      notifyOwner(channel.guild, `🚨 **AntiNuke** triggered!\n**User:** <@${entry.executor.id}>\n**Action:** Webhook Created\n**Punishment:** ${cfg.punishment}`);
    }
  } catch {}
});

// Detect dangerous role permission grants
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const cfg = getAntiNuke(newMember.guild.id);
  if (!cfg.enabled) return;
  const added = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
  for (const role of added.values()) {
    if (role.permissions.has(PermissionFlagsBits.Administrator) || role.permissions.has(PermissionFlagsBits.BanMembers) || role.permissions.has(PermissionFlagsBits.ManageGuild)) {
      try {
        const logs = await newMember.guild.fetchAuditLogs({ type: 25, limit: 1 });
        const entry = logs.entries.first();
        if (!entry || !entry.executor) return;
        if (entry.executor.id === client.user.id) return;
        if (cfg.whitelist.has(entry.executor.id)) return;
        if (trackAction(newMember.guild.id, entry.executor.id, "dangerousRole", cfg.threshold)) {
          await punishUser(newMember.guild, entry.executor.id, cfg.punishment, `[AntiNuke] Dangerous role granted`);
          notifyOwner(newMember.guild, `🚨 **AntiNuke** triggered!\n**User:** <@${entry.executor.id}>\n**Action:** Dangerous Role Grant\n**Punishment:** ${cfg.punishment}`);
        }
      } catch {}
    }
  }
});

// ── ANTIRAID EVENT ───────────────────────────────────
client.on("guildMemberAdd", async (member) => {
  if (member.guild.id === TARGET_GUILD_ID) return;
  const cfg = getAntiRaid(member.guild.id);
  if (!cfg.enabled) return;

  const guildId = member.guild.id;
  const now = Date.now();
  const joins = (recentJoins.get(guildId) || []).filter(j => now - j.time < cfg.joinWindow);
  joins.push({ userId: member.id, time: now });
  recentJoins.set(guildId, joins);

  if (joins.length >= cfg.joinThreshold) {
    if (!lockedGuilds.has(guildId)) {
      lockedGuilds.add(guildId);
      notifyOwner(member.guild, `🚨 **AntiRaid** triggered!\n**${joins.length} joins** in ${cfg.joinWindow / 1000}s\n**Action:** ${cfg.action} + lockdown`);
      // Lock all channels
      const channels = member.guild.channels.cache.filter(c => c.type === 0);
      for (const ch of channels.values()) {
        await ch.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: false }).catch(() => {});
      }
      log(`AntiRaid: Lockdown activated in ${member.guild.name}`, "success");
      // Auto-unlock after 5 minutes
      setTimeout(async () => {
        lockedGuilds.delete(guildId);
        for (const ch of channels.values()) {
          await ch.permissionOverwrites.edit(member.guild.roles.everyone, { SendMessages: null }).catch(() => {});
        }
        log(`AntiRaid: Lockdown lifted in ${member.guild.name}`, "info");
      }, 5 * 60 * 1000);
    }
    // Apply action to raider
    try {
      if (cfg.action === "ban") await member.ban({ reason: "[AntiRaid] Raid detected" });
      else if (cfg.action === "kick") await member.kick("[AntiRaid] Raid detected");
      else if (cfg.action === "mute") await member.timeout(10 * 60 * 1000, "[AntiRaid] Raid detected");
    } catch {}
  }
});

// ── NOTIFY OWNER HELPER ──────────────────────────────
async function notifyOwner(guild, message) {
  try {
    const owner = await client.users.fetch(guild.ownerId);
    await owner.send(message);
  } catch {}
}

// ── ANTINUKE & ANTIRAID COMMANDS ────────────────────
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(",")) return;
  const args = message.content.slice(1).trim().split(/ +/);
  const command = args[0].toLowerCase();
  if (ignoreList.get(message.guild?.id)?.has(message.author.id)) return;


  // ,antinuke <on|off|punishment|threshold|whitelist|unwhitelist|status>
  if (command === "antinuke") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator) && message.author.id !== message.guild.ownerId) return err(message, "Only the server owner or admins can configure antinuke.");
    const cfg = getAntiNuke(message.guild.id);
    const sub = args[1]?.toLowerCase();

    if (sub === "on" || sub === "enable") {
      cfg.enabled = true;
      saveAllConfigs();return ok(message, "**AntiNuke** enabled. The bot will now monitor for destructive actions.");
    }
    if (sub === "off" || sub === "disable") {
      cfg.enabled = false;
      saveAllConfigs();return ok(message, "**AntiNuke** disabled.");
    }
    if (sub === "punishment") {
      const p = args[2]?.toLowerCase();
      if (!["ban", "kick", "strip"].includes(p)) return err(message, "missing required argument");

      cfg.punishment = p;
      saveAllConfigs();return ok(message, `AntiNuke punishment set to **${p}**`);
    }
    if (sub === "threshold") {
      const n = parseInt(args[2]);
      return err(message, "missing required argument");


      cfg.threshold = n;
      saveAllConfigs();return ok(message, `AntiNuke threshold set to **${n}** actions`);
    }
    if (sub === "whitelist") {
      const target = message.mentions.users.first() || await client.users.fetch(args[2]).catch(() => null);
      if (!target) return err(message, "missing required argument");

      cfg.whitelist.add(target.id);
      saveAllConfigs();return ok(message, `**${target.username}** whitelisted from AntiNuke`);
    }
    if (sub === "unwhitelist") {
      const target = message.mentions.users.first() || await client.users.fetch(args[2]).catch(() => null);
      if (!target) return err(message, "missing required argument");

      cfg.whitelist.delete(target.id);
      saveAllConfigs();return ok(message, `**${target.username}** removed from AntiNuke whitelist`);
    }
    if (sub === "status" || !sub) {
      const wl = cfg.whitelist.size > 0 ? [...cfg.whitelist].map(id => `<@${id}>`).join(", ") : "None";
      return message.reply({ embeds: [{ color: PINK, title: "🛡️ AntiNuke Status", fields: [{ name: "Status", value: cfg.enabled ? "✅ Enabled" : "❌ Disabled", inline: true }, { name: "Punishment", value: cfg.punishment, inline: true }, { name: "Threshold", value: `${cfg.threshold} actions/10s`, inline: true }, { name: "Whitelist", value: wl }] }] });
    }
    return err(message, "missing required argument");

  }

  // ,antiraid <on|off|action|threshold|window|status|unlock>
  if (command === "antiraid") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator) && message.author.id !== message.guild.ownerId) return err(message, "Only the server owner or admins can configure antiraid.");
    const cfg = getAntiRaid(message.guild.id);
    const sub = args[1]?.toLowerCase();

    if (sub === "on" || sub === "enable") {
      cfg.enabled = true;
      saveAllConfigs();return ok(message, "**AntiRaid** enabled. Mass joins will trigger automatic lockdown.");
    }
    if (sub === "off" || sub === "disable") {
      cfg.enabled = false;
      saveAllConfigs();return ok(message, "**AntiRaid** disabled.");
    }
    if (sub === "action") {
      const a = args[2]?.toLowerCase();
      if (!["ban", "kick", "mute"].includes(a)) return err(message, "missing required argument");

      cfg.action = a;
      saveAllConfigs();return ok(message, `AntiRaid action set to **${a}**`);
    }
    if (sub === "threshold") {
      const n = parseInt(args[2]);
      return err(message, "missing required argument");


      cfg.joinThreshold = n;
      saveAllConfigs();return ok(message, `AntiRaid threshold set to **${n}** joins`);
    }
    if (sub === "window") {
      const n = parseInt(args[2]);
      if (isNaN(n) || n < 1) return err(message, "missing required argument");

      cfg.joinWindow = n * 1000;
      saveAllConfigs();return ok(message, `AntiRaid window set to **${n}** seconds`);
    }
    if (sub === "unlock") {
      lockedGuilds.delete(message.guild.id);
      const channels = message.guild.channels.cache.filter(c => c.type === 0);
      for (const ch of channels.values()) {
        await ch.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null }).catch(() => {});
      }
      saveAllConfigs();return ok(message, "Server unlocked manually.");
    }
    if (sub === "status" || !sub) {
      return message.reply({ embeds: [{ color: PINK, title: "🚨 AntiRaid Status", fields: [{ name: "Status", value: cfg.enabled ? "✅ Enabled" : "❌ Disabled", inline: true }, { name: "Action", value: cfg.action, inline: true }, { name: "Threshold", value: `${cfg.joinThreshold} joins`, inline: true }, { name: "Window", value: `${cfg.joinWindow / 1000}s`, inline: true }, { name: "Lockdown Active", value: lockedGuilds.has(message.guild.id) ? "🔒 Yes" : "✅ No", inline: true }] }] });
    }
    return err(message, "missing required argument");

  }

  // ,lockdown [reason] — manually lock all channels
  if (command === "lockdown") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const reason = args.slice(1).join(" ") || "Manual lockdown";
    const channels = message.guild.channels.cache.filter(c => c.type === 0);
    let count = 0;
    for (const ch of channels.values()) {
      await ch.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }).catch(() => {});
      count++;
    }
    lockedGuilds.add(message.guild.id);
    return ok(message, `**${count}** channels locked | ${reason}`);
  }

  // ,unlockdown — unlock all channels
  if (command === "unlockdown") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const channels = message.guild.channels.cache.filter(c => c.type === 0);
    let count = 0;
    for (const ch of channels.values()) {
      await ch.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null }).catch(() => {});
      count++;
    }
    lockedGuilds.delete(message.guild.id);
    return ok(message, `**${count}** channels unlocked.`);
  }

  // ,massnick <nickname> — change all members' nicknames
  if (command === "massnick") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const nick = args.slice(1).join(" ") || null;
    const members = await message.guild.members.fetch();
    let count = 0;
    message.reply({ embeds: [{ color: PINK, description: `🌸 Changing nicknames for ${members.size} members...` }] });
    for (const m of members.values()) {
      if (m.user.bot || m.id === message.guild.ownerId) continue;
      await m.setNickname(nick).catch(() => {});
      count++;
    }
    return message.channel.send({ embeds: [{ color: PINK, description: "🌸 " + `✅ Changed nicknames for **${count}** members.` }] });
  }

  // ,massrole <add|remove> <@role> — add/remove a role from everyone
  if (command === "massrole") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const action = args[1]?.toLowerCase();
    const role = message.mentions.roles.first();
    if (!role || !["add", "remove"].includes(action)) return err(message, "missing required argument");

    const members = await message.guild.members.fetch();
    message.reply({ embeds: [{ color: PINK, description: `🌸 Processing **${members.size}** members...` }] });
    let count = 0;
    for (const m of members.values()) {
      if (m.user.bot) continue;
      if (action === "add") await m.roles.add(role).catch(() => {});
      else await m.roles.remove(role).catch(() => {});
      count++;
    }
    return message.channel.send({ embeds: [{ color: PINK, description: "🌸 " + `✅ ${action === "add" ? "Added" : "Removed"} **${role.name}** for **${count}** members.` }] });
  }

  // ,logging <#channel | off> — set mod log channel
  if (command === "logging") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    if (args[1] === "off") {
      welcomeConfig.delete(`log-${message.guild.id}`);
      saveAllConfigs();return ok(message, "Logging disabled.");
    }
    const channel = message.mentions.channels.first();
    if (!channel) return err(message, "missing required argument");

    welcomeConfig.set(`log-${message.guild.id}`, { channelId: channel.id });
    saveAllConfigs();return ok(message, `Mod logs will be sent to ${channel}`);
  }

  // ,rolecreate <name> [color]
  if (command === "rolecreate") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return err(message, "Missing permissions.");
    const name = args[1];
    const color = args[2] || "#000000";
    if (!name) return err(message, "missing required argument");

    const role = await message.guild.roles.create({ name, color }).catch(() => null);
    if (!role) return err(message, "Could not create role.");
    return ok(message, `Created role **${role.name}**`);
  }

  // ,roledelete <@role>
  if (command === "roledelete") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return err(message, "Missing permissions.");
    const role = message.mentions.roles.first();
    if (!role) return err(message, "missing required argument");

    await role.delete().catch(() => null);
    return ok(message, `Deleted role **${role.name}**`);
  }

  // ,rolecolor <@role> <#color>
  if (command === "rolecolor") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return err(message, "Missing permissions.");
    const role = message.mentions.roles.first();
    const color = args[2];
    if (!role || !color) return err(message, "missing required argument");

    await role.setColor(color).catch(() => null);
    return ok(message, `Changed **${role.name}** color to **${color}**`);
  }

  // ,roleall — list all roles
  if (command === "roleall" || command === "roles") {
    const roles = message.guild.roles.cache.sort((a, b) => b.position - a.position);
    const list = roles.map(r => `<@&${r.id}> (${r.members.size})`).slice(0, 20).join("\n");
    return message.reply({ embeds: [{ color: PINK, title: `Roles (${roles.size})`, description: list }] });
  }

  // ,channelcreate <name> [text|voice]
  if (command === "channelcreate") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const name = args[1];
    const type = args[2]?.toLowerCase() === "voice" ? 2 : 0;
    if (!name) return err(message, "missing required argument");

    const ch = await message.guild.channels.create({ name, type }).catch(() => null);
    if (!ch) return err(message, "Could not create channel.");
    return ok(message, `Created ${type === 2 ? "voice" : "text"} channel **${ch.name}**`);
  }

  // ,channeldelete [#channel]
  if (command === "channeldelete") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const channel = message.mentions.channels.first() || message.channel;
    await channel.delete().catch(() => null);
    if (channel.id !== message.channel.id) ok(message, `✅ Deleted **${channel.name}**`);
  }

  // ,categorycreate <name>
  if (command === "categorycreate") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const name = args.slice(1).join(" ");
    if (!name) return err(message, "missing required argument");

    const cat = await message.guild.channels.create({ name, type: 4 }).catch(() => null);
    if (!cat) return err(message, "Could not create category.");
    return ok(message, `Created category **${cat.name}**`);
  }

  // ,modlogs [user] — show recent audit log entries
  if (command === "modlogs") {
    if (!message.member.permissions.has(PermissionFlagsBits.ViewAuditLog)) return err(message, "Missing permissions.");
    const target = message.mentions.users.first() || await client.users.fetch(args[1]).catch(() => null);
    const logs = await message.guild.fetchAuditLogs({ limit: 10 }).catch(() => null);
    if (!logs) return err(message, "Could not fetch audit logs.");
    let entries = [...logs.entries.values()];
    if (target) entries = entries.filter(e => e.target?.id === target.id || e.executor?.id === target.id);
    if (entries.length === 0) return message.reply("📋 No recent mod actions found.");
    const lines = entries.map(e => `**${e.action}** — by ${e.executor?.username || "Unknown"} on ${e.target?.username || e.target?.id || "Unknown"}\n*${e.reason || "No reason"}*`);
    return message.reply({ embeds: [{ color: PINK, title: "📋 Mod Logs", description: lines.join("\n\n").substring(0, 4096) }] });
  }

  // ,timeout <user> <duration> [reason] — discord native timeout
  if (command === "timeout") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    // Block action on boosters by role ID (unless owner)
    if (isProtectedBooster(target) && message.author.id !== OWNER_ID) return err(message, `**${target.user.username}** is a booster and cannot be punished.`);
    const timeStr = args[2];
    const match = timeStr?.match(/^(\d+)(s|m|h|d)$/);
    return err(message, "missing required argument");


    const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const ms = parseInt(match[1]) * units[match[2]];
    const reason = args.slice(3).join(" ") || "No reason";
    const toResult = await target.timeout(ms, reason).catch(() => null);
    if (!toResult) return err(message, `failed to timeout **${target.user.username}**`);
    return ok(message, `timed out **${target.user.username}** for **${timeStr}** | ${reason}`);
  }

  // ,untimeout <user>
  if (command === "untimeout") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    await target.timeout(null).catch(() => null);
    return ok(message, `Removed timeout from **${target.user.username}**`);
  }

  // ,baninfo <userId>
  if (command === "baninfo") {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return err(message, "Missing permissions.");
    const userId = args[1];
    if (!userId) return err(message, "missing required argument: **userId**");

    const ban = await message.guild.bans.fetch(userId).catch(() => null);
    if (!ban) return err(message, "User is not banned.");
    return message.reply({ embeds: [{ color: PINK, title: `🔨 Ban Info`, fields: [{ name: "User", value: ban.user.username, inline: true }, { name: "ID", value: ban.user.id, inline: true }, { name: "Reason", value: ban.reason || "No reason" }], thumbnail: { url: ban.user.displayAvatarURL() } }] });
  }

  // ,memberinfo <user> — detailed member info
  if (command === "memberinfo" || command === "mi") {
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null) || message.member;
    const perms = target.permissions.toArray().slice(0, 5).join(", ");
    return message.reply({ embeds: [{ color: target.displayColor || PINK, title: target.user.username, thumbnail: { url: target.user.displayAvatarURL({ size: 256 }) }, fields: [{ name: "ID", value: target.id, inline: true }, { name: "Nickname", value: target.nickname || "None", inline: true }, { name: "Joined", value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`, inline: true }, { name: "Created", value: `<t:${Math.floor(target.user.createdTimestamp / 1000)}:R>`, inline: true }, { name: "Boosting", value: target.premiumSince ? `<t:${Math.floor(target.premiumSinceTimestamp / 1000)}:R>` : "No", inline: true }, { name: `Roles (${target.roles.cache.size - 1})`, value: target.roles.cache.filter(r => r.id !== message.guild.id).map(r => `<@&${r.id}>`).slice(0, 8).join(" ") || "None" }, { name: "Key Perms", value: perms || "None" }] }] });
  }

  // ,whois <user> — alias for memberinfo
  if (command === "whois") {
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null) || message.member;
    const perms = target.permissions.toArray().slice(0, 5).join(", ");
    return message.reply({ embeds: [{ color: target.displayColor || PINK, title: target.user.username, thumbnail: { url: target.user.displayAvatarURL({ size: 256 }) }, fields: [{ name: "ID", value: target.id, inline: true }, { name: "Nickname", value: target.nickname || "None", inline: true }, { name: "Joined", value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`, inline: true }, { name: "Created", value: `<t:${Math.floor(target.user.createdTimestamp / 1000)}:R>`, inline: true }, { name: "Boosting", value: target.premiumSince ? "Yes ✅" : "No", inline: true }, { name: `Roles (${target.roles.cache.size - 1})`, value: target.roles.cache.filter(r => r.id !== message.guild.id).map(r => `<@&${r.id}>`).slice(0, 8).join(" ") || "None" }, { name: "Key Perms", value: perms || "None" }] }] });
  }

  // ,newmembers [count] — show most recently joined members
  if (command === "newmembers") {
    await message.channel.sendTyping().catch(() => {});
    const count = Math.min(parseInt(args[1]) || 10, 20);
    const members = (await message.guild.members.fetch()).sort((a, b) => b.joinedTimestamp - a.joinedTimestamp).first(count);
    const lines = members.map((m, i) => `**${i + 1}.** ${m.user.username} — <t:${Math.floor(m.joinedTimestamp / 1000)}:R>`);
    return message.reply({ embeds: [{ color: PINK, title: `🆕 Newest Members`, description: lines.join("\n") }] });
  }

  // ,oldmembers [count] — show oldest members
  if (command === "oldmembers") {
    await message.channel.sendTyping().catch(() => {});
    const count = Math.min(parseInt(args[1]) || 10, 20);
    const members = (await message.guild.members.fetch()).sort((a, b) => a.joinedTimestamp - b.joinedTimestamp).first(count);
    const lines = members.map((m, i) => `**${i + 1}.** ${m.user.username} — <t:${Math.floor(m.joinedTimestamp / 1000)}:R>`);
    return message.reply({ embeds: [{ color: PINK, title: `👴 Oldest Members`, description: lines.join("\n") }] });
  }

  // ,inrole <@role> — list members with a role
  if (command === "inrole") {
    const role = message.mentions.roles.first() || message.guild.roles.cache.find(r => r.name.toLowerCase() === args.slice(1).join(" ").toLowerCase());
    if (!role) return err(message, "missing required argument: **role**");
    const members = role.members;
    if (members.size === 0) return info(message, `no members have **${role.name}**.`);
    const list = members.map(m => m.user.username).slice(0, 30).join(", ");
    return message.reply({ embeds: [{ color: role.color || PINK, title: `${role.name} (${members.size})`, description: list }] });
  }

  // ,boostinfo — show all server boosters
  if (command === "boostinfo" || command === "boosters") {
    const boosters = message.guild.members.cache.filter(m => m.premiumSince);
    if (boosters.size === 0) return message.reply("No boosters.");
    const list = boosters.map(m => `${m.user.username} — <t:${Math.floor(m.premiumSinceTimestamp / 1000)}:R>`).join("\n");
    return message.reply({ embeds: [{ color: 0xFF73FA, title: `💜 Boosters (${boosters.size})`, description: list }] });
  }

  // ,servericon
  if (command === "servericon" || command === "sicon") {
    const url = message.guild.iconURL({ size: 1024 });
    if (!url) return err(message, "Server has no icon.");
    return message.reply({ embeds: [{ color: PINK, title: `${message.guild.name} Icon`, image: { url } }] });
  }

  // ,serverbanner
  if (command === "serverbanner") {
    const url = message.guild.bannerURL({ size: 1024 });
    if (!url) return err(message, "Server has no banner.");
    return message.reply({ embeds: [{ color: PINK, title: `${message.guild.name} Banner`, image: { url } }] });
  }

  // ,bind staff <@role> — mark role as staff (for antinuke)
  if (command === "bind") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const sub = args[1]?.toLowerCase();
    if (sub === "staff") {
      const role = message.mentions.roles.first();
      if (!role) return err(message, "missing required argument");

      const cfg = getAntiNuke(message.guild.id);
      cfg.whitelist.add(role.id);
      return ok(message, `**${role.name}** marked as staff role (whitelisted in AntiNuke)`);
    }
    return err(message, "missing required argument");

  }

  // ,clearsnipe
  if (command === "clearsnipe" || command === "cs") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    sniped.delete(message.channel.id);
    editSniped.delete(message.channel.id);
    return ok(message, "Snipe cleared.");
  }

  // ,identify <userId> — look up a user by ID
  if (command === "identify" || command === "lookup") {
    const userId = args[1];
    if (!userId) return err(message, "missing required argument: **userId**");

    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return err(message, "missing required argument: **user**");
    return message.reply({ embeds: [{ color: PINK, title: user.username, thumbnail: { url: user.displayAvatarURL({ size: 256 }) }, fields: [{ name: "ID", value: user.id, inline: true }, { name: "Bot", value: user.bot ? "Yes" : "No", inline: true }, { name: "Created", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true }] }] });
  }
});

// ===================================================
// ===== EXTENDED MODERATION (130+ commands) =========
// ===================================================

// ── AUTOMOD / FILTER SYSTEM ─────────────────────────
const filterConfig = new Map();
const spamTracker = new Map();    // userId-guildId => [timestamps]
const automodExempt = new Map();
const modlogChannel = new Map();

function getFilter(guildId) {
  if (!filterConfig.has(guildId)) filterConfig.set(guildId, { enabled: false, words: [], links: false, invites: false, caps: false, spam: false, maxMentions: 5, mentions: false });
  return filterConfig.get(guildId);
}
function getExempt(guildId) {
  if (!automodExempt.has(guildId)) automodExempt.set(guildId, { roles: new Set(), channels: new Set() });
  return automodExempt.get(guildId);
}

async function sendModLog(guild, embed) {
  const chId = modlogChannel.get(guild.id);
  if (!chId) return;
  const ch = guild.channels.cache.get(chId);
  if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
}

// Automod message scanner
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild || message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;
  const filter = getFilter(message.guild.id);
  if (!filter.enabled) return;
  const exempt = getExempt(message.guild.id);
  if (exempt.channels.has(message.channel.id)) return;
  if (message.member?.roles.cache.some(r => exempt.roles.has(r.id))) return;

  const content = message.content;
  let triggered = null;

  // Bad words
  if (filter.words.length > 0 && filter.words.some(w => content.toLowerCase().includes(w.toLowerCase()))) triggered = "Banned word";
  // Links
  if (!triggered && filter.links && /https?:\/\/[^\s]+/.test(content)) triggered = "Unauthorized link";
  // Discord invites
  if (!triggered && filter.invites && /(discord\.gg|discord\.com\/invite)\/[a-zA-Z0-9]+/.test(content)) triggered = "Discord invite";
  // Caps (>70% caps, >8 chars)
  if (!triggered && filter.caps && content.length > 8) {
    const upper = content.replace(/[^a-zA-Z]/g, "");
    if (upper.length > 0 && (upper.split("").filter(c => c === c.toUpperCase()).length / upper.length) > 0.7) triggered = "Excessive caps";
  }
  // Spam (5 messages in 5s)
  if (!triggered && filter.spam) {
    const key = `${message.author.id}-${message.guild.id}`;
    const now = Date.now();
    const times = (spamTracker.get(key) || []).filter(t => now - t < 5000);
    times.push(now);
    spamTracker.set(key, times);
    if (times.length >= 5) triggered = "Spam";
  }
  // Mass mentions
  if (!triggered && filter.mentions && message.mentions.users.size >= filter.maxMentions) triggered = `Mass mention (${message.mentions.users.size})`;

  if (triggered) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send(`⚠️ ${message.author} your message was removed: **${triggered}**`);
    setTimeout(() => warn.delete().catch(() => {}), 5000);
    await sendModLog(message.guild, { color: PINK, title: "🤖 AutoMod", fields: [{ name: "User", value: message.author.username, inline: true }, { name: "Channel", value: `<#${message.channel.id}>`, inline: true }, { name: "Reason", value: triggered, inline: true }, { name: "Message", value: content.substring(0, 512) }], timestamp: new Date() });
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(",")) return;
  const args = message.content.slice(1).trim().split(/ +/);
  const command = args[0].toLowerCase();
  if (ignoreList.get(message.guild?.id)?.has(message.author.id)) return;


  // ── PURGE FILTERS ───────────────────────────────────

  // ,purge bots [amount]
  if (command === "purge" && args[1] === "bots") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const msgs = await message.channel.messages.fetch({ limit: 100 });
    const toDelete = msgs.filter(m => m.author.bot).first(parseInt(args[2]) || 100);
    await message.channel.bulkDelete(toDelete, true).catch(() => {});
    const m = await message.channel.send({ embeds: [{ color: PINK, description: "🌸 " + `✅ Deleted ${toDelete.size} bot messages.` }] });
    setTimeout(() => m.delete().catch(() => {}), 3000);
  }

  // ,purge images [amount]
  if (command === "purge" && args[1] === "images") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const msgs = await message.channel.messages.fetch({ limit: 100 });
    const toDelete = msgs.filter(m => m.attachments.size > 0 || m.embeds.some(e => e.image)).first(parseInt(args[2]) || 100);
    await message.channel.bulkDelete(toDelete, true).catch(() => {});
    const m = await message.channel.send({ embeds: [{ color: PINK, description: "🌸 " + `✅ Deleted ${toDelete.size} image messages.` }] });
    setTimeout(() => m.delete().catch(() => {}), 3000);
  }

  // ,purge links [amount]
  if (command === "purge" && args[1] === "links") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const msgs = await message.channel.messages.fetch({ limit: 100 });
    const toDelete = msgs.filter(m => /https?:\/\/[^\s]+/.test(m.content)).first(parseInt(args[2]) || 100);
    await message.channel.bulkDelete(toDelete, true).catch(() => {});
    const m = await message.channel.send({ embeds: [{ color: PINK, description: "🌸 " + `✅ Deleted ${toDelete.size} link messages.` }] });
    setTimeout(() => m.delete().catch(() => {}), 3000);
  }

  // ,purge embeds [amount]
  if (command === "purge" && args[1] === "embeds") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const msgs = await message.channel.messages.fetch({ limit: 100 });
    const toDelete = msgs.filter(m => m.embeds.length > 0).first(parseInt(args[2]) || 100);
    await message.channel.bulkDelete(toDelete, true).catch(() => {});
    const m = await message.channel.send({ embeds: [{ color: PINK, description: "🌸 " + `✅ Deleted ${toDelete.size} embed messages.` }] });
    setTimeout(() => m.delete().catch(() => {}), 3000);
  }

  // ,purge user <@user|id> — deletes ALL messages from user in this channel
  if (command === "purge" && args[1] === "user") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const target = message.mentions.users.first() || await client.users.fetch(args[2]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**\nusage: `,purge user @user`");

    const statusMsg = await message.channel.send({ embeds: [{ color: PINK, description: `🌸 Scanning and deleting all messages from **${target.username}**... this may take a moment` }] });

    let deleted = 0;
    let lastId = undefined;
    let keepGoing = true;

    while (keepGoing) {
      const options = { limit: 100 };
      if (lastId) options.before = lastId;

      const batch = await message.channel.messages.fetch(options).catch(() => null);
      if (!batch || batch.size === 0) { keepGoing = false; break; }

      const userMsgs = [...batch.filter(m => m.author.id === target.id).values()];
      lastId = batch.last().id;

      // Bulk delete recent messages (< 14 days)
      const recent = userMsgs.filter(m => Date.now() - m.createdTimestamp < 12 * 24 * 60 * 60 * 1000);
      const old = userMsgs.filter(m => Date.now() - m.createdTimestamp >= 12 * 24 * 60 * 60 * 1000);

      if (recent.length > 0) {
        await message.channel.bulkDelete(recent, true).catch(() => {});
        deleted += recent.length;
      }
      // Delete old messages one by one (bulkDelete doesn't work on these)
      for (const msg of old) {
        await msg.delete().catch(() => {});
        deleted++;
        await new Promise(r => setTimeout(r, 300));
      }

      if (deleted > 0 && deleted % 50 === 0) {
        statusMsg.edit({ embeds: [{ color: PINK, description: `🌸 Deleted **${deleted}** messages from **${target.username}** so far...` }] }).catch(() => {});
      }

      if (batch.size < 100) keepGoing = false;
    }

    await statusMsg.edit({ embeds: [{ color: PINK, description: `🌸 deleted **${deleted}** messages from **${target.username}**` }] }).catch(() => {});
    setTimeout(() => statusMsg.delete().catch(() => {}), 5000);
    return;
  }

  // ,purge contains <text> [amount]
  if (command === "purge" && args[1] === "contains") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const text = args[2];
    if (!text) return err(message, "missing required argument");

    const msgs = await message.channel.messages.fetch({ limit: 100 });
    const toDelete = msgs.filter(m => m.content.toLowerCase().includes(text.toLowerCase())).first(parseInt(args[3]) || 100);
    await message.channel.bulkDelete(toDelete, true).catch(() => {});
    const m = await message.channel.send({ embeds: [{ color: PINK, description: "🌸 " + `✅ Deleted ${toDelete.size} messages containing **${text}**.` }] });
    setTimeout(() => m.delete().catch(() => {}), 3000);
  }

  // ,purge startswith <text>
  if (command === "purge" && args[1] === "startswith") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const text = args[2];
    if (!text) return err(message, "missing required argument");

    const msgs = await message.channel.messages.fetch({ limit: 100 });
    const toDelete = msgs.filter(m => m.content.toLowerCase().startsWith(text.toLowerCase())).first(100);
    await message.channel.bulkDelete(toDelete, true).catch(() => {});
    const m = await message.channel.send({ embeds: [{ color: PINK, description: "🌸 " + `✅ Deleted ${toDelete.size} messages.` }] });
    setTimeout(() => m.delete().catch(() => {}), 3000);
  }

  // ,purge mentions [amount]
  if (command === "purge" && args[1] === "mentions") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const msgs = await message.channel.messages.fetch({ limit: 100 });
    const toDelete = msgs.filter(m => m.mentions.users.size > 0).first(parseInt(args[2]) || 100);
    await message.channel.bulkDelete(toDelete, true).catch(() => {});
    const m = await message.channel.send({ embeds: [{ color: PINK, description: "🌸 " + `✅ Deleted ${toDelete.size} messages with mentions.` }] });
    setTimeout(() => m.delete().catch(() => {}), 3000);
  }

  // ,purge humans [amount]
  if (command === "purge" && args[1] === "humans") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const msgs = await message.channel.messages.fetch({ limit: 100 });
    const toDelete = msgs.filter(m => !m.author.bot).first(parseInt(args[2]) || 100);
    await message.channel.bulkDelete(toDelete, true).catch(() => {});
    const m = await message.channel.send({ embeds: [{ color: PINK, description: "🌸 " + `✅ Deleted ${toDelete.size} human messages.` }] });
    setTimeout(() => m.delete().catch(() => {}), 3000);
  }

  // ── FILTER / AUTOMOD COMMANDS ────────────────────────

  // ,filter <on|off|add|remove|list|links|invites|caps|spam|mentions>
  if (command === "filter") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const cfg = getFilter(message.guild.id);
    const sub = args[1]?.toLowerCase();
    if (sub === "on") { cfg.enabled = true; return ok(message, "AutoMod filter enabled."); }
    if (sub === "off") { cfg.enabled = false; return ok(message, "AutoMod filter disabled."); }
    if (sub === "add") {
      const word = args.slice(2).join(" ");
      if (!word) return err(message, "missing required argument");

      cfg.words.push(word.toLowerCase());
      saveAllConfigs();return ok(message, `Added **${word}** to filter.`);
    }
    if (sub === "remove") {
      const word = args.slice(2).join(" ").toLowerCase();
      cfg.words = cfg.words.filter(w => w !== word);
      saveAllConfigs();return ok(message, `Removed **${word}** from filter.`);
    }
    if (sub === "list") return message.reply({ embeds: [{ color: PINK, title: "Filter Words", description: cfg.words.length > 0 ? cfg.words.map((w, i) => `${i + 1}. \`${w}\``).join("\n") : "No words filtered." }] });
    if (sub === "links") { cfg.links = !cfg.links; return ok(message, `Link filter: **${cfg.links ? "on" : "off"}**`); }
    if (sub === "invites") { cfg.invites = !cfg.invites; return ok(message, `Invite filter: **${cfg.invites ? "on" : "off"}**`); }
    if (sub === "caps") { cfg.caps = !cfg.caps; return ok(message, `Caps filter: **${cfg.caps ? "on" : "off"}**`); }
    if (sub === "spam") { cfg.spam = !cfg.spam; return ok(message, `Spam filter: **${cfg.spam ? "on" : "off"}**`); }
    if (sub === "mentions") {
      const max = parseInt(args[2]);
      if (!isNaN(max)) { cfg.maxMentions = max; cfg.mentions = true; return ok(message, `Mention filter: on (max **${max}**)`); }
      cfg.mentions = !cfg.mentions;
      saveAllConfigs();return ok(message, `Mention filter: **${cfg.mentions ? "on" : "off"}**`);
    }
    if (sub === "status" || !sub) return message.reply({ embeds: [{ color: PINK, title: "🤖 AutoMod Status", fields: [{ name: "Status", value: cfg.enabled ? "✅ On" : "❌ Off", inline: true }, { name: "Links", value: cfg.links ? "✅" : "❌", inline: true }, { name: "Invites", value: cfg.invites ? "✅" : "❌", inline: true }, { name: "Caps", value: cfg.caps ? "✅" : "❌", inline: true }, { name: "Spam", value: cfg.spam ? "✅" : "❌", inline: true }, { name: "Mentions", value: cfg.mentions ? `✅ (max ${cfg.maxMentions})` : "❌", inline: true }, { name: "Banned Words", value: `${cfg.words.length}` }] }] });
    return err(message, "missing required argument");

  }

  // ,filter exempt <add|remove> <@role|#channel>
  if (command === "filterexempt" || (command === "filter" && args[1] === "exempt")) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const exempt = getExempt(message.guild.id);
    const action = command === "filterexempt" ? args[1] : args[2];
    const role = message.mentions.roles.first();
    const channel = message.mentions.channels.first();
    if (!role && !channel) return err(message, "missing required argument");

    if (action === "add") {
      if (role) { exempt.roles.add(role.id); return ok(message, `**${role.name}** exempted from filter.`); }
      if (channel) { exempt.channels.add(channel.id); return ok(message, `${channel} exempted from filter.`); }
    }
    if (action === "remove") {
      if (role) { exempt.roles.delete(role.id); return ok(message, `**${role.name}** removed from filter exemptions.`); }
      if (channel) { exempt.channels.delete(channel.id); return ok(message, `${channel} removed from filter exemptions.`); }
    }
  }

  // ── MOD LOG SETUP ────────────────────────────────────

  // ,modlog <#channel | off>
  if (command === "modlog" || command === "modlogs" && args[1]?.startsWith("<#")) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    if (args[1] === "off") { modlogChannel.delete(message.guild.id); return ok(message, "Mod logs disabled."); }
    const ch = message.mentions.channels.first();
    if (!ch) return err(message, "missing required argument");

    modlogChannel.set(message.guild.id, ch.id);
    return ok(message, `Mod logs → ${ch}`);
  }

  // ── HACKBAN ──────────────────────────────────────────

  // ,hackban <userId> [reason] — ban user not in server
  if (command === "hackban") {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return err(message, "Missing permissions.");
    const userId = args[1];
    if (!userId) return err(message, "missing required argument: **userId**");

    const reason = args.slice(2).join(" ") || "Hackban";
    recentBoosters.delete(userId);
    await message.guild.members.ban(userId, { reason }).catch(() => null);
    return ok(message, `hackbanned user **${userId}** | ${reason}`);
  }

  // ,unbanall — unban everyone
  if (command === "unbanall") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const bans = await message.guild.bans.fetch();
    if (bans.size === 0) return info(message, "No banned users.");
    await confirm(message, `Are you sure you want to **unban all ${bans.size} users**?\n\nThis action is **irreversable**.`, async () => {
      for (const ban of bans.values()) await message.guild.bans.remove(ban.user.id).catch(() => {});
      message.channel.send({ embeds: [{ color: PINK, description: `🌸 Unbanned **${bans.size}** users.` }] });
    });
  }

  // ,banreason <userId> <reason> — update ban reason
  if (command === "banreason") {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return err(message, "Missing permissions.");
    const userId = args[1];
    const reason = args.slice(2).join(" ");
    if (!userId || !reason) return err(message, "missing required argument");

    const ban = await message.guild.bans.fetch(userId).catch(() => null);
    if (!ban) return err(message, "User is not banned.");
    await message.guild.bans.remove(userId).catch(() => {});
    await message.guild.members.ban(userId, { reason }).catch(() => {});
    return ok(message, `ban reason updated for **${userId}**`);
  }

  // ── HISTORY ──────────────────────────────────────────

  // ,history <@user> — show all moderation actions for a user
  if (command === "history") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.users.first() || await client.users.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    const key = `${message.guild.id}-${target.id}`;
    const warnList = warns.get(key) || [];
    const isBanned = await message.guild.bans.fetch(target.id).catch(() => null);
    const fields = [];
    if (warnList.length > 0) fields.push({ name: `⚠️ Warns (${warnList.length})`, value: warnList.map((w, i) => `${i + 1}. ${w.reason} — ${w.mod}`).join("\n").substring(0, 1024) });
    if (isBanned) fields.push({ name: "🔨 Banned", value: isBanned.reason || "No reason" });
    if (fields.length === 0) fields.push({ name: "Clean record", value: "No moderation actions found." });
    return message.reply({ embeds: [{ color: PINK, title: `📋 History: ${target.username}`, thumbnail: { url: target.displayAvatarURL() }, fields }] });
  }

  // ,clearhistory <@user>
  if (command === "clearhistory") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const target = message.mentions.users.first() || await client.users.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    warns.delete(`${message.guild.id}-${target.id}`);
    return ok(message, `Cleared history for **${target.username}**`);
  }

  // ── ROLE MANAGEMENT EXTENDED ─────────────────────────

  // ,roleicon <@role> <emoji>
  if (command === "roleicon") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return err(message, "Missing permissions.");
    const role = message.mentions.roles.first();
    const emoji = args[2];
    if (!role || !emoji) return err(message, "missing required argument");

    await role.setUnicodeEmoji(emoji).catch(() => null);
    return ok(message, `Set icon for **${role.name}**`);
  }

  // ,rolehoist <@role> — toggle hoist
  if (command === "rolehoist") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return err(message, "Missing permissions.");
    const role = message.mentions.roles.first();
    if (!role) return err(message, "missing required argument");

    await role.setHoist(!role.hoist).catch(() => null);
    return ok(message, `**${role.name}** hoist: **${!role.hoist}**`);
  }

  // ,rolemention <@role> — toggle mentionable
  if (command === "rolemention") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return err(message, "Missing permissions.");
    const role = message.mentions.roles.first();
    if (!role) return err(message, "missing required argument");

    await role.setMentionable(!role.mentionable).catch(() => null);
    return ok(message, `**${role.name}** mentionable: **${!role.mentionable}**`);
  }

  // ,giverole <@user> <@role> — alias
  if (command === "giverole" || command === "addrole") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first();
    const role = message.mentions.roles.first();
    if (!target || !role) return err(message, "missing required argument");

    await target.roles.add(role).catch(() => null);
    return ok(message, `Added **${role.name}** to **${target.user.username}**`);
  }

  // ,takerole <@user> <@role> — alias
  if (command === "takerole" || command === "removerole") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first();
    const role = message.mentions.roles.first();
    if (!target || !role) return err(message, "missing required argument");

    await target.roles.remove(role).catch(() => null);
    return ok(message, `Removed **${role.name}** from **${target.user.username}**`);
  }

  // ,roleperms <@role> — show role permissions
  if (command === "roleperms") {
    const role = message.mentions.roles.first();
    if (!role) return err(message, "missing required argument");

    const perms = role.permissions.toArray();
    return message.reply({ embeds: [{ color: role.color || PINK, title: `Permissions: ${role.name}`, description: perms.length > 0 ? perms.join(", ") : "No permissions" }] });
  }

  // ── CHANNEL MANAGEMENT EXTENDED ──────────────────────

  // ,channelclone [#channel]
  if (command === "channelclone") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const ch = message.mentions.channels.first() || message.channel;
    const clone = await ch.clone().catch(() => null);
    if (!clone) return err(message, "Could not clone channel.");
    return ok(message, `Cloned to ${clone}`);
  }

  // ,lockall — lock all text channels
  if (command === "lockall") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const channels = message.guild.channels.cache.filter(c => c.type === 0);
    for (const ch of channels.values()) await ch.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }).catch(() => {});
    return ok(message, `Locked **${channels.size}** channels.`);
  }

  // ,unlockall — unlock all text channels
  if (command === "unlockall") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const channels = message.guild.channels.cache.filter(c => c.type === 0);
    for (const ch of channels.values()) await ch.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null }).catch(() => {});
    return ok(message, `Unlocked **${channels.size}** channels.`);
  }

  // ,hideall — hide all channels from everyone
  if (command === "hideall") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const channels = message.guild.channels.cache.filter(c => c.type === 0);
    for (const ch of channels.values()) await ch.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: false }).catch(() => {});
    return ok(message, `hidden **${channels.size}** channels`);
  }

  // ,unhideall
  if (command === "unhideall") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const channels = message.guild.channels.cache.filter(c => c.type === 0);
    for (const ch of channels.values()) await ch.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: null }).catch(() => {});
    return ok(message, `unhidden **${channels.size}** channels`);
  }

  // ,slowmodeall <seconds>
  if (command === "slowmodeall") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const seconds = parseInt(args[1]) ?? 0;
    const channels = message.guild.channels.cache.filter(c => c.type === 0);
    for (const ch of channels.values()) await ch.setRateLimitPerUser(seconds).catch(() => {});
    return message.reply(seconds === 0 ? `✅ Slowmode disabled in all channels.` : `✅ Slowmode set to **${seconds}s** in all channels.`);
  }

  // ── VOICE MODERATION ─────────────────────────────────

  // ,vcmute <@user>
  if (command === "vcmute") {
    if (!message.member.permissions.has(PermissionFlagsBits.MuteMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    if (!target.voice.channel) return err(message, "User is not in a voice channel.");
    await target.voice.setMute(true).catch(() => null);
    return ok(message, `Voice muted **${target.user.username}**`);
  }

  // ,vcunmute <@user>
  if (command === "vcunmute") {
    if (!message.member.permissions.has(PermissionFlagsBits.MuteMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    await target.voice.setMute(false).catch(() => null);
    return ok(message, `Voice unmuted **${target.user.username}**`);
  }

  // ,vcdeafen <@user>
  if (command === "vcdeafen") {
    if (!message.member.permissions.has(PermissionFlagsBits.DeafenMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    await target.voice.setDeaf(true).catch(() => null);
    return ok(message, `Deafened **${target.user.username}**`);
  }

  // ,vcundeafen <@user>
  if (command === "vcundeafen") {
    if (!message.member.permissions.has(PermissionFlagsBits.DeafenMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    await target.voice.setDeaf(false).catch(() => null);
    return ok(message, `Undeafened **${target.user.username}**`);
  }

  // ,vckick <@user>
  if (command === "vckick") {
    if (!message.member.permissions.has(PermissionFlagsBits.MoveMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    if (!target.voice.channel) return err(message, "User is not in a voice channel.");
    await target.voice.disconnect().catch(() => null);
    return ok(message, `kicked **${target.user.username}** from voice`);
  }

  // ,vcmove <@user> <#channel>
  if (command === "vcmove") {
    if (!message.member.permissions.has(PermissionFlagsBits.MoveMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first();
    const channel = message.mentions.channels.first();
    if (!target || !channel) return err(message, "missing required argument");

    await target.voice.setChannel(channel).catch(() => null);
    return ok(message, `Moved **${target.user.username}** to ${channel}`);
  }

  // ,vcmuteall — mute everyone in a voice channel
  if (command === "vcmuteall") {
    if (!message.member.permissions.has(PermissionFlagsBits.MuteMembers)) return err(message, "Missing permissions.");
    const vc = message.member.voice.channel;
    if (!vc) return err(message, "You must be in a voice channel.");
    for (const m of vc.members.values()) await m.voice.setMute(true).catch(() => {});
    return ok(message, `Muted **${vc.members.size}** members in **${vc.name}**`);
  }

  // ,vcunmuteall
  if (command === "vcunmuteall") {
    if (!message.member.permissions.has(PermissionFlagsBits.MuteMembers)) return err(message, "Missing permissions.");
    const vc = message.member.voice.channel;
    if (!vc) return err(message, "You must be in a voice channel.");
    for (const m of vc.members.values()) await m.voice.setMute(false).catch(() => {});
    return ok(message, `Unmuted **${vc.members.size}** members in **${vc.name}**`);
  }

  // ── SERVER SETTINGS ──────────────────────────────────

  // ,setname <n> — rename server
  if (command === "setname") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const name = args.slice(1).join(" ");
    if (!name) return err(message, "missing required argument");

    await message.guild.setName(name).catch(() => null);
    return ok(message, `Server renamed to **${name}**`);
  }

  // ,setdescription <text>
  if (command === "setdescription" || command === "setdesc") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const desc = args.slice(1).join(" ") || null;
    await message.guild.setDescription(desc).catch(() => null);
    return ok(message, `Server description ${desc ? "updated" : "cleared"}.`);
  }

  // ,vanity — show server vanity URL
  if (command === "vanity") {
    const vanity = message.guild.vanityURLCode;
    if (!vanity) return err(message, "This server has no vanity URL.");
    return info(message, `Vanity URL: **discord.gg/${vanity}** (${message.guild.vanityURLUses} uses)`);
  }

  // ,verification <none|low|medium|high|highest>
  if (command === "verification") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const levels = { none: 0, low: 1, medium: 2, high: 3, highest: 4 };
    const level = levels[args[1]?.toLowerCase()];
    if (level === undefined) return err(message, "missing required argument");

    await message.guild.setVerificationLevel(level).catch(() => null);
    return ok(message, `Verification level set to **${args[1]}**`);
  }

  // ,contentfilter <disabled|members|all>
  if (command === "contentfilter") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const levels = { disabled: 0, members: 1, all: 2 };
    const level = levels[args[1]?.toLowerCase()];
    if (level === undefined) return err(message, "missing required argument");

    await message.guild.setExplicitContentFilter(level).catch(() => null);
    return ok(message, `Content filter set to **${args[1]}**`);
  }

  // ,invitecheck — show all invites and their usage
  if (command === "invitecheck") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const invites = await message.guild.invites.fetch().catch(() => null);
    if (!invites || invites.size === 0) return message.reply("No active invites.");
    const sorted = invites.sort((a, b) => (b.uses || 0) - (a.uses || 0));
    const list = sorted.map(i => `**discord.gg/${i.code}** — ${i.inviter?.username || "Unknown"} | ${i.uses} uses | expires: ${i.maxAge ? `${i.maxAge / 3600}h` : "never"}`).slice(0, 15).join("\n");
    return message.reply({ embeds: [{ color: PINK, title: `📨 Invites (${invites.size})`, description: list }] });
  }

  // ,deleteinvite <code>
  if (command === "deleteinvite") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const code = args[1];
    if (!code) return err(message, "missing required argument");

    await client.fetchInvite(code).then(inv => inv.delete()).catch(() => null);
    return ok(message, `Deleted invite **${code}**`);
  }

  // ,deleteallinvites — delete all invites
  if (command === "deleteallinvites") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const invites = await message.guild.invites.fetch().catch(() => null);
    if (!invites) return err(message, "Could not fetch invites.");
    for (const inv of invites.values()) await inv.delete().catch(() => {});
    return ok(message, `Deleted **${invites.size}** invites.`);
  }

  // ── REACTION ROLES ────────────────────────────────────
  // ,reactionrole <messageId> <emoji> <@role>
  if (command === "reactionrole" || command === "rr") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return err(message, "Missing permissions.");
    const msgId = args[1];
    const emoji = args[2];
    const role = message.mentions.roles.first();
    if (!msgId || !emoji || !role) return err(message, "missing required argument");

    reactionRoles.set(`${msgId}-${emoji}`, role.id);
    try {
      const msg = await message.channel.messages.fetch(msgId);
      await msg.react(emoji);
    } catch {}
    return ok(message, `Reaction role set: ${emoji} → **${role.name}**`);
  }

  // ── USEFUL EXTRAS ─────────────────────────────────────

  // ,massban <userId1> <userId2> ... — ban multiple users
  if (command === "massban") {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return err(message, "Missing permissions.");
    const ids = args.slice(1).filter(id => /^\d+$/.test(id));
    if (ids.length === 0) return err(message, "missing required argument");

    message.reply({ embeds: [{ color: PINK, description: `🌸 Banning **${ids.length}** users...` }] });
    let count = 0;
    for (const id of ids) {
      recentBoosters.delete(id);
      await message.guild.members.ban(id, { reason: `[Massban] by ${message.author.username}` }).catch(() => {});
      count++;
    }
    return message.channel.send({ embeds: [{ color: PINK, description: "🌸 " + `✅ Banned **${count}** users.` }] });
  }

  // ,masskick <@user1> <@user2> ...
  if (command === "masskick") {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return err(message, "Missing permissions.");
    const targets = [...message.mentions.members.values()];
    if (targets.length === 0) return err(message, "missing required argument");

    message.reply({ embeds: [{ color: PINK, description: `🌸 Kicking **${targets.length}** users...` }] });
    for (const t of targets) await t.kick(`[Masskick] by ${message.author.username}`).catch(() => {});
    return message.channel.send({ embeds: [{ color: PINK, description: "🌸 " + `✅ Kicked **${targets.length}** users.` }] });
  }

  // ,timeout all <duration> — timeout everyone
  if (command === "timeoutall") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const timeStr = args[1];
    const match = timeStr?.match(/^(\d+)(s|m|h)$/);
    return err(message, "missing required argument");


    const units = { s: 1000, m: 60000, h: 3600000 };
    const ms = parseInt(match[1]) * units[match[2]];
    const members = await message.guild.members.fetch();
    message.reply({ embeds: [{ color: PINK, description: `🌸 Timing out **${members.size}** members...` }] });
    for (const m of members.values()) {
      if (m.user.bot || m.id === message.guild.ownerId) continue;
      await m.timeout(ms).catch(() => {});
    }
    return message.channel.send({ embeds: [{ color: PINK, description: "🌸 " + `✅ Timed out all members for **${timeStr}**.` }] });
  }

  // ,untimeoutall
  if (command === "untimeoutall") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const members = await message.guild.members.fetch();
    for (const m of members.values()) {
      if (m.communicationDisabledUntil) await m.timeout(null).catch(() => {});
    }
    return ok(message, `Removed all timeouts.`);
  }

  // ,note <@user> <text> — add a private note to a user
  if (command === "note") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.users.first();
    const text = args.slice(2).join(" ");
    if (!target || !text) return err(message, "missing required argument");

    const key = `${message.guild.id}-${target.id}`;
    const list = notes.get(key) || [];
    list.push({ text, mod: message.author.username, date: new Date().toLocaleDateString() });
    notes.set(key, list);
    return ok(message, `Note added for **${target.username}**`);
  }

  // ,notes <@user> — view notes
  if (command === "notes") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.users.first() || await client.users.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    const list = notes.get(`${message.guild.id}-${target.id}`) || [];
    if (list.length === 0) return info(message, `no notes for **${target.username}**.`);
    return message.reply({ embeds: [{ color: PINK, title: `📋 Notes: ${target.username}`, description: list.map((n, i) => `**${i + 1}.** ${n.text}\n— ${n.mod} (${n.date})`).join("\n\n") }] });
  }

  // ,clearnotes <@user>
  if (command === "clearnotes") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const target = message.mentions.users.first() || await client.users.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    notes.delete(`${message.guild.id}-${target.id}`);
    return ok(message, `Cleared notes for **${target.username}**`);
  }

  // ,moved <@user> <#channel> — move user messages context (just informs)
  if (command === "move") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const target = message.mentions.users.first();
    const channel = message.mentions.channels.first();
    if (!target || !channel) return err(message, "missing required argument");

    return info(message, `**${target.username}** please continue in ${channel}`);
  }

  // ,report <@user> <reason> — report a user to mods
  if (command === "report") {
    const target = message.mentions.users.first();
    const reason = args.slice(2).join(" ");
    if (!target || !reason) return err(message, "missing required argument");

    const logChId = modlogChannel.get(message.guild.id);
    if (logChId) {
      const logCh = message.guild.channels.cache.get(logChId);
      if (logCh) await logCh.send({ embeds: [{ color: PINK, title: "📢 User Report", fields: [{ name: "Reported User", value: target.username, inline: true }, { name: "Reported By", value: message.author.username, inline: true }, { name: "Channel", value: `<#${message.channel.id}>`, inline: true }, { name: "Reason", value: reason }], timestamp: new Date() }] });
    }
    return ok(message, `Report submitted for **${target.username}**`);
  }
});

// Reaction roles handler
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});
  const roleId = reactionRoles.get(`${reaction.message.id}-${reaction.emoji.name}`);
  if (!roleId) return;
  const member = await reaction.message.guild?.members.fetch(user.id).catch(() => null);
  if (member) await member.roles.add(roleId).catch(() => {});
});

client.on("messageReactionRemove", async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});
  const roleId = reactionRoles.get(`${reaction.message.id}-${reaction.emoji.name}`);
  if (!roleId) return;
  const member = await reaction.message.guild?.members.fetch(user.id).catch(() => null);
  if (member) await member.roles.remove(roleId).catch(() => {});
});

// ===================================================
// ===== MASSIVE EXTENSION — 250+ NEW COMMANDS =======
// ===================================================

// ── IN-MEMORY STORES ────────────────────────────────
const vanityLock = new Map();
const customCommands = new Map();
const disabledCommands = new Map();
const aliases = new Map();
const boosterRoles = new Map();      // userId-guildId => roleId (custom booster role)
const reactionTriggers = new Map();
const counters = new Map();
const stickyMessages = new Map();    // channelId => { content, msgId }
const bumpReminder = new Map();      // guildId => { channelId, lastBump, reminded }
const joinToCreate = new Map();      // guildId => { triggerVcId, categoryId }
const tempVoiceChannels = new Set(); // channelIds of temp vc
const confessions = new Map();       // guildId => channelId
const appealConfig = new Map();      // guildId => channelId
const medicConfig = new Map();       // guildId => { roleId }
const fakePerms = new Map();         // guildId-roleId => [permissions]
const autoResponders = new Map();    // guildId => [{ trigger, response, exact }]
const birthdayData = new Map();      // userId => { day, month }
const birthdayChannel = new Map();
const muteRole = new Map();
const ignoreList = new Map();        // guildId => Set<userId> (ignored from all cmds)
const blacklistWords = new Map();    // guildId => Set<word>
const warnThresholds = new Map();
const caseCounter = new Map();       // guildId => number
const cases = new Map();             // guildId-caseId => { type, user, mod, reason, date }

function nextCase(guildId) {
  const n = (caseCounter.get(guildId) || 0) + 1;
  caseCounter.set(guildId, n);
  return n;
}

function addCase(guildId, type, userId, modId, reason) {
  const id = nextCase(guildId);
  cases.set(`${guildId}-${id}`, { id, type, userId, modId, reason, date: new Date().toISOString() });
  return id;
}

// ── VANITY LOCK MONITOR ──────────────────────────────
setInterval(async () => {
  for (const [guildId, cfg] of vanityLock.entries()) {
    if (!cfg.locked || !cfg.code) continue;
    try {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) continue;
      const vanityData = await guild.fetchVanityData().catch(() => null);
      if (!vanityData) continue;
      if (vanityData.code !== cfg.code) {
        // Vanity was changed — revert it
        await guild.setVanityCode(cfg.code).catch(async () => {
          // Can't revert — notify owner
          const owner = await client.users.fetch(guild.ownerId).catch(() => null);
          if (owner) await owner.send(`🚨 **Vanity Lock Alert!**\nVanity \`${cfg.code}\` was changed and could NOT be restored!\nCurrent: \`${vanityData.code}\``).catch(() => {});
        });
        if (cfg.notifyUserId) {
          const u = await client.users.fetch(cfg.notifyUserId).catch(() => null);
          if (u) await u.send(`🔒 **Vanity Lock**: \`${cfg.code}\` was changed. Attempting to restore...`).catch(() => {});
        }
      }
    } catch {}
  }
}, 15000);

// ── BUMP REMINDER ────────────────────────────────────
client.on("messageCreate", async (message) => {
  if (message.author.id === "302050872383242240" && message.embeds[0]?.description?.includes("Bump done")) {
    const cfg = bumpReminder.get(message.guild?.id);
    if (!cfg) return;
    cfg.lastBump = Date.now();
    cfg.reminded = false;
    bumpReminder.set(message.guild.id, cfg);
  }
});
setInterval(async () => {
  for (const [guildId, cfg] of bumpReminder.entries()) {
    if (cfg.reminded || !cfg.lastBump) continue;
    if (Date.now() - cfg.lastBump >= 7200000) {
      cfg.reminded = true;
      bumpReminder.set(guildId, cfg);
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) continue;
      const ch = guild.channels.cache.get(cfg.channelId);
      if (ch) ch.send("⏰ It's time to **bump** the server! Use `/bump` now!").catch(() => {});
    }
  }
}, 60000);

// ── STICKY MESSAGES ──────────────────────────────────
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  const sticky = stickyMessages.get(message.channel.id);
  if (!sticky) return;
  if (message.id === sticky.msgId) return;
  const old = await message.channel.messages.fetch(sticky.msgId).catch(() => null);
  if (old) await old.delete().catch(() => {});
  const newMsg = await message.channel.send(sticky.content).catch(() => null);
  if (newMsg) sticky.msgId = newMsg.id;
  stickyMessages.set(message.channel.id, sticky);
});

// ── AUTO RESPONDERS ──────────────────────────────────
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  const responders = autoResponders.get(message.guild.id) || [];
  for (const r of responders) {
    const matches = r.exact ? message.content.toLowerCase() === r.trigger.toLowerCase() : message.content.toLowerCase().includes(r.trigger.toLowerCase());
    if (matches) {
      await message.channel.send(r.response).catch(() => {});
      break;
    }
  }
});

// ── JOIN TO CREATE ────────────────────────────────────
client.on("voiceStateUpdate", async (oldState, newState) => {
  const guildId = newState.guild.id;
  const cfg = joinToCreate.get(guildId);
  if (!cfg) return;
  // User joined the trigger channel
  if (newState.channelId === cfg.triggerVcId && newState.member) {
    const ch = await newState.guild.channels.create({
      name: `${newState.member.user.username}'s channel`,
      type: 2,
      parent: cfg.categoryId || null,
    }).catch(() => null);
    if (ch) {
      tempVoiceChannels.add(ch.id);
      await newState.member.voice.setChannel(ch).catch(() => {});
    }
  }
  // Clean up empty temp channels
  if (oldState.channel && tempVoiceChannels.has(oldState.channelId)) {
    if (oldState.channel.members.size === 0) {
      await oldState.channel.delete().catch(() => {});
      tempVoiceChannels.delete(oldState.channelId);
    }
  }
});

// ── BIRTHDAY CHECKER ─────────────────────────────────
setInterval(async () => {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth() + 1;
  for (const [userId, bd] of birthdayData.entries()) {
    if (bd.day === day && bd.month === month && !bd.announcedYear === now.getFullYear()) {
      bd.announcedYear = now.getFullYear();
      birthdayData.set(userId, bd);
      // Announce in all guilds where this user is
      for (const [guildId, channelId] of birthdayChannel.entries()) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;
        const member = guild.members.cache.get(userId);
        if (!member) continue;
        const ch = guild.channels.cache.get(channelId);
        if (ch) ch.send(`🎂 Happy Birthday <@${userId}>! 🎉`).catch(() => {});
      }
    }
  }
}, 60 * 60 * 1000); // check every hour

// ── CUSTOM COMMAND HANDLER ────────────────────────────
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(",")) return;
  const args = message.content.slice(1).trim().split(/ +/);
  const command = args[0].toLowerCase();
  if (ignoreList.get(message.guild?.id)?.has(message.author.id)) return;

  const guildId = message.guild.id;

  // Check disabled commands
  const disabled = disabledCommands.get(guildId);
  if (disabled?.has(command)) return;

  // Check aliases
  const aliasKey = `${guildId}-${command}`;
  const aliasTarget = aliases.get(aliasKey);
  if (aliasTarget) {
    message.content = `,${aliasTarget} ${args.slice(1).join(" ")}`;
  }

  // Custom commands
  const ccKey = `${guildId}-${command}`;
  const ccResponse = customCommands.get(ccKey);
  if (ccResponse) {
    return message.channel.send(ccResponse.replace("{user}", message.author.toString()).replace("{server}", message.guild.name).replace("{count}", message.guild.memberCount));
  }

  // ── VANITY COMMANDS ───────────────────────────────────

  if (command === "vanitylock") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const sub = args[1]?.toLowerCase();
    const cfg = vanityLock.get(guildId) || { code: null, locked: false, notifyUserId: message.author.id };

    if (sub === "on" || sub === "enable") {
      const vanityData = await message.guild.fetchVanityData().catch(() => null);
      if (!vanityData?.code) return err(message, "This server has no vanity URL.");
      cfg.code = vanityData.code;
      cfg.locked = true;
      cfg.notifyUserId = message.author.id;
      vanityLock.set(guildId, cfg);
      saveAllConfigs();
      return ok(message, `Vanity lock enabled for **discord.gg/${cfg.code}** — I'll monitor every 15s and restore if changed.`);
    }
    if (sub === "off" || sub === "disable") {
      cfg.locked = false;
      vanityLock.set(guildId, cfg);
      saveAllConfigs();
      return ok(message, "Vanity lock disabled.");
    }
    if (sub === "status" || !sub) {
      const vanityData = await message.guild.fetchVanityData().catch(() => null);
      return message.reply({ embeds: [{ color: PINK, title: "🔒 Vanity Lock", fields: [{ name: "Status", value: cfg.locked ? "✅ Locked" : "❌ Unlocked", inline: true }, { name: "Locked Code", value: cfg.code ? `discord.gg/${cfg.code}` : "None", inline: true }, { name: "Current Code", value: vanityData?.code ? `discord.gg/${vanityData.code}` : "None", inline: true }] }] });
    }
  }

  // ,vanitytransfer <code> — claim a vanity for the server
  if (command === "vanitytransfer") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const code = args[1];
    if (!code) return err(message, "missing required argument");

    await message.guild.setVanityCode(code).catch(e => err(message, `Failed: ${e.message}`));
    return ok(message, `Vanity URL set to **discord.gg/${code}**`);
  }

  // ── CASE SYSTEM ───────────────────────────────────────

  // ,case <id>
  if (command === "case") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return err(message, "Missing permissions.");
    const id = parseInt(args[1]);
    if (isNaN(id)) return err(message, "missing required argument");

    const c = cases.get(`${guildId}-${id}`);
    if (!c) return err(message, `Case #${id} not found.`);
    return message.reply({ embeds: [{ color: PINK, title: `Case #${c.id}`, fields: [{ name: "Type", value: c.type, inline: true }, { name: "User", value: `<@${c.userId}>`, inline: true }, { name: "Moderator", value: `<@${c.modId}>`, inline: true }, { name: "Reason", value: c.reason }, { name: "Date", value: `<t:${Math.floor(new Date(c.date).getTime() / 1000)}:R>` }] }] });
  }

  // ,cases <@user>
  if (command === "cases") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.users.first() || await client.users.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    const userCases = [...cases.entries()].filter(([k, v]) => k.startsWith(guildId) && v.userId === target.id).map(([, v]) => v);
    if (userCases.length === 0) return ok(message, `**${target.username}** has no cases.`);
    const lines = userCases.map(c => `**#${c.id}** ${c.type} — ${c.reason} (${c.date.split("T")[0]})`).join("\n");
    return message.reply({ embeds: [{ color: PINK, title: `Cases: ${target.username}`, description: lines.substring(0, 4096) }] });
  }

  // ,editcase <id> <new reason>
  if (command === "editcase") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return err(message, "Missing permissions.");
    const id = parseInt(args[1]);
    const reason = args.slice(2).join(" ");
    if (isNaN(id) || !reason) return err(message, "missing required argument");

    const c = cases.get(`${guildId}-${id}`);
    if (!c) return err(message, `Case #${id} not found.`);
    c.reason = reason;
    cases.set(`${guildId}-${id}`, c);
    return ok(message, `Case #${id} reason updated.`);
  }

  // ,deletecase <id>
  if (command === "deletecase") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const id = parseInt(args[1]);
    if (isNaN(id)) return err(message, "missing required argument");

    cases.delete(`${guildId}-${id}`);
    return ok(message, `Case #${id} deleted.`);
  }

  // ── WARN THRESHOLDS ───────────────────────────────────

  // ,warnthreshold <count> <action> — e.g. ,warnthreshold 3 mute
  if (command === "warnthreshold") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const count = parseInt(args[1]);
    const action = args[2]?.toLowerCase();
    if (isNaN(count) || !["mute", "kick", "ban"].includes(action)) return err(message, "missing required argument");

    const list = warnThresholds.get(guildId) || [];
    list.push({ count, action });
    list.sort((a, b) => a.count - b.count);
    warnThresholds.set(guildId, list);
    saveAllConfigs();return ok(message, `At **${count}** warns → **${action}**`);
  }

  // ,warnthresholds — list all thresholds
  if (command === "warnthresholds") {
    const list = warnThresholds.get(guildId) || [];
    if (list.length === 0) return message.reply("No warn thresholds set.");
    return message.reply({ embeds: [{ color: PINK, title: "⚠️ Warn Thresholds", description: list.map(t => `**${t.count}** warns → **${t.action}**`).join("\n") }] });
  }

  // ── CUSTOM COMMANDS ───────────────────────────────────

  // ,cc add <name> <response>
  if (command === "cc") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const sub = args[1]?.toLowerCase();
    if (sub === "add") {
      const name = args[2]?.toLowerCase();
      const response = args.slice(3).join(" ");
      if (!name || !response) return err(message, "missing required argument");

      customCommands.set(`${guildId}-${name}`, response);
      saveAllConfigs();return ok(message, `Custom command **,${name}** created.`);
    }
    if (sub === "remove" || sub === "delete") {
      const name = args[2]?.toLowerCase();
      if (!name) return err(message, "missing required argument");

      customCommands.delete(`${guildId}-${name}`);
      saveAllConfigs();return ok(message, `Custom command **,${name}** removed.`);
    }
    if (sub === "list") {
      const cmds = [...customCommands.keys()].filter(k => k.startsWith(`${guildId}-`)).map(k => k.replace(`${guildId}-`, ""));
      if (cmds.length === 0) return message.reply("No custom commands.");
      return message.reply({ embeds: [{ color: PINK, title: "Custom Commands", description: cmds.map(c => `\`,${c}\``).join(", ") }] });
    }
    return err(message, "missing required argument");

  }

  // ── ALIASES ───────────────────────────────────────────

  // ,alias add <alias> <command>
  if (command === "alias") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const sub = args[1]?.toLowerCase();
    if (sub === "add") {
      const alias = args[2]?.toLowerCase();
      const target = args[3]?.toLowerCase();
      if (!alias || !target) return err(message, "missing required argument");

      aliases.set(`${guildId}-${alias}`, target);
      saveAllConfigs();return ok(message, `\`,${alias}\` is now an alias for \`,${target}\``);
    }
    if (sub === "remove") {
      const alias = args[2]?.toLowerCase();
      aliases.delete(`${guildId}-${alias}`);
      saveAllConfigs();return ok(message, `Alias \`,${alias}\` removed.`);
    }
    if (sub === "list") {
      const list = [...aliases.entries()].filter(([k]) => k.startsWith(`${guildId}-`)).map(([k, v]) => `\`,${k.replace(`${guildId}-`, "")}\` → \`,${v}\``);
      if (list.length === 0) return message.reply("No aliases set.");
      return message.reply({ embeds: [{ color: PINK, title: "Aliases", description: list.join("\n") }] });
    }
  }

  // ── DISABLE COMMANDS ──────────────────────────────────

  // ,disable <command>
  if (command === "disable") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const cmd = args[1]?.toLowerCase();
    if (!cmd) return err(message, "missing required argument");

    const set = disabledCommands.get(guildId) || new Set();
    set.add(cmd);
    disabledCommands.set(guildId, set);
    saveAllConfigs();return ok(message, `Command \`,${cmd}\` disabled.`);
  }

  // ,enable <command>
  if (command === "enable") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const cmd = args[1]?.toLowerCase();
    const set = disabledCommands.get(guildId);
    set?.delete(cmd);
    return ok(message, `Command \`,${cmd}\` enabled.`);
  }

  // ,disabled — list disabled commands
  if (command === "disabled") {
    const set = disabledCommands.get(guildId);
    if (!set || set.size === 0) return message.reply("No commands are disabled.");
    return info(message, `disabled: ${[...set].map(c => "`,"+c+"`").join(", ")}`);
  }

  // ── AUTO RESPONDERS ───────────────────────────────────

  // ,autorespond add <trigger> | <response>
  if (command === "autorespond" || command === "ar") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const sub = args[1]?.toLowerCase();
    if (sub === "add") {
      const text = args.slice(2).join(" ");
      const parts = text.split("|");
      if (parts.length < 2) return err(message, "missing required argument");

      const trigger = parts[0].trim();
      const response = parts.slice(1).join("|").trim();
      const exact = args[2] === "--exact";
      const list = autoResponders.get(guildId) || [];
      list.push({ trigger, response, exact });
      autoResponders.set(guildId, list);
      return ok(message, `auto responder added: \`${trigger}\` → \`${response}\``);
    }
    if (sub === "remove") {
      const trigger = args.slice(2).join(" ");
      const list = (autoResponders.get(guildId) || []).filter(r => r.trigger !== trigger);
      autoResponders.set(guildId, list);
      return ok(message, `auto responder \`${trigger}\` removed.`);
    }
    if (sub === "list") {
      const list = autoResponders.get(guildId) || [];
      if (list.length === 0) return message.reply("No auto responders.");
      return message.reply({ embeds: [{ color: PINK, title: "Auto Responders", description: list.map((r, i) => `**${i + 1}.** \`${r.trigger}\` → \`${r.response}\``).join("\n") }] });
    }
  }

  // ── REACTION TRIGGERS ─────────────────────────────────

  // ,reactiontrigger add <trigger> <emoji>
  if (command === "reactiontrigger" || command === "rt") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const sub = args[1]?.toLowerCase();
    if (sub === "add") {
      const trigger = args[2];
      const emoji = args[3];
      if (!trigger || !emoji) return err(message, "missing required argument");

      const list = reactionTriggers.get(guildId) || [];
      list.push({ trigger, emoji });
      reactionTriggers.set(guildId, list);
      return ok(message, `reaction trigger added: \`${trigger}\` → ${emoji}`);
    }
    if (sub === "remove") {
      const trigger = args[2];
      const list = (reactionTriggers.get(guildId) || []).filter(r => r.trigger !== trigger);
      reactionTriggers.set(guildId, list);
      return ok(message, `reaction trigger \`${trigger}\` removed.`);
    }
    if (sub === "list") {
      const list = reactionTriggers.get(guildId) || [];
      if (list.length === 0) return message.reply("No reaction triggers.");
      return message.reply({ embeds: [{ color: PINK, title: "Reaction Triggers", description: list.map((r, i) => `**${i + 1}.** \`${r.trigger}\` → ${r.emoji}`).join("\n") }] });
    }
  }

  // Reaction trigger handler
  if (!message.content.startsWith(",")) {
    const triggers = reactionTriggers.get(guildId) || [];
    for (const t of triggers) {
      if (message.content.toLowerCase().includes(t.trigger.toLowerCase())) {
        await message.react(t.emoji).catch(() => {});
      }
    }
  }

  // ── STICKY MESSAGES ───────────────────────────────────

  // ,sticky <message>
  if (command === "sticky") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const sub = args[1]?.toLowerCase();
    if (sub === "off" || sub === "remove") {
      stickyMessages.delete(message.channel.id);
      return ok(message, "Sticky message removed.");
    }
    const content = args.slice(1).join(" ");
    if (!content) return err(message, "missing required argument");

    const msg = await message.channel.send(content);
    stickyMessages.set(message.channel.id, { content, msgId: msg.id });
    message.delete().catch(() => {});
  }

  // ── COUNTERS ──────────────────────────────────────────

  // ,counter create <name> <#channel> <type: members|bots|all|custom>
  if (command === "counter") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const sub = args[1]?.toLowerCase();
    if (sub === "create") {
      const name = args[2];
      const channel = message.mentions.channels.first();
      const type = args[4]?.toLowerCase() || "custom";
      if (!name || !channel) return err(message, "missing required argument");

      let count = 0;
      if (type === "members") count = message.guild.memberCount;
      else if (type === "bots") count = message.guild.members.cache.filter(m => m.user.bot).size;
      else if (type === "all") count = message.guild.memberCount;
      counters.set(`${guildId}-${name}`, { channelId: channel.id, count, type });
      await channel.setName(`${name}: ${count}`).catch(() => {});
      saveAllConfigs();return ok(message, `Counter **${name}** created in ${channel}`);
    }
    if (sub === "delete") {
      const name = args[2];
      counters.delete(`${guildId}-${name}`);
      saveAllConfigs();return ok(message, `Counter **${name}** deleted.`);
    }
    if (sub === "list") {
      const list = [...counters.entries()].filter(([k]) => k.startsWith(`${guildId}-`));
      if (list.length === 0) return message.reply("No counters.");
      return message.reply({ embeds: [{ color: PINK, title: "Counters", description: list.map(([k, v]) => `**${k.replace(`${guildId}-`, "")}** — <#${v.channelId}> (${v.count})`).join("\n") }] });
    }
  }

  // Update member counters on join/leave
  client.on("guildMemberAdd", async (member) => {
    for (const [key, cfg] of counters.entries()) {
      if (!key.startsWith(member.guild.id)) continue;
      if (cfg.type === "members" || cfg.type === "all") {
        cfg.count = member.guild.memberCount;
        counters.set(key, cfg);
        const ch = member.guild.channels.cache.get(cfg.channelId);
        if (ch) await ch.setName(`${key.replace(`${member.guild.id}-`, "")}: ${cfg.count}`).catch(() => {});
      }
    }
  });

  // ── CONFESSIONS ───────────────────────────────────────

  // ,confessions <#channel | off>
  if (command === "confessions") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    if (args[1] === "off") { confessions.delete(guildId); return ok(message, "Confessions disabled."); }
    const ch = message.mentions.channels.first();
    if (!ch) return err(message, "missing required argument");

    confessions.set(guildId, ch.id);
    return ok(message, `Confessions channel set to ${ch}`);
  }

  // ,confess <message>
  if (command === "confess") {
    const chId = confessions.get(guildId);
    if (!chId) return err(message, "Confessions are not set up.");
    const text = args.slice(1).join(" ");
    if (!text) return err(message, "missing required argument");

    const ch = message.guild.channels.cache.get(chId);
    if (!ch) return err(message, "Confession channel not found.");
    await ch.send({ embeds: [{ color: PINK, title: "💬 Anonymous Confession", description: text, footer: { text: `Confession #${(counters.get(`${guildId}-confessions`) || { count: 0 }).count + 1}` }, timestamp: new Date() }] });
    message.delete().catch(() => {});
    await message.author.send("✅ Your confession was submitted anonymously.").catch(() => {});
  }

  // ── BUMP REMINDER ─────────────────────────────────────

  // ,bumpchannel <#channel>
  if (command === "bumpchannel") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const ch = message.mentions.channels.first();
    if (!ch) return err(message, "missing required argument");

    const existing = bumpReminder.get(guildId) || {};
    existing.channelId = ch.id;
    bumpReminder.set(guildId, existing);
    return ok(message, `Bump reminder set in ${ch} (reminds 2h after last bump)`);
  }

  // ── JOIN TO CREATE ────────────────────────────────────

  // ,jointocreate <#voicechannel>
  if (command === "jointocreate" || command === "jtc") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const sub = args[1]?.toLowerCase();
    if (sub === "off") { joinToCreate.delete(guildId); return ok(message, "Join to Create disabled."); }
    const ch = message.mentions.channels.first();
    if (!ch) return err(message, "missing required argument");

    joinToCreate.set(guildId, { triggerVcId: ch.id, categoryId: ch.parentId });
    return ok(message, `Join **${ch.name}** to create your own voice channel.`);
  }

  // ── BOOSTER ROLES ─────────────────────────────────────

  // ,boosterrole create — creates a custom role for the booster
  if (command === "boosterrole") {
    const sub = args[1]?.toLowerCase();
    if (sub === "create") {
      if (!message.member.premiumSince) return err(message, "You must be a booster to use this.");
      const existingRoleId = boosterRoles.get(`${message.author.id}-${guildId}`);
      if (existingRoleId) return err(message, "You already have a custom booster role.");
      const role = await message.guild.roles.create({ name: `${message.author.username}'s Role`, color: "#FF73FA", reason: "Custom booster role" }).catch(() => null);
      if (!role) return err(message, "Could not create role.");
      await message.member.roles.add(role).catch(() => {});
      boosterRoles.set(`${message.author.id}-${guildId}`, role.id);
      return ok(message, `custom booster role **${role.name}** created! Use \`,boosterrole color\` and \`,boosterrole rename\``);
    }
    if (sub === "color") {
      const roleId = boosterRoles.get(`${message.author.id}-${guildId}`);
      if (!roleId) return err(message, "You don't have a custom booster role.");
      const color = args[2];
      if (!color) return err(message, "missing required argument");

      const role = message.guild.roles.cache.get(roleId);
      await role?.setColor(color).catch(() => {});
      return ok(message, `Role color updated to **${color}**`);
    }
    if (sub === "rename") {
      const roleId = boosterRoles.get(`${message.author.id}-${guildId}`);
      if (!roleId) return err(message, "You don't have a custom booster role.");
      const name = args.slice(2).join(" ");
      if (!name) return err(message, "missing required argument");

      const role = message.guild.roles.cache.get(roleId);
      await role?.setName(name).catch(() => {});
      return ok(message, `Role renamed to **${name}**`);
    }
    if (sub === "delete") {
      const roleId = boosterRoles.get(`${message.author.id}-${guildId}`);
      if (!roleId) return err(message, "No custom booster role.");
      const role = message.guild.roles.cache.get(roleId);
      await role?.delete().catch(() => {});
      boosterRoles.delete(`${message.author.id}-${guildId}`);
      return ok(message, "Booster role deleted.");
    }
    if (sub === "icon") {
      const roleId = boosterRoles.get(`${message.author.id}-${guildId}`);
      if (!roleId) return err(message, "No custom booster role.");
      const emoji = args[2];
      const role = message.guild.roles.cache.get(roleId);
      await role?.setUnicodeEmoji(emoji).catch(() => {});
      return ok(message, `Role icon set to ${emoji}`);
    }
    return err(message, "missing required argument");

  }

  // ── BIRTHDAY ──────────────────────────────────────────

  // ,birthday set <day> <month>
  if (command === "birthday") {
    const sub = args[1]?.toLowerCase();
    if (sub === "set") {
      const day = parseInt(args[2]);
      const month = parseInt(args[3]);
      if (isNaN(day) || isNaN(month) || day < 1 || day > 31 || month < 1 || month > 12) return err(message, "missing required argument");

      birthdayData.set(message.author.id, { day, month });
      saveAllConfigs();return ok(message, `Birthday set to **${day}/${month}** 🎂`);
    }
    if (sub === "remove") {
      birthdayData.delete(message.author.id);
      saveAllConfigs();return ok(message, "Birthday removed.");
    }
    if (sub === "channel") {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
      const ch = message.mentions.channels.first();
      if (!ch) return err(message, "missing required argument");

      birthdayChannel.set(guildId, ch.id);
      saveAllConfigs();return ok(message, `Birthday announcements in ${ch}`);
    }
    if (sub === "list") {
      const members = await message.guild.members.fetch();
      const list = members.filter(m => birthdayData.has(m.id)).map(m => {
        const bd = birthdayData.get(m.id);
        return `${m.user.username} — **${bd.day}/${bd.month}**`;
      }).slice(0, 20);
      if (list.length === 0) return message.reply("No birthdays set.");
      return message.reply({ embeds: [{ color: PINK, title: "🎂 Birthdays", description: list.join("\n") }] });
    }
    if (sub === "today") {
      const now = new Date();
      const members = await message.guild.members.fetch();
      const today = members.filter(m => {
        const bd = birthdayData.get(m.id);
        return bd && bd.day === now.getDate() && bd.month === now.getMonth() + 1;
      });
      if (today.size === 0) return message.reply("🎂 No birthdays today.");
      return info(message, `Today's birthdays: ${today.map(m => m.user.username).join(", ")}`);
    }
    const target = message.mentions.users.first() || message.author;
    const bd = birthdayData.get(target.id);
    if (!bd) return err(message, `**${target.username}** hasn't set their birthday.`);
    return info(message, `**${target.username}**'s birthday: **${bd.day}/${bd.month}**`);
  }

  // ── FAKE PERMISSIONS ──────────────────────────────────

  // ,fakeperm <@role> <permission> — grant "fake" permissions via role check
  if (command === "fakeperm") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const sub = args[1]?.toLowerCase();
    if (sub === "add") {
      const role = message.mentions.roles.first();
      const perm = args[3];
      if (!role || !perm) return err(message, "missing required argument");

      const key = `${guildId}-${role.id}`;
      const perms = fakePerms.get(key) || [];
      perms.push(perm);
      fakePerms.set(key, perms);
      return ok(message, `Fake permission **${perm}** added to **${role.name}**`);
    }
    if (sub === "remove") {
      const role = message.mentions.roles.first();
      const perm = args[3];
      if (!role || !perm) return err(message, "missing required argument");

      const key = `${guildId}-${role.id}`;
      const perms = (fakePerms.get(key) || []).filter(p => p !== perm);
      fakePerms.set(key, perms);
      return ok(message, `Fake permission **${perm}** removed from **${role.name}**`);
    }
    if (sub === "list") {
      const role = message.mentions.roles.first();
      if (!role) return err(message, "missing required argument");

      const perms = fakePerms.get(`${guildId}-${role.id}`) || [];
    return info(message, `fake perms for **${role.name}**: ${perms.join(", ") || "None"}`);
    }
  }

  // ── IGNORE LIST ───────────────────────────────────────

  // ,ignore <@user> — bot ignores all commands from user
  if (command === "ignore") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const target = message.mentions.users.first();
    if (!target) return err(message, "missing required argument");

    const set = ignoreList.get(guildId) || new Set();
    if (set.has(target.id)) {
      set.delete(target.id);
      return ok(message, `**${target.username}** is no longer ignored.`);
    }
    set.add(target.id);
    ignoreList.set(guildId, set);
    return ok(message, `Bot will now ignore **${target.username}**`);
  }

  // ,ignorelist
  if (command === "ignorelist") {
    const set = ignoreList.get(guildId);
    if (!set || set.size === 0) return message.reply("No ignored users.");
    return info(message, `ignored: ${[...set].map(id => "<@"+id+">").join(", ")}`);
  }

  // ── LOGGING EVENTS ────────────────────────────────────

  // ,log <event> <#channel> — configure what to log where
  if (command === "log") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const events = ["ban", "kick", "mute", "warn", "join", "leave", "message", "voice", "role", "channel", "nickname", "invite"];
    const sub = args[1]?.toLowerCase();
    if (sub === "list") return message.reply({ embeds: [{ color: PINK, title: "Log Events", description: events.map(e => { const chId = logEvents.get(`${guildId}-${e}`); return `**${e}**: ${chId ? `<#${chId}>` : "Not set"}`; }).join("\n") }] });
    if (!events.includes(sub)) return err(message, `invalid event. Valid events: ${events.join(", ")}`);
    if (args[2] === "off") { logEvents.delete(`${guildId}-${sub}`); return ok(message, `**${sub}** log disabled.`); }
    const ch = message.mentions.channels.first();
    if (!ch) return err(message, "missing required argument");

    logEvents.set(`${guildId}-${sub}`, ch.id);
    saveAllConfigs();return ok(message, `**${sub}** events logged to ${ch}`);
  }

  // ── BLACKLIST ─────────────────────────────────────────

  // ,blacklist add <word>
  if (command === "blacklist") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const sub = args[1]?.toLowerCase();
    const word = args.slice(2).join(" ").toLowerCase();
    if (sub === "add") {
      if (!word) return err(message, "missing required argument");

      const set = blacklistWords.get(guildId) || new Set();
      set.add(word);
      blacklistWords.set(guildId, set);
      return ok(message, `**${word}** blacklisted.`);
    }
    if (sub === "remove") {
      const set = blacklistWords.get(guildId);
      set?.delete(word);
      return ok(message, `**${word}** removed from blacklist.`);
    }
    if (sub === "list") {
      const set = blacklistWords.get(guildId);
      if (!set || set.size === 0) return message.reply("No blacklisted words.");
      return message.reply({ embeds: [{ color: PINK, title: "Blacklisted Words", description: [...set].join(", ") }] });
    }
    if (sub === "clear") {
      blacklistWords.delete(guildId);
      return ok(message, "Blacklist cleared.");
    }
  }

  // ── SERVER INFO EXTRAS ────────────────────────────────

  // ,channellist — list all channels
  if (command === "channellist") {
    const cats = message.guild.channels.cache.filter(c => c.type === 4).sort((a, b) => a.position - b.position);
    let desc = "";
    for (const cat of cats.values()) {
      desc += `**${cat.name}**\n`;
      const children = cat.children.cache.sort((a, b) => a.position - b.position);
      for (const ch of children.values()) desc += `  ${ch.type === 2 ? "🔊" : "#"} ${ch.name}\n`;
    }
    return message.reply({ embeds: [{ color: PINK, title: `Channels (${message.guild.channels.cache.size})`, description: desc.substring(0, 4096) || "No channels" }] });
  }

  // ,rolelist — alias for roles
  if (command === "rolelist") {
    const roles = message.guild.roles.cache.sort((a, b) => b.position - a.position).filter(r => r.id !== message.guild.id);
    const list = roles.map(r => `<@&${r.id}>`).slice(0, 30).join(", ");
    return message.reply({ embeds: [{ color: PINK, title: `Roles (${roles.size})`, description: list }] });
  }

  // ,emojiinfo <emoji>
  if (command === "emojiinfo") {
    const emoji = message.guild.emojis.cache.find(e => args[1]?.includes(e.id) || e.name === args[1]);
    if (!emoji) return err(message, "Emoji not found.");
    return message.reply({ embeds: [{ color: PINK, title: emoji.name, thumbnail: { url: emoji.url }, fields: [{ name: "ID", value: emoji.id, inline: true }, { name: "Animated", value: `${emoji.animated}`, inline: true }, { name: "Created", value: `<t:${Math.floor(emoji.createdTimestamp / 1000)}:R>`, inline: true }] }] });
  }

  // ,stickerinfo <name>
  if (command === "stickerinfo") {
    const sticker = message.guild.stickers.cache.find(s => s.name.toLowerCase() === args.slice(1).join(" ").toLowerCase());
    if (!sticker) return err(message, "Sticker not found.");
    return message.reply({ embeds: [{ color: PINK, title: sticker.name, description: sticker.description, thumbnail: { url: sticker.url }, fields: [{ name: "ID", value: sticker.id }, { name: "Format", value: sticker.format }] }] });
  }

  // ,stickers — list all stickers
  if (command === "stickers") {
    const stickers = message.guild.stickers.cache;
    if (stickers.size === 0) return message.reply("No custom stickers.");
    return message.reply({ embeds: [{ color: PINK, title: `Stickers (${stickers.size})`, description: stickers.map(s => `**${s.name}** — ${s.description || "No description"}`).join("\n") }] });
  }

  // ,permissions <@user|@role> — check permissions in current channel
  if (command === "permissions" || command === "perms") {
    const target = message.mentions.members.first() || message.member;
    const perms = message.channel.permissionsFor(target);
    const allowed = perms?.toArray().join(", ") || "None";
    return message.reply({ embeds: [{ color: PINK, title: `Permissions: ${target.user.username}`, description: allowed.substring(0, 4096) }] });
  }

  // ,shared <userId> — mutual servers (can only check if user in cache)
  if (command === "shared") {
    const userId = args[1] || message.author.id;
    const shared = client.guilds.cache.filter(g => g.members.cache.has(userId));
    return info(message, `Shared servers: **${shared.size}**\n${shared.map(g => g.name).join(", ")}`);
  }

  // ,joined <@user> — when did user join
  if (command === "joined") {
    const target = message.mentions.members.first() || message.member;
    return info(message, `**${target.user.username}** joined <t:${Math.floor(target.joinedTimestamp / 1000)}:R>`);
  }

  // ,created <@user> — when was account created
  if (command === "created") {
    const target = message.mentions.users.first() || message.author;
    return info(message, `**${target.username}** account created <t:${Math.floor(target.createdTimestamp / 1000)}:R>`);
  }

  // ,mutual — check mutual servers with a user
  if (command === "mutual") {
    const target = message.mentions.users.first();
    if (!target) return err(message, "missing required argument");

    const mutual = client.guilds.cache.filter(g => g.members.cache.has(target.id));
    if (mutual.size === 0) return message.reply("No mutual servers.");
    return info(message, `**${mutual.size}** mutual servers with **${target.username}**: ${mutual.map(g => g.name).join(", ")}`);
  }

  // ── UTILITY EXTRAS ────────────────────────────────────

  // ,timestamp <date> — convert date to Discord timestamp
  if (command === "timestamp") {
    const dateStr = args.slice(1).join(" ");
    const date = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(date)) return err(message, "Invalid date.");
    const ts = Math.floor(date.getTime() / 1000);
    return message.reply({ embeds: [{ color: PINK, title: "🕐 Timestamps", description: `\`<t:${ts}>\` → <t:${ts}>\n\`<t:${ts}:R>\` → <t:${ts}:R>\n\`<t:${ts}:F>\` → <t:${ts}:F>\n\`<t:${ts}:D>\` → <t:${ts}:D>` }] });
  }

  // ,charinfo <text> — unicode info
  if (command === "charinfo") {
    const text = args.slice(1).join(" ");
    if (!text) return err(message, "missing required argument");

    const chars = [...text].slice(0, 10).map(c => `\`${c}\` — U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")} — ${c.codePointAt(0)}`);
    return message.reply(chars.join("\n"));
  }

  // ,color <#hex> — show color info
  if (command === "color") {
    const hex = args[1]?.replace("#", "");
    if (!hex || !/^[0-9A-Fa-f]{6}$/.test(hex)) return err(message, "missing required argument");

    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return message.reply({ embeds: [{ color: parseInt(hex, 16), title: `#${hex.toUpperCase()}`, fields: [{ name: "RGB", value: `${r}, ${g}, ${b}`, inline: true }, { name: "Decimal", value: `${parseInt(hex, 16)}`, inline: true }] }] });
  }

  // ,encode <text> — base64 encode
  if (command === "encode") {
    const text = args.slice(1).join(" ");
    if (!text) return err(message, "missing required argument");

    return info(message, `encoded: \`${Buffer.from(text).toString("base64")}\``);
  }

  // ,decode <base64> — base64 decode
  if (command === "decode") {
    const text = args[1];
    if (!text) return err(message, "missing required argument");

    try {
      return info(message, `decoded: \`${Buffer.from(text, "base64").toString("utf8")}\``);
    } catch { return err(message, "Invalid base64."); }
  }

  // ,binary <text> — text to binary
  if (command === "binary") {
    const text = args.slice(1).join(" ");
    if (!text) return err(message, "missing required argument");

    const bin = text.split("").map(c => c.charCodeAt(0).toString(2).padStart(8, "0")).join(" ");
    return info(message, `\`${bin.substring(0, 1900)}\``);
  }

  // ,reverse <text>
  if (command === "reverse") {
    const text = args.slice(1).join(" ");
    if (!text) return err(message, "missing required argument");

    return message.reply([...text].reverse().join(""));
  }

  // ,uppercase <text>
  if (command === "uppercase") {
    return message.reply(args.slice(1).join(" ").toUpperCase() || "❌ No text provided.");
  }

  // ,lowercase <text>
  if (command === "lowercase") {
    return message.reply(args.slice(1).join(" ").toLowerCase() || "❌ No text provided.");
  }

  // ,mock <text> — SpOnGeBoB mOcKiNg
  if (command === "mock") {
    const text = args.slice(1).join(" ");
    if (!text) return err(message, "missing required argument");

    return message.reply(text.split("").map((c, i) => i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()).join(""));
  }

  // ,clap <text> — add 👏 between words
  if (command === "clap") {
    const text = args.slice(1).join(" ");
    if (!text) return err(message, "missing required argument");

    return message.reply(text.split(" ").join(" 👏 "));
  }

  // ,google <query>
  if (command === "google") {
    const query = args.slice(1).join(" ");
    if (!query) return err(message, "missing required argument");

    return info(message, `https://www.google.com/search?q=${encodeURIComponent(query)}`);
  }

  // ,youtube <query>
  if (command === "youtube" || command === "yt") {
    const query = args.slice(1).join(" ");
    if (!query) return err(message, "missing required argument");

    return info(message, `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
  }

  // ,spotify <query>
  if (command === "spotify") {
    const query = args.slice(1).join(" ");
    if (!query) return err(message, "missing required argument");

    return info(message, `https://open.spotify.com/search/${encodeURIComponent(query)}`);
  }

  // ,define <word>
  if (command === "define") {
    await message.channel.sendTyping().catch(() => {});
    const word = args[1];
    if (!word) return err(message, "missing required argument");

    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
      const data = await res.json();
      if (!Array.isArray(data)) return err(message, "No definition found.");
      const entry = data[0];
      const meaning = entry.meanings[0];
      const def = meaning.definitions[0];
      return message.reply({ embeds: [{ color: PINK, title: `📖 ${entry.word}`, fields: [{ name: meaning.partOfSpeech, value: def.definition }, { name: "Example", value: def.example || "None" }] }] });
    } catch { return err(message, "Could not fetch definition."); }
  }

  // ,translate <lang> <text>
  if (command === "translate") {
    await message.channel.sendTyping().catch(() => {});
    const lang = args[1];
    const text = args.slice(2).join(" ");
    if (!lang || !text) return err(message, "missing required argument");

    try {
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${lang}`);
      const data = await res.json();
      return info(message, `**${data.responseData.translatedText}**`);
    } catch { return err(message, "Translation failed."); }
  }

  // ,qr <text> — generate QR code
  if (command === "qr") {
    const text = args.slice(1).join(" ");
    if (!text) return err(message, "missing required argument");

    return message.reply({ embeds: [{ color: PINK, title: "QR Code", image: { url: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}` } }] });
  }

  // ,screenshot <url>
  if (command === "screenshot") {
    const url = args[1];
    if (!url) return err(message, "missing required argument");

    return message.reply({ embeds: [{ color: PINK, title: "📸 Screenshot", image: { url: `https://api.apiflash.com/v1/urltoimage?access_key=free&url=${encodeURIComponent(url)}&width=1280&height=720` } }] });
  }

  // ── FUN EXTRAS ────────────────────────────────────────

  // ,meme — random meme
  if (command === "meme") {
    await message.channel.sendTyping().catch(() => {});
    try {
      const res = await fetch("https://meme-api.com/gimme");
      const data = await res.json();
      return message.reply({ embeds: [{ color: PINK, title: data.title, image: { url: data.url }, footer: { text: `👍 ${data.ups} | r/${data.subreddit} • ${message.guild.name}` } }] });
    } catch { return err(message, "Could not fetch meme."); }
  }

  // ,joke — random joke
  if (command === "joke") {
    await message.channel.sendTyping().catch(() => {});
    try {
      const res = await fetch("https://official-joke-api.appspot.com/random_joke");
      const data = await res.json();
      return info(message, `**${data.setup}**\n||${data.punchline}||`);
    } catch { return err(message, "Could not fetch joke."); }
  }

  // ,fact — random fact
  if (command === "fact") {
    await message.channel.sendTyping().catch(() => {});
    try {
      const res = await fetch("https://uselessfacts.jsph.pl/api/v2/facts/random?language=en");
      const data = await res.json();
      return info(message, `${data.text}`);
    } catch { return err(message, "Could not fetch fact."); }
  }

  // ,quote — random quote
  if (command === "quote") {
    await message.channel.sendTyping().catch(() => {});
    try {
      const res = await fetch("https://api.quotable.io/random");
      const data = await res.json();
      return info(message, `*"${data.content}"*\n— **${data.author}**`);
    } catch { return err(message, "Could not fetch quote."); }
  }

  // ,catfact
  if (command === "catfact") {
    await message.channel.sendTyping().catch(() => {});
    try {
      const res = await fetch("https://catfact.ninja/fact");
      const data = await res.json();
      return info(message, `${data.fact}`);
    } catch { return err(message, "Could not fetch cat fact."); }
  }

  // ,dogfact
  if (command === "dogfact") {
    await message.channel.sendTyping().catch(() => {});
    try {
      const res = await fetch("https://dog-api.kinduff.com/api/facts");
      const data = await res.json();
      return info(message, `${data.facts[0]}`);
    } catch { return err(message, "Could not fetch dog fact."); }
  }

  // ,cat — random cat image
  if (command === "cat") {
    await message.channel.sendTyping().catch(() => {});
    try {
      const res = await fetch("https://api.thecatapi.com/v1/images/search");
      const data = await res.json();
      return message.reply({ embeds: [{ color: PINK, image: { url: data[0].url } }] });
    } catch { return err(message, "Could not fetch cat."); }
  }

  // ,dog — random dog image
  if (command === "dog") {
    await message.channel.sendTyping().catch(() => {});
    try {
      const res = await fetch("https://dog.ceo/api/breeds/image/random");
      const data = await res.json();
      return message.reply({ embeds: [{ color: PINK, image: { url: data.message } }] });
    } catch { return err(message, "Could not fetch dog."); }
  }

  // ,fox — random fox image
  if (command === "fox") {
    await message.channel.sendTyping().catch(() => {});
    try {
      const res = await fetch("https://randomfox.ca/floof/");
      const data = await res.json();
      return message.reply({ embeds: [{ color: PINK, image: { url: data.image } }] });
    } catch { return err(message, "Could not fetch fox."); }
  }

  // ,duck — random duck image
  if (command === "duck") {
    await message.channel.sendTyping().catch(() => {});
    try {
      const res = await fetch("https://random-d.uk/api/v2/random");
      const data = await res.json();
      return message.reply({ embeds: [{ color: PINK, image: { url: data.url } }] });
    } catch { return err(message, "Could not fetch duck."); }
  }

  // ,panda
  if (command === "panda") {
    await message.channel.sendTyping().catch(() => {});
    try {
      const res = await fetch("https://some-random-api.com/animal/panda");
      const data = await res.json();
      return message.reply({ embeds: [{ color: PINK, image: { url: data.image }, description: data.fact }] });
    } catch { return err(message, "Could not fetch panda."); }
  }

  // ,wyr — would you rather
  if (command === "wyr") {
    const questions = [
      "Be able to fly or be invisible?",
      "Live without music or without TV?",
      "Be the funniest person or the smartest person in the room?",
      "Have no internet or no phone?",
      "Be always hot or always cold?",
      "Be a superhero or a wizard?",
      "Lose all your money or all your memories?",
    ];
    const q = questions[Math.floor(Math.random() * questions.length)];
    const msg = await message.reply({ embeds: [{ color: PINK, title: "Would you rather...", description: q, footer: { text: message.guild.name } }] });
    await msg.react("1️⃣");
    await msg.react("2️⃣");
  }

  // ,neverhaveiever
  if (command === "neverhaveiever" || command === "nhie") {
    const prompts = [
      "Never have I ever lied to get out of trouble",
      "Never have I ever stayed up more than 24 hours",
      "Never have I ever eaten something off the floor",
      "Never have I ever ghosted someone",
      "Never have I ever sent a text to the wrong person",
    ];
    return info(message, prompts[Math.floor(Math.random() * prompts.length)]);
  }

  // ,truthordare
  if (command === "truthordare" || command === "tod") {
    const truths = ["What's your biggest fear?", "Have you ever lied to a friend?", "What's your most embarrassing moment?"];
    const dares = ["Send a selfie", "Speak in an accent for 2 minutes", "Do 10 pushups"];
    const isTruth = Math.random() < 0.5;
    const list = isTruth ? truths : dares;
    return info(message, `${isTruth ? "**TRUTH:**" : "**DARE:**"} ${list[Math.floor(Math.random() * list.length)]}`);
  }

  // ,compliment [user]
  if (command === "compliment") {
    const target = message.mentions.users.first() || message.author;
    const compliments = ["You're an amazing person!", "You light up every room you enter!", "You have an incredible sense of humor!", "Your kindness is truly inspiring!", "You're doing better than you think!"];
    return info(message, `${target.toString()}: ${compliments[Math.floor(Math.random() * compliments.length)]}`);
  }

  // ,insult [user] — fun/silly only
  if (command === "insult") {
    const target = message.mentions.users.first() || message.author;
    const insults = ["You're as useful as a screen door on a submarine!", "You're not stupid, you just have bad luck thinking!", "I'd agree with you but then we'd both be wrong!", "You're not the dumbest person alive, but you better hope they don't die!"];
    return info(message, `${target.toString()}: ${insults[Math.floor(Math.random() * insults.length)]}`);
  }

  // ,ascii <text>
  if (command === "ascii") {
    const text = args.slice(1).join(" ").toUpperCase().substring(0, 10);
    if (!text) return err(message, "missing required argument");

    return info(message, `\`\`\`\n${text}\n\`\`\``);
  }

  // ,slots — slot machine
  if (command === "slots") {
    const symbols = ["🍎", "🍋", "🍇", "⭐", "💎", "7️⃣"];
    const s = () => symbols[Math.floor(Math.random() * symbols.length)];
    const r = [s(), s(), s()];
    const win = r[0] === r[1] && r[1] === r[2];
    return info(message, `${r.join(" | ")}\n${win ? "🎉 **JACKPOT!**" : "😔 Try again!"}`);
  }

  // ,dice <NdN> — e.g. ,dice 2d6
  if (command === "dice") {
    const notation = args[1] || "1d6";
    const match = notation.match(/^(\d+)d(\d+)$/i);
    return err(message, "missing required argument");


    const count = Math.min(parseInt(match[1]), 20);
    const sides = parseInt(match[2]);
    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    const total = rolls.reduce((a, b) => a + b, 0);
    return info(message, `Rolled **${notation}**: [${rolls.join(", ")}] = **${total}**`);
  }

  // ,numberguess — start a number guessing game
  if (command === "numberguess" || command === "guess") {
    const secret = Math.floor(Math.random() * 100) + 1;
    await message.reply("🔢 I'm thinking of a number between 1-100. You have 10 seconds to guess! Type your number:");
    const collector = message.channel.createMessageCollector({ filter: m => m.author.id === message.author.id && !isNaN(m.content), time: 10000, max: 5 });
    let guessed = false;
    collector.on("collect", m => {
      const guess = parseInt(m.content);
      if (guess === secret) { guessed = true; collector.stop(); message.channel.send(`🎉 Correct! The number was **${secret}**!`); }
      else if (guess < secret) message.channel.send("⬆️ Higher!");
      else message.channel.send("⬇️ Lower!");
    });
    collector.on("end", () => { if (!guessed) message.channel.send(`⏰ Time's up! The number was **${secret}**.`); });
  }

  // ── APPEAL SYSTEM ─────────────────────────────────────

  // ,appeal <reason> — submit ban appeal via DM
  if (command === "appeal") {
    const reason = args.slice(1).join(" ");
    if (!reason) return err(message, "missing required argument");

    const guildId2 = args[0]; // not used here, but for structure
    // Notify owner
    const owner = await client.users.fetch(message.guild?.ownerId || OWNER_ID).catch(() => null);
    if (owner) await owner.send({ embeds: [{ color: PINK, title: "📨 Ban Appeal", fields: [{ name: "User", value: `${message.author.username} (${message.author.id})` }, { name: "Reason", value: reason }], timestamp: new Date() }] }).catch(() => {});
    return ok(message, "Your appeal has been submitted.");
  }
});

// ===================================================
// ===== EXTENSION 2 — 150+ MORE COMMANDS ============
// ===================================================

// ── MORE IN-MEMORY STORES ────────────────────────────
const pollData = new Map();          // messageId => { question, options, votes: Map<userId, optionIndex> }
const todoLists = new Map();         // userId => [{ text, done }]
const tagData = new Map();           // guildId-name => { content, author }
const highlights = new Map();        // userId => Set<word>
const tempBans = new Map();          // already handled but extend
const muteHistory = new Map();       // guildId-userId => [{ duration, reason, mod, date }]
const channelPerms = new Map();      // saved channel permission snapshots
const serverStats = new Map();       // guildId => { joins, leaves, bans, kicks }
const pingRoles = new Map();         // guildId => Set<roleId> — roles allowed to be pinged
const slowmodeHistory = new Map();   // channelId => previous slowmode
const memberSearch = new Map();      // cache
const voiceLogs = new Map();
const userTimezones = new Map();
const reactionRoles = new Map();
const logEvents = new Map();

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(",")) return;
  const args = message.content.slice(1).trim().split(/ +/);
  const command = args[0].toLowerCase();
  if (ignoreList.get(message.guild?.id)?.has(message.author.id)) return;

  const guildId = message.guild.id;

  // ── POLL SYSTEM (advanced) ───────────────────────────

  // ,poll create <question> | <opt1> | <opt2> | ...
  if (command === "poll" && args[1] === "create") {
    const text = args.slice(2).join(" ");
    const parts = text.split("|").map(p => p.trim());
    const question = parts[0];
    const options = parts.slice(1);
    if (!question || options.length < 2) return err(message, "missing required argument");

    const emojis = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];
    const desc = options.map((o, i) => `${emojis[i]} ${o}`).join("\n");
    const msg = await message.channel.send({ embeds: [{ color: PINK, title: `📊 ${question}`, description: desc, footer: { text: "React to vote!" } }] });
    for (let i = 0; i < options.length; i++) await msg.react(emojis[i]);
    pollData.set(msg.id, { question, options, votes: new Map() });
    message.delete().catch(() => {});
  }

  // ,poll end <messageId>
  if (command === "poll" && args[1] === "end") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const msgId = args[2];
    if (!msgId) return err(message, "missing required argument");

    const poll = pollData.get(msgId);
    if (!poll) return err(message, "Poll not found.");
    try {
      const msg = await message.channel.messages.fetch(msgId);
      const emojis = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];
      const results = poll.options.map((o, i) => {
        const reaction = msg.reactions.cache.get(emojis[i]);
        return { option: o, votes: (reaction?.count || 1) - 1 };
      }).sort((a, b) => b.votes - a.votes);
      const winner = results[0];
      await message.channel.send({ embeds: [{ color: PINK, title: `📊 Poll Ended: ${poll.question}`, description: results.map((r, i) => `${i === 0 ? "🏆" : `${i+1}.`} **${r.option}** — ${r.votes} votes`).join("\n") }] });
      pollData.delete(msgId);
    } catch { return err(message, "Could not fetch poll message."); }
  }

  // ── TAG SYSTEM ───────────────────────────────────────

  // ,tag <n> — show tag
  if (command === "tag") {
    const sub = args[1]?.toLowerCase();
    if (sub === "create" || sub === "add") {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
      const name = args[2]?.toLowerCase();
      const content = args.slice(3).join(" ");
      if (!name || !content) return err(message, "missing required argument");

      tagData.set(`${guildId}-${name}`, { content, author: message.author.username });
      return ok(message, `Tag **${name}** created.`);
    }
    if (sub === "delete" || sub === "remove") {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
      const name = args[2]?.toLowerCase();
      tagData.delete(`${guildId}-${name}`);
      return ok(message, `Tag **${name}** deleted.`);
    }
    if (sub === "list") {
      const tags = [...tagData.keys()].filter(k => k.startsWith(`${guildId}-`)).map(k => k.replace(`${guildId}-`, ""));
      if (tags.length === 0) return message.reply("No tags created.");
      return message.reply({ embeds: [{ color: PINK, title: `Tags (${tags.length})`, description: tags.map(t => `\`,tag ${t}\``).join(", ") }] });
    }
    if (sub === "info") {
      const name = args[2]?.toLowerCase();
      const tag = tagData.get(`${guildId}-${name}`);
      if (!tag) return err(message, "Tag not found.");
      return message.reply({ embeds: [{ color: PINK, title: `Tag: ${name}`, fields: [{ name: "Content", value: tag.content }, { name: "Author", value: tag.author }] }] });
    }
    if (sub === "edit") {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
      const name = args[2]?.toLowerCase();
      const content = args.slice(3).join(" ");
      if (!tagData.has(`${guildId}-${name}`)) return err(message, "Tag not found.");
      tagData.get(`${guildId}-${name}`).content = content;
      return ok(message, `Tag **${name}** updated.`);
    }
    // Show tag
    const name = sub;
    const tag = tagData.get(`${guildId}-${name}`);
    if (!tag) return err(message, `Tag **${name}** not found.`);
    return message.channel.send(tag.content.replace("{user}", message.author.toString())).catch(() => null);
  }

  // ── TODO LIST ────────────────────────────────────────

  // ,todo add <text>
  if (command === "todo") {
    const sub = args[1]?.toLowerCase();
    const list = todoLists.get(message.author.id) || [];
    if (sub === "add") {
      const text = args.slice(2).join(" ");
      if (!text) return err(message, "missing required argument");

      list.push({ text, done: false });
      todoLists.set(message.author.id, list);
      return ok(message, `Added to your todo list.`);
    }
    if (sub === "done") {
      const index = parseInt(args[2]) - 1;
      if (isNaN(index) || !list[index]) return err(message, "Invalid number.");
      list[index].done = true;
      todoLists.set(message.author.id, list);
      return ok(message, `Marked as done.`);
    }
    if (sub === "remove" || sub === "delete") {
      const index = parseInt(args[2]) - 1;
      if (isNaN(index) || !list[index]) return err(message, "Invalid number.");
      list.splice(index, 1);
      todoLists.set(message.author.id, list);
      return ok(message, `Removed from todo list.`);
    }
    if (sub === "clear") { todoLists.delete(message.author.id); return ok(message, "Todo list cleared."); }
    if (sub === "list" || !sub) {
      if (list.length === 0) return message.reply("📋 Your todo list is empty.");
      const lines = list.map((t, i) => `${t.done ? "✅" : "⬜"} **${i+1}.** ${t.text}`);
      return message.reply({ embeds: [{ color: PINK, title: "📋 Your Todo List", description: lines.join("\n") }] });
    }
  }

  // ── HIGHLIGHTS ────────────────────────────────────────

  // ,highlight add <word>
  if (command === "highlight" || command === "hl") {
    const sub = args[1]?.toLowerCase();
    if (sub === "add") {
      const word = args.slice(2).join(" ").toLowerCase();
      if (!word) return err(message, "missing required argument");

      const set = highlights.get(message.author.id) || new Set();
      set.add(word);
      highlights.set(message.author.id, set);
      return ok(message, `You'll be notified when **${word}** is mentioned.`);
    }
    if (sub === "remove") {
      const word = args.slice(2).join(" ").toLowerCase();
      highlights.get(message.author.id)?.delete(word);
      return ok(message, `Highlight **${word}** removed.`);
    }
    if (sub === "list") {
      const set = highlights.get(message.author.id);
      if (!set || set.size === 0) return message.reply("No highlights set.");
      return info(message, `highlights: ${[...set].join(", ")}`);
    }
    if (sub === "clear") { highlights.delete(message.author.id); return ok(message, "Highlights cleared."); }
  }

  // ── SERVER STATS ──────────────────────────────────────

  // ,serverstats — detailed server statistics
  if (command === "serverstats") {
    await message.channel.sendTyping().catch(() => {});
    const g = message.guild;
    const members = await g.members.fetch();
    const bots = members.filter(m => m.user.bot).size;
    const humans = members.size - bots;
    const online = members.filter(m => m.presence?.status === "online").size;
    const textChannels = g.channels.cache.filter(c => c.type === 0).size;
    const voiceChannels = g.channels.cache.filter(c => c.type === 2).size;
    const categories = g.channels.cache.filter(c => c.type === 4).size;
    const animated = g.emojis.cache.filter(e => e.animated).size;
    const static_ = g.emojis.cache.filter(e => !e.animated).size;
    return message.reply({ embeds: [{ color: PINK, title: `📊 ${g.name} Stats`, thumbnail: { url: g.iconURL() }, fields: [
      { name: "👥 Members", value: `Total: ${g.memberCount}\nHumans: ${humans}\nBots: ${bots}`, inline: true },
      { name: "📢 Channels", value: `Text: ${textChannels}\nVoice: ${voiceChannels}\nCategories: ${categories}`, inline: true },
      { name: "🏷️ Roles", value: `${g.roles.cache.size}`, inline: true },
      { name: "😀 Emojis", value: `Static: ${static_}\nAnimated: ${animated}`, inline: true },
      { name: "💜 Boosts", value: `${g.premiumSubscriptionCount} (Tier ${g.premiumTier})`, inline: true },
      { name: "📅 Created", value: `<t:${Math.floor(g.createdTimestamp/1000)}:R>`, inline: true },
    ] }] });
  }

  // ,joincount — how many people joined today
  if (command === "joincount") {
    await message.channel.sendTyping().catch(() => {});
    const members = await message.guild.members.fetch();
    const today = Date.now() - 86400000;
    const recent = members.filter(m => m.joinedTimestamp > today).size;
    return info(message, `**${recent}** members joined in the last 24 hours`);
  }

  // ,boostcount
  if (command === "boostcount") {
    return info(message, `**${message.guild.premiumSubscriptionCount}** boosts | Tier **${message.guild.premiumTier}**`);
  }

  // ,onlinecount
  if (command === "onlinecount") {
    const members = message.guild.members.cache;
    const online = members.filter(m => m.presence?.status === "online").size;
    const idle = members.filter(m => m.presence?.status === "idle").size;
    const dnd = members.filter(m => m.presence?.status === "dnd").size;
    return info(message, `🟢 **${online}** online | 🌙 **${idle}** idle | ⛔ **${dnd}** dnd`);
  }

  // ── USER SEARCH ───────────────────────────────────────

  // ,find <query> — search members by name
  if (command === "find" || command === "search") {
    const query = args.slice(1).join(" ").toLowerCase();
    if (!query) return err(message, "missing required argument");

    const members = message.guild.members.cache.filter(m =>
      m.user.username.toLowerCase().includes(query) ||
      m.nickname?.toLowerCase().includes(query)
    ).first(10);
    if (!members || (Array.isArray(members) ? members.length === 0 : members.size === 0)) return err(message, "No members found.");
    const list = (Array.isArray(members) ? members : [...members.values()]).map(m => `${m.user.username} (${m.id})`).join("\n");
    return message.reply({ embeds: [{ color: PINK, title: `Search: "${query}"`, description: list }] });
  }

  // ,rolecount <@role>
  if (command === "rolecount") {
    const role = message.mentions.roles.first() || message.guild.roles.cache.find(r => r.name.toLowerCase() === args.slice(1).join(" ").toLowerCase());
    if (!role) return err(message, "missing required argument: **role**");
    return info(message, `**${role.name}** has **${role.members.size}** members`);
  }

  // ,admins — list all server admins
  if (command === "admins") {
    const admins = message.guild.members.cache.filter(m => m.permissions.has(PermissionFlagsBits.Administrator) && !m.user.bot);
    if (admins.size === 0) return message.reply("No admins found.");
    return message.reply({ embeds: [{ color: PINK, title: `👑 Admins (${admins.size})`, description: admins.map(m => m.user.username).join("\n") }] });
  }

  // ,mods — list members with ban/kick permissions
  if (command === "mods") {
    const mods = message.guild.members.cache.filter(m => (m.permissions.has(PermissionFlagsBits.BanMembers) || m.permissions.has(PermissionFlagsBits.KickMembers)) && !m.user.bot && !m.permissions.has(PermissionFlagsBits.Administrator));
    return message.reply({ embeds: [{ color: PINK, title: `🛡️ Moderators (${mods.size})`, description: mods.size > 0 ? mods.map(m => m.user.username).join("\n") : "None" }] });
  }

  // ,bots — list all bots in server
  if (command === "bots") {
    const bots = message.guild.members.cache.filter(m => m.user.bot);
    return message.reply({ embeds: [{ color: PINK, title: `🤖 Bots (${bots.size})`, description: bots.map(m => m.user.username).join("\n").substring(0, 4096) }] });
  }

  // ── VOICE MANAGEMENT ──────────────────────────────────

  // ,voicelist — list all voice channels and who's in them
  if (command === "voicelist" || command === "vc") {
    const vcs = message.guild.channels.cache.filter(c => c.type === 2 && c.members.size > 0);
    if (vcs.size === 0) return message.reply("🔇 No one is in a voice channel.");
    const desc = vcs.map(c => `**${c.name}** (${c.members.size})\n${c.members.map(m => `  └ ${m.user.username}`).join("\n")}`).join("\n\n");
    return message.reply({ embeds: [{ color: PINK, title: "🔊 Voice Channels", description: desc.substring(0, 4096) }] });
  }

  // ,vclimit <#channel> <limit>
  if (command === "vclimit") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const ch = message.mentions.channels.first() || message.member.voice.channel;
    const limit = parseInt(args[ch ? 2 : 1]);
    if (!ch || isNaN(limit)) return err(message, "missing required argument");

    await ch.setUserLimit(limit).catch(() => null);
    return ok(message, `User limit for **${ch.name}** set to **${limit}**`);
  }

  // ,vcname <#channel> <n>
  if (command === "vcname") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const ch = message.mentions.channels.first() || message.member.voice.channel;
    const name = args.slice(ch ? 2 : 1).join(" ");
    if (!ch || !name) return err(message, "missing required argument");

    await ch.setName(name).catch(() => null);
    return ok(message, `Voice channel renamed to **${name}**`);
  }

  // ,vclock — lock voice channel (no one can join)
  if (command === "vclock") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const ch = message.mentions.channels.first() || message.member.voice.channel;
    if (!ch) return err(message, "No voice channel specified.");
    await ch.permissionOverwrites.edit(message.guild.roles.everyone, { Connect: false }).catch(() => null);
    return ok(message, `Locked **${ch.name}**`);
  }

  // ,vcunlock
  if (command === "vcunlock") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const ch = message.mentions.channels.first() || message.member.voice.channel;
    if (!ch) return err(message, "No voice channel specified.");
    await ch.permissionOverwrites.edit(message.guild.roles.everyone, { Connect: null }).catch(() => null);
    return ok(message, `Unlocked **${ch.name}**`);
  }

  // ── MESSAGE MANAGEMENT ────────────────────────────────

  // ,pin <messageId>
  if (command === "pin") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const msgId = args[1];
    if (!msgId) return err(message, "missing required argument");

    const msg = await message.channel.messages.fetch(msgId).catch(() => null);
    if (!msg) return err(message, "Message not found.");
    await msg.pin().catch(() => null);
    return ok(message, "Message pinned.");
  }

  // ,unpin <messageId>
  if (command === "unpin") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const msgId = args[1];
    if (!msgId) return err(message, "missing required argument");

    const msg = await message.channel.messages.fetch(msgId).catch(() => null);
    if (!msg) return err(message, "Message not found.");
    await msg.unpin().catch(() => null);
    return ok(message, "Message unpinned.");
  }

  // ,pins — list pinned messages count
  if (command === "pins") {
    await message.channel.sendTyping().catch(() => {});
    const pins = await message.channel.messages.fetchPinned().catch(() => null);
    if (!pins) return err(message, "Could not fetch pins.");
    return info(message, `**${pins.size}** pinned messages in this channel`);
  }

  // ,movepin <messageId> <#channel>
  if (command === "movepin") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const msgId = args[1];
    const ch = message.mentions.channels.first();
    if (!msgId || !ch) return err(message, "missing required argument");

    const msg = await message.channel.messages.fetch(msgId).catch(() => null);
    if (!msg) return err(message, "Message not found.");
    await ch.send({ content: `📌 Moved from <#${message.channel.id}>:\n${msg.content}`, embeds: msg.embeds });
    return ok(message, `Message moved to ${ch}`);
  }

  // ── THREAD MANAGEMENT ─────────────────────────────────

  // ,thread create <n>
  if (command === "thread") {
    const sub = args[1]?.toLowerCase();
    if (sub === "create") {
      if (!message.member.permissions.has(PermissionFlagsBits.CreatePublicThreads)) return err(message, "Missing permissions.");
      const name = args.slice(2).join(" ") || "New Thread";
      const thread = await message.channel.threads.create({ name, autoArchiveDuration: 1440 }).catch(() => null);
      if (!thread) return err(message, "Could not create thread.");
      return ok(message, `Thread created: ${thread}`);
    }
    if (sub === "close") {
      if (!message.channel.isThread()) return err(message, "Not in a thread.");
      await message.channel.setArchived(true).catch(() => null);
      return ok(message, "Thread closed.");
    }
    if (sub === "open") {
      if (!message.channel.isThread()) return err(message, "Not in a thread.");
      await message.channel.setArchived(false).catch(() => null);
      return ok(message, "Thread reopened.");
    }
    if (sub === "lock") {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageThreads)) return err(message, "Missing permissions.");
      if (!message.channel.isThread()) return err(message, "Not in a thread.");
      await message.channel.setLocked(true).catch(() => null);
      return ok(message, "Thread locked.");
    }
    if (sub === "unlock") {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageThreads)) return err(message, "Missing permissions.");
      if (!message.channel.isThread()) return err(message, "Not in a thread.");
      await message.channel.setLocked(false).catch(() => null);
      return ok(message, "Thread unlocked.");
    }
    if (sub === "rename") {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageThreads)) return err(message, "Missing permissions.");
      if (!message.channel.isThread()) return err(message, "Not in a thread.");
      const name = args.slice(2).join(" ");
      await message.channel.setName(name).catch(() => null);
      return ok(message, `Thread renamed to **${name}**`);
    }
    if (sub === "add") {
      const target = message.mentions.members.first();
      if (!target) return err(message, "missing required argument");

      if (!message.channel.isThread()) return err(message, "Not in a thread.");
      await message.channel.members.add(target.id).catch(() => null);
      return ok(message, `Added **${target.user.username}** to thread.`);
    }
    if (sub === "remove") {
      const target = message.mentions.members.first();
      if (!target) return err(message, "missing required argument");

      if (!message.channel.isThread()) return err(message, "Not in a thread.");
      await message.channel.members.remove(target.id).catch(() => null);
      return ok(message, `Removed **${target.user.username}** from thread.`);
    }
  }

  // ── EMOJI MANAGEMENT EXTENDED ─────────────────────────

  // ,emoji add <n> <url>
  if (command === "emoji") {
    const sub = args[1]?.toLowerCase();
    if (sub === "add") {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageEmojisAndStickers)) return err(message, "Missing permissions.");
      const name = args[2];
      const url = args[3];
      if (!name || !url) return err(message, "missing required argument");

      const emoji = await message.guild.emojis.create({ attachment: url, name }).catch(() => null);
      if (!emoji) return err(message, "Could not add emoji.");
      return ok(message, `Added emoji ${emoji}`);
    }
    if (sub === "remove") {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageEmojisAndStickers)) return err(message, "Missing permissions.");
      const emoji = message.guild.emojis.cache.find(e => e.name === args[2] || args[2]?.includes(e.id));
      if (!emoji) return err(message, "Emoji not found.");
      await emoji.delete().catch(() => null);
      return ok(message, `Emoji removed.`);
    }
    if (sub === "rename") {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageEmojisAndStickers)) return err(message, "Missing permissions.");
      const emoji = message.guild.emojis.cache.find(e => e.name === args[2] || args[2]?.includes(e.id));
      const newName = args[3];
      if (!emoji || !newName) return err(message, "missing required argument");

      await emoji.setName(newName).catch(() => null);
      return ok(message, `Emoji renamed to **${newName}**`);
    }
    if (sub === "list") {
      const emojis = message.guild.emojis.cache;
      return message.reply({ embeds: [{ color: PINK, title: `Emojis (${emojis.size})`, description: emojis.map(e => `${e} \`:${e.name}:\``).slice(0, 40).join(" ") || "None" }] });
    }
  }

  // ── WEBHOOK MANAGEMENT ────────────────────────────────

  // ,webhook create <n> [#channel]
  if (command === "webhook") {
    const sub = args[1]?.toLowerCase();
    if (sub === "create") {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageWebhooks)) return err(message, "Missing permissions.");
      const name = args[2];
      const ch = message.mentions.channels.first() || message.channel;
      if (!name) return err(message, "missing required argument");

      const wh = await ch.createWebhook({ name }).catch(() => null);
      if (!wh) return err(message, "Could not create webhook.");
      await message.author.send(`🔗 Webhook URL (keep private!): ${wh.url}`).catch(() => {});
      return ok(message, "Webhook created. URL sent to your DMs.");
    }
    if (sub === "delete") {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageWebhooks)) return err(message, "Missing permissions.");
      const whs = await message.channel.fetchWebhooks().catch(() => null);
      if (!whs || whs.size === 0) return message.reply("No webhooks in this channel.");
      for (const wh of whs.values()) await wh.delete().catch(() => {});
      return ok(message, `Deleted **${whs.size}** webhooks.`);
    }
    if (sub === "list") {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageWebhooks)) return err(message, "Missing permissions.");
      const whs = await message.guild.fetchWebhooks().catch(() => null);
      if (!whs || whs.size === 0) return message.reply("No webhooks.");
      return message.reply({ embeds: [{ color: PINK, title: `Webhooks (${whs.size})`, description: whs.map(w => `**${w.name}** — <#${w.channelId}>`).join("\n") }] });
    }
  }

  // ── GIVEAWAY EXTENDED ─────────────────────────────────

  // ,giveaway — alias
  if (command === "giveaway") {
    const sub = args[1]?.toLowerCase();
    if (sub === "list") {
      const active = [...giveaways.entries()].filter(([, g]) => !g.ended && g.guildId === guildId);
      if (active.length === 0) return message.reply("No active giveaways.");
      return message.reply({ embeds: [{ color: PINK, title: "🎉 Active Giveaways", description: active.map(([id, g]) => `**${g.prize}** — ends <t:${Math.floor(g.endTime/1000)}:R> — [Jump](https://discord.com/channels/${guildId}/${g.channelId}/${id})`).join("\n") }] });
    }
  }

  // ── MODERATION EXTRAS ─────────────────────────────────

  // ,mutehistory <@user>
  if (command === "mutehistory") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.users.first() || await client.users.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    const hist = muteHistory.get(`${guildId}-${target.id}`) || [];
    if (hist.length === 0) return ok(message, `**${target.username}** has no mute history.`);
    return message.reply({ embeds: [{ color: PINK, title: `Mute History: ${target.username}`, description: hist.map((h, i) => `**${i+1}.** ${h.duration} — ${h.reason} (${h.mod})`).join("\n") }] });
  }

  // ,stafflist — list all staff (admin + mod)
  if (command === "stafflist") {
    const staff = message.guild.members.cache.filter(m => m.permissions.has(PermissionFlagsBits.ModerateMembers) && !m.user.bot);
    return message.reply({ embeds: [{ color: PINK, title: `👮 Staff (${staff.size})`, description: staff.map(m => `${m.user.username} — ${m.roles.highest.name}`).join("\n").substring(0, 4096) }] });
  }

  // ,slowmodechannel <#channel> <seconds>
  if (command === "slowmodechannel") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const ch = message.mentions.channels.first();
    const seconds = parseInt(args[2]) ?? 0;
    if (!ch) return err(message, "missing required argument");

    await ch.setRateLimitPerUser(seconds).catch(() => null);
    return ok(message, `Slowmode in ${ch}: **${seconds}s**`);
  }

  // ,banwave <reason> — ban all recent raiders (users who joined in last 5 min with no messages)
  if (command === "banwave") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const reason = args.slice(1).join(" ") || "Banwave — suspected raid";
    const members = await message.guild.members.fetch();
    const suspects = members.filter(m => !m.user.bot && m.joinedTimestamp > Date.now() - 5 * 60 * 1000);
    if (suspects.size === 0) return ok(message, "No suspicious members found (joined in last 5 min).");
    message.reply({ embeds: [{ color: PINK, description: `🌸 Banning **${suspects.size}** suspicious members...` }] });
    let count = 0;
    for (const m of suspects.values()) { await m.ban({ reason }).catch(() => {}); count++; }
    return message.channel.send({ embeds: [{ color: PINK, description: "🌸 " + `✅ Banned **${count}** members.` }] });
  }

  // ,kick everyone — kick all non-staff (requires confirmation)
  if (command === "kickeveryone") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator) || message.author.id !== message.guild.ownerId) return err(message, "Only server owner.");
    if (args[1] !== "confirm") return message.reply("⚠️ This will kick ALL non-staff members. Type `,kickeveryone confirm` to confirm.");
    const members = await message.guild.members.fetch();
    let count = 0;
    for (const m of members.values()) {
      if (m.user.bot || m.id === message.guild.ownerId || m.permissions.has(PermissionFlagsBits.Administrator)) continue;
      await m.kick("Mass kick by owner").catch(() => {});
      count++;
    }
    return message.channel.send({ embeds: [{ color: PINK, description: "🌸 " + `✅ Kicked **${count}** members.` }] });
  }

  // ,dehoist — remove hoisted characters from nicknames
  if (command === "dehoist") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageNicknames)) return err(message, "Missing permissions.");
    const members = await message.guild.members.fetch();
    let count = 0;
    for (const m of members.values()) {
      const name = m.nickname || m.user.username;
      if (/^[^a-zA-Z0-9]/.test(name)) {
        const clean = name.replace(/^[^a-zA-Z0-9]+/, "");
        await m.setNickname(clean || "Dehoisted").catch(() => {});
        count++;
      }
    }
    return ok(message, `Dehoisted **${count}** members.`);
  }

  // ,decancer <@user> — remove special characters from nickname
  if (command === "decancer") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageNicknames)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    const clean = (target.nickname || target.user.username).replace(/[^\x20-\x7E]/g, "").trim() || "Cleaned Nick";
    await target.setNickname(clean).catch(() => null);
    return ok(message, `Cleaned nickname: **${clean}**`);
  }

  // ,dehoistall — dehoist all members
  if (command === "dehoistall") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageNicknames)) return err(message, "Missing permissions.");
    const members = await message.guild.members.fetch();
    let count = 0;
    message.reply({ embeds: [{ color: PINK, description: `🌸 Dehoisting **${members.size}** members...` }] });
    for (const m of members.values()) {
      if (m.user.bot || m.id === message.guild.ownerId) continue;
      const name = m.nickname || m.user.username;
      if (/^[^a-zA-Z0-9]/.test(name)) {
        await m.setNickname(name.replace(/^[^a-zA-Z0-9]+/, "") || "Dehoisted").catch(() => {});
        count++;
      }
    }
    return message.channel.send({ embeds: [{ color: PINK, description: "🌸 " + `✅ Dehoisted **${count}** members.` }] });
  }

  // ,resetnick <@user>
  if (command === "resetnick") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageNicknames)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    await target.setNickname(null).catch(() => null);
    return ok(message, `Reset nickname for **${target.user.username}**`);
  }

  // ,resetallnicks — reset all nicknames
  if (command === "resetallnicks") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const members = await message.guild.members.fetch();
    message.reply({ embeds: [{ color: PINK, description: `🌸 Resetting ${members.size} nicknames...` }] });
    let count = 0;
    for (const m of members.values()) {
      if (m.nickname) { await m.setNickname(null).catch(() => {}); count++; }
    }
    return message.channel.send({ embeds: [{ color: PINK, description: "🌸 " + `✅ Reset **${count}** nicknames.` }] });
  }

  // ── LOGGING EVENTS EXTENDED ───────────────────────────

  // ,messagelog <#channel> — log all deleted/edited messages
  if (command === "messagelog") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    if (args[1] === "off") { modlogChannel.delete(`msg-${guildId}`); return ok(message, "Message log disabled."); }
    const ch = message.mentions.channels.first();
    if (!ch) return err(message, "missing required argument");

    modlogChannel.set(`msg-${guildId}`, ch.id);
    saveAllConfigs();return ok(message, `Message logs → ${ch}`);
  }

  // ,joinlog <#channel>
  if (command === "joinlog") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    if (args[1] === "off") { modlogChannel.delete(`join-${guildId}`); return ok(message, "Join log disabled."); }
    const ch = message.mentions.channels.first();
    if (!ch) return err(message, "missing required argument");

    modlogChannel.set(`join-${guildId}`, ch.id);
    saveAllConfigs();return ok(message, `Join/leave logs → ${ch}`);
  }

  // ,voicelog <#channel>
  if (command === "voicelog") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    if (args[1] === "off") { voiceLogs.delete(guildId); return ok(message, "Voice log disabled."); }
    const ch = message.mentions.channels.first();
    if (!ch) return err(message, "missing required argument");

    voiceLogs.set(guildId, ch.id);
    return ok(message, `Voice logs → ${ch}`);
  }

  // ── PING ROLES ────────────────────────────────────────

  // ,pingrole <@role> — toggle pingable role
  if (command === "pingrole") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return err(message, "Missing permissions.");
    const role = message.mentions.roles.first();
    if (!role) return err(message, "missing required argument");

    const set = pingRoles.get(guildId) || new Set();
    if (set.has(role.id)) {
      set.delete(role.id);
      await role.setMentionable(false).catch(() => {});
      return ok(message, `**${role.name}** is no longer pingable.`);
    }
    set.add(role.id);
    pingRoles.set(guildId, set);
    await role.setMentionable(true).catch(() => {});
    return ok(message, `**${role.name}** is now pingable.`);
  }

  // ── INFO EXTRAS ────────────────────────────────────────

  // ,id [user|role|channel] — get ID
  if (command === "id") {
    const user = message.mentions.users.first();
    const role = message.mentions.roles.first();
    const ch = message.mentions.channels.first();
    if (user) return info(message, `**${user.username}** — \`${user.id}\``);
    if (role) return info(message, `**${role.name}** — \`${role.id}\``);
    if (ch) return info(message, `**${ch.name}** — \`${ch.id}\``);
    return info(message, `your ID: \`${message.author.id}\` | server: \`${guildId}\` | channel: \`${message.channel.id}\``);
  }

  // ,icon [user]
  if (command === "icon") {
    const target = message.mentions.users.first() || message.author;
    return message.reply({ embeds: [{ color: PINK, author: { name: target.username, icon_url: target.displayAvatarURL() }, image: { url: target.displayAvatarURL({ size: 1024, dynamic: true }) }, footer: { text: message.guild.name } }] });
  }

  // ,banner [user]
  if (command === "banner") {
    await message.channel.sendTyping().catch(() => {});
    const target = await client.users.fetch(message.mentions.users.first()?.id || message.author.id, { force: true }).catch(() => null);
    if (!target) return err(message, "missing required argument: **user**");
    const url = target.bannerURL({ size: 1024 });
    if (!url) return info(message, `**${target.username}** has no banner`);
    return message.reply({ embeds: [{ color: PINK, author: { name: target.username, icon_url: target.displayAvatarURL() }, image: { url }, footer: { text: message.guild.name } }] });
  }

  // ,hex <color> — convert color name to hex
  if (command === "hex") {
    const color = args.slice(1).join(" ");
    if (!color) return err(message, "missing required argument");

    const colors = { red: "#FF0000", blue: "#0000FF", green: "#00FF00", yellow: "#FFFF00", purple: "#800080", orange: "#FFA500", pink: "#FFC0CB", white: "#FFFFFF", black: "#000000", cyan: "#00FFFF", gold: "#FFD700", silver: "#C0C0C0" };
    const hex = colors[color.toLowerCase()];
    if (!hex) return err(message, "Color not found. Try: red, blue, green, etc.");
    const int = parseInt(hex.replace("#", ""), 16);
    return message.reply({ embeds: [{ color: int, title: `${color} = ${hex}` }] });
  }

  // ,snowflake <id> — decode Discord snowflake
  if (command === "snowflake") {
    const id = args[1];
    if (!id || !/^\d+$/.test(id)) return err(message, "missing required argument");

    const timestamp = BigInt(id) >> 22n;
    const date = new Date(Number(timestamp) + 1420070400000);
    return info(message, `**${id}**\nCreated: <t:${Math.floor(date.getTime()/1000)}:F>\nTimestamp: ${date.getTime()}`);
  }

  // ,discrim <discriminator> — find users with same discriminator
  if (command === "discrim") {
    const discrim = args[1];
    if (!discrim) return err(message, "missing required argument");

    const members = message.guild.members.cache.filter(m => m.user.discriminator === discrim);
    if (members.size === 0) return info(message, `no members with discriminator **#${discrim}**`);
    return message.reply({ embeds: [{ color: PINK, title: `Users with #${discrim}`, description: members.map(m => m.user.username).join("\n") }] });
  }

  // ,copycat <@user> — mimic a user's name and avatar for a webhook message
  if (command === "copycat") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageWebhooks)) return err(message, "Missing permissions.");
    const target = message.mentions.users.first();
    const text = args.slice(2).join(" ");
    if (!target || !text) return err(message, "missing required argument");

    const wh = await message.channel.createWebhook({ name: target.username, avatar: target.displayAvatarURL() }).catch(() => null);
    if (!wh) return err(message, "Could not create webhook.");
    await wh.send(text);
    await wh.delete().catch(() => {});
    message.delete().catch(() => {});
  }

  // ── ECONOMY EXTRAS ────────────────────────────────────

  // ,weekly — weekly reward
  if (command === "weekly") {
    const key = `weekly-${message.author.id}`;
    const last = economy.get(key);
    const now = Date.now();
    if (last && now - last < 604800000) {
      const remaining = Math.ceil((604800000 - (now - last)) / 3600000);
      return info(message, `⏰ Come back in **${remaining}h** for your weekly reward.`);
    }
    const current = economy.get(message.author.id) || 0;
    economy.set(message.author.id, current + 2500);
    economy.set(key, now);
    return ok(message, `You claimed your weekly **2500 coins**! Balance: **${current + 2500}**`);
  }

  // ,monthly
  if (command === "monthly") {
    const key = `monthly-${message.author.id}`;
    const last = economy.get(key);
    const now = Date.now();
    if (last && now - last < 2592000000) {
      const remaining = Math.ceil((2592000000 - (now - last)) / 86400000);
      return info(message, `⏰ Come back in **${remaining}d** for your monthly reward.`);
    }
    const current = economy.get(message.author.id) || 0;
    economy.set(message.author.id, current + 10000);
    economy.set(key, now);
    return ok(message, `You claimed your monthly **10,000 coins**! Balance: **${current + 10000}**`);
  }

  // ,give <@user> <amount> — admin give coins
  if (command === "give") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const target = message.mentions.users.first();
    const amount = parseInt(args[2]);
    if (!target || isNaN(amount)) return err(message, "missing required argument");

    economy.set(target.id, (economy.get(target.id) || 0) + amount);
    return ok(message, `Gave **${amount} coins** to **${target.username}**`);
  }

  // ,take <@user> <amount>
  if (command === "take") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const target = message.mentions.users.first();
    const amount = parseInt(args[2]);
    if (!target || isNaN(amount)) return err(message, "missing required argument");

    const bal = economy.get(target.id) || 0;
    economy.set(target.id, Math.max(0, bal - amount));
    return ok(message, `Took **${amount} coins** from **${target.username}**`);
  }

  // ,resetbal <@user>
  if (command === "resetbal") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const target = message.mentions.users.first();
    if (!target) return err(message, "missing required argument");

    economy.set(target.id, 0);
    return ok(message, `Reset **${target.username}**'s balance.`);
  }

  // ,setbal <@user> <amount>
  if (command === "setbal") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const target = message.mentions.users.first();
    const amount = parseInt(args[2]);
    if (!target || isNaN(amount)) return err(message, "missing required argument");

    economy.set(target.id, amount);
    return ok(message, `Set **${target.username}**'s balance to **${amount}**`);
  }

  // ,work — earn coins by working
  if (command === "work") {
    const key = `work-${message.author.id}`;
    const last = economy.get(key);
    const now = Date.now();
    if (last && now - last < 3600000) {
      const remaining = Math.ceil((3600000 - (now - last)) / 60000);
      return info(message, `⏰ You can work again in **${remaining} minutes**.`);
    }
    const jobs = ["mowed the lawn", "delivered pizza", "wrote some code", "walked dogs", "fixed a computer"];
    const job = jobs[Math.floor(Math.random() * jobs.length)];
    const earned = Math.floor(Math.random() * 200) + 50;
    economy.set(message.author.id, (economy.get(message.author.id) || 0) + earned);
    economy.set(key, now);
    return ok(message, `You ${job} and earned **${earned} coins**!`);
  }

  // ,crime — risky way to earn coins
  if (command === "crime") {
    const key = `crime-${message.author.id}`;
    const last = economy.get(key);
    const now = Date.now();
    if (last && now - last < 7200000) return info(message, `⏰ Too risky right now. Wait **${Math.ceil((7200000 - (now - last)) / 60000)} minutes**.`);
    economy.set(key, now);
    const success = Math.random() > 0.4;
    const amount = Math.floor(Math.random() * 500) + 100;
    const bal = economy.get(message.author.id) || 0;
    if (success) {
      economy.set(message.author.id, bal + amount);
      return ok(message, `You committed a crime and got away with **${amount} coins**!`);
    } else {
      economy.set(message.author.id, Math.max(0, bal - amount));
      return info(message, `You got caught! You lost **${amount} coins**.`);
    }
  }

  // ,rob <@user>
  if (command === "rob") {
    const target = message.mentions.users.first();
    if (!target) return err(message, "missing required argument: **user**\nusage: `,rob @user`");
    if (target.id === message.author.id) return err(message, "You can't rob yourself.");
    const key = `rob-${message.author.id}`;
    const last = economy.get(key);
    const now = Date.now();
    if (last && now - last < 3600000) return info(message, `⏰ Wait **${Math.ceil((3600000 - (now - last)) / 60000)} minutes** before robbing again.`);
    economy.set(key, now);
    const targetBal = economy.get(target.id) || 0;
    if (targetBal < 100) return err(message, `**${target.username}** is too poor to rob.`);
    const success = Math.random() > 0.5;
    const amount = Math.floor(targetBal * 0.2);
    if (success) {
      economy.set(target.id, targetBal - amount);
      economy.set(message.author.id, (economy.get(message.author.id) || 0) + amount);
      return ok(message, `You robbed **${target.username}** and stole **${amount} coins**!`);
    } else {
      const fine = Math.floor(amount / 2);
      economy.set(message.author.id, Math.max(0, (economy.get(message.author.id) || 0) - fine));
      return info(message, `You got caught robbing **${target.username}** and paid a **${fine} coin** fine!`);
    }
  }

  // ,shop — show economy shop
  if (command === "shop") {
    return info(message, "shop coming soon! Use `,work` `,daily` `,crime` to earn coins");
  }

  // ── FUN EXTRAS ────────────────────────────────────────

  // ,emojify <text>
  if (command === "emojify") {
    const text = args.slice(1).join(" ").toLowerCase();
    if (!text) return err(message, "missing required argument");

    const result = text.split("").map(c => {
      if (/[a-z]/.test(c)) return `:regional_indicator_${c}: `;
      if (c === " ") return "  ";
      return c;
    }).join("");
    return message.reply(result.substring(0, 2000) || "❌");
  }

  // ,spoiler <text>
  if (command === "spoiler") {
    const text = args.slice(1).join(" ");
    if (!text) return err(message, "missing required argument");

    message.delete().catch(() => {});
    return message.channel.send(`||${text}||`).catch(() => null);
  }

  // ,zalgo <text>
  if (command === "zalgo") {
    const text = args.slice(1).join(" ");
    if (!text) return err(message, "missing required argument");

    const zalgoChars = ["̴","̵","̶","̷","̸","̡","̢","̧","̨","͜","͝","͞","͟","͠","͡"];
    const result = text.split("").map(c => c + zalgoChars[Math.floor(Math.random() * zalgoChars.length)].repeat(3)).join("");
    return message.reply(result.substring(0, 2000));
  }

  // ,leet <text>
  if (command === "leet") {
    const text = args.slice(1).join(" ");
    if (!text) return err(message, "missing required argument");

    const map = { a: "4", e: "3", i: "1", o: "0", s: "5", t: "7", b: "8", g: "9" };
    return message.reply(text.toLowerCase().split("").map(c => map[c] || c).join(""));
  }

  // ,vaporwave <text>
  if (command === "vaporwave") {
    const text = args.slice(1).join(" ");
    if (!text) return err(message, "missing required argument");

    const result = text.split("").map(c => {
      const code = c.charCodeAt(0);
      if (code >= 33 && code <= 126) return String.fromCharCode(code + 65248);
      return c;
    }).join("");
    return message.reply(result);
  }

  // ,countdown <n> — counts down in chat
  if (command === "countdown") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const n = Math.min(parseInt(args[1]) || 5, 10);
    if (isNaN(n) || n < 1) return err(message, "missing required argument");

    const msg = await message.channel.send(`⏳ **${n}**`);
    let current = n - 1;
    const interval = setInterval(async () => {
      if (current <= 0) { clearInterval(interval); await msg.edit({ embeds: [{ color: PINK, description: "🎉 **GO!**" }] }).catch(() => {}); return; }
      await msg.edit({ embeds: [{ color: PINK, description: `⏳ **${current}**` }] }).catch(() => { clearInterval(interval); });
      current--;
    }, 1000);
  }

  // ,math advanced
  if (command === "calc") {
    const expr = args.slice(1).join(" ");
    if (!expr) return err(message, "missing required argument");

    try {
      const result = Function(`"use strict"; return (${expr.replace(/[^0-9+\-*/().\s%^]/g, "")})`)();
      return info(message, `**${expr}** = **${result}**`);
    } catch { return err(message, "Invalid expression."); }
  }

  // ,tinytext <text>
  if (command === "tinytext") {
    const text = args.slice(1).join(" ").toLowerCase();
    const tiny = { a:"ᵃ",b:"ᵇ",c:"ᶜ",d:"ᵈ",e:"ᵉ",f:"ᶠ",g:"ᵍ",h:"ʰ",i:"ⁱ",j:"ʲ",k:"ᵏ",l:"ˡ",m:"ᵐ",n:"ⁿ",o:"ᵒ",p:"ᵖ",r:"ʳ",s:"ˢ",t:"ᵗ",u:"ᵘ",v:"ᵛ",w:"ʷ",x:"ˣ",y:"ʸ",z:"ᶻ" };
    return message.reply(text.split("").map(c => tiny[c] || c).join(""));
  }

  // ,bold <text>
  if (command === "bold") {
    const text = args.slice(1).join(" ");
    message.delete().catch(() => {});
    return message.channel.send(`**${text}**`).catch(() => null);
  }

  // ,italic <text>
  if (command === "italic") {
    const text = args.slice(1).join(" ");
    message.delete().catch(() => {});
    return message.channel.send(`*${text}*`).catch(() => null);
  }

  // ,strikethrough <text>
  if (command === "strikethrough") {
    const text = args.slice(1).join(" ");
    message.delete().catch(() => {});
    return message.channel.send(`~~${text}~~`).catch(() => null);
  }

  // ,underline <text>
  if (command === "underline") {
    const text = args.slice(1).join(" ");
    message.delete().catch(() => {});
    return message.channel.send(`__${text}__`).catch(() => null);
  }

  // ,codeblock <text>
  if (command === "codeblock") {
    const text = args.slice(1).join(" ");
    message.delete().catch(() => {});
    return message.channel.send(`\`\`\`\n${text}\n\`\`\``).catch(() => null);
  }

  // ,repeat <n> <text>
  if (command === "repeat") {
    const n = Math.min(parseInt(args[1]) || 1, 10);
    const text = args.slice(2).join(" ");
    if (!text) return err(message, "missing required argument");

    return message.reply(Array(n).fill(text).join("\n").substring(0, 2000));
  }

  // ,toss — heads or tails (alias coinflip)
  if (command === "toss") {
    return info(message, `**${Math.random() < 0.5 ? "Heads" : "Tails"}!**`);
  }

  // ,yesno — yes or no random
  if (command === "yesno") {
    return message.reply(Math.random() < 0.5 ? "✅ **Yes**" : "❌ **No**");
  }

  // ,decide <option1> | <option2> | ...
  if (command === "decide") {
    const options = args.slice(1).join(" ").split("|").map(o => o.trim()).filter(Boolean);
    if (options.length < 2) return err(message, "missing required argument");

    return info(message, `I pick: **${options[Math.floor(Math.random() * options.length)]}**`);
  }

  // ,number <min> <max>
  if (command === "number") {
    const min = parseInt(args[1]) || 1;
    const max = parseInt(args[2]) || 100;
    return info(message, `**${Math.floor(Math.random() * (max - min + 1)) + min}**`);
  }

  // ,team <size> <@user1> <@user2> ... — split into teams
  if (command === "team") {
    const size = parseInt(args[1]);
    const members = [...message.mentions.users.values()];
    if (isNaN(size) || members.length < size) return err(message, "missing required argument");

    const shuffled = members.sort(() => Math.random() - 0.5);
    const teams = [];
    for (let i = 0; i < shuffled.length; i += size) teams.push(shuffled.slice(i, i + size));
    const desc = teams.map((t, i) => `**Team ${i+1}:** ${t.map(u => u.username).join(", ")}`).join("\n");
    return message.reply({ embeds: [{ color: PINK, title: "⚽ Teams", description: desc }] });
  }

  // ,shuffle <item1> | <item2> | ...
  if (command === "shuffle") {
    const items = args.slice(1).join(" ").split("|").map(i => i.trim()).filter(Boolean);
    if (items.length < 2) return err(message, "missing required argument");

    const shuffled = items.sort(() => Math.random() - 0.5);
    return info(message, `${shuffled.join(", ")}`);
  }

  // ,password <length> — generate random password
  if (command === "password") {
    const length = Math.min(parseInt(args[1]) || 16, 64);
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    const password = Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    try { await message.author.send(`🔒 Generated password: \`${password}\``); } catch {}
    return ok(message, "Password sent to your DMs!");
  }

  // ,token — generate random token-like string
  if (command === "token") {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const token = Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    return info(message, `token: \`${token}\``);
  }

  // ── UTILITY EXTRAS ────────────────────────────────────

  // ,news — latest Discord status
  if (command === "news") {
    await message.channel.sendTyping().catch(() => {});
    try {
      const res = await fetch("https://discordstatus.com/api/v2/status.json");
      const data = await res.json();
      return message.reply({ embeds: [{ color: PINK, title: "📡 Discord Status", description: data.status.description }] });
    } catch { return err(message, "Could not fetch Discord status."); }
  }

  // ,serverage — how old is the server
  if (command === "serverage") {
    const created = message.guild.createdTimestamp;
    const days = Math.floor((Date.now() - created) / 86400000);
    return info(message, `Server is **${days} days** old (created <t:${Math.floor(created/1000)}:R>)`);
  }

  // ,accountage [user]
  if (command === "accountage") {
    const target = message.mentions.users.first() || message.author;
    const days = Math.floor((Date.now() - target.createdTimestamp) / 86400000);
    return info(message, `**${target.username}**'s account is **${days} days** old`);
  }

  // ,invitebot — get bot invite link
  if (command === "invitebot") {
    return info(message, `[Invite me!](https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot)`);
  }

  // ,support — support server
  if (command === "support") {
    return message.reply("💬 Join our support server for help!");
  }

  // ,source — show bot source info
  if (command === "source") {
    return message.reply({ embeds: [{ color: PINK, title: "📦 Bot Info", fields: [{ name: "Library", value: "discord.js v14", inline: true }, { name: "Runtime", value: `Node.js ${process.version}`, inline: true }, { name: "Memory", value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`, inline: true }], footer: { text: message.guild.name }, timestamp: new Date() }] });
  }

  // ,shards — shard info
  if (command === "shards") {
    return info(message, `shard **${client.shard?.ids[0] ?? 0}** | guilds: **${client.guilds.cache.size}**`);
  }

  // ,leave — make bot leave server (owner only)
  if (command === "leave") {
    if (message.author.id !== OWNER_ID) return err(message, "Owner only.");
    await message.reply("👋 Leaving server...");
    await message.guild.leave();
  }

  // ,guilds — list all guilds bot is in (owner only)
  if (command === "guilds") {
    if (message.author.id !== OWNER_ID) return err(message, "Owner only.");
    const list = client.guilds.cache.map(g => `**${g.name}** (${g.memberCount})`).join("\n");
    return message.reply({ embeds: [{ color: PINK, title: `Guilds (${client.guilds.cache.size})`, description: list.substring(0, 4096) }] });
  }

  // ,eval <code> — owner only
  if (command === "eval") {
    if (message.author.id !== OWNER_ID) return err(message, "Owner only.");
    const code = args.slice(1).join(" ");
    try {
      let result = eval(code);
      if (result instanceof Promise) result = await result;
      const output = typeof result === "object" ? JSON.stringify(result, null, 2) : String(result);
      return message.reply({ embeds: [{ color: PINK, description: `\`\`\`js\n${output.substring(0, 1900)}\n\`\`\`` }] });
    } catch (e) { return message.reply({ embeds: [{ color: PINK, description: `\`\`\`js\n${e.message}\n\`\`\`` }] }); }
  }

  // ,exec <command> — owner only shell (disabled for safety)
  if (command === "exec") {
    return err(message, "exec is disabled for security reasons.");
  }

  // ,status <online|idle|dnd|invisible> — set bot status
  if (command === "status") {
    if (message.author.id !== OWNER_ID) return err(message, "Owner only.");
    const status = args[1];
    if (!["online","idle","dnd","invisible"].includes(status)) return err(message, "missing required argument");

    client.user.setStatus(status);
    return ok(message, `Status set to **${status}**`);
  }

  // ,activity <type> <text> — set bot activity
  if (command === "activity") {
    if (message.author.id !== OWNER_ID) return err(message, "Owner only.");
    const types = {
      playing: ActivityType.Playing,
      streaming: ActivityType.Streaming,
      listening: ActivityType.Listening,
      watching: ActivityType.Watching,
      competing: ActivityType.Competing
    };
    const type = args[1]?.toLowerCase();
    const text = args.slice(2).join(" ");
    if (!types[type] || !text) return err(message, "usage: `,activity <playing|streaming|listening|watching|competing> <text>`");
    const opts = { type: types[type] };
    if (type === "streaming") opts.url = "https://www.twitch.tv/sensational";
    client.user.setActivity(text, opts);
    return ok(message, `activity set to **${type}** ${text}`);
  }

  // ,say2 <#channel> <message> — send to different channel
  if (command === "say2") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const ch = message.mentions.channels.first();
    const text = args.slice(2).join(" ");
    if (!ch || !text) return err(message, "missing required argument");

    await ch.send(text);
    return ok(message, `Sent to ${ch}`);
  }

  // ,react <messageId> <emoji>
  if (command === "react") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const msgId = args[1];
    const emoji = args[2];
    if (!msgId || !emoji) return err(message, "missing required argument");

    const msg = await message.channel.messages.fetch(msgId).catch(() => null);
    if (!msg) return err(message, "Message not found.");
    await msg.react(emoji).catch(() => null);
    message.delete().catch(() => {});
  }

  // ,unreact <messageId> — remove all bot reactions
  if (command === "unreact") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const msgId = args[1];
    const msg = await message.channel.messages.fetch(msgId).catch(() => null);
    if (!msg) return err(message, "Message not found.");
    await msg.reactions.removeAll().catch(() => null);
    return ok(message, "Reactions removed.");
  }

  // ,editbot <text> — edit last bot message
  if (command === "editbot") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const text = args.slice(1).join(" ");
    const msgs = await message.channel.messages.fetch({ limit: 20 });
    const botMsg = msgs.filter(m => m.author.id === client.user.id).first();
    if (!botMsg) return err(message, "No recent bot message found.");
    await botMsg.edit(text).catch(() => null);
    message.delete().catch(() => {});
  }

  // ,deletebot — delete last bot message
  if (command === "deletebot") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const msgs = await message.channel.messages.fetch({ limit: 20 });
    const botMsg = msgs.filter(m => m.author.id === client.user.id).first();
    if (!botMsg) return err(message, "No recent bot message found.");
    await botMsg.delete().catch(() => null);
    message.delete().catch(() => {});
  }
});

// ===== FINAL COMMANDS TO REACH 450+ =====
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(",")) return;
  const args = message.content.slice(1).trim().split(/ +/);
  const command = args[0].toLowerCase();
  if (ignoreList.get(message.guild?.id)?.has(message.author.id)) return;


  if (command === "whitelistcheck") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const cfg = getAntiNuke(message.guild.id);
    const wl = cfg.whitelist.size > 0 ? [...cfg.whitelist].map(id => `<@${id}>`).join(", ") : "Empty";
    return info(message, `antinuke whitelist: ${wl}`);
  }
  if (command === "temprole") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first();
    const role = message.mentions.roles.first();
    const timeStr = args[3];
    if (!target || !role || !timeStr) return err(message, "missing required argument");

    const match = timeStr.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return err(message, "Invalid time.");
    const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const ms = parseInt(match[1]) * units[match[2]];
    await target.roles.add(role).catch(() => null);
    ok(message, `✅ Gave **${role.name}** to **${target.user.username}** for **${timeStr}**`);
    setTimeout(async () => { await target.roles.remove(role).catch(() => {}); message.channel.send(`⏰ Removed **${role.name}** from **${target.user.username}**`).catch(() => {}); }, ms);
  }
  if (command === "muterole") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const role = message.mentions.roles.first();
    if (!role) return err(message, "missing required argument");

    muteRole.set(message.guild.id, role.id);
    saveAllConfigs();return ok(message, `Mute role set to **${role.name}**`);
  }
  if (command === "imagemute") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first();
    if (!target) return err(message, "missing required argument");

    const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === "image muted");
    if (!role) return err(message, "No 'Image Muted' role. Run `,setupmute` first.");
    await target.roles.add(role).catch(() => null);
    return ok(message, `Image muted **${target.user.username}**`);
  }
  if (command === "reactionmute") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first();
    if (!target) return err(message, "missing required argument");

    const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === "reaction muted");
    if (!role) return err(message, "No 'Reaction Muted' role. Run `,setupmute` first.");
    await target.roles.add(role).catch(() => null);
    return ok(message, `Reaction muted **${target.user.username}**`);
  }
  if (command === "reactionunmute") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first();
    const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === "reaction muted");
    if (target && role) await target.roles.remove(role).catch(() => null);
    return ok(message, `Reaction unmuted **${target?.user.username}**`);
  }
  if (command === "imageunmute") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.members.first();
    const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === "image muted");
    if (target && role) await target.roles.remove(role).catch(() => null);
    return ok(message, `Image unmuted **${target?.user.username}**`);
  }
  if (command === "serverrules") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const rules = args.slice(1).join(" ").split("|").map((r, i) => `**${i+1}.** ${r.trim()}`).filter(Boolean);
    if (rules.length === 0) return err(message, "missing required argument");

    return message.channel.send({ embeds: [{ color: PINK, title: `📜 ${message.guild.name} Rules`, description: rules.join("\n") }] });
  }
  if (command === "inviteinfo2") {
    const code = args[1];
    if (!code) return err(message, "missing required argument");

    const invite = await client.fetchInvite(code).catch(() => null);
    if (!invite) return err(message, "Invite not found.");
    return message.reply({ embeds: [{ color: PINK, title: `Invite: ${code}`, fields: [{ name: "Server", value: invite.guild?.name || "Unknown", inline: true }, { name: "Channel", value: invite.channel?.name || "Unknown", inline: true }, { name: "Uses", value: `${invite.uses ?? "?"}`, inline: true }, { name: "Inviter", value: invite.inviter?.username || "Unknown", inline: true }, { name: "Max Uses", value: `${invite.maxUses || "∞"}`, inline: true }, { name: "Expires", value: invite.expiresAt ? `<t:${Math.floor(invite.expiresAt.getTime()/1000)}:R>` : "Never", inline: true }] }] });
  }
  if (command === "memberpos") {
    const target = message.mentions.members.first() || message.member;
    const members = (await message.guild.members.fetch()).sort((a, b) => a.joinedTimestamp - b.joinedTimestamp);
    const pos = [...members.values()].findIndex(m => m.id === target.id) + 1;
    return info(message, `**${target.user.username}** is member **#${pos}** to join`);
  }
  if (command === "permissions2") {
    const target = message.mentions.members.first() || message.member;
    const perms = target.permissions.toArray();
    return message.reply({ embeds: [{ color: PINK, title: `All Permissions: ${target.user.username}`, description: perms.join(", ").substring(0, 4096) || "None" }] });
  }
  if (command === "channelpermissions") {
    const ch = message.mentions.channels.first() || message.channel;
    const target = message.mentions.members.first() || message.member;
    const perms = ch.permissionsFor(target)?.toArray() || [];
    return message.reply({ embeds: [{ color: PINK, title: `Channel Perms: ${target.user.username} in #${ch.name}`, description: perms.join(", ").substring(0, 4096) || "None" }] });
  }
  if (command === "guildicon") {
    const url = message.guild.iconURL({ size: 2048, dynamic: true });
    if (!url) return err(message, "No icon.");
    return message.reply({ embeds: [{ color: PINK, image: { url } }] });
  }
  if (command === "guildbanner") {
    const url = message.guild.bannerURL({ size: 2048 });
    if (!url) return err(message, "No banner.");
    return message.reply({ embeds: [{ color: PINK, image: { url } }] });
  }
  if (command === "guildsplash") {
    const url = message.guild.splashURL({ size: 2048 });
    if (!url) return err(message, "No splash.");
    return message.reply({ embeds: [{ color: PINK, image: { url } }] });
  }
  if (command === "cleardm") {
    return message.author.send("📬 Discord does not allow bots to delete DMs.").catch(() => err(message, "Could not DM you."));
  }
  if (command === "userperms") {
    const target = message.mentions.members.first() || message.member;
    const dangerous = [];
    if (target.permissions.has(PermissionFlagsBits.Administrator)) dangerous.push("Administrator");
    if (target.permissions.has(PermissionFlagsBits.BanMembers)) dangerous.push("Ban Members");
    if (target.permissions.has(PermissionFlagsBits.KickMembers)) dangerous.push("Kick Members");
    if (target.permissions.has(PermissionFlagsBits.ManageGuild)) dangerous.push("Manage Server");
    if (target.permissions.has(PermissionFlagsBits.ManageRoles)) dangerous.push("Manage Roles");
    return message.reply({ embeds: [{ color: PINK, title: `⚠️ Key Perms: ${target.user.username}`, description: dangerous.length > 0 ? dangerous.join(", ") : "No dangerous permissions" }] });
  }
  if (command === "vcrename") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const vc = message.member.voice.channel;
    if (!vc) return err(message, "Join a voice channel first.");
    const name = args.slice(1).join(" ");
    if (!name) return err(message, "missing required argument");

    await vc.setName(name).catch(() => null);
    return ok(message, `Renamed to **${name}**`);
  }
  if (command === "vcinfo") {
    const vc = message.mentions.channels.first() || message.member.voice.channel;
    if (!vc) return err(message, "No voice channel found.");
    return message.reply({ embeds: [{ color: PINK, title: `🔊 ${vc.name}`, fields: [{ name: "Members", value: `${vc.members.size}`, inline: true }, { name: "User Limit", value: `${vc.userLimit || "∞"}`, inline: true }, { name: "Bitrate", value: `${vc.bitrate / 1000}kbps`, inline: true }, { name: "ID", value: vc.id }] }] });
  }
  if (command === "afklist") {
    const list = [...afkUsers.entries()].filter(([k]) => k.startsWith(message.guild.id));
    if (list.length === 0) return message.reply("No AFK users.");
    return message.reply({ embeds: [{ color: PINK, title: "💤 AFK Users", description: list.map(([k, v]) => `<@${k.split("-")[1]}> — ${v}`).join("\n") }] });
  }
  if (command === "removeafk") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return err(message, "Missing permissions.");
    const target = message.mentions.users.first();
    if (!target) return err(message, "missing required argument");

    afkUsers.delete(`${message.guild.id}-${target.id}`);
    return ok(message, `Removed AFK from **${target.username}**`);
  }
  if (command === "censor") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const sub = args[1]?.toLowerCase();
    const cfg = getFilter(message.guild.id);
    if (sub === "add") {
      const word = args.slice(2).join(" ");
      if (!word) return err(message, "missing required argument");

      cfg.words.push(word.toLowerCase());
      cfg.enabled = true;
      return ok(message, `Word **${word}** added to censor list.`);
    }
    if (sub === "remove") {
      const word = args.slice(2).join(" ").toLowerCase();
      cfg.words = cfg.words.filter(w => w !== word);
      return ok(message, `Word **${word}** removed from censor.`);
    }
    if (sub === "list") return info(message, `censored words: ${cfg.words.join(", ") || "None"}`);
    return err(message, "missing required argument");

  }
  if (command === "unmutechat") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null }).catch(() => null);
    return ok(message, "Chat unmuted.");
  }
  if (command === "mutechat") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }).catch(() => null);
    return ok(message, "Chat muted.");
  }
  if (command === "archive") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    if (!message.channel.isThread()) return err(message, "Not a thread.");
    await message.channel.setArchived(true).catch(() => null);
  }
  if (command === "unarchive") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    if (!message.channel.isThread()) return err(message, "Not a thread.");
    await message.channel.setArchived(false).catch(() => null);
    return ok(message, "Thread unarchived.");
  }
  if (command === "export") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const msgs = await message.channel.messages.fetch({ limit: 100 });
    const text = msgs.reverse().map(m => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.username}: ${m.content}`).join("\n");
    await message.author.send(`📥 Chat log from #${message.channel.name} sent!`).catch(() => err(message, "Could not DM you."));
    return ok(message, "Chat log sent to your DMs.");
  }
  if (command === "nsfwcheck") {
    return info(message, `this channel is ${message.channel.nsfw ? "**NSFW**" : "**SFW**"}`);
  }
  if (command === "nsfw") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    await message.channel.setNSFW(!message.channel.nsfw).catch(() => null);
    return ok(message, `NSFW: **${!message.channel.nsfw}**`);
  }
  if (command === "setbitrate") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const ch = message.mentions.channels.first() || message.member.voice.channel;
    const bitrate = parseInt(args[ch ? 2 : 1]) * 1000;
    if (!ch || isNaN(bitrate)) return err(message, "missing required argument");

    await ch.setBitrate(bitrate).catch(() => null);
    return ok(message, `Bitrate set to **${bitrate/1000}kbps**`);
  }
  if (command === "audit") {
    if (!message.member.permissions.has(PermissionFlagsBits.ViewAuditLog)) return err(message, "Missing permissions.");
    const logs = await message.guild.fetchAuditLogs({ limit: 5 }).catch(() => null);
    if (!logs) return err(message, "Could not fetch audit logs.");
    const lines = [...logs.entries.values()].map(e => `**${e.action}** by ${e.executor?.username || "Unknown"} — ${e.reason || "No reason"}`);
    return message.reply({ embeds: [{ color: PINK, title: "📋 Recent Audit Log", description: lines.join("\n") }] });
  }
  if (command === "clearreactions") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const msgId = args[1];
    const msg = await message.channel.messages.fetch(msgId).catch(() => null);
    if (!msg) return err(message, "Message not found.");
    await msg.reactions.removeAll().catch(() => null);
    return ok(message, "Reactions cleared.");
  }
  if (command === "serverfeatures") {
    const features = message.guild.features;
    return message.reply({ embeds: [{ color: PINK, title: `✨ ${message.guild.name} Features`, description: features.length > 0 ? features.join(", ") : "No special features" }] });
  }
  if (command === "boostgoal") {
    const current = message.guild.premiumSubscriptionCount;
    const goals = [0, 2, 7, 14];
    const tier = message.guild.premiumTier;
    const nextGoal = goals[tier + 1] || 14;
    return info(message, `**${current}/${nextGoal}** boosts for Tier **${Math.min(tier + 1, 3)}**`);
  }
  if (command === "prune") {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return err(message, "Missing permissions.");
    const days = parseInt(args[1]) || 7;
    const pruned = await message.guild.members.prune({ days, dry: false }).catch(() => null);
    return ok(message, `Pruned **${pruned}** members inactive for **${days}** days.`);
  }
  if (command === "prunedry") {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return err(message, "Missing permissions.");
    const days = parseInt(args[1]) || 7;
    const pruned = await message.guild.members.prune({ days, dry: true }).catch(() => null);
    return info(message, `**${pruned}** members would be pruned (inactive ${days}d) — use \`,prune ${days}\` to confirm`);
  }
  if (command === "antilinks") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const cfg = getFilter(message.guild.id);
    cfg.links = !cfg.links;
    cfg.enabled = true;
    return ok(message, `Anti-links: **${cfg.links ? "on" : "off"}**`);
  }
  if (command === "antiinvites") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const cfg = getFilter(message.guild.id);
    cfg.invites = !cfg.invites;
    cfg.enabled = true;
    return ok(message, `Anti-invites: **${cfg.invites ? "on" : "off"}**`);
  }
  if (command === "antispam") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const cfg = getFilter(message.guild.id);
    cfg.spam = !cfg.spam;
    cfg.enabled = true;
    return ok(message, `Anti-spam: **${cfg.spam ? "on" : "off"}**`);
  }
  if (command === "anticaps") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return err(message, "Missing permissions.");
    const cfg = getFilter(message.guild.id);
    cfg.caps = !cfg.caps;
    cfg.enabled = true;
    return ok(message, `Anti-caps: **${cfg.caps ? "on" : "off"}**`);
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(",")) return;
  const args = message.content.slice(1).trim().split(/ +/);
  const command = args[0].toLowerCase();
  if (ignoreList.get(message.guild?.id)?.has(message.author.id)) return;

  if (command === "hackban2") {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return err(message, "Missing permissions.");
    const ids = args.slice(1).filter(id => /^\d+$/.test(id));
    if (ids.length === 0) return err(message, "missing required argument: **userId**\nusage: `,hackban2 <id1> <id2> ...`");
    for (const id of ids) await message.guild.members.ban(id, { reason: `Hackban by ${message.author.username}` }).catch(() => {});
    return ok(message, `hackbanned **${ids.length}** users`);
  }
  if (command === "modnick") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageNicknames)) return err(message, "Missing permissions.");
    const t = message.mentions.members.first() || await message.guild.members.fetch(args[1]).catch(() => null);
    if (!t) return err(message, "missing required argument: **user**\nusage: `,modnick @user <nick>`");
    const nick = args.slice(2).join(" ");
    if (!nick) return err(message, "missing required argument: **nick**\nusage: `,modnick @user <nick>`");
    await t.setNickname(nick).catch(() => null);
    return ok(message, `nickname set to **${nick}** for **${t.user.username}**`);
  }
  if (command === "roleaddall") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const role = message.mentions.roles.first();
    if (!role) return err(message, "missing required argument: **role**\nusage: `,roleaddall @role`");
    const members = await message.guild.members.fetch();
    for (const m of members.values()) await m.roles.add(role).catch(() => {});
    return ok(message, `added **${role.name}** to **${members.size}** members`);
  }
  if (command === "roleremoveall") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const role = message.mentions.roles.first();
    if (!role) return err(message, "missing required argument: **role**\nusage: `,roleremoveall @role`");
    const members = await message.guild.members.fetch();
    for (const m of members.values()) await m.roles.remove(role).catch(() => {});
    return ok(message, `removed **${role.name}** from **${members.size}** members`);
  }
  if (command === "tempchannel") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const mins = parseInt(args[1]) || 60;
    const name = args.slice(2).join(" ") || "temp-channel";
    const ch = await message.guild.channels.create({ name, type: 0 }).catch(() => null);
    if (!ch) return err(message, "Failed to create channel.");
    setTimeout(() => ch.delete().catch(() => {}), mins * 60000);
    return ok(message, `temp channel ${ch} created — deletes in **${mins} min**`);
  }
  if (command === "channelpos") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return err(message, "Missing permissions.");
    const ch = message.mentions.channels.first() || message.channel;
    const pos = parseInt(args[message.mentions.channels.first() ? 2 : 1]);
    if (isNaN(pos)) return err(message, "missing required argument: **position**\nusage: `,channelpos [#channel] <position>`");
    await ch.setPosition(pos).catch(() => null);
    return ok(message, `moved **${ch.name}** to position **${pos}**`);
  }
  if (command === "rolepos") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) return err(message, "Missing permissions.");
    const role = message.mentions.roles.first();
    const pos = parseInt(args[2]);
    if (!role) return err(message, "missing required argument: **role**\nusage: `,rolepos @role <position>`");
    if (isNaN(pos)) return err(message, "missing required argument: **position**\nusage: `,rolepos @role <position>`");
    await role.setPosition(pos).catch(() => null);
    return ok(message, `moved **${role.name}** to position **${pos}**`);
  }
  if (command === "unignore") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const t = message.mentions.users.first();
    if (!t) return err(message, "missing required argument: **user**\nusage: `,unignore @user`");
    ignoreList.get(message.guild.id)?.delete(t.id);
    return ok(message, `unignored **${t.username}**`);
  }
  if (command === "staffrole") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const role = message.mentions.roles.first();
    if (!role) return err(message, "missing required argument: **role**\nusage: `,staffrole @role`");
    getAntiNuke(message.guild.id).whitelist.add(role.id);
    return ok(message, `**${role.name}** set as staff role`);
  }
  if (command === "modconfig") {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return err(message, "Missing permissions.");
    const an = getAntiNuke(message.guild.id);
    const ar = getAntiRaid(message.guild.id);
    const fl = getFilter(message.guild.id);
    return message.reply({ embeds: [{ color: PINK, title: "⚙️ Mod Config", fields: [
      { name: "AntiNuke", value: an.enabled ? "✅ On" : "❌ Off", inline: true },
      { name: "AntiRaid", value: ar.enabled ? "✅ On" : "❌ Off", inline: true },
      { name: "AutoMod", value: fl.enabled ? "✅ On" : "❌ Off", inline: true },
      { name: "AN Punishment", value: an.punishment, inline: true },
      { name: "AR Action", value: ar.action, inline: true },
      { name: "AR Threshold", value: `${ar.joinThreshold} joins`, inline: true }
    ] }] });
  }
  if (command === "botperms") {
    const perms = message.guild.members.me?.permissions.toArray() || [];
    return message.reply({ embeds: [{ color: PINK, title: "🤖 My Permissions", description: perms.length > 0 ? perms.join(", ") : "None" }] });
  }
  if (command === "cleanup") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return err(message, "Missing permissions.");
    const msgs = await message.channel.messages.fetch({ limit: 100 });
    const botMsgs = msgs.filter(m => m.author.id === client.user.id);
    await message.channel.bulkDelete(botMsgs, true).catch(() => null);
    const m = await message.channel.send({ embeds: [{ color: PINK, description: `🌸 deleted **${botMsgs.size}** bot messages` }] });
    setTimeout(() => m.delete().catch(() => {}), 3000);
  }
});


// ===== TIMEZONE COMMANDS =====
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(",")) return;
  if (ignoreList.get(message.guild?.id)?.has(message.author.id)) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args[0].toLowerCase();

  // ,settz <timezone> or ,set tz <timezone>
  if (command === "settz" || (command === "set" && args[1]?.toLowerCase() === "tz")) {
    const tz = command === "settz" ? args[1] : args[2];
    if (!tz) return err(message, "missing required argument: **timezone**\nusage: `,settz <timezone>` (e.g. `,settz America/New_York`, `,settz Europe/Rome`)");
    // Validate timezone
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
    } catch {
      return err(message, `**${tz}** is not a valid timezone\nExamples: \`America/New_York\`, \`Europe/London\`, \`Europe/Rome\`, \`Asia/Tokyo\`, \`UTC\``);
    }
    userTimezones.set(message.author.id, tz);
    const now = new Date().toLocaleString("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
    return ok(message, `timezone set to **${tz}** — current time: **${now}**`);
  }

  // ,tz [user]
  if (command === "tz") {
    const target = message.mentions.users.first() || message.author;
    const tz = userTimezones.get(target.id);
    if (!tz) return info(message, `**${target.username}** hasn't set a timezone — use \`,settz <timezone>\` to set one`);
    const now = new Date().toLocaleString("en-US", { timeZone: tz, weekday: "long", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" });
    return message.reply({ embeds: [{ color: PINK, author: { name: target.username, icon_url: target.displayAvatarURL() }, description: `🕐 **${now}**`, footer: { text: `Timezone: ${tz}` } }] });
  }

  // ,tzlist — list all timezones set in this server
  if (command === "tzlist") {
    const members = await message.guild.members.fetch().catch(() => null);
    if (!members) return err(message, "could not fetch members");
    const list = [];
    for (const [userId, tz] of userTimezones.entries()) {
      if (!members.has(userId)) continue;
      const member = members.get(userId);
      const now = new Date().toLocaleString("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
      list.push({ name: member.user.username, tz, now });
    }
    if (list.length === 0) return info(message, "no members have set a timezone — use `,settz <timezone>`");
    list.sort((a, b) => a.tz.localeCompare(b.tz));
    const desc = list.map(l => `**${l.name}** — ${l.tz} (${l.now})`).join("\n");
    return message.reply({ embeds: [{ color: PINK, title: "🌍 Server Timezones", description: desc, footer: { text: message.guild.name }, timestamp: new Date() }] });
  }
});

// ===================================================
// ===== ANTI-MINORS SYSTEM ==========================
// ===================================================

// ── CONFIG (only OWNER_ID can modify) ──────────────
const antiMinorsConfig = new Map();

function getAMConfig(guildId) {
  if (!antiMinorsConfig.has(guildId)) {
    antiMinorsConfig.set(guildId, { logChannelId: null, modRoleId: null, channels: new Set(), requireAttach: new Set() });
  }
  const cfg = antiMinorsConfig.get(guildId);
  // Ensure channels and requireAttach are always proper Sets (survives JSON reload)
  if (!(cfg.channels instanceof Set)) cfg.channels = new Set(Array.isArray(cfg.channels) ? cfg.channels : []);
  if (!(cfg.requireAttach instanceof Set)) cfg.requireAttach = new Set(Array.isArray(cfg.requireAttach) ? cfg.requireAttach : []);
  return cfg;
}

// ── REGEX ENGINE (from old bot, extended) ───────────
function checkForMinor(text) {
  if (!text || text.trim().length < 1) return { flag: false };

  // Step 1: normalize emoji numbers
  const emojiMap = {
    '0️⃣':'0','1️⃣':'1','2️⃣':'2','3️⃣':'3','4️⃣':'4',
    '5️⃣':'5','6️⃣':'6','7️⃣':'7','8️⃣':'8','9️⃣':'9',
    '🔢':'','#️⃣':'',
  };
  let t = text;
  for (const [e, n] of Object.entries(emojiMap)) t = t.replace(new RegExp(e.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'), n);

  // Step 1b: remove Discord mentions before any processing (they contain large IDs)
  t = t.replace(/<[@#][!&]?\d+>/g, '');   // remove <#channelId>, <@userId>, <@&roleId>
  t = t.replace(/https?:\/\/\S+/g, '');  // remove URLs
  t = t.replace(/\b1[,.]\d{2}\s*m\b/gi, ''); // European heights 1,78m
  t = t.replace(/\b\d+[,.]\d+\s*m\b/gi, ''); // decimal meters

  // Step 2: normalize leet/special bypass chars (digits only, don't touch letters)
  t = t.replace(/[|!¡](\d)/g, '$1')   // !6 → 6
       .replace(/(\d)[|!¡]/g, '$1');   // 6! → 6
  // Note: intentionally NOT replacing o→0 as it breaks "yo", "top", "bottom" etc

  const lower = t.toLowerCase();

  // Step 3: check reversed ages (61 m reversed = 16m)
  const reversedPatterns = [
    /(\d{2,3})\s*(reversed?|flip(ped)?|swap(ped)?)/i,
    /(reversed?|flip(ped)?|swap(ped)?)\s*(\d{2,3})/i,
    /(\d{2,3})\s*[🔁🔄↩️🔃⤴️⤵️⬆️⬇️↕️]/,
    /[🔁🔄↩️🔃⤴️⤵️⬆️⬇️↕️]\s*(\d{2,3})/,
  ];
  for (const p of reversedPatterns) {
    const m = t.match(p);
    if (m) {
      const raw = (m[1] || m[3] || '').replace(/\D/g,'');
      if (!raw) continue;
      const original = parseInt(raw);
      // If already a valid adult age (18-70), NEVER treat as reversed bypass
      if (original >= 18 && original <= 70) continue;
      const reversed = parseInt(raw.split('').reverse().join('').replace(/^0+/,'') || '0');
      if (reversed < 18) return { flag: true, reason: `Reversed age bypass: ${raw} → ${reversed} (minor)`, confidence: 'high' };
      return { flag: true, reason: `Age bypass attempt detected (reversed: ${raw} → ${reversed})`, confidence: 'high' };
    }
  }

  // Step 4: suspiciously high ages (bypass with 99, 100, etc.)
  // Exclude: weights (lbs/kg/pounds), heights (cm after number), years (2014 etc)
  const highAgeRegex = /\b([7-9]\d|1\d{2,})\s*[mfMF]?\b/g;
  let highMatch;
  while ((highMatch = highAgeRegex.exec(t)) !== null) {
    const age = parseInt(highMatch[1]);
    if (age < 70) continue;
    const before = t.substring(Math.max(0, highMatch.index - 15), highMatch.index).toLowerCase();
    const after = t.substring(highMatch.index + highMatch[0].length, highMatch.index + highMatch[0].length + 15).toLowerCase();
    // Skip if it's a weight (lbs, kg, pounds, lb)
    if (/\d$/.test(before) || /^\s*(lbs?|kg|pounds?|lb)/.test(after) || /(lbs?|kg|pounds?|lb)\s*$/.test(before)) continue;
    // Skip if it's a height in cm
    if (/^\s*cm/.test(after)) continue;
    // Skip years (4 digits)
    if (highMatch[1].length === 4) continue;
    // Skip 3-digit body stats (100-250 range = weight/height)
    if (age >= 100 && age <= 250) continue;
    // Skip Discord snowflake IDs (15+ digit numbers)
    if (highMatch[1].length >= 15) continue;
    // Skip if preceded by # : , . (discriminator, height, channel ref)
    const beforeHigh = t.substring(Math.max(0, highMatch.index - 3), highMatch.index);
    if (beforeHigh.includes('#') || beforeHigh.includes(':') || 
        beforeHigh.includes(',') || beforeHigh.includes('.')) continue;
    // Skip 2-digit numbers 70-99 if they appear right after a number+comma (height notation)
    if (/\d[,.]\s*$/.test(beforeHigh)) continue;
    return { flag: true, is_minor: false, reason: `Suspiciously high age: ${age} (possible bypass)`, confidence: 'medium' };
  }

  // Step 5: direct minor age patterns (10–17) — exact from original script
  const minorPatterns = [
    /\b(1[0-7])\s*[mfMF]\b/,
    /\b[mfMF]\s*(1[0-7])(?!\s*(cm|inch(es)?|in|"|'))\b/,
    /\b(1[0-7])(?!\s*(cm|inch(es)?|in|"|'|\.\d))\s*(yo|year|yr|male|female|boy|girl|enby|nb|top|bottom|vers|bttm|btm|skinny|chubby|twink|bear)\b/i,
    /\baged?\s*(1[0-7])\b/i,
    /\b(1[0-7])\s*aged?\b/i,
    /\bi'?m\s*(1[0-7])\b/i,
    /\bturned\s*(1[0-7])\b/i,
    /\b(1[0-7])\s*today\b/i,
    /\bunderage\b.*\b(1[0-7])\b/i,
    /\b(1[0-7])\b.*\bunderage\b/i,
    /\b(1[0-7])\s*m(?!\s*(cm|inch(es)?))\b/i,
    /\b(1[0-7])\s*[mfMF]\s+\w+/i,
    /[mfMF]\s*(1[0-7])\s+\w+/i,
  ];

  // Check with hasAdultAge logic from original script
  const adultPreCheck = [
    /\b(1[8-9]|[2-6]\d)\s*[mfMF]\b/,
    /\b[mfMF]\s*(1[8-9]|[2-6]\d)\b/,
    /\b(1[8-9]|[2-6]\d)\s*(yo|year|yr|y\.o|y\/o|male|female|man|woman|boy|girl|lf|lm|top|bottom|vers|masc|femme|here|looking|latino|latina|black|white|asian|mixed|bi|gay|str8|straight|curious|sub|dom|twink|bear|masc|femme)\b/i,
    /\bi'?m\s*(1[8-9]|[2-6]\d)\b/i,
    /\b(1[8-9]|[2-6]\d)\s*years?\s*old\b/i,
    /\bturned\s*(1[8-9]|[2-6]\d)\b/i,
    /\b(1[8-9]|[2-6]\d)\s*today\b/i,
    // standalone number at start of message
    /^(1[8-9]|[2-9]\d)\s+/,
    /\bhii?\s+(1[8-9]|[2-9]\d)\b/i,
    /\bhey\s+(1[8-9]|[2-9]\d)\b/i,
    /\bim\s+(1[8-9]|[2-9]\d)\b/i,
    /\b(male|female|boy|girl|man|woman|guy|dude)\s+(1[8-9]|[2-6]\d)\b/i,
    /\b(1[8-9]|[2-6]\d)\s*[😊😁😉🔥💕❤️🌸✨💜🖤]$/,
  ];
  let hasAdultAge = false;
  for (const p of adultPreCheck) {
    const match = t.match(p);
    if (match) {
      // Try all capture groups to find the age (some patterns have word before age)
      const ageStr = [match[1], match[2], match[3]].find(g => g && /^\d+$/.test(g));
      const age = parseInt(ageStr || '0');
      if (age >= 18 && age <= 70) { hasAdultAge = true; break; }
    }
  }

  if (hasAdultAge) {
    // With an adult age present, only flag strict minor patterns
    const strictMinor = [
      /\b(1[0-7])\s*[mfMF]\b/,
      /\b[mfMF]\s*(1[0-7])\b/,
      /\bi'?m\s*(1[0-7])\b/i,
    ];
    for (const p of strictMinor) {
      const m = t.match(p);
      if (m) {
        const age = parseInt(m[1] || m[2]);
        return { flag: true, is_minor: true, reason: `Minor detected: ${age} (despite adult age)`, confidence: 'high' };
      }
    }
  } else {
    // No adult age — check standalone minor patterns first
    const standaloneMinor = [
      /^\s*(1[0-7])\s*$/,
      // standalone at start, but not followed by measurement words
      /^\s*(1[0-7])\s+(?!inch(es)?|cm|in\b|'|")/,
      // standalone at end, but not preceded by measurement context
      /(?<!inch(es)?\s|cm\s|\d\.\d)\s+(1[0-7])\s*$/,
    ];
    for (const p of standaloneMinor) {
      const m = t.match(p);
      if (m) return { flag: true, is_minor: true, reason: `Minor detected: ${parseInt(m[1])} years old`, confidence: 'high' };
    }
    // Then check full minor patterns with afterMatch exclusion
    for (const p of minorPatterns) {
      const m = t.match(p);
      if (m) {
        const age = parseInt(m[1] || m[2]);
        const fullMatch = m[0];
        const afterMatch = t.substring(m.index + fullMatch.length, m.index + fullMatch.length + 10);
        if (!/^\s*(cm|inch(es)?|in|"|')/.test(afterMatch) && !isNaN(age) && age < 18) {
          return { flag: true, is_minor: true, reason: `Minor detected: ${age} years old`, confidence: 'high' };
        }
      }
    }
  }

  // Step 6: banned bypass keywords
  const bannedKeywords = [
    /\breversed?\b/i, /\bswap(ped)?\b/i, /\bflip(ped)?\b/i,
    /check\s+(my\s+)?bio/i, /in\s+(my\s+)?bio/i, /see\s+(my\s+)?bio/i,
    /selling\s+content/i, /buy\s+content/i, /dm\s+for\s+content/i,
    /\bunderage\b/i,
    /\bminor\b/i,
    /\bstill\s+in\s+(high\s*school|hs|school)\b/i,
  ];
  for (const p of bannedKeywords) {
    if (p.test(lower)) return { flag: true, reason: `Banned keyword: "${t.match(p)?.[0]}"`, confidence: 'high' };
  }

  // Step 7: no valid 18+ age mentioned — silent delete
  if (!hasAdultAge) return { flag: true, noAge: true, reason: 'No valid 18+ age mentioned', confidence: 'low' };

  return { flag: false };
}

// ── ANTI-MINORS MESSAGE HANDLER ────────────────────
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  const cfg = getAMConfig(message.guild.id);

  // Check require-attachment channels
  if (cfg.requireAttach.has(message.channel.id)) {
    const hasMedia = message.attachments.size > 0 &&
      [...message.attachments.values()].some(a => a.contentType?.startsWith('image/') || a.contentType?.startsWith('video/'));
    if (!hasMedia && message.content) {
      await message.delete().catch(() => {});
      return; // silently delete text-only messages
    }
  }

  // Check monitored channels
  if (!cfg.channels.has(message.channel.id)) return;
  if (!message.content?.trim()) return;

  const result = checkForMinor(message.content);
  if (!result.flag) return;

  // Delete the message
  await message.delete().catch(() => {});

  // If just no age mentioned — silent delete, no log
  if (result.noAge) return;

  // Minor detected — send to log channel
  const logCh = cfg.logChannelId ? message.guild.channels.cache.get(cfg.logChannelId) : null;
  if (!logCh) return;

  const modPing = cfg.modRoleId ? `<@&${cfg.modRoleId}>` : '';

  const embed = {
    color: PINK,
    author: { name: message.author.username, icon_url: message.author.displayAvatarURL() },
    title: "🚨 Minor Detected",
    description: `**Message:**\n\`\`\`${message.content.substring(0, 800)}\`\`\``,
    fields: [
      { name: "Reason", value: result.reason, inline: false },
      { name: "Confidence", value: result.confidence === 'high' ? '🔴 High' : '🟡 Medium', inline: true },
      { name: "User ID", value: `\`${message.author.id}\``, inline: true },
      { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
    ],
    footer: { text: message.guild.name },
    timestamp: new Date(),
  };

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`am_ban_${message.author.id}`).setLabel("ban").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`am_ignore_${message.author.id}`).setLabel("ignore").setStyle(ButtonStyle.Secondary)
  );

  await logCh.send({ content: modPing || undefined, embeds: [embed], components: [row], allowedMentions: { roles: cfg.modRoleId ? [cfg.modRoleId] : [] } }).catch(() => {});
});

// ── ANTI-MINORS BUTTON HANDLER ─────────────────────
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith("am_")) return;

  const [, action, userId] = interaction.customId.split("_");
  const guild = interaction.guild;
  const mod = interaction.user;

  try {
    if (action === "ban") {
      // Try to ban — works even if user already left (hackban)
      const banResult = await guild.members.ban(userId, {
        reason: `[Anti-Minors] underage — banned by ${mod.username}`,
        deleteMessageSeconds: 604800 // delete 7 days of messages
      }).catch(() => null);

      const updatedEmbed = {
        ...interaction.message.embeds[0].data,
        color: PINK,
        footer: { text: `banned by ${mod.username} • ${new Date().toLocaleString()}` }
      };

      if (banResult) {
        // Track in modstats
        const guildId = guild.id;
        const modId = mod.id;
        if (!banStats[guildId]) banStats[guildId] = {};
        if (!banStats[guildId][modId]) {
          banStats[guildId][modId] = { username: mod.username, actions: 0, bans: 0, ignores: 0 };
        }
        banStats[guildId][modId].username = mod.username;
        banStats[guildId][modId].actions += 1;
        banStats[guildId][modId].bans += 1;

        // Add case to mod cases
        addCase(guildId, "ban", userId, modId, "[Anti-Minors] underage");

        await interaction.update({ embeds: [updatedEmbed], components: [] }).catch(() => {});
      } else {
        // Ban failed — user may already be banned
        const failEmbed = {
          ...interaction.message.embeds[0].data,
          color: PINK,
          footer: { text: `ban failed (already banned or left?) • attempted by ${mod.username}` }
        };
        await interaction.update({ embeds: [failEmbed], components: [] }).catch(() => {});
      }

    } else if (action === "ignore") {
      // Track ignore in modstats
      const guildId = guild.id;
      const modId = mod.id;
      if (!banStats[guildId]) banStats[guildId] = {};
      if (!banStats[guildId][modId]) {
        banStats[guildId][modId] = { username: mod.username, actions: 0, bans: 0, ignores: 0 };
      }
      banStats[guildId][modId].username = mod.username;
      banStats[guildId][modId].actions += 1;
      banStats[guildId][modId].ignores += 1;

      const updatedEmbed = {
        ...interaction.message.embeds[0].data,
        color: 0x808080,
        footer: { text: `ignored by ${mod.username} • ${new Date().toLocaleString()}` }
      };
      await interaction.update({ embeds: [updatedEmbed], components: [] }).catch(() => {});
    }
  } catch (e) {
    interaction.update({ components: [] }).catch(() => {});
  }
});

// ── ANTI-MINORS COMMANDS (OWNER ONLY) ─────────────
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(",")) return;
  if (message.author.id !== OWNER_ID) return; // only owner

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args[0].toLowerCase();
  const cfg = getAMConfig(message.guild.id);

  // ,addc #channel — add channel to monitor
  if (command === "addc") {
    const ch = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
    if (!ch) return err(message, "missing required argument: **channel**\nusage: `,addc #channel`");
    cfg.channels.add(ch.id);
    saveAllConfigs();
    return ok(message, `now monitoring **#${ch.name}** for minors`);
  }

  // ,delc #channel — remove channel from monitor
  if (command === "delc") {
    const ch = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
    if (!ch) return err(message, "missing required argument: **channel**\nusage: `,delc #channel`");
    cfg.channels.delete(ch.id);
    saveAllConfigs();
    return ok(message, `stopped monitoring **#${ch.name}**`);
  }

  // ,list — show monitored channels
  if (command === "list" || command === "amlist") {
    const monitored = [...cfg.channels].map(id => `<#${id}>`).join(", ") || "none";
    const reqAttach = [...cfg.requireAttach].map(id => `<#${id}>`).join(", ") || "none";
    const logCh = cfg.logChannelId ? `<#${cfg.logChannelId}>` : "not set";
    const modRole = cfg.modRoleId ? `<@&${cfg.modRoleId}>` : "not set";
    return message.reply({ embeds: [{ color: PINK, title: "🔞 Anti-Minors Config", fields: [
      { name: "Monitored Channels", value: monitored, inline: false },
      { name: "Require Attachment", value: reqAttach, inline: false },
      { name: "Log Channel", value: logCh, inline: true },
      { name: "Mod Role", value: modRole, inline: true },
    ], footer: { text: message.guild.name }, timestamp: new Date() }] });
  }

  // ,reqattach #channel — require attachments
  if (command === "reqattach") {
    const ch = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
    if (!ch) return err(message, "missing required argument: **channel**\nusage: `,reqattach #channel`");
    cfg.requireAttach.add(ch.id);
    saveAllConfigs();
    return ok(message, `**#${ch.name}** now requires attachments — text-only messages will be deleted`);
  }

  // ,unreqattach #channel — remove attachment requirement
  if (command === "unreqattach") {
    const ch = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
    if (!ch) return err(message, "missing required argument: **channel**\nusage: `,unreqattach #channel`");
    cfg.requireAttach.delete(ch.id);
    saveAllConfigs();
    return ok(message, `**#${ch.name}** no longer requires attachments`);
  }

  // ,modr @role — set mod role to ping
  if (command === "modr") {
    const role = message.mentions.roles.first();
    if (!role) return err(message, "missing required argument: **role**\nusage: `,modr @role`");
    cfg.modRoleId = role.id;
    saveAllConfigs();
    return ok(message, `mod role set to **${role.name}** — will be pinged on minor detections`);
  }

  // ,logs #channel — set log channel
  if (command === "logs") {
    const ch = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
    if (!ch) return err(message, "missing required argument: **channel**\nusage: `,logs #channel`");
    cfg.logChannelId = ch.id;
    saveAllConfigs();
    return ok(message, `minor warnings will be sent to **#${ch.name}**`);
  }
});

// ===== ERROR HANDLING =====
client.on("error", (error) => {
  log(`Client error: ${error.message}`, "error");
});

// Clean up handled messages cache every 30 seconds

client.login(process.env.TOKEN);
