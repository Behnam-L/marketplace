import { MigrationInterface, QueryRunner } from "typeorm";

export class Exports1790703290574 implements MigrationInterface {
    name = 'Exports1790703290574'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "export_job" ("id" character varying(40) NOT NULL, "resource" character varying(40) NOT NULL, "filters" jsonb NOT NULL DEFAULT '{}', "status" character varying(40) NOT NULL, "pii_allowed" boolean NOT NULL DEFAULT false, "row_count" integer, "file_id" character varying(40), "error" character varying(300), "created_by" character varying(40) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_2edcb6f1780d22e5a9f2f29f466" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_export_status" ON "export_job" ("status", "created_at") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."ix_export_status"`);
        await queryRunner.query(`DROP TABLE "export_job"`);
    }

}
