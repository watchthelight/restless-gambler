import { EmbedBuilder, Colors } from 'discord.js';

type Field = { name: string; value: string; inline?: boolean };

export const okCard = ({ title, description, fields = [], footer }: {
  title: string;
  description?: string;
  fields?: Field[];
  footer?: string;
}) =>
  new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle(title)
    .setDescription(description ?? '')
    .addFields(fields)
    .setTimestamp()
    .setFooter(footer ? { text: footer } : (null as any));

export const errorCard = ({ command, type, message, errorId, details, titleOverride }: {
  command: string;
  type: string;
  message: string;
  errorId: string;
  details?: string;
  titleOverride?: string;
}) =>
  new EmbedBuilder()
    .setColor(Colors.Red)
    .setTitle(titleOverride ?? `❌ ${command} failed`)
    .setDescription(message)
    .addFields(
      { name: 'Type', value: `\`${type}\``, inline: true },
      { name: 'Error ID', value: `\`${errorId}\``, inline: true },
      ...(details ? [{ name: 'Details', value: `\`\`\`\n${details.slice(0, 900)}\n\`\`\`` }] as Field[] : [])
    )
    .setFooter({ text: '💡 Tip: Run /bugreport to report this issue to admins' })
    .setTimestamp();
