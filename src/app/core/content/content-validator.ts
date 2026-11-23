import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { Manifest, Poem } from '../models';

const idPattern = '^[a-z0-9]+(?:-[a-z0-9]+)*$';
const verseSchema = {
  type: 'object', additionalProperties: false,
  required: ['id', 'number', 'first_hemistich', 'second_hemistich', 'text'],
  properties: {
    id: { type: 'string', pattern: idPattern }, number: { type: 'integer', minimum: 1 },
    first_hemistich: { type: 'string', minLength: 1 }, second_hemistich: { type: 'string', minLength: 1 },
    text: { type: 'string', minLength: 3 }, chapter_id: { type: 'string' }
  }
};
const poemSchema = {
  type: 'object', additionalProperties: false,
  required: ['schema_version', 'id', 'title', 'author', 'science', 'source', 'is_complete', 'revision', 'chapters', 'verses'],
  properties: {
    schema_version: { const: 1 }, id: { type: 'string', pattern: idPattern },
    title: { type: 'string', minLength: 1 }, author: { type: 'string', minLength: 1 },
    description: { type: 'string' }, science: { type: 'string', minLength: 1 },
    source: { type: 'object', required: ['name'], additionalProperties: false, properties: {
      name: { type: 'string', minLength: 1 }, url: { type: 'string', format: 'uri' }, notes: { type: 'string' }
    } },
    is_complete: { type: 'boolean' }, revision: { type: 'integer', minimum: 1 },
    chapters: { type: 'array', items: { type: 'object', required: ['id', 'title'], additionalProperties: false, properties: {
      id: { type: 'string', pattern: idPattern }, title: { type: 'string', minLength: 1 }, number: { type: 'integer', minimum: 1 }
    } } },
    verses: { type: 'array', items: verseSchema }
  }
};
const manifestSchema = {
  type: 'object', additionalProperties: false,
  required: ['schema_version', 'catalog_version', 'updated_at', 'poems'],
  properties: {
    schema_version: { const: 1 }, catalog_version: { type: 'integer', minimum: 0 },
    updated_at: { type: 'string', format: 'date-time' },
    poems: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['id', 'title', 'author', 'science', 'verse_count', 'path', 'revision', 'sha256', 'is_complete'],
      properties: {
        id: { type: 'string', pattern: idPattern }, title: { type: 'string' }, author: { type: 'string' },
        science: { type: 'string' }, verse_count: { type: 'integer', minimum: 0 },
        path: { type: 'string', pattern: '^poems/[a-z0-9-]+\\.json$' }, revision: { type: 'integer', minimum: 1 },
        sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' }, is_complete: { type: 'boolean' }
      }
    } }
  }
};

export class ContentValidator {
  private readonly ajv = new Ajv2020({ allErrors: true, strict: true });
  private readonly validateManifestSchema;
  private readonly validatePoemSchema;

  constructor() {
    addFormats(this.ajv);
    this.validateManifestSchema = this.ajv.compile(manifestSchema);
    this.validatePoemSchema = this.ajv.compile(poemSchema);
  }

  manifest(value: unknown): Manifest {
    if (!this.validateManifestSchema(value)) throw new Error(this.errors(this.validateManifestSchema.errors));
    const manifest = value as unknown as Manifest;
    const ids = manifest.poems.map((poem) => poem.id);
    if (new Set(ids).size !== ids.length) throw new Error('الفهرس يحتوي معرّفات منظومات مكررة.');
    for (const poem of manifest.poems) {
      if (poem.path !== `poems/${poem.id}.json`) throw new Error(`مسار غير آمن أو غير مطابق: ${poem.path}`);
    }
    return manifest;
  }

  poem(value: unknown, expectedId?: string): Poem {
    if (!this.validatePoemSchema(value)) throw new Error(this.errors(this.validatePoemSchema.errors));
    const poem = value as unknown as Poem;
    if (expectedId && poem.id !== expectedId) throw new Error(`هوية الملف لا تطابق ${expectedId}.`);
    const verseIds = new Set<string>();
    const chapterIds = new Set(poem.chapters.map((chapter) => chapter.id));
    if (chapterIds.size !== poem.chapters.length) throw new Error('توجد أبواب مكررة المعرّف.');
    poem.verses.forEach((verse, index) => {
      if (verseIds.has(verse.id)) throw new Error(`معرّف البيت مكرر: ${verse.id}`);
      verseIds.add(verse.id);
      if (verse.number !== index + 1) throw new Error(`ترقيم غير متسلسل عند البيت ${verse.id}.`);
      if (verse.text !== `${verse.first_hemistich}\n${verse.second_hemistich}`) throw new Error(`الشطران لا يطابقان نص البيت ${verse.id}.`);
      if (verse.chapter_id && !chapterIds.has(verse.chapter_id)) throw new Error(`باب غير معروف للبيت ${verse.id}.`);
    });
    return poem;
  }

  private errors(errors: unknown): string {
    return `ملف محتوى غير صالح: ${JSON.stringify(errors)}`;
  }
}
