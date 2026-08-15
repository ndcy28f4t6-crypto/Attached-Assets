/**
 * Semantic design tokens — synced from the My Day AI web artifact (index.css).
 * HSL values from the web app have been converted to hex so both artifacts
 * share a cohesive visual identity.
 */

const colors = {
  light: {
    // Legacy aliases
    text: '#273c3c',
    tint: '#d4614b',

    background: '#f4f0e6',
    foreground: '#273c3c',
    card: '#faf8f2',
    cardForeground: '#273c3c',
    cardBorder: '#ddd5c3',

    primary: '#d4614b',
    primaryForeground: '#faf8f2',

    secondary: '#c4d9d0',
    secondaryForeground: '#2a4141',

    muted: '#ece7dc',
    mutedForeground: '#6c7d7d',

    accent: '#a5c9ba',
    accentForeground: '#2a4141',

    destructive: '#c43c31',
    destructiveForeground: '#faf8f2',

    border: '#ddd5c3',
    input: '#d5cab5',

    // Priority colors
    priorityHigh: '#d4614b',
    priorityMedium: '#c8a44a',
    priorityLow: '#6c8a7d',
  },

  dark: {
    text: '#ece8de',
    tint: '#e57060',

    background: '#162020',
    foreground: '#ece8de',
    card: '#1c2a2a',
    cardForeground: '#ece8de',
    cardBorder: '#2a3c3c',

    primary: '#e57060',
    primaryForeground: '#142020',

    secondary: '#2e4238',
    secondaryForeground: '#ece8de',

    muted: '#202d2d',
    mutedForeground: '#94a3a3',

    accent: '#3b5e4c',
    accentForeground: '#ece8de',

    destructive: '#cf4c4c',
    destructiveForeground: '#142020',

    border: '#2a3c3c',
    input: '#303d3d',

    // Priority colors
    priorityHigh: '#e57060',
    priorityMedium: '#d4a84e',
    priorityLow: '#7aaa90',
  },

  // Border radius (in px) — matches web app --radius: 1.05rem ≈ 17px
  radius: 17,
};

export default colors;
