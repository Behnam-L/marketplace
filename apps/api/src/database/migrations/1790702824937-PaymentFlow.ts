import { MigrationInterface, QueryRunner } from "typeorm";

export class PaymentFlow1790702824937 implements MigrationInterface {
    name = 'PaymentFlow1790702824937'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "credit_inquiry" ("id" character varying(40) NOT NULL, "order_id" character varying(40) NOT NULL, "attempt_no" integer NOT NULL, "kind" character varying(40) NOT NULL, "status" character varying(40) NOT NULL, "provider_count" integer NOT NULL, "provider_ids" text array NOT NULL DEFAULT '{}', "finished_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8845fad9f3a6e8419dc30e26d6b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_inquiry_attempt" ON "credit_inquiry" ("order_id", "attempt_no") `);
        await queryRunner.query(`CREATE TABLE "credit_inquiry_result" ("id" character varying(40) NOT NULL, "inquiry_id" character varying(40) NOT NULL, "provider_id" character varying(40) NOT NULL, "outcome" character varying(40) NOT NULL, "available_amount" bigint, "latency_ms" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_82ab17d9a85b9a4183d8c49cc83" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_inquiry_result" ON "credit_inquiry_result" ("inquiry_id", "provider_id") `);
        await queryRunner.query(`CREATE TABLE "credit_reservation" ("id" character varying(40) NOT NULL, "order_id" character varying(40) NOT NULL, "provider_id" character varying(40) NOT NULL, "consumer_user_id" character varying(40) NOT NULL, "attempt_no" integer NOT NULL, "amount" bigint NOT NULL, "status" character varying(40) NOT NULL, "recon_direction" character varying(12), "provider_reference" character varying(100), "hold_deadline_at" TIMESTAMP WITH TIME ZONE, "reserved_at" TIMESTAMP WITH TIME ZONE, "allocated_at" TIMESTAMP WITH TIME ZONE, "released_at" TIMESTAMP WITH TIME ZONE, "reversed_amount" bigint NOT NULL DEFAULT '0', "version" integer NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0c828e25a99d2cc7b4842f53f78" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_reservation_consumer" ON "credit_reservation" ("consumer_user_id") `);
        await queryRunner.query(`CREATE INDEX "ix_reservation_status" ON "credit_reservation" ("status") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_reservation_attempt" ON "credit_reservation" ("order_id", "provider_id", "attempt_no") `);
        await queryRunner.query(`CREATE TABLE "provider_transaction" ("id" character varying(40) NOT NULL, "order_id" character varying(40), "reservation_id" character varying(40), "refund_leg_id" character varying(40), "provider_id" character varying(40) NOT NULL, "type" character varying(40) NOT NULL, "amount" bigint NOT NULL, "status" character varying(40) NOT NULL, "provider_reference" character varying(100), "attempts" integer NOT NULL DEFAULT '0', "next_attempt_at" TIMESTAMP WITH TIME ZONE, "last_error" character varying(300), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ac3b8216aa7889ef379e58c6d65" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_ptx_reservation" ON "provider_transaction" ("reservation_id") `);
        await queryRunner.query(`CREATE INDEX "ix_ptx_order" ON "provider_transaction" ("order_id") `);
        await queryRunner.query(`CREATE INDEX "ix_ptx_due" ON "provider_transaction" ("status", "next_attempt_at") `);
        await queryRunner.query(`CREATE TABLE "reconciliation_item" ("id" character varying(40) NOT NULL, "type" character varying(40) NOT NULL, "severity" character varying(40) NOT NULL, "order_id" character varying(40), "refs" jsonb NOT NULL DEFAULT '{}', "expected_amount" bigint, "actual_amount" bigint, "status" character varying(40) NOT NULL, "assignee_id" character varying(40), "resolution_type" character varying(40), "note" character varying(1000), "linked_document_id" character varying(40), "dedupe_key" character varying(200) NOT NULL, "resolved_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_bb2cce06c70eb871a5b9a1ed2ef" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_recon_status" ON "reconciliation_item" ("status", "created_at") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_recon_open_dedupe" ON "reconciliation_item" ("dedupe_key") WHERE status <> 'Resolved'`);
        await queryRunner.query(`CREATE TABLE "psp_settlement_line" ("id" character varying(40) NOT NULL, "source" character varying(40) NOT NULL, "gateway_code" character varying(40) NOT NULL, "report_date" date NOT NULL, "reference" character varying(100) NOT NULL, "amount" bigint NOT NULL, "fee" bigint NOT NULL DEFAULT '0', "matched_tx_id" character varying(40), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b5131a4abf487b7e1ab006ad006" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_psp_line" ON "psp_settlement_line" ("source", "reference") `);
        await queryRunner.query(`CREATE TABLE "provider_statement_line" ("id" character varying(40) NOT NULL, "source" character varying(40) NOT NULL, "statement_date" date NOT NULL, "reference" character varying(100) NOT NULL, "operation" character varying(20) NOT NULL, "state" character varying(20) NOT NULL, "amount" bigint NOT NULL, "matched_tx_id" character varying(40), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_921afe15a9cee5b920ceb23d213" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_provider_statement_line" ON "provider_statement_line" ("source", "reference") `);
        await queryRunner.query(`CREATE TABLE "bank_gateway" ("id" character varying(40) NOT NULL, "code" character varying(40) NOT NULL, "name" character varying(100) NOT NULL, "priority" integer NOT NULL, "health_status" character varying(40) NOT NULL, "supports_reverse" boolean NOT NULL, "supports_refund" boolean NOT NULL, "credentials_ref" character varying(200) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_348d50786c94cb3dab927858e8c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_gateway_code" ON "bank_gateway" ("code") `);
        await queryRunner.query(`CREATE TABLE "bank_transaction" ("id" character varying(40) NOT NULL, "order_id" character varying(40), "refund_leg_id" character varying(40), "type" character varying(40) NOT NULL, "gateway_code" character varying(40) NOT NULL, "amount" bigint NOT NULL, "status" character varying(40) NOT NULL, "gateway_token" character varying(120), "gateway_reference" character varying(100), "card_mask" character varying(30), "authorized_at" TIMESTAMP WITH TIME ZONE, "verified_at" TIMESTAMP WITH TIME ZONE, "is_authoritative" boolean NOT NULL DEFAULT false, "failure_code" character varying(40), "attempts" integer NOT NULL DEFAULT '0', "next_attempt_at" TIMESTAMP WITH TIME ZONE, "last_error" character varying(300), "version" integer NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_729b2e0031227515d2ef6f14336" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_btx_status" ON "bank_transaction" ("status", "next_attempt_at") `);
        await queryRunner.query(`CREATE INDEX "ix_btx_order" ON "bank_transaction" ("order_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_btx_authoritative" ON "bank_transaction" ("order_id") WHERE is_authoritative`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_btx_gateway_reference" ON "bank_transaction" ("gateway_code", "gateway_reference") WHERE gateway_reference IS NOT NULL`);
        await queryRunner.query(`CREATE TABLE "bank_call_log" ("id" character varying(40) NOT NULL, "bank_transaction_id" character varying(40) NOT NULL, "operation" character varying(30) NOT NULL, "outcome" character varying(30) NOT NULL, "detail" character varying(500), "latency_ms" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_fd0e87686f9e9738cb5cb051393" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_bank_call_log_btx" ON "bank_call_log" ("bank_transaction_id") `);
        await queryRunner.query(`CREATE TABLE "order" ("id" character varying(40) NOT NULL, "merchant_id" character varying(40) NOT NULL, "merchant_order_number" character varying(64) NOT NULL, "consumer_user_id" character varying(40) NOT NULL, "total_amount" bigint NOT NULL, "cash_amount" bigint, "credit_amount" bigint, "cash_payment_bps" integer, "status" character varying(40) NOT NULL, "failure_reason" character varying(30), "allocation_status" character varying(40), "refund_status" character varying(40) NOT NULL DEFAULT 'None', "refunded_amount" bigint NOT NULL DEFAULT '0', "session_expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "payment_deadline_at" TIMESTAMP WITH TIME ZONE, "inquiry_attempts" integer NOT NULL DEFAULT '0', "reservation_attempts" integer NOT NULL DEFAULT '0', "quote_hash" character varying(64), "cash_only" boolean NOT NULL DEFAULT false, "return_url" character varying(2048) NOT NULL, "callback_url" character varying(2048), "checkout_token_hash" character varying(64) NOT NULL, "checkout_token_enc" text NOT NULL, "terms_version" character varying(20), "terms_accepted_at" TIMESTAMP WITH TIME ZONE, "terms_accepted_ip" character varying(64), "terms_accepted_user_agent" character varying(500), "settlement_terms_snapshot" jsonb, "completed_at" TIMESTAMP WITH TIME ZONE, "claimed_bank_transaction_id" character varying(40), "cancel_requested_at" TIMESTAMP WITH TIME ZONE, "cancel_not_applied" boolean NOT NULL DEFAULT false, "metadata" jsonb, "version" integer NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_order_amounts" CHECK ((cash_amount IS NULL AND credit_amount IS NULL) OR (cash_amount + credit_amount = total_amount)), CONSTRAINT "PK_1031171c13130102495201e3e20" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_order_created" ON "order" ("created_at") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "ix_order_token" ON "order" ("checkout_token_hash") `);
        await queryRunner.query(`CREATE INDEX "ix_order_consumer" ON "order" ("consumer_user_id") `);
        await queryRunner.query(`CREATE INDEX "ix_order_status_deadline" ON "order" ("status", "payment_deadline_at") `);
        await queryRunner.query(`CREATE INDEX "ix_order_status_session" ON "order" ("status", "session_expires_at") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_order_merchant_number_active" ON "order" ("merchant_id", "merchant_order_number") WHERE status NOT IN ('Cancelled', 'Expired', 'Failed')`);
        await queryRunner.query(`CREATE TABLE "order_event" ("id" character varying(40) NOT NULL, "order_id" character varying(40) NOT NULL, "from_status" character varying(40), "to_status" character varying(40) NOT NULL, "actor" character varying(60) NOT NULL, "reason" character varying(300), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_394b0d7613180ebee9028e9aaa1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_order_event_order" ON "order_event" ("order_id", "created_at") `);
        await queryRunner.query(`CREATE TABLE "checkout_session" ("id" character varying(40) NOT NULL, "order_id" character varying(40) NOT NULL, "token_hash" character varying(64) NOT NULL, "otp_verified_at" TIMESTAMP WITH TIME ZONE, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ip" character varying(64), "user_agent" character varying(500), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_143bac9b20b973e700fc05ee4e7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_checkout_session_order" ON "checkout_session" ("order_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_checkout_session_token" ON "checkout_session" ("token_hash") `);
        await queryRunner.query(`CREATE TABLE "otp_session" ("id" character varying(40) NOT NULL, "order_id" character varying(40) NOT NULL, "checkout_session_id" character varying(40) NOT NULL, "consumer_user_id" character varying(40) NOT NULL, "code_hash" character varying(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "attempts" integer NOT NULL DEFAULT '0', "status" character varying(40) NOT NULL, "dispatch_status" character varying(40) NOT NULL, "sms_provider" character varying(60), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e574ba7d3c7faa01608fe1f5304" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_otp_consumer_created" ON "otp_session" ("consumer_user_id", "created_at") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_otp_sent_per_order" ON "otp_session" ("order_id") WHERE status = 'Sent'`);
        for (const t of ['order_event', 'bank_call_log']) {
            await queryRunner.query(`CREATE TRIGGER ${t}_append_only BEFORE UPDATE OR DELETE ON "${t}" FOR EACH ROW EXECUTE FUNCTION bajet_forbid_mutation()`);
            await queryRunner.query(`CREATE TRIGGER ${t}_no_truncate BEFORE TRUNCATE ON "${t}" FOR EACH STATEMENT EXECUTE FUNCTION bajet_forbid_mutation()`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const t of ['order_event', 'bank_call_log']) {
            await queryRunner.query(`DROP TRIGGER ${t}_no_truncate ON "${t}"`);
            await queryRunner.query(`DROP TRIGGER ${t}_append_only ON "${t}"`);
        }
        await queryRunner.query(`DROP INDEX "public"."uq_otp_sent_per_order"`);
        await queryRunner.query(`DROP INDEX "public"."ix_otp_consumer_created"`);
        await queryRunner.query(`DROP TABLE "otp_session"`);
        await queryRunner.query(`DROP INDEX "public"."uq_checkout_session_token"`);
        await queryRunner.query(`DROP INDEX "public"."ix_checkout_session_order"`);
        await queryRunner.query(`DROP TABLE "checkout_session"`);
        await queryRunner.query(`DROP INDEX "public"."ix_order_event_order"`);
        await queryRunner.query(`DROP TABLE "order_event"`);
        await queryRunner.query(`DROP INDEX "public"."uq_order_merchant_number_active"`);
        await queryRunner.query(`DROP INDEX "public"."ix_order_status_session"`);
        await queryRunner.query(`DROP INDEX "public"."ix_order_status_deadline"`);
        await queryRunner.query(`DROP INDEX "public"."ix_order_consumer"`);
        await queryRunner.query(`DROP INDEX "public"."ix_order_token"`);
        await queryRunner.query(`DROP INDEX "public"."ix_order_created"`);
        await queryRunner.query(`DROP TABLE "order"`);
        await queryRunner.query(`DROP INDEX "public"."ix_bank_call_log_btx"`);
        await queryRunner.query(`DROP TABLE "bank_call_log"`);
        await queryRunner.query(`DROP INDEX "public"."uq_btx_gateway_reference"`);
        await queryRunner.query(`DROP INDEX "public"."uq_btx_authoritative"`);
        await queryRunner.query(`DROP INDEX "public"."ix_btx_order"`);
        await queryRunner.query(`DROP INDEX "public"."ix_btx_status"`);
        await queryRunner.query(`DROP TABLE "bank_transaction"`);
        await queryRunner.query(`DROP INDEX "public"."uq_gateway_code"`);
        await queryRunner.query(`DROP TABLE "bank_gateway"`);
        await queryRunner.query(`DROP INDEX "public"."uq_provider_statement_line"`);
        await queryRunner.query(`DROP TABLE "provider_statement_line"`);
        await queryRunner.query(`DROP INDEX "public"."uq_psp_line"`);
        await queryRunner.query(`DROP TABLE "psp_settlement_line"`);
        await queryRunner.query(`DROP INDEX "public"."uq_recon_open_dedupe"`);
        await queryRunner.query(`DROP INDEX "public"."ix_recon_status"`);
        await queryRunner.query(`DROP TABLE "reconciliation_item"`);
        await queryRunner.query(`DROP INDEX "public"."ix_ptx_due"`);
        await queryRunner.query(`DROP INDEX "public"."ix_ptx_order"`);
        await queryRunner.query(`DROP INDEX "public"."ix_ptx_reservation"`);
        await queryRunner.query(`DROP TABLE "provider_transaction"`);
        await queryRunner.query(`DROP INDEX "public"."uq_reservation_attempt"`);
        await queryRunner.query(`DROP INDEX "public"."ix_reservation_status"`);
        await queryRunner.query(`DROP INDEX "public"."ix_reservation_consumer"`);
        await queryRunner.query(`DROP TABLE "credit_reservation"`);
        await queryRunner.query(`DROP INDEX "public"."uq_inquiry_result"`);
        await queryRunner.query(`DROP TABLE "credit_inquiry_result"`);
        await queryRunner.query(`DROP INDEX "public"."uq_inquiry_attempt"`);
        await queryRunner.query(`DROP TABLE "credit_inquiry"`);
    }

}
