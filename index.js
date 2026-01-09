const { Client, GatewayIntentBits, PermissionFlagsBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildPresences // REQUIRED for boost detection
  ],
  partials: ["CHANNEL"]
});

// ===== CONFIGURATION =====
const OWNER_ID = "1005237630113419315";
const SOURCE_GUILD_ID = "1439575441693343809";
const TARGET_GUILD_ID = "1425102156125442140";

// Role IDs
const DISCORD_BOOSTER_ROLE_ID = "1439576681403781212"; // Discord's automatic booster role
const CUSTOM_BOOSTER_ROLE_ID = "1439656430163722240"; // Your custom role to give after boost
const ACCESS_ROLE_ID = "1439978535736578119"; // Access in target server
const DENIED_ROLE_ID = "1426874194263805992"; // Denied in target server

// ===== VANITY CONFIG =====
const VANITY_CODES = ["vanityteen", "jerkpit", "boytoy"];
const CHECK_INTERVAL = 30 * 1000; // 30 seconds
const REQUIRED_404_COUNT = 5; // 5 consecutive 404s = vanity free

// ===== TRACKERS =====
const vanity404Counter = {};
const vanityNotified = {};
const memberCache = new Map(); // Cache for member data to reduce API calls

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

// ===== BOOST DETECTION =====
function isBoosting(member) {
  // Check both Discord's booster role AND premiumSince for reliability
  return member.roles.cache.has(DISCORD_BOOSTER_ROLE_ID) || !!member.premiumSince;
}

async function giveCustomBoosterRole(member) {
  try {
    if (!member.roles.cache.has(CUSTOM_BOOSTER_ROLE_ID)) {
      await member.roles.add(CUSTOM_BOOSTER_ROLE_ID);
      log(`Gave custom booster role to ${member.user.tag} (${member.id})`, "success");
      return true;
    }
  } catch (error) {
    log(`Failed to give custom booster role to ${member.user.tag}: ${error.message}`, "error");
  }
  return false;
}

async function removeCustomBoosterRole(member) {
  try {
    if (member.roles.cache.has(CUSTOM_BOOSTER_ROLE_ID)) {
      await member.roles.remove(CUSTOM_BOOSTER_ROLE_ID);
      log(`Removed custom booster role from ${member.user.tag} (${member.id})`, "success");
      return true;
    }
  } catch (error) {
    log(`Failed to remove custom booster role from ${member.user.tag}: ${error.message}`, "error");
  }
  return false;
}

async function updateTargetServerAccess(userId, shouldHaveAccess) {
  try {
    const targetGuild = await client.guilds.fetch(TARGET_GUILD_ID);
    const targetMember = await targetGuild.members.fetch(userId).catch(() => null);
    
    if (!targetMember) return false;
    
    if (shouldHaveAccess) {
      await targetMember.roles.add(ACCESS_ROLE_ID);
      await targetMember.roles.remove(DENIED_ROLE_ID).catch(() => {});
      log(`Granted access to ${targetMember.user.tag} in target server`, "success");
    } else {
      await targetMember.roles.remove(ACCESS_ROLE_ID).catch(() => {});
      await targetMember.roles.add(DENIED_ROLE_ID);
      log(`Revoked access from ${targetMember.user.tag} in target server`, "success");
    }
    return true;
  } catch (error) {
    log(`Failed to update target server access for ${userId}: ${error.message}`, "error");
    return false;
  }
}

