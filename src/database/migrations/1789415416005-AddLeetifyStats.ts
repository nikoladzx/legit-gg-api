import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLeetifyStats1789415416005 implements MigrationInterface {
  name = 'AddLeetifyStats1789415416005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "leetify_stats" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "match_id" uuid NOT NULL, "steam_id" text NOT NULL, "pre_aim" double precision, "reaction_time" double precision, "accuracy" double precision, "accuracy_enemy_spotted" double precision, "accuracy_head" double precision, "leetify_rating" double precision, "last_updated" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "UQ_leetify_stats_match_player" UNIQUE ("match_id", "steam_id"), CONSTRAINT "PK_199b9e12f62c18945fdd2737109" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_leetify_stats_steam_id" ON "leetify_stats" ("steam_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "leetify_stats" ADD CONSTRAINT "FK_6ead5ec102f3d67a76f257a380d" FOREIGN KEY ("steam_id") REFERENCES "players"("steam_id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "leetify_stats" DROP CONSTRAINT "FK_6ead5ec102f3d67a76f257a380d"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_leetify_stats_steam_id"`);
    await queryRunner.query(`DROP TABLE "leetify_stats"`);
  }
}
