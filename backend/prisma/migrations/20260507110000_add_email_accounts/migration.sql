-- CreateTable
CREATE TABLE "email_accounts" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "email_address" TEXT NOT NULL,
    "display_name" TEXT,
    "imap_host" TEXT NOT NULL DEFAULT 'imap.hostinger.com',
    "imap_port" INTEGER NOT NULL DEFAULT 993,
    "smtp_host" TEXT NOT NULL DEFAULT 'smtp.hostinger.com',
    "smtp_port" INTEGER NOT NULL DEFAULT 465,
    "credential_id" TEXT NOT NULL,
    "signature_text" TEXT,
    "signature_html" TEXT,
    "last_sync_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_account_shares" (
    "email_account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_account_shares_pkey" PRIMARY KEY ("email_account_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_accounts_email_address_key" ON "email_accounts"("email_address");

-- CreateIndex
CREATE UNIQUE INDEX "email_accounts_credential_id_key" ON "email_accounts"("credential_id");

-- CreateIndex
CREATE INDEX "email_accounts_owner_id_idx" ON "email_accounts"("owner_id");

-- CreateIndex
CREATE INDEX "email_account_shares_user_id_idx" ON "email_account_shares"("user_id");

-- AddForeignKey
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_account_shares" ADD CONSTRAINT "email_account_shares_email_account_id_fkey" FOREIGN KEY ("email_account_id") REFERENCES "email_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_account_shares" ADD CONSTRAINT "email_account_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
