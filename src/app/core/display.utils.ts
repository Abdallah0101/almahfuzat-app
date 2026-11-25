export interface DisplayPreferences {
  darkTheme: boolean;
  fontScale: number;
  verseFontScale: number;
}

const verseBaseSizes = {
  default: 1.54,
  review: 1.43,
  preview: 1.35,
  mobile: 1.45
} as const;

export function applyDisplayPreferences(preferences: DisplayPreferences): void {
  const root = document.documentElement;
  const fontScale = Math.min(1.6, Math.max(0.85, preferences.fontScale));
  const verseFontScale = Math.min(2, Math.max(0.85, preferences.verseFontScale));
  root.dataset['theme'] = preferences.darkTheme ? 'dark' : 'light';
  root.style.fontSize = `${fontScale * 100}%`;
  for (const [name, baseSize] of Object.entries(verseBaseSizes)) {
    root.style.setProperty(`--verse-font-size-${name}`, `${Number((baseSize * verseFontScale).toFixed(4))}rem`);
  }
}
