import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAccounts1789332684589 implements MigrationInterface {
    name = 'AddAccounts1789332684589'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "accounts" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "player_id" uuid NOT NULL, "display_name" text NOT NULL, "avatar_url" text NOT NULL, "avatar_full_url" text NOT NULL, "profile_url" text NOT NULL, "last_login_at" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT now(), "updated_at" TIMESTAMP(3) NOT NULL DEFAULT now(), CONSTRAINT "REL_70dd63ddf3335b8b6a4b00ce2f" UNIQUE ("player_id"), CONSTRAINT "PK_5a7a02c20412299d198e097a8fe" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "accounts" ADD CONSTRAINT "FK_70dd63ddf3335b8b6a4b00ce2fa" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "accounts" DROP CONSTRAINT "FK_70dd63ddf3335b8b6a4b00ce2fa"`);
        await queryRunner.query(`DROP TABLE "accounts"`);
    }

}
