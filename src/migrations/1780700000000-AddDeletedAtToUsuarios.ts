import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Soft delete for users.
 *
 * 1. Adds a nullable `deleted_at` column to `usuarios`. A non-null value marks
 *    the user as soft-deleted; queries that should not see deleted users
 *    filter `WHERE deleted_at IS NULL`.
 *
 * 2. Replaces the global unique constraint on `email` with a partial unique
 *    index that only applies to non-deleted users. This lets a deleted user's
 *    email be re-used when the same identity is re-created later — the new
 *    row is a brand-new user with a new id, not a resurrection of the old
 *    one, so old laudos/images stay pinned to the old id by design.
 */
export class AddDeletedAtToUsuarios1780700000000
  implements MigrationInterface
{
  name = 'AddDeletedAtToUsuarios1780700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add the column. Nullable, no default — existing rows are all active.
    await queryRunner.query(`
      ALTER TABLE "usuarios"
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ NULL
    `);

    // 2. Drop the global unique constraint on email (whatever name it has).
    //    We look it up from pg_constraint so we don't depend on TypeORM's
    //    auto-generated name. The constraint is always UNIQUE on (email) of
    //    table `usuarios`.
    await queryRunner.query(`
      DO $$
      DECLARE
        constraint_name text;
      BEGIN
        SELECT c.conname INTO constraint_name
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'usuarios'
          AND c.contype = 'u'
          AND pg_get_constraintdef(c.oid) ILIKE '%(email)%'
        LIMIT 1;

        IF constraint_name IS NOT NULL THEN
          EXECUTE 'ALTER TABLE "usuarios" DROP CONSTRAINT "' || constraint_name || '"';
        END IF;
      END $$;
    `);

    // 3. Partial unique index: only active (non-deleted) users must have a
    //    unique email. Deleted rows are excluded, so a recreated user can
    //    reuse an email that belonged to a previously soft-deleted account.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_usuarios_email_active"
      ON "usuarios" ("email")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse the partial index, restore the global unique constraint, then
    // drop the column. WARNING: downgrading will fail if any soft-deleted
    // user shares an email with an active user, since the global constraint
    // would conflict. Operators must clean that up first or accept the error.
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_usuarios_email_active"
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        conflict_count integer;
      BEGIN
        SELECT COUNT(*) INTO conflict_count
        FROM (
          SELECT email FROM usuarios GROUP BY email HAVING COUNT(*) > 1
        ) dups;
        IF conflict_count > 0 THEN
          RAISE EXCEPTION
            'Cannot restore global unique on email: % duplicate group(s) exist',
            conflict_count;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "usuarios"
      ADD CONSTRAINT "UQ_usuarios_email" UNIQUE ("email")
    `);

    await queryRunner.query(`
      ALTER TABLE "usuarios"
      DROP COLUMN IF EXISTS "deleted_at"
    `);
  }
}
