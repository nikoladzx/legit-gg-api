import { MigrationInterface, QueryRunner } from "typeorm";

export class InitPlayers1789317258748 implements MigrationInterface {
    name = 'InitPlayers1789317258748'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "players" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "steam_id" text NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT now(), "updated_at" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "UQ_865763e260c801fbde124fe4275" UNIQUE ("steam_id"), CONSTRAINT "PK_de22b8fdeee0c33ab55ae71da3b" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "players"`);
    }

}
