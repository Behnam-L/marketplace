import { MigrationInterface, QueryRunner } from "typeorm";

export class Refunds1790703180585 implements MigrationInterface {
    name = 'Refunds1790703180585'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "refund" ("id" character varying(40) NOT NULL, "order_id" character varying(40) NOT NULL, "merchant_id" character varying(40) NOT NULL, "amount" bigint NOT NULL, "cumulative_amount" bigint NOT NULL, "merchant_margin_refund" bigint NOT NULL, "status" character varying(40) NOT NULL, "initiated_by" character varying(40) NOT NULL, "actor_id" character varying(40), "reason" character varying(500) NOT NULL, "version" integer NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f1cefa2e60d99b206c46c1116e5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_refund_created" ON "refund" ("created_at") `);
        await queryRunner.query(`CREATE INDEX "ix_refund_order" ON "refund" ("order_id") `);
        await queryRunner.query(`CREATE TABLE "refund_leg" ("id" character varying(40) NOT NULL, "refund_id" character varying(40) NOT NULL, "leg_type" character varying(40) NOT NULL, "provider_id" character varying(40), "reservation_id" character varying(40), "amount" bigint NOT NULL, "provider_margin_refund" bigint NOT NULL DEFAULT '0', "status" character varying(40) NOT NULL, "via_gateway" boolean NOT NULL DEFAULT false, "gateway_code" character varying(40), "payee_iban_enc" text, "document_id" character varying(40), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_118503c93cc8b57a80e7f3a4bc5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_refund_leg_refund" ON "refund_leg" ("refund_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."ix_refund_leg_refund"`);
        await queryRunner.query(`DROP TABLE "refund_leg"`);
        await queryRunner.query(`DROP INDEX "public"."ix_refund_order"`);
        await queryRunner.query(`DROP INDEX "public"."ix_refund_created"`);
        await queryRunner.query(`DROP TABLE "refund"`);
    }

}
