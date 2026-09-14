import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlayerLastCheckedAt1789419219836 implements MigrationInterface {
  name = 'AddPlayerLastCheckedAt1789419219836';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "players" ADD "last_checked_at" TIMESTAMP(3)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_players_last_checked_at" ON "players" ("last_checked_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_players_last_checked_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "players" DROP COLUMN "last_checked_at"`,
    );
  }
}
