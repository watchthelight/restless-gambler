# Playing Card Rendering System

This directory contains the playing card rendering system for the bot.

## Card Display Modes

The bot supports two rendering modes for playing cards:

1. **Image Mode** (default) - High-quality SVG-generated cards rendered as PNG
2. **Unicode Mode** (fallback) - Unicode playing card characters

## Card Specifications

### Image Cards
- **Size**: 240px height × 172px width (standard 0.715 aspect ratio)
- **Resolution**: Rendered at 2x (480px) for crisp display
- **Format**: PNG with alpha channel
- **Styling**:
  - White background with rounded corners
  - Shadow effects for depth
  - Large corner ranks (36px) and suits (32px)
  - Huge center suit symbol (96px) for instant recognition
  - Red for hearts/diamonds, black for spades/clubs
  - Professional card back with blue pattern

### Card Layout
- Cards are composited horizontally in rows
- Player hand on top, dealer hand on bottom
- 12px gap between cards in same hand
- 16px gap between player and dealer rows
- 16px padding around entire image
- Dark background (#111827)

## Files

- `Card.ts` - Type definitions for Card, Suit, and Rank
- `images.ts` - SVG generation and PNG rendering (240px cards)
- `unicode.ts` - Unicode fallback rendering
- `../ui/cardsDisplay.ts` - High-level API for rendering hands

## Usage

```typescript
import { renderHands } from '../ui/cardsDisplay.js';

// Render a blackjack hand
const result = await renderHands(
  guildId,
  playerCards,  // Player's cards
  dealerCards,  // Dealer's cards
  false,        // Hide dealer cards (show card backs)
  'image'       // Force image mode (optional)
);

if (result.kind === 'image') {
  // Use result.attachment in Discord message
} else {
  // Use result.text (unicode fallback)
}
```

## Cache

Generated card images are cached in `data/cache/cards/240px/`:
- `S-A.png`, `S-2.png`, ... `S-K.png` (Spades)
- `H-A.png`, `H-2.png`, ... `H-K.png` (Hearts)
- `D-A.png`, `D-2.png`, ... `D-K.png` (Diamonds)
- `C-A.png`, `C-2.png`, ... `C-K.png` (Clubs)
- `back.png` (Card back)

Total: 53 files (52 cards + 1 back)

## Configuration

Users can set their guild's preferred card style:

```sql
UPDATE guild_settings SET cards_style = 'image';  -- or 'unicode'
```

The system automatically falls back to Unicode if image rendering fails (e.g., sharp library not available).

## Performance

- Cards are generated once and cached
- Subsequent renders use cached PNG files
- Compositing is done with sharp for optimal performance
- Total cache size: ~500KB for all 53 cards
