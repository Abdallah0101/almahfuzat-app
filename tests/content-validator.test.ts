import { describe, expect, it } from 'vitest';
import { ContentValidator } from '../src/app/core/content/content-validator';
import { normalizeArabic } from '../src/app/core/text.utils';
import { Poem } from '../src/app/core/models';

const poem = (): Poem => ({
  schema_version: 1, id: 'demo', title: 'اختبار', author: 'اختبار', science: 'اختبار',
  source: { name: 'اختبار' }, is_complete: true, revision: 1, chapters: [],
  verses: [{ id: 'verse-1', number: 1, first_hemistich: 'بِسْمِ اللَّهِ', second_hemistich: 'الحَمْدُ لِلَّهِ', text: 'بِسْمِ اللَّهِ\nالحَمْدُ لِلَّهِ' }]
});

describe('Arabic content validation', () => {
  it('normalizes only the search copy', () => {
    const original = 'بِسْمِ اللَّهِ';
    expect(normalizeArabic(original)).toBe('بسم الله');
    expect(original).toBe('بِسْمِ اللَّهِ');
  });

  it('accepts a valid poem with diacritics', () => {
    expect(new ContentValidator().poem(poem()).verses[0].text).toContain('بِسْمِ');
  });

  it('rejects duplicate ids and inconsistent hemistichs', () => {
    const value = poem();
    value.verses.push({ ...value.verses[0], number: 2 });
    expect(() => new ContentValidator().poem(value)).toThrow('مكرر');
    const broken = poem();
    broken.verses[0].text = 'نص آخر';
    expect(() => new ContentValidator().poem(broken)).toThrow('الشطران');
  });

  it('rejects unsafe manifest paths', () => {
    const validator = new ContentValidator();
    expect(() => validator.manifest({ schema_version: 1, catalog_version: 1, updated_at: new Date().toISOString(), poems: [{
      id: 'demo', title: 'اختبار', author: 'اختبار', science: 'اختبار', verse_count: 1,
      path: '../secret.json', revision: 1, sha256: 'a'.repeat(64), is_complete: true
    }] })).toThrow();
  });
});
