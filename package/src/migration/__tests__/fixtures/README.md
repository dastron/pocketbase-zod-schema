# Test Fixtures

This directory contains test fixtures for the migration test suite.

## Directory Structure

### reference-migrations/

Contains manually created PocketBase migrations copied from `pocketbase/pb_migrations/`. These serve as the expected output for test validation.

**Available Fixtures:**

- `1764625712_created_create_new_collection_with_columns.js` - Collection with all field types
- `1764625735_created_create_new_collection_blank.js` - Minimal collection with only base fields
- `1764625772_created_create_new_collection_with_unique_index.js` - Collection with unique index
- `1764625807_created_create_new_collection_with_unrestricted_api_rules.js` - Collection with empty string permissions
- `1764625943_created_create_new_collection_with_restricted_api_rules.js` - Collection with filter expression permissions
- `1764625982_created_edit_collection_add_field.js` - Initial migration for field addition test
- `1764626004_updated_edit_collection_add_field.js` - Update migration adding a field
- `1764626024_created_edit_collection_add_index.js` - Initial migration for index addition test
- `1764626069_updated_edit_collection_add_index.js` - Update migration adding an index
- `1764700000_created_create_new_collection_with_null_permissions.js` - Collection with every rule `null` (superusers only)
- `1764700001_created_test_auth_users.js` - Auth collection with PocketBase's injected system fields
- `1769500000_created_view_collection.js` - Read-only view collection backed by a SQL query (captured from PocketBase 0.35.0's automigrate output; note the derived `fields` array with regenerated `_clone_*` ids, which is why the generator never emits fields for a view)

### dynamic-migrations/

Hand-written migrations that only the execution engine can read: their effect does not exist until
the code has run. Used by `engine/__tests__/dynamic-migrations.test.ts`, and by the down-verification
suite (two of them have a deliberately no-op `down()`, as the ground truth that verification detects
a rollback that does not roll back).

- `1800000001_loop_add_fields.js` - Fields added in a `for` loop
- `1800000002_foreach_field_defs.js` - Fields added by iterating a definition array
- `1800000003_helper_function.js` - Field construction behind a helper function
- `1800000004_conditional_add.js` - Field added inside a conditional
- `1800000005_variable_indirection.js` - Collection reached through a variable
- `1800000006_remove_by_id.js` - `fields.removeById()`
- `1800000007_computed_unmarshal.js` - `unmarshal()` with a computed payload
- `1800000008_bulk_collections.js` - Several collections created in one migration

### schemas/

Contains Zod schema definitions that correspond to the reference migrations. These are used as input to the migration generator during tests.

**Available Schema Fixtures:**

- `create-collection-with-columns.ts` - Schema for collection with all field types (text, editor, number, bool, email, url, date, select, file, relation, json, geoPoint, autodate)
- `create-collection-blank.ts` - Schema for minimal collection with only base fields (id, created, updated)
- `create-collection-with-unique-index.ts` - Schema for collection with unique index on a text field
- `create-collection-with-unrestricted-api-rules.ts` - Schema with empty string permissions (unrestricted access)
- `create-collection-with-restricted-api-rules.ts` - Schema with filter expression permissions (owner-based access)
- `create-collection-with-null-permissions.ts` - Schema with every rule `null` (superusers only)
- `create-auth-collection-with-manage-rule.ts` - Auth collection exercising `manageRule`, which is only emitted for this type
- `create-view-collection.ts` - Schema for a read-only view collection (no fields, no indexes, SQL query + read rules)
- `special-characters-schema.ts` - Field names and rule expressions needing escaping
- `unicode-schema.ts` - Non-ASCII collection, field and value names
- `index.ts` - Exports all schema fixtures for easy import

### snapshots/

Contains snapshot states representing the database schema at various points in time. Used for testing diff detection and update migrations.

**Available Snapshot Fixtures:**

- `edit-collection-add-field-before.json` - Snapshot of collection before adding a field (only base fields)
- `edit-collection-add-index-before.json` - Snapshot of collection before adding an index (only base fields)

## Usage

Tests load fixtures from these directories to:

1. Build schema definitions
2. Run the migration generator
3. Compare generated output against reference migrations
4. Validate that the migration system produces correct PocketBase migrations

## Adding New Fixtures

When adding new test scenarios:

1. Create the migration manually in PocketBase or copy from `pocketbase/pb_migrations/`
2. Copy the migration file to `reference-migrations/`
3. Create corresponding schema definition in `schemas/`
4. Create snapshot files in `snapshots/` if testing update scenarios
5. Document the fixture purpose in this README
