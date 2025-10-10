// Best-effort Canvas font registration and font stacks
export const BOLT = '🔩';

let canvas: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  canvas = require('canvas');
} catch {}

function tryRegister(file: string, family: string, weight = 'normal') {
  try {
    if (canvas && canvas.registerFont) canvas.registerFont(file, { family, weight });
  } catch {}
}

// System emoji-capable fonts
tryRegister('/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf', 'Noto Color Emoji');
tryRegister('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'DejaVu Sans');
tryRegister('C:/Windows/Fonts/seguiemj.ttf', 'Segoe UI Emoji');
tryRegister('C:/Windows/Fonts/segoeui.ttf', 'Segoe UI');

// Optional bundled fonts
tryRegister('./assets/fonts/Inter-Regular.ttf', 'Inter', '400');
tryRegister('./assets/fonts/Inter-SemiBold.ttf', 'Inter', '600');
tryRegister('./assets/fonts/JetBrainsMono-Regular.ttf', 'JetBrains Mono', '400');
tryRegister('./assets/fonts/JetBrainsMono-SemiBold.ttf', 'JetBrains Mono', '600');

export const FONT_STACK_SANS = 'Inter, system-ui, Arial';
export const FONT_STACK_MONO = 'JetBrains Mono, Cascadia Mono, Consolas, monospace';
export const FONT_STACK_EMOJI = 'Segoe UI Emoji, Noto Color Emoji, DejaVu Sans';