// ===== BOT EVENTS =====
client.once("ready", async () => {
  log(`Logged in as ${client.user.tag} (${client.user.id})`, "success");
  
  // Initial setup check
  try {
    const sourceGuild = await client.guilds.fetch(SOURCE_GUILD_ID);
    const targetGuild = await client.guilds.fetch(TARGET_GUILD_ID);
    
    log(`Source Server: ${sourceGuild.name} (${sourceGuild.id})`);
    log(`Target Server: ${targetGuild.name} (${targetGuild.id})`);
    
    // Check bot permissions
    const sourcePerms = sourceGuild.members.me.permissions;
    const targetPerms = targetGuild.members.me.permissions;
    
    if (!sourcePerms.has(PermissionFlagsBits.ManageRoles)) {
      log("WARNING: Bot missing 'Manage Roles' permission in source server!", "error");
    }
    if (!targetPerms.has(PermissionFlagsBits.ManageRoles)) {
      log("WARNING: Bot missing 'Manage Roles' permission in target server!", "error");
    }
    
    // Process existing boosters
    log("Checking existing boosters in source server...");
    const members = await sourceGuild.members.fetch();
    let boosterCount = 0;
    
    for (const member of members.values()) {
      if (isBoosting(member)) {
        boosterCount++;
        await giveCustomBoosterRole(member);
        
        // Update their access in target server if they're there
        const targetMember = await targetGuild.members.fetch(member.id).catch(() => null);
        if (targetMember) {
          await updateTargetServerAccess(member.id, true);
        }
      }
    }
    
    log(`Found ${boosterCount} existing boosters`, "success");
  } catch (error) {
    log(`Startup error: ${error.message}`, "error");
  }
  
  startVanityMonitor();
});

// ===== MEMBER JOINS TARGET SERVER =====
client.on("guildMemberAdd", async (member) => {
  if (member.guild.id !== TARGET_GUILD_ID) return;
  
  log(`${member.user.tag} joined target server`, "info");
  
  try {
    const sourceGuild = await client.guilds.fetch(SOURCE_GUILD_ID);
    const sourceMember = await sourceGuild.members.fetch(member.id).catch(() => null);
    
    if (sourceMember && isBoosting(sourceMember)) {
      // User is boosting - grant access
      await updateTargetServerAccess(member.id, true);
      await giveCustomBoosterRole(sourceMember);
    } else {
      // User is not boosting - deny access
      await updateTargetServerAccess(member.id, false);
    }
  } catch (error) {
    log(`Error processing ${member.user.tag} join: ${error.message}`, "error");
    await member.roles.add(DENIED_ROLE_ID).catch(() => {});
  }
});

