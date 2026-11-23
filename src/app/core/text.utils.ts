export function normalizeArabic(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('ar');
}

export async function sha256Hex(data: string | ArrayBuffer): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function newId(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

export function verseText(verse: Pick<VerseLike, 'first_hemistich' | 'second_hemistich'>): string {
  return `${verse.first_hemistich}\n${verse.second_hemistich}`;
}

interface VerseLike {
  first_hemistich: string;
  second_hemistich: string;
}
