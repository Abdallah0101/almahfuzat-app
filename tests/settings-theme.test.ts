import '@angular/compiler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from '../src/app/pages/settings.page';

vi.stubGlobal('document', { documentElement: { dataset: {}, style: { setProperty: vi.fn() } } });

describe('display settings', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('applies the selected theme and persists it on the device', async () => {
    const page = Object.create(SettingsPage.prototype) as SettingsPage;
    const db = { setSetting: vi.fn().mockResolvedValue(undefined) };
    Object.assign(page, { db });
    page.darkTheme = true;
    await page.setDarkTheme();
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(db.setSetting).toHaveBeenCalledWith('dark_theme', true);

    page.darkTheme = false;
    await page.setDarkTheme();
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(db.setSetting).toHaveBeenCalledWith('dark_theme', false);
  });

  it('applies and persists a dedicated verse font scale', async () => {
    const page = Object.create(SettingsPage.prototype) as SettingsPage;
    const db = { setSetting: vi.fn().mockResolvedValue(undefined) };
    Object.assign(page, { db });
    page.verseFontScale = 1.3;
    await page.setVerseFontScale();
    expect(document.documentElement.style.setProperty).toHaveBeenCalledWith('--verse-font-scale', '1.3');
    expect(db.setSetting).toHaveBeenCalledWith('verse_font_scale', 1.3);

    page.verseFontScale = 2.1;
    await page.setVerseFontScale();
    expect(page.verseFontScale).toBe(2);
  });
});
