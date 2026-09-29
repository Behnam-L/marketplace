import { MigrationInterface, QueryRunner } from "typeorm";

export class PartnersFinance1790701514974 implements MigrationInterface {
    name = 'PartnersFinance1790701514974'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "provider_settlement_plan" ("id" character varying(40) NOT NULL, "plan_number" character varying(20) NOT NULL, "provider_payable_margin_bps" integer NOT NULL, "installment_count" integer NOT NULL, "maturity_rule" character varying(40) NOT NULL, "status" character varying(40) NOT NULL, "version" integer NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_provider_plan_ranges" CHECK (provider_payable_margin_bps BETWEEN 0 AND 10000 AND installment_count BETWEEN 1 AND 6), CONSTRAINT "PK_5b69d9d39d2a41347e7980928d0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_provider_plan_number" ON "provider_settlement_plan" ("plan_number") `);
        await queryRunner.query(`CREATE TABLE "merchant_settlement_plan" ("id" character varying(40) NOT NULL, "plan_number" character varying(20) NOT NULL, "merchant_receivable_margin_bps" integer NOT NULL, "cash_settlement_enabled" boolean NOT NULL, "cash_settlement_bps" integer, "installment_count" integer NOT NULL, "maturity_rule" character varying(40) NOT NULL, "status" character varying(40) NOT NULL, "version" integer NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_merchant_plan_cash" CHECK ((cash_settlement_enabled AND cash_settlement_bps BETWEEN 100 AND 10000) OR (NOT cash_settlement_enabled AND cash_settlement_bps IS NULL)), CONSTRAINT "ck_merchant_plan_ranges" CHECK (merchant_receivable_margin_bps BETWEEN 0 AND 10000 AND installment_count BETWEEN 1 AND 6), CONSTRAINT "PK_57a840430ee24bd5dc29fcc0cfe" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_merchant_plan_number" ON "merchant_settlement_plan" ("plan_number") `);
        await queryRunner.query(`CREATE TABLE "settlement_document" ("id" character varying(40) NOT NULL, "number" character varying(30) NOT NULL, "direction" character varying(40) NOT NULL, "counterparty_type" character varying(40) NOT NULL, "counterparty_id" character varying(40) NOT NULL, "order_id" character varying(40), "refund_id" character varying(40), "kind" character varying(40) NOT NULL, "installment_index" integer NOT NULL DEFAULT '1', "installment_count" integer NOT NULL DEFAULT '1', "amount" bigint NOT NULL, "maturity_date" date NOT NULL, "status" character varying(40) NOT NULL, "invoice_id" character varying(40), "reason" character varying(40), "note" character varying(1000), "cancel_reason" character varying(500), "awaiting_payee_details" boolean NOT NULL DEFAULT false, "created_by" character varying(40) NOT NULL, "approved_by" character varying(40), "source_key" character varying(200) NOT NULL, "version" integer NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_document_amount" CHECK (amount > 0), CONSTRAINT "PK_9832b16497a39222ecf6ead1f3d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_document_order" ON "settlement_document" ("order_id") `);
        await queryRunner.query(`CREATE INDEX "ix_document_counterparty" ON "settlement_document" ("counterparty_type", "counterparty_id") `);
        await queryRunner.query(`CREATE INDEX "ix_document_status_maturity" ON "settlement_document" ("status", "maturity_date") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_document_source_key" ON "settlement_document" ("source_key") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_document_number" ON "settlement_document" ("number") `);
        await queryRunner.query(`CREATE TABLE "invoice" ("id" character varying(40) NOT NULL, "number" character varying(30) NOT NULL, "direction" character varying(40) NOT NULL, "counterparty_type" character varying(40) NOT NULL, "counterparty_id" character varying(40) NOT NULL, "invoice_date" date NOT NULL, "period_from" date NOT NULL, "period_to" date NOT NULL, "total_amount" bigint NOT NULL, "document_count" integer NOT NULL, "due_date" date NOT NULL, "status" character varying(40) NOT NULL, "paid_at" TIMESTAMP WITH TIME ZONE, "bank_reference" character varying(100), "recorded_by" character varying(40), "version" integer NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_15d25c200d9bcd8a33f698daf18" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_invoice_counterparty_date" ON "invoice" ("direction", "counterparty_type", "counterparty_id", "invoice_date") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_invoice_number" ON "invoice" ("number") `);
        await queryRunner.query(`CREATE TABLE "number_sequence" ("scope" character varying(30) NOT NULL, "last_value" integer NOT NULL, CONSTRAINT "PK_3d79eebb702c4fe76e99113c70b" PRIMARY KEY ("scope"))`);
        await queryRunner.query(`CREATE TABLE "merchant" ("id" character varying(40) NOT NULL, "display_name" character varying(100) NOT NULL, "entity_type" character varying(40) NOT NULL, "legal_name" character varying(200) NOT NULL, "national_id" character varying(11) NOT NULL, "economic_id" character varying(12), "manager_name" character varying(100) NOT NULL, "manager_national_code" character varying(10) NOT NULL, "contact_number" character varying(16) NOT NULL, "website_url" character varying(2048) NOT NULL, "office_address" character varying(500) NOT NULL, "iban" character varying(26) NOT NULL, "contract_file_id" character varying(40), "merchant_settlement_plan_id" character varying(40) NOT NULL, "status" character varying(40) NOT NULL, "return_url_domains" text array NOT NULL DEFAULT '{}', "webhook_url" character varying(2048), "version" integer NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9a3850e0537d869734fc9bff5d6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_merchant_economic_id" ON "merchant" ("economic_id") WHERE economic_id IS NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_merchant_national_id" ON "merchant" ("national_id") `);
        await queryRunner.query(`CREATE TABLE "merchant_api_key" ("id" character varying(40) NOT NULL, "merchant_id" character varying(40) NOT NULL, "key_id" character varying(40) NOT NULL, "secret_enc" text NOT NULL, "status" character varying(40) NOT NULL, "last_used_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ba56ab4becd6b871aa34a17cd20" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_api_key_merchant" ON "merchant_api_key" ("merchant_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_api_key_id" ON "merchant_api_key" ("key_id") `);
        await queryRunner.query(`CREATE TABLE "merchant_webhook_event" ("id" character varying(40) NOT NULL, "merchant_id" character varying(40) NOT NULL, "event_type" character varying(40) NOT NULL, "payload" jsonb NOT NULL, "target_url" character varying(2048) NOT NULL, "status" character varying(40) NOT NULL, "attempts" integer NOT NULL DEFAULT '0', "next_attempt_at" TIMESTAMP WITH TIME ZONE, "last_http_status" integer, "last_error" character varying(300), "delivered_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_670cb83fc19092bba46629d67e0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_webhook_merchant" ON "merchant_webhook_event" ("merchant_id") `);
        await queryRunner.query(`CREATE INDEX "ix_webhook_due" ON "merchant_webhook_event" ("status", "next_attempt_at") `);
        await queryRunner.query(`CREATE TABLE "credit_provider" ("id" character varying(40) NOT NULL, "legal_name" character varying(200) NOT NULL, "display_name" character varying(100) NOT NULL, "icon_file_id" character varying(40), "national_id" character varying(11) NOT NULL, "economic_id" character varying(12) NOT NULL, "website_url" character varying(2048) NOT NULL, "contact_number" character varying(16) NOT NULL, "office_address" character varying(500) NOT NULL, "iban" character varying(26) NOT NULL, "contract_file_id" character varying(40), "provider_settlement_plan_id" character varying(40) NOT NULL, "display_status" character varying(40) NOT NULL, "connection_status" character varying(40) NOT NULL, "connection_status_changed_at" TIMESTAMP WITH TIME ZONE, "adapter_type" character varying(40) NOT NULL, "api_base_url" character varying(2048) NOT NULL, "credentials_ref" character varying(200) NOT NULL, "inquiry_key" character varying(40) NOT NULL, "sort_order" integer NOT NULL DEFAULT '0', "version" integer NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_683c285984a2bf88c238a6738ef" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_provider_economic_id" ON "credit_provider" ("economic_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_provider_national_id" ON "credit_provider" ("national_id") `);
        await queryRunner.query(`CREATE TABLE "provider_call_log" ("id" character varying(40) NOT NULL, "provider_transaction_id" character varying(40), "provider_id" character varying(40) NOT NULL, "operation" character varying(30) NOT NULL, "request" jsonb, "response" jsonb, "http_status" integer, "latency_ms" integer NOT NULL, "outcome" character varying(20) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_33ce86d6dee7f3cd8b0ce8b3930" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_pcl_ptx" ON "provider_call_log" ("provider_transaction_id") `);
        await queryRunner.query(`CREATE INDEX "ix_pcl_provider_created" ON "provider_call_log" ("provider_id", "created_at") `);
        await queryRunner.query(`CREATE TABLE "consumer_user" ("id" character varying(40) NOT NULL, "phone_e164" character varying(16) NOT NULL, "status" character varying(40) NOT NULL, "first_name" character varying(100), "last_name" character varying(100), "cooldown_until" TIMESTAMP WITH TIME ZONE, "last_transaction_at" TIMESTAMP WITH TIME ZONE, "otp_verified_at" TIMESTAMP WITH TIME ZONE, "status_reason" character varying(500), "version" integer NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7c0e24da90f3831cc0f1f25b2a9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_consumer_phone" ON "consumer_user" ("phone_e164") `);
        await queryRunner.query(`CREATE TABLE "identity_linkage" ("id" character varying(40) NOT NULL, "consumer_user_id" character varying(40) NOT NULL, "national_id_enc" text NOT NULL, "national_id_hash" character varying(64) NOT NULL, "dob_enc" text, "status" character varying(40) NOT NULL, "order_id" character varying(40), "verified_at" TIMESTAMP WITH TIME ZONE, "last_matched_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9337c5189cc48cadc6c35adb372" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_linkage_consumer" ON "identity_linkage" ("consumer_user_id") `);
        await queryRunner.query(`CREATE INDEX "ix_linkage_order" ON "identity_linkage" ("order_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_linkage_verified" ON "identity_linkage" ("consumer_user_id") WHERE status = 'Verified'`);
        await queryRunner.query(`CREATE TABLE "identity_attempt" ("id" character varying(40) NOT NULL, "order_id" character varying(40) NOT NULL, "consumer_user_id" character varying(40) NOT NULL, "step" character varying(40) NOT NULL, "outcome" character varying(40) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b3c91516d28b89f58d5fb5d247c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_identity_attempt_consumer" ON "identity_attempt" ("consumer_user_id", "created_at") `);
        await queryRunner.query(`CREATE INDEX "ix_identity_attempt_order" ON "identity_attempt" ("order_id") `);
        await queryRunner.query(`CREATE TABLE "journal_entry" ("id" character varying(40) NOT NULL, "event_type" character varying(60) NOT NULL, "source_type" character varying(40) NOT NULL, "source_id" character varying(80) NOT NULL, "posted_at" TIMESTAMP WITH TIME ZONE NOT NULL, "reverses_entry_id" character varying(40), "memo" character varying(300), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_69167f660c807d2aa178f0bd7e6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_journal_event_source" ON "journal_entry" ("event_type", "source_id") `);
        await queryRunner.query(`CREATE TABLE "ledger_line" ("id" character varying(40) NOT NULL, "entry_id" character varying(40) NOT NULL, "account_code" character varying(80) NOT NULL, "debit" bigint NOT NULL DEFAULT '0', "credit" bigint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a19363079df6f58038f909718ab" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_ledger_line_entry" ON "ledger_line" ("entry_id") `);
        await queryRunner.query(`CREATE INDEX "ix_ledger_line_account" ON "ledger_line" ("account_code") `);
        for (const t of ['journal_entry', 'ledger_line', 'identity_attempt', 'provider_call_log']) {
            await queryRunner.query(`CREATE TRIGGER ${t}_append_only BEFORE UPDATE OR DELETE ON "${t}" FOR EACH ROW EXECUTE FUNCTION bajet_forbid_mutation()`);
            await queryRunner.query(`CREATE TRIGGER ${t}_no_truncate BEFORE TRUNCATE ON "${t}" FOR EACH STATEMENT EXECUTE FUNCTION bajet_forbid_mutation()`);
        }
        // BR-LED-01: each ledger line has exactly one positive side.
        await queryRunner.query(`ALTER TABLE "ledger_line" ADD CONSTRAINT "ck_ledger_line_one_side" CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ledger_line" DROP CONSTRAINT "ck_ledger_line_one_side"`);
        for (const t of ['journal_entry', 'ledger_line', 'identity_attempt', 'provider_call_log']) {
            await queryRunner.query(`DROP TRIGGER ${t}_no_truncate ON "${t}"`);
            await queryRunner.query(`DROP TRIGGER ${t}_append_only ON "${t}"`);
        }
        await queryRunner.query(`DROP INDEX "public"."ix_ledger_line_account"`);
        await queryRunner.query(`DROP INDEX "public"."ix_ledger_line_entry"`);
        await queryRunner.query(`DROP TABLE "ledger_line"`);
        await queryRunner.query(`DROP INDEX "public"."uq_journal_event_source"`);
        await queryRunner.query(`DROP TABLE "journal_entry"`);
        await queryRunner.query(`DROP INDEX "public"."ix_identity_attempt_order"`);
        await queryRunner.query(`DROP INDEX "public"."ix_identity_attempt_consumer"`);
        await queryRunner.query(`DROP TABLE "identity_attempt"`);
        await queryRunner.query(`DROP INDEX "public"."uq_linkage_verified"`);
        await queryRunner.query(`DROP INDEX "public"."ix_linkage_order"`);
        await queryRunner.query(`DROP INDEX "public"."ix_linkage_consumer"`);
        await queryRunner.query(`DROP TABLE "identity_linkage"`);
        await queryRunner.query(`DROP INDEX "public"."uq_consumer_phone"`);
        await queryRunner.query(`DROP TABLE "consumer_user"`);
        await queryRunner.query(`DROP INDEX "public"."ix_pcl_provider_created"`);
        await queryRunner.query(`DROP INDEX "public"."ix_pcl_ptx"`);
        await queryRunner.query(`DROP TABLE "provider_call_log"`);
        await queryRunner.query(`DROP INDEX "public"."uq_provider_national_id"`);
        await queryRunner.query(`DROP INDEX "public"."uq_provider_economic_id"`);
        await queryRunner.query(`DROP TABLE "credit_provider"`);
        await queryRunner.query(`DROP INDEX "public"."ix_webhook_due"`);
        await queryRunner.query(`DROP INDEX "public"."ix_webhook_merchant"`);
        await queryRunner.query(`DROP TABLE "merchant_webhook_event"`);
        await queryRunner.query(`DROP INDEX "public"."uq_api_key_id"`);
        await queryRunner.query(`DROP INDEX "public"."ix_api_key_merchant"`);
        await queryRunner.query(`DROP TABLE "merchant_api_key"`);
        await queryRunner.query(`DROP INDEX "public"."uq_merchant_national_id"`);
        await queryRunner.query(`DROP INDEX "public"."uq_merchant_economic_id"`);
        await queryRunner.query(`DROP TABLE "merchant"`);
        await queryRunner.query(`DROP TABLE "number_sequence"`);
        await queryRunner.query(`DROP INDEX "public"."uq_invoice_number"`);
        await queryRunner.query(`DROP INDEX "public"."uq_invoice_counterparty_date"`);
        await queryRunner.query(`DROP TABLE "invoice"`);
        await queryRunner.query(`DROP INDEX "public"."uq_document_number"`);
        await queryRunner.query(`DROP INDEX "public"."uq_document_source_key"`);
        await queryRunner.query(`DROP INDEX "public"."ix_document_status_maturity"`);
        await queryRunner.query(`DROP INDEX "public"."ix_document_counterparty"`);
        await queryRunner.query(`DROP INDEX "public"."ix_document_order"`);
        await queryRunner.query(`DROP TABLE "settlement_document"`);
        await queryRunner.query(`DROP INDEX "public"."uq_merchant_plan_number"`);
        await queryRunner.query(`DROP TABLE "merchant_settlement_plan"`);
        await queryRunner.query(`DROP INDEX "public"."uq_provider_plan_number"`);
        await queryRunner.query(`DROP TABLE "provider_settlement_plan"`);
    }

}
