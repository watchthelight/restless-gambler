import { Guild } from 'discord.js';

export function extractUserId(input: string): string | null {
    // Accept raw snowflake or mention forms <@123> or <@!123>
    const m = String(input).match(/\d{17,20}/);
    return m ? m[0] : null;
}

export function isValidSnowflake(id: string | null | undefined): id is string {
    return !!id && /^\d{17,20}$/.test(id);
}

export function formatMentionInGuild(guild: Guild, userId: string): string {
    const member = guild.members.cache.get(userId);
    return member ? member.toString() : `<@${userId}>`;
}
