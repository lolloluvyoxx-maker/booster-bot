const { Client, GatewayIntentBits, PermissionFlagsBits } = require("discord.js");

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
        const modTag = entry.executor.tag || entry.executor.username;

        if (!stats[modId]) {
          stats[modId] = { tag: modTag, actions: 0, bans: 0, ignores: 0 };
        }
        stats[modId].tag = modTag;
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

// ===== DM ON BOOST/UNBOOST =====
async function sendBoostDM(user, boosted) {
  try {
    const template = boosted ? customMessages.boost : customMessages.unboost;
    const msg = template.replace("{user}", `<@${user.id}>`);
    await user.send(msg);
    log(`DM sent to ${user.tag} (boosted: ${boosted})`, "success");
  } catch (error) {
    log(`Failed to send DM to ${user.tag}: ${error.message}`, "error");
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
      recentBoosters.add(userId);
      log(`Granted access to ${targetMember.user.tag}`, "success");
    } else {
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
              log(`Fixed: ${targetMember.user.tag} - Added access role (boosting)`, "success");
              updatedCount++;
            }
            recentBoosters.add(targetMember.id);
          } else if (!isRecentBooster) {
            if (hasAccessRole || !hasDeniedRole) {
              await targetMember.roles.remove(ACCESS_ROLE_ID).catch(() => {});
              await targetMember.roles.add(DENIED_ROLE_ID);
              log(`Fixed: ${targetMember.user.tag} - Added denied role (not boosting)`, "success");
              updatedCount++;
            }
          }
        } else if (!isRecentBooster) {
          if (!targetMember.roles.cache.has(DENIED_ROLE_ID)) {
            await targetMember.roles.add(DENIED_ROLE_ID);
            await targetMember.roles.remove(ACCESS_ROLE_ID).catch(() => {});
            log(`Fixed: ${targetMember.user.tag} - Added denied role (not in source)`, "success");
            updatedCount++;
          }
        }

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
});

// ===== MEMBER JOINS TARGET SERVER =====
client.on("guildMemberAdd", async (member) => {
  if (member.guild.id !== TARGET_GUILD_ID) return;

  log(`${member.user.tag} joined TARGET server`, "info");

  try {
    const sourceGuild = await client.guilds.fetch(SOURCE_GUILD_ID);

    await new Promise(resolve => setTimeout(resolve, 2000));

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

  log(`Boost change: ${newMember.user.tag} - ${wasBoosting ? "Was" : "Not"} -> ${isNowBoosting ? "Now" : "Not"}`, "info");

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
      return message.reply("Usage: `!setmsg <boost|unboost|ping> <text>`\nIn the ping message use `{user}` as a placeholder for the mention.");
    }
    const text = args.slice(2).join(" ");
    if (!text) return message.reply("❌ Please write the message text after the type.");
    customMessages[type] = text;
    return message.reply(`✅ **${type}** message updated!\n\nPreview:\n${text.replace("{user}", `@${message.author.username}`)}`);
  }

  // !viewmsg
  if (command === "viewmsg") {
    const embed = {
      color: 0x9b59b6,
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

  // !checkall
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
        "All roles are already correct!",
      timestamp: new Date()
    };

    message.reply({ embeds: [embed] });
  }

  // !fixuser
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
      message.reply(`Error: ${error.message}`);
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

// ===== TRACK BANS (guildBanAdd) =====
client.on("guildBanAdd", async (ban) => {
  try {
    const guild = ban.guild;
    const auditLogs = await guild.fetchAuditLogs({ type: 22 /* BAN */, limit: 5 });
    const entry = auditLogs.entries.find(e => e.target?.id === ban.user.id);
    if (!entry) return;

    const modId = entry.executor.id;
    const modTag = entry.executor.tag || entry.executor.username;
    const guildId = guild.id;

    if (!banStats[guildId]) banStats[guildId] = {};
    if (!banStats[guildId][modId]) {
      banStats[guildId][modId] = { tag: modTag, actions: 0, bans: 0, ignores: 0 };
    }

    banStats[guildId][modId].tag = modTag;
    banStats[guildId][modId].actions += 1;
    banStats[guildId][modId].bans += 1;
    log(`Ban tracked: ${modTag} banned ${ban.user.tag}`, "info");

    log(`Ban tracked: ${modTag} banned ${ban.user.tag}`, "info");
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

  const member = message.member;
  if (!member) return;

  const entries = Object.entries(banStats[message.guild.id] || {});

  if (entries.length === 0) {
    return message.reply("📊 No ban stats recorded yet.");
  }

  // Sort by bans descending, then by actions
  entries.sort((a, b) => b[1].bans - a[1].bans || b[1].actions - a[1].actions);

  const lines = entries.map(([, data]) => {
    const banPct = data.actions > 0 ? ((data.bans / data.actions) * 100).toFixed(1) : "0.0";
    return `**@${data.tag}**\nactions: ${data.actions} | bans: ${data.bans} (${banPct}%) | ignores: ${data.ignores}`;
  });

  const embed = {
    color: 0x5865F2,
    title: "📊 Mod Stats — Ban Leaderboard",
    description: lines.join("\n\n"),
    footer: { text: `${message.guild.name} • ${new Date().toUTCString()}` }
  };

  message.channel.send({ embeds: [embed] });
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

// ===== ERROR HANDLING =====
client.on("error", (error) => {
  log(`Client error: ${error.message}`, "error");
});

client.login(process.env.TOKEN);
