const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// ===== CONFIG =====
const SOURCE_GUILD_ID = "1439575441693343809";
const TARGET_GUILD_ID = "1425102156125442140";

const BOOSTER_ROLE_ID = "1439656430163722240";
const ACCESS_ROLE_ID = "1439978535736578119";
const DENIED_ROLE_ID = "1426874194263805992";
// ==================

client.once("ready", () => {
  console.log(`Online come ${client.user.tag}`);
});

/**
 * Quando una persona entra nel TARGET server
 */
client.on("guildMemberAdd", async (member) => {
  if (member.guild.id !== TARGET_GUILD_ID) return;

  try {
    const sourceGuild = await client.guilds.fetch(SOURCE_GUILD_ID);
    const sourceMember = await sourceGuild.members.fetch(member.id).catch(() => null);

    if (sourceMember && sourceMember.roles.cache.has(BOOSTER_ROLE_ID)) {
      await member.roles.add(ACCESS_ROLE_ID);
      await member.roles.remove(DENIED_ROLE_ID).catch(() => {});
    } else {
      await member.roles.add(DENIED_ROLE_ID);
    }
  } catch (err) {
    console.error("guildMemberAdd:", err);
  }
});

/**
 * Quando cambia lo stato boost nel SOURCE
 * (inizia o smette di boostare)
 */
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  if (oldMember.guild.id !== SOURCE_GUILD_ID) return;

  const hadBoost = oldMember.premiumSince;
  const hasBoost = newMember.premiumSince;

  try {
    const targetGuild = await client.guilds.fetch(TARGET_GUILD_ID);
    const targetMember = await targetGuild.members.fetch(newMember.id).catch(() => null);
    if (!targetMember) return;

    // 🔴 HA TOLTO IL BOOST → DENIED
    if (hadBoost && !hasBoost) {
      await targetMember.roles.remove(ACCESS_ROLE_ID).catch(() => {});
      await targetMember.roles.add(DENIED_ROLE_ID).catch(() => {});
    }

    // 🟢 HA INIZIATO A BOOSTARE → ACCESS
    if (!hadBoost && hasBoost) {
      await targetMember.roles.add(ACCESS_ROLE_ID).catch(() => {});
      await targetMember.roles.remove(DENIED_ROLE_ID).catch(() => {});
    }

  } catch (err) {
    console.error("guildMemberUpdate:", err);
  }
});

client.login(process.env.TOKEN);
