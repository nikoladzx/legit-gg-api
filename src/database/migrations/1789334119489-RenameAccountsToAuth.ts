import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameAccountsToAuth1789334119489 implements MigrationInterface {
  name = 'RenameAccountsToAuth1789334119489';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "accounts" RENAME TO "auth"`);
    await queryRunner.query(
      `ALTER TABLE "auth" RENAME CONSTRAINT "PK_5a7a02c20412299d198e097a8fe" TO "PK_7e416cf6172bc5aec04244f6459"`,
    );
    await queryRunner.query(
      `ALTER TABLE "auth" RENAME CONSTRAINT "REL_70dd63ddf3335b8b6a4b00ce2f" TO "REL_f2e381ea1e47db29e382a1038d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "auth" RENAME CONSTRAINT "FK_70dd63ddf3335b8b6a4b00ce2fa" TO "FK_f2e381ea1e47db29e382a1038d2"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "auth" RENAME CONSTRAINT "FK_f2e381ea1e47db29e382a1038d2" TO "FK_70dd63ddf3335b8b6a4b00ce2fa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "auth" RENAME CONSTRAINT "REL_f2e381ea1e47db29e382a1038d" TO "REL_70dd63ddf3335b8b6a4b00ce2f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "auth" RENAME CONSTRAINT "PK_7e416cf6172bc5aec04244f6459" TO "PK_5a7a02c20412299d198e097a8fe"`,
    );
    await queryRunner.query(`ALTER TABLE "auth" RENAME TO "accounts"`);
  }
}
