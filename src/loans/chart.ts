import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { LoanOffer } from './types.js';
import { dailyRateFromAprBps } from './calculator.js';

type ChartInput = { principal: number; aprBps: number; termDays: number };

export async function buildChart({ principal, aprBps, termDays }: ChartInput): Promise<{ embed: EmbedBuilder; file?: AttachmentBuilder }>
{
  const daily = dailyRateFromAprBps(aprBps);
  const series: { day: number; balance: number }[] = [];
  let balance = principal;
  for (let d = 0; d <= termDays; d++) {
    series.push({ day: d, balance: Math.max(0, Math.floor(balance)) });
    // simple interest accrual visualization; no scheduled payments
    const interest = Math.floor(balance * daily);
    balance += interest;
  }

  const png = await drawTiny(series);
  if (png) {
    const file = new AttachmentBuilder(png, { name: `loan_${principal}_${aprBps}_${termDays}.png` });
    const embed = new EmbedBuilder()
      .setTitle('Loan Preview')
      .setDescription(`Principal ${principal} • APR ${(aprBps/100).toFixed(2)}% • ${termDays} days`)
      .setImage(`attachment://loan_${principal}_${aprBps}_${termDays}.png`);
    return { embed, file };
  }

  const lines: string[] = [];
  lines.push('day  | est balance');
  lines.push('-----|-------------');
  for (const p of series.filter(x => x.day % Math.max(1, Math.floor(termDays/5)) === 0)) {
    lines.push(`${String(p.day).padStart(4)} | ${p.balance}`);
  }
  const embed = new EmbedBuilder()
    .setTitle('Loan Preview')
    .setDescription('```\n' + lines.join('\n') + '\n```');
  return { embed };
}

async function drawTiny(series: { day: number; balance: number }[]): Promise<Buffer | null> {
  try {
    const mod: any = await import('canvas');
    const createCanvas = mod.createCanvas;
    const width = 600, height = 200;
    const cv = createCanvas(width, height);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0,0,width,height);
    const maxBal = Math.max(...series.map(s => s.balance), 1);
    const maxDay = Math.max(...series.map(s => s.day), 1);
    ctx.strokeStyle = '#94a3b8';
    ctx.beginPath();
    for (let i = 0; i < series.length; i++) {
      const s = series[i];
      const x = 20 + (width - 40) * (s.day / maxDay);
      const y = height - 20 - (height - 40) * (s.balance / maxBal);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    return cv.toBuffer('image/png');
  } catch {
    return null;
  }
}

