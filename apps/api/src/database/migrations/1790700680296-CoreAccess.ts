import { MigrationInterface, QueryRunner } from "typeorm";

export class CoreAccess1790700680296 implements MigrationInterface {
    name = 'CoreAccess1790700680296'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "idempotency_record" ("scope" character varying(80) NOT NULL, "key" character varying(64) NOT NULL, "request_hash" character varying(64) NOT NULL, "status" character varying(16) NOT NULL, "response_code" integer, "response_body" jsonb, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_43ea3d50a854b79e2f59aaad8a8" PRIMARY KEY ("scope", "key"))`);
        await queryRunner.query(`CREATE TABLE "system_setting" ("key" character varying(64) NOT NULL, "value_json" jsonb NOT NULL, "updated_by" character varying(40), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c6ce0e35b3c0d67dca93523ba1b" PRIMARY KEY ("key"))`);
        await queryRunner.query(`CREATE TABLE "system_setting_change" ("id" character varying(40) NOT NULL, "key" character varying(64) NOT NULL, "old_value" jsonb NOT NULL, "new_value" jsonb NOT NULL, "reason" character varying(500) NOT NULL, "changed_by" character varying(40) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c55906a51a9cf61e8dba930887c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "message_template" ("id" character varying(40) NOT NULL, "event" character varying(60) NOT NULL, "channel" character varying(10) NOT NULL, "name" character varying(100) NOT NULL, "content" character varying(1000) NOT NULL, "params" text array NOT NULL DEFAULT '{}', "status" character varying(40) NOT NULL, "orphaned" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_616800da109c721fb4dd2019a9b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_template_active" ON "message_template" ("event", "channel") WHERE status = 'Active'`);
        await queryRunner.query(`CREATE TABLE "message_log" ("id" character varying(40) NOT NULL, "template_id" character varying(40), "event" character varying(60) NOT NULL, "recipient" character varying(20) NOT NULL, "status" character varying(40) NOT NULL, "provider" character varying(60), "provider_message_id" character varying(120), "sent_at" TIMESTAMP WITH TIME ZONE, "delivered_at" TIMESTAMP WITH TIME ZONE, "error" character varying(500), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f89fb3fddab953711137ce8b62c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_message_log_created" ON "message_log" ("created_at") `);
        await queryRunner.query(`CREATE TABLE "file_object" ("id" character varying(40) NOT NULL, "kind" character varying(40) NOT NULL, "mime" character varying(100) NOT NULL, "size" integer NOT NULL, "sha256" character varying(64) NOT NULL, "storage_key" character varying(200) NOT NULL, "original_name" character varying(200), "status" character varying(40) NOT NULL, "scan_status" character varying(40) NOT NULL, "uploaded_by" character varying(40), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1994186c0a6bafbb6ccc8bc1853" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "admin_session" ("id" character varying(40) NOT NULL, "admin_user_id" character varying(40) NOT NULL, "token_hash" character varying(64) NOT NULL, "csrf_token" character varying(64) NOT NULL, "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "step_up_at" TIMESTAMP WITH TIME ZONE, "ip" character varying(64), "user_agent" character varying(500), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_031b46c28b79cc8e17984c9f1a2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_admin_session_token" ON "admin_session" ("token_hash") `);
        await queryRunner.query(`CREATE TABLE "audit_log" ("id" character varying(40) NOT NULL, "actor_id" character varying(40), "actor_name" character varying(200), "action" character varying(120) NOT NULL, "entity_type" character varying(60), "entity_id" character varying(80), "before" jsonb, "after" jsonb, "ip" character varying(64), "user_agent" character varying(500), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_audit_entity" ON "audit_log" ("entity_type", "entity_id") `);
        await queryRunner.query(`CREATE INDEX "ix_audit_created" ON "audit_log" ("created_at") `);
        await queryRunner.query(`CREATE TABLE "admin_user" ("id" character varying(40) NOT NULL, "first_name" character varying(100) NOT NULL, "last_name" character varying(100) NOT NULL, "phone_e164" character varying(16) NOT NULL, "role_id" character varying(40) NOT NULL, "status" character varying(40) NOT NULL, "password_hash" character varying(200), "totp_secret_enc" text, "pending_totp_secret_enc" text, "failed_logins" integer NOT NULL DEFAULT '0', "locked_until" TIMESTAMP WITH TIME ZONE, "last_login_at" TIMESTAMP WITH TIME ZONE, "action_token_hash" character varying(64), "action_token_purpose" character varying(20), "action_token_expires_at" TIMESTAMP WITH TIME ZONE, "mfa_token_hash" character varying(64), "mfa_token_expires_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a28028ba709cd7e5053a86857b4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_admin_phone" ON "admin_user" ("phone_e164") `);
        await queryRunner.query(`CREATE TABLE "role" ("id" character varying(40) NOT NULL, "name" character varying(60) NOT NULL, "description" character varying(300) NOT NULL DEFAULT '', "is_system" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b36bcfe02fc8de3c57a8b2391c2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_role_name" ON "role" ("name") `);
        await queryRunner.query(`CREATE TABLE "permission" ("code" character varying(60) NOT NULL, "description" character varying(300) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_30e166e8c6359970755c5727a23" PRIMARY KEY ("code"))`);
        await queryRunner.query(`CREATE TABLE "role_permission" ("role_id" character varying(40) NOT NULL, "permission_code" character varying(60) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_fef7ec15c505a247aac9503f43f" PRIMARY KEY ("role_id", "permission_code"))`);
        // Append-only enforcement (BR-LED-01 style): UPDATE/DELETE blocked by trigger.
        await queryRunner.query(`CREATE OR REPLACE FUNCTION bajet_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql`);
        for (const t of ['audit_log', 'system_setting_change']) {
            await queryRunner.query(`CREATE TRIGGER ${t}_append_only BEFORE UPDATE OR DELETE ON "${t}" FOR EACH ROW EXECUTE FUNCTION bajet_forbid_mutation()`);
            await queryRunner.query(`CREATE TRIGGER ${t}_no_truncate BEFORE TRUNCATE ON "${t}" FOR EACH STATEMENT EXECUTE FUNCTION bajet_forbid_mutation()`);
        }
        await queryRunner.query(`ALTER TABLE "admin_user" ADD CONSTRAINT "fk_admin_role" FOREIGN KEY ("role_id") REFERENCES "role"("id")`);
        await queryRunner.query(`ALTER TABLE "role_permission" ADD CONSTRAINT "fk_rp_role" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE`);
        await queryRunner.query(`ALTER TABLE "role_permission" ADD CONSTRAINT "fk_rp_permission" FOREIGN KEY ("permission_code") REFERENCES "permission"("code")`);
        await queryRunner.query(`ALTER TABLE "admin_session" ADD CONSTRAINT "fk_session_admin" FOREIGN KEY ("admin_user_id") REFERENCES "admin_user"("id") ON DELETE CASCADE`);
        await queryRunner.query(`CREATE INDEX "ix_idempotency_expires" ON "idempotency_record" ("expires_at")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "ix_idempotency_expires"`);
        await queryRunner.query(`ALTER TABLE "admin_session" DROP CONSTRAINT "fk_session_admin"`);
        await queryRunner.query(`ALTER TABLE "role_permission" DROP CONSTRAINT "fk_rp_permission"`);
        await queryRunner.query(`ALTER TABLE "role_permission" DROP CONSTRAINT "fk_rp_role"`);
        await queryRunner.query(`ALTER TABLE "admin_user" DROP CONSTRAINT "fk_admin_role"`);
        for (const t of ['audit_log', 'system_setting_change']) {
            await queryRunner.query(`DROP TRIGGER ${t}_no_truncate ON "${t}"`);
            await queryRunner.query(`DROP TRIGGER ${t}_append_only ON "${t}"`);
        }
        await queryRunner.query(`DROP TABLE "role_permission"`);
        await queryRunner.query(`DROP TABLE "permission"`);
        await queryRunner.query(`DROP INDEX "public"."uq_role_name"`);
        await queryRunner.query(`DROP TABLE "role"`);
        await queryRunner.query(`DROP INDEX "public"."uq_admin_phone"`);
        await queryRunner.query(`DROP TABLE "admin_user"`);
        await queryRunner.query(`DROP INDEX "public"."ix_audit_created"`);
        await queryRunner.query(`DROP INDEX "public"."ix_audit_entity"`);
        await queryRunner.query(`DROP TABLE "audit_log"`);
        await queryRunner.query(`DROP INDEX "public"."uq_admin_session_token"`);
        await queryRunner.query(`DROP TABLE "admin_session"`);
        await queryRunner.query(`DROP TABLE "file_object"`);
        await queryRunner.query(`DROP INDEX "public"."ix_message_log_created"`);
        await queryRunner.query(`DROP TABLE "message_log"`);
        await queryRunner.query(`DROP INDEX "public"."uq_template_active"`);
        await queryRunner.query(`DROP TABLE "message_template"`);
        await queryRunner.query(`DROP TABLE "system_setting_change"`);
        await queryRunner.query(`DROP TABLE "system_setting"`);
        await queryRunner.query(`DROP TABLE "idempotency_record"`);
        await queryRunner.query(`DROP FUNCTION bajet_forbid_mutation()`);
    }

}
