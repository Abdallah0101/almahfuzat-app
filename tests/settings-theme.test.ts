import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from '../src/app/pages/settings.page';

vi.stubGlobal('document', { documentElement: { dataset: {}, style: { setProperty: vi.fn() } } });

describe('display settings', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('previews and explicitly saves all display preferences', async () => {
    const page = Object.create(SettingsPage.prototype) as SettingsPage;
    const db = { setSetting: vi.fn().mockResolvedValue(undefined) };
    const toast = { present: vi.fn().mockResolvedValue(undefined) };
    Object.assign(page, { db, toasts: { create: vi.fn().mockResolvedValue(toast) } });
    page.darkTheme = true;
    page.fontScale = 1;
    page.verseFontScale = 1.3;
    await page.saveDisplaySettings();

    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(document.documentElement.style.fontSize).toBe('100%');
    expect(document.documentElement.style.setProperty).toHaveBeenCalledWith('--verse-font-size-default', '2.002rem');
    expect(db.setSetting).toHaveBeenCalledWith('dark_theme', true);
    expect(db.setSetting).toHaveBeenCalledWith('font_scale', 1);
    expect(db.setSetting).toHaveBeenCalledWith('verse_font_scale', 1.3);
    expect(toast.present).toHaveBeenCalledOnce();
  });

  it('keeps button adjustments unsaved until the save action', async () => {
    const page = Object.create(SettingsPage.prototype) as SettingsPage;
    const db = { setSetting: vi.fn().mockResolvedValue(undefined) };
    Object.assign(page, {
      db,
      darkTheme: false,
      fontScale: 1,
      verseFontScale: 1.95,
      toasts: { create: vi.fn().mockResolvedValue({ present: vi.fn() }) }
    });
    page.adjustVerseFontScale(0.05);
    expect(page.verseFontScale).toBe(2);
    expect(db.setSetting).not.toHaveBeenCalled();

    await page.saveDisplaySettings();
    expect(db.setSetting).toHaveBeenCalledWith('verse_font_scale', 2);
  });
});
