import { userMention } from "discord.js";
import { sendChannelCard } from "../ui/cardFactory.js";

const lastChannel = new Map<string, string>(); // guild:user -> channelId

export function rememberUserChannel(gid: string, uid: string, cid: string) {
  lastChannel.set(`${gid}:${uid}`, cid);
}

export async function queueRankUpAnnouncement(
  gid: string,
  uid: string,
  level: number,
  luckBps: number,
  durSec: number,
) {
  const cid = lastChannel.get(`${gid}:${uid}`);
  if (!cid) return;
  const percent = (luckBps / 100).toFixed(2);
  const mins = Math.max(1, Math.floor(durSec / 60));
  await sendChannelCard(gid, cid, {
    title: "👏 Rank Up!",
    lines: [
      `${userMention(uid)} reached **Level ${level}**`,
      `New buff: **+${percent}%** luck for ${mins}m.`,
      `Tip: keep playing to extend your buff.`,
    ],
  });
}