// ===== BOOST STATUS CHANGES =====
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  if (newMember.guild.id !== SOURCE_GUILD_ID) return;
  
  const wasBoosting = isBoosting(oldMember);
  const isNowBoosting = isBoosting(newMember);
  
  // Skip if no change
  if (wasBoosting === isNowBoosting) return;
  
  log(`Boost status changed for ${newMember.user.tag}: ${wasBoosting ? 'Boosting' : 'Not boosting'} → ${isNowBoosting ? 'Boosting' : 'Not boosting'}`, "info");
  
  // Update custom booster role
  if (isNowBoosting) {
    await giveCustomBoosterRole(newMember);
  } else {
    await removeCustomBoosterRole(newMember);
  }
  
  // Update target server access
  await updateTargetServerAccess(newMember.id, isNowBoosting);
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
      return message.reply("✅ All vanity monitors have been reset.");
    }
    
    if (!VANITY_CODES.includes(arg)) {
      return message.reply("❌ Vanity not found.");
    }
    
    vanity404Counter[arg] = 0;
    vanityNotified[arg] = false;
    return message.reply(`✅ Vanity **${arg}** has been reset.`);
  }
  
  // !checkboost command - NEW
  if (command === "checkboost") {
    const userId = args[1] || message.mentions.users.first()?.id;
    
    if (!userId) {
      return message.reply("Usage: `!checkboost <userid|@mention>`");
    }
    
    try {
      const sourceGuild = await client.guilds.fetch(SOURCE_GUILD_ID);
      const member = await sourceGuild.members.fetch(userId).catch(() => null);
      
      if (!member) {
        return message.reply("❌ User not found in source server.");
      }
      
      const boosting = isBoosting(member);
      const embed = {
        color: boosting ? 0x00ff00 : 0xff0000,
        title: `Boost Status: ${member.user.tag}`,
        fields: [
          { name: "Is Boosting", value: boosting ? "✅ Yes" : "❌ No", inline: true },
          { name: "Custom Booster Role", value: member.roles.cache.has(CUSTOM_BOOSTER_ROLE_ID) ? "✅ Yes" : "❌ No", inline: true },
          { name: "Discord Booster Role", value: member.roles.cache.has(DISCORD_BOOSTER_ROLE_ID) ? "✅ Yes" : "❌ No", inline: true },
          { name: "Boosting Since", value: member.premiumSince ? new Date(member.premiumSince).toLocaleString() : "❌ Not boosting", inline: false },
          { name: "User ID", value: member.id, inline: false }
        ],
        timestamp: new Date()
      };
      
      message.reply({ embeds: [embed] });
    } catch (error) {
      message.reply("❌ Error checking boost status.");
      log(`Checkboost error: ${error.message}`, "error");
    }
  }
  
  // !forceupdate command - NEW
  if (command === "forceupdate") {
    const userId = args[1] || message.mentions.users.first()?.id;
    
    if (!userId) {
      return message.reply("Usage: `!forceupdate <userid|@mention>`");
    }
    
    try {
      const sourceGuild = await client.guilds.fetch(SOURCE_GUILD_ID);
      const member = await sourceGuild.members.fetch(userId).catch(() => null);
      
      if (!member) {
        return message.reply("❌ User not found in source server.");
      }
      
      const boosting = isBoosting(member);
      
      // Update roles based on current status
      if (boosting) {
        await giveCustomBoosterRole(member);
        await updateTargetServerAccess(userId, true);
        message.reply(`✅ Force updated ${member.user.tag} - Granted booster role and access (Boosting: ✅)`);
      } else {
        await removeCustomBoosterRole(member);
        await updateTargetServerAccess(userId, false);
        message.reply(`✅ Force updated ${member.user.tag} - Removed booster role and access (Boosting: ❌)`);
      }
    } catch (error) {
      message.reply("❌ Error force updating user.");
      log(`Forceupdate error: ${error.message}`, "error");
    }
  }
});

// ===== VANITY MONITOR =====
function startVanityMonitor() {
  log("Vanity monitor started", "success");
  
  setInterval(async () => {
    for (const vanity of VANITY_CODES) {
      if (vanityNotified[vanity]) continue;
      
      try {
        const response = await fetch(`https://discord.com/api/v10/invites/${vanity}`, {
          headers: { Authorization: `Bot ${process.env.TOKEN}` }
        });
        
        if (response.status === 404) {
          vanity404Counter[vanity]++;
          log(`Vanity ${vanity}: 404 count ${vanity404Counter[vanity]}/${REQUIRED_404_COUNT}`);
        } else {
          vanity404Counter[vanity] = 0;
        }
        
        if (vanity404Counter[vanity] >= REQUIRED_404_COUNT) {
          vanityNotified[vanity] = true;
          
          const owner = await client.users.fetch(OWNER_ID);
          await owner.send({
            embeds: [{
              color: 0xff0000,
              title: "🚨 VANITY AVAILABLE 🚨",
              description: `Vanity: **discord.gg/${vanity}**`,
              fields: [
                { name: "Time", value: utcTimestamp() },
                { name: "Status", value: "Confirmed available" }
              ],
              timestamp: new Date()
            }]
          });
          
          log(`Vanity ${vanity} confirmed available - Notification sent`, "success");
        }
      } catch (error) {
        log(`Vanity check error for ${vanity}: ${error.message}`, "error");
      }
    }
  }, CHECK_INTERVAL);
}

// ===== ERROR HANDLING =====
client.on("error", (error) => {
  log(`Client error: ${error.message}`, "error");
});

process.on("unhandledRejection", (error) => {
  log(`Unhandled rejection: ${error.message}`, "error");
});

// ===== START BOT =====
client.login(process.env.TOKEN).catch(error => {
  log(`Failed to login: ${error.message}`, "error");
  process.exit(1);
});
