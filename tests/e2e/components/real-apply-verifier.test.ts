/**
 * Real Apply Verifier component tests
 *
 * Covers the parts that do not need a live PocketBase: parsing what
 * `pocketbase migrate up` reported, simulating the same files through the
 * engine, and diffing a captured real state against that simulation.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  compareRealState,
  parseMigrateOutput,
  simulateApply,
} from './real-apply-verifier.js';
import type { RawCollection } from '../../../package/src/migration/engine/index.js';

/** A fresh PocketBase's non-system collections, trimmed to what we compare */
const BASELINE: RawCollection[] = [
  {
    id: '_pb_users_auth_',
    name: 'users',
    type: 'auth',
    fields: [
      { id: 'text3208210256', name: 'id', type: 'text', system: true, required: true, primaryKey: true },
    ],
    indexes: [],
  },
];

/** What the library generator emits for a two-field collection */
const CREATE_POSTS = `
migrate((app) => {
  const collection = new Collection({
    id: "pb_posts000000001",
    name: "posts",
    type: "base",
    listRule: null,
    fields: [
      { name: "title", id: "text_title", type: "text", required: true, min: 1, max: 200 },
      { name: "views", id: "number_views", type: "number", required: false },
    ],
    indexes: [],
  });
  return app.save(collection);
}, (app) => {
  return app.delete(app.findCollectionByNameOrId("posts"));
});
`;

/** How PocketBase serializes that collection back over the REST API */
function realPosts(overrides: Partial<RawCollection> = {}): RawCollection {
  return {
    id: 'pb_posts000000001',
    name: 'posts',
    type: 'base',
    listRule: null,
    system: false,
    fields: [
      {
        autogeneratePattern: '[a-z0-9]{15}',
        hidden: false,
        id: 'text3208210256',
        max: 15,
        min: 15,
        name: 'id',
        pattern: '^[a-z0-9]+$',
        presentable: false,
        primaryKey: true,
        required: true,
        system: true,
        type: 'text',
      },
      {
        autogeneratePattern: '',
        hidden: false,
        id: 'text_title',
        max: 200,
        min: 1,
        name: 'title',
        pattern: '',
        presentable: false,
        primaryKey: false,
        required: true,
        system: false,
        type: 'text',
      },
      {
        hidden: false,
        id: 'number_views',
        name: 'views',
        onlyInt: false,
        presentable: false,
        required: false,
        system: false,
        type: 'number',
      },
    ],
    indexes: [],
    ...overrides,
  };
}

describe('parseMigrateOutput', () => {
  it('collects the files PocketBase reported as applied', () => {
    const output = [
      '[0.00ms] SELECT (1) FROM `_migrations` WHERE `file`=\'1717233558_v0.23_migrate3.go\' LIMIT 1',
      'Applied 1769385981_created_Projects.js',
      'Applied 1769385999_created_Tasks.js',
    ].join('\n');

    expect(parseMigrateOutput(output)).toEqual({
      appliedFiles: ['1769385981_created_Projects.js', '1769385999_created_Tasks.js'],
      failures: [],
    });
  });

  it('extracts per-file failures, which PocketBase reports with a zero exit code', () => {
    const output = [
      'Applied 1769385981_created_Projects.js',
      'Error: failed to apply migration 1769386001_badrule.js: listRule: Invalid rule.',
    ].join('\n');

    const parsed = parseMigrateOutput(output);

    expect(parsed.appliedFiles).toEqual(['1769385981_created_Projects.js']);
    expect(parsed.failures).toEqual([
      { file: '1769386001_badrule.js', error: 'listRule: Invalid rule.' },
    ]);
  });

  it('reports nothing for a run with no pending migrations', () => {
    expect(parseMigrateOutput('No new migrations to apply.')).toEqual({
      appliedFiles: [],
      failures: [],
    });
  });
});

describe('real apply state comparison', () => {
  let workDir: string;
  let createPosts: string;

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'real-apply-verifier-'));
    createPosts = join(workDir, '1769385981_created_posts.js');
    await writeFile(createPosts, CREATE_POSTS);
  });

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('scopes the comparison to the collections the migration touched', () => {
    const simulated = simulateApply(BASELINE, [createPosts]);

    expect(simulated.touched).toEqual(['posts']);
    expect(simulated.deleted).toEqual([]);
    expect(simulated.errors).toEqual([]);
  });

  it('treats PocketBase-materialized option defaults as equivalent', () => {
    const simulated = simulateApply(BASELINE, [createPosts]);

    // The real state carries pattern: "", min: 0, onlyInt: false that the
    // migration never declared - normalization, not divergence
    const comparison = compareRealState([...BASELINE, realPosts()], simulated);

    expect(comparison.differences).toEqual([]);
    expect(comparison.equivalent).toBe(true);
    expect(comparison.score).toBe(100);
  });

  it('reports a field PocketBase dropped', () => {
    const simulated = simulateApply(BASELINE, [createPosts]);
    const dropped = realPosts();
    dropped.fields = dropped.fields.filter((field: any) => field.name !== 'views');

    const comparison = compareRealState([...BASELINE, dropped], simulated);

    expect(comparison.equivalent).toBe(false);
    expect(comparison.differences).toEqual(['[posts] field "views" present only in engine']);
    expect(comparison.score).toBeLessThan(100);
  });

  it('reports an option PocketBase stored with a different value', () => {
    const simulated = simulateApply(BASELINE, [createPosts]);
    const changed = realPosts();
    changed.fields.find((field: any) => field.name === 'title').max = 500;

    const comparison = compareRealState([...BASELINE, changed], simulated);

    expect(comparison.equivalent).toBe(false);
    expect(comparison.differences).toEqual([
      '[posts] field "title" differs: options.max (real PocketBase=500, engine=200)',
    ]);
  });

  it('reports a rule PocketBase rewrote', () => {
    const simulated = simulateApply(BASELINE, [createPosts]);

    const comparison = compareRealState([...BASELINE, realPosts({ listRule: '@request.auth.id != ""' })], simulated);

    expect(comparison.equivalent).toBe(false);
    // Rules and permissions mirror each other in the converted schema, so a
    // rule change surfaces under both headings
    expect(comparison.differences).toEqual([
      '[posts] rule "listRule" differs (real PocketBase="@request.auth.id != \\"\\"", engine=null)',
      '[posts] permission "listRule" differs',
    ]);
  });

  it('reports a collection the migration deleted that PocketBase still has', async () => {
    const deletePosts = join(workDir, '1769385990_deleted_posts.js');
    await writeFile(
      deletePosts,
      `migrate((app) => {
         return app.delete(app.findCollectionByNameOrId("posts"));
       }, (app) => {});`
    );

    const simulated = simulateApply(BASELINE, [deletePosts], { baselineFiles: [createPosts] });
    expect(simulated.deleted).toEqual(['posts']);

    const comparison = compareRealState([...BASELINE, realPosts()], simulated);

    expect(comparison.equivalent).toBe(false);
    expect(comparison.differences).toEqual([
      'collection "posts" was deleted by the migration but still exists in real PocketBase',
    ]);
  });

  it('records engine failures instead of throwing', () => {
    const simulated = simulateApply(BASELINE, [join(workDir, 'does-not-exist.js')]);

    expect(simulated.errors).toHaveLength(1);
    expect(simulated.touched).toEqual([]);
  });
});
