export function extractUserId(input: string): string | null {
    // Accept raw snowflake or mention forms <@123> or <@!123>
    const m = String(input).match(/\d{17,20}/);
    return m ? m[0] : null;
}

export function isValidSnowflake(id: string | null | undefined): id is string {
    return !!id && /^\d{17,20}$/.test(id);
}
