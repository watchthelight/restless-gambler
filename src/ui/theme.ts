export type Theme = {
  name: string;
  bgGradient: [string, string];
  surface: string;
  textPrimary: string;
  textSecondary?: string; // legacy
  textMuted: string;
  accent: number; // discord.js color number
  success: string;
  warn: string;
  danger: string;
  shadowRGBA: string; // e.g., 'rgba(0,0,0,0.3)'
};

export const Themes: Record<string, Theme> = {
  neon: {
    name: 'neon',
    bgGradient: ['#0f0c29', '#302b63'],
    surface: '#1f1b3a',
    textPrimary: '#EAF6FF',
    textSecondary: '#B1B5C5',
    textMuted: '#B1B5C5',
    accent: 0x8a2be2,
    success: '#18d26e',
    warn: '#f9c74f',
    danger: '#f94144',
    shadowRGBA: 'rgba(0,0,0,0.4)',
  },
  midnight: {
    name: 'midnight',
    bgGradient: ['#0b1020', '#111b2e'],
    surface: '#18223a',
    textPrimary: '#e5e9f0',
    textMuted: '#9aa7b4',
    accent: 0x5865f2,
    success: '#2bb673',
    warn: '#ffb703',
    danger: '#ef476f',
    shadowRGBA: 'rgba(0,0,0,0.5)',
  },
  obsidian: {
    name: 'obsidian',
    bgGradient: ['#0d0f14', '#141922'],
    surface: '#1b2230',
    textPrimary: '#e6edf3',
    textMuted: '#9fb0c0',
    accent: 0x3b82f6,
    success: '#22c55e',
    warn: '#eab308',
    danger: '#ef4444',
    shadowRGBA: 'rgba(0,0,0,0.45)',
  },
  aurora: {
    name: 'aurora',
    bgGradient: ['#0b1a1f', '#0e2430'],
    surface: '#163543',
    textPrimary: '#e8fbff',
    textMuted: '#a7c7cf',
    accent: 0x22d3ee,
    success: '#34d399',
    warn: '#fde047',
    danger: '#f87171',
    shadowRGBA: 'rgba(0,0,0,0.4)',
  },
  sapphire: {
    name: 'sapphire',
    bgGradient: ['#0a1226', '#0f1b3a'],
    surface: '#12244a',
    textPrimary: '#e6efff',
    textMuted: '#afbfda',
    accent: 0x60a5fa,
    success: '#10b981',
    warn: '#f59e0b',
    danger: '#ef4444',
    shadowRGBA: 'rgba(0,0,0,0.45)',
  },
  emerald: {
    name: 'emerald',
    bgGradient: ['#0b2e2a', '#0c3b34'],
    surface: '#12443e',
    textPrimary: '#e9fff5',
    textSecondary: '#b4cec3',
    textMuted: '#b4cec3',
    accent: 0x10b981,
    success: '#34d399',
    warn: '#f59e0b',
    danger: '#ef4444',
    shadowRGBA: 'rgba(0,0,0,0.45)',
  },
  crimson: {
    name: 'crimson',
    bgGradient: ['#2a0b14', '#3b0c17'],
    surface: '#44121d',
    textPrimary: '#ffe9ee',
    textSecondary: '#e0b9c4',
    textMuted: '#e0b9c4',
    accent: 0xdc2626,
    success: '#22c55e',
    warn: '#eab308',
    danger: '#ef4444',
    shadowRGBA: 'rgba(0,0,0,0.45)',
  },
  ocean: {
    name: 'ocean',
    bgGradient: ['#072b3a', '#0a3d52'],
    surface: '#0f4a5a',
    textPrimary: '#e6fbff',
    textMuted: '#a7cfd9',
    accent: 0x22d3ee,
    success: '#34d399',
    warn: '#fde047',
    danger: '#f87171',
    shadowRGBA: 'rgba(0,0,0,0.45)',
  },
  cherry: {
    name: 'cherry',
    bgGradient: ['#2a0b14', '#3b0c17'],
    surface: '#44121d',
    textPrimary: '#ffe9ee',
    textMuted: '#e0b9c4',
    accent: 0xdc2626,
    success: '#22c55e',
    warn: '#eab308',
    danger: '#ef4444',
    shadowRGBA: 'rgba(0,0,0,0.45)',
  },
  lime: {
    name: 'lime',
    bgGradient: ['#0e2710', '#143318'],
    surface: '#18401e',
    textPrimary: '#e9ffe9',
    textMuted: '#bde5bd',
    accent: 0x84cc16,
    success: '#22c55e',
    warn: '#fde047',
    danger: '#ef4444',
    shadowRGBA: 'rgba(0,0,0,0.45)',
  },
  slate: {
    name: 'slate',
    bgGradient: ['#0f172a', '#111827'],
    surface: '#1f2937',
    textPrimary: '#e5e7eb',
    textMuted: '#9ca3af',
    accent: 0x60a5fa,
    success: '#10b981',
    warn: '#f59e0b',
    danger: '#ef4444',
    shadowRGBA: 'rgba(0,0,0,0.45)',
  },
};

export function getThemeByName(name?: string): Theme {
  if (!name) return Themes.midnight;
  const t = Themes[name.toLowerCase()];
  return t ?? Themes.midnight;
}

// Guild theme resolver uses DB to read persisted theme value.
import { getGuildDb } from '../db/connection.js';
import { getSetting } from '../db/kv.js';
export function getGuildTheme(guildId?: string | null): Theme {
  if (!guildId) return Themes.midnight;
  const db = getGuildDb(guildId);
  const themeName = getSetting(db, 'theme') || 'midnight';
  return getThemeByName(themeName);
}
