import type { BotCommandHandler } from '../commands.js';

export const facebookLinksCommandHandler: BotCommandHandler = {
  name: 'fb',
  aliases: ['fb', 'link'],
  async handle(context) {
    const group = context.facebookOptions.groupLink?.trim() || 'https://www.facebook.com/messages/t/6141393309283013';
    const page = context.facebookOptions.pageLink?.trim() || 'https://www.facebook.com/profile.php?id=61589654425540';
    const discord = context.facebookOptions.discordLink?.trim() || 'https://discord.gg/zKumexN9p';
    const website = context.facebookOptions.websiteLink?.trim();

    const text = `Links:\nGroup: ${group}${website ? `\nWebsite: ${website}` : ''}\nPage: ${page}\nDiscord: ${discord}`;
    await context.send(text);
  }
};