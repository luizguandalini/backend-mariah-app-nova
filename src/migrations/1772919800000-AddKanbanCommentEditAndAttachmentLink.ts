import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKanbanCommentEditAndAttachmentLink1772919800000 implements MigrationInterface {
  name = 'AddKanbanCommentEditAndAttachmentLink1772919800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "kanban_comments"
      ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
    `);

    await queryRunner.query(`
      ALTER TABLE "kanban_attachments"
      ADD COLUMN IF NOT EXISTS "comment_id" UUID NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_kanban_attachments_comment'
            AND table_name = 'kanban_attachments'
        ) THEN
          ALTER TABLE "kanban_attachments"
          ADD CONSTRAINT "FK_kanban_attachments_comment"
          FOREIGN KEY ("comment_id")
          REFERENCES "kanban_comments"("id")
          ON DELETE SET NULL;
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_kanban_attachments_comment_id"
      ON "kanban_attachments" ("comment_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_kanban_attachments_comment_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "kanban_attachments"
      DROP CONSTRAINT IF EXISTS "FK_kanban_attachments_comment"
    `);

    await queryRunner.query(`
      ALTER TABLE "kanban_attachments"
      DROP COLUMN IF EXISTS "comment_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "kanban_comments"
      DROP COLUMN IF EXISTS "updated_at"
    `);
  }
}
