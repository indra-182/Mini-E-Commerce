CREATE TYPE "Currency" AS ENUM ('IDR');
CREATE TYPE "ArticleType" AS ENUM ('PRODUCT', 'NEWS', 'OTHER');
CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'CLOSED');
CREATE TYPE "OrderStatus" AS ENUM ('AWAITING_PAYMENT', 'PAID', 'EXPIRED');
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED');
CREATE TYPE "ShippingMethod" AS ENUM ('REGULAR');

CREATE TABLE "GuestSession" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "imagePaths" TEXT[] NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductVariant" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "optionLabel" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'IDR',
    "availableQuantity" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Article" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "ArticleType" NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "contentHtml" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Cart" (
    "id" UUID NOT NULL,
    "guestSessionId" UUID NOT NULL,
    "status" "CartStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CartItem" (
    "id" UUID NOT NULL,
    "cartId" UUID NOT NULL,
    "productVariantId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "guestSessionId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "shippingAddress" JSONB NOT NULL,
    "shippingMethod" "ShippingMethod" NOT NULL DEFAULT 'REGULAR',
    "subtotal" INTEGER NOT NULL,
    "shippingFee" INTEGER NOT NULL,
    "grandTotal" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'IDR',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productVariantId" UUID NOT NULL,
    "skuSnapshot" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "optionLabelSnapshot" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotal" INTEGER NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentAttempt" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "providerReference" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'IDR',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookEvent" (
    "id" UUID NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IdempotencyRecord" (
    "id" UUID NOT NULL,
    "guestSessionId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "orderId" UUID NOT NULL,
    "initialPaymentAttemptId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuestSession_tokenHash_key" ON "GuestSession"("tokenHash");
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");
CREATE UNIQUE INDEX "CartItem_cartId_productVariantId_key" ON "CartItem"("cartId", "productVariantId");
CREATE UNIQUE INDEX "PaymentAttempt_providerReference_key" ON "PaymentAttempt"("providerReference");
CREATE UNIQUE INDEX "WebhookEvent_providerEventId_key" ON "WebhookEvent"("providerEventId");
CREATE UNIQUE INDEX "IdempotencyRecord_orderId_key" ON "IdempotencyRecord"("orderId");
CREATE UNIQUE INDEX "IdempotencyRecord_initialPaymentAttemptId_key" ON "IdempotencyRecord"("initialPaymentAttemptId");
CREATE UNIQUE INDEX "IdempotencyRecord_guestSessionId_idempotencyKey_key" ON "IdempotencyRecord"("guestSessionId", "idempotencyKey");

CREATE INDEX "Product_isActive_category_idx" ON "Product"("isActive", "category");
CREATE INDEX "Product_isActive_createdAt_idx" ON "Product"("isActive", "createdAt");
CREATE INDEX "ProductVariant_productId_isActive_idx" ON "ProductVariant"("productId", "isActive");
CREATE INDEX "ProductVariant_isActive_price_idx" ON "ProductVariant"("isActive", "price");
CREATE INDEX "Article_isPublished_type_publishedAt_idx" ON "Article"("isPublished", "type", "publishedAt");
CREATE INDEX "Cart_guestSessionId_status_idx" ON "Cart"("guestSessionId", "status");
CREATE INDEX "CartItem_productVariantId_idx" ON "CartItem"("productVariantId");
CREATE INDEX "Order_guestSessionId_createdAt_idx" ON "Order"("guestSessionId", "createdAt");
CREATE INDEX "Order_status_expiresAt_idx" ON "Order"("status", "expiresAt");
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_productVariantId_idx" ON "OrderItem"("productVariantId");
CREATE INDEX "PaymentAttempt_orderId_status_idx" ON "PaymentAttempt"("orderId", "status");
CREATE INDEX "PaymentAttempt_status_expiresAt_idx" ON "PaymentAttempt"("status", "expiresAt");

CREATE UNIQUE INDEX "Cart_one_active_per_guest_idx"
  ON "Cart"("guestSessionId")
  WHERE "status" = 'ACTIVE';

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Cart"
  ADD CONSTRAINT "Cart_guestSessionId_fkey"
  FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_cartId_fkey"
  FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_productVariantId_fkey"
  FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_guestSessionId_fkey"
  FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_productVariantId_fkey"
  FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentAttempt"
  ADD CONSTRAINT "PaymentAttempt_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "IdempotencyRecord"
  ADD CONSTRAINT "IdempotencyRecord_guestSessionId_fkey"
  FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "IdempotencyRecord"
  ADD CONSTRAINT "IdempotencyRecord_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "IdempotencyRecord"
  ADD CONSTRAINT "IdempotencyRecord_initialPaymentAttemptId_fkey"
  FOREIGN KEY ("initialPaymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_imagePaths_check"
  CHECK (cardinality("imagePaths") > 0);

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_price_check"
  CHECK ("price" >= 0),
  ADD CONSTRAINT "ProductVariant_availableQuantity_check"
  CHECK ("availableQuantity" >= 0);

ALTER TABLE "Article"
  ADD CONSTRAINT "Article_publishedAt_check"
  CHECK ("isPublished" = false OR "publishedAt" IS NOT NULL);

ALTER TABLE "Cart"
  ADD CONSTRAINT "Cart_version_check"
  CHECK ("version" >= 1);

ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_quantity_check"
  CHECK ("quantity" > 0);

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_subtotal_check"
  CHECK ("subtotal" >= 0),
  ADD CONSTRAINT "Order_shippingFee_check"
  CHECK ("shippingFee" >= 0),
  ADD CONSTRAINT "Order_grandTotal_check"
  CHECK ("grandTotal" >= 0),
  ADD CONSTRAINT "Order_total_matches_parts_check"
  CHECK ("grandTotal" = "subtotal" + "shippingFee");

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_unitPrice_check"
  CHECK ("unitPrice" >= 0),
  ADD CONSTRAINT "OrderItem_quantity_check"
  CHECK ("quantity" > 0),
  ADD CONSTRAINT "OrderItem_lineTotal_check"
  CHECK ("lineTotal" >= 0),
  ADD CONSTRAINT "OrderItem_lineTotal_matches_parts_check"
  CHECK ("lineTotal" = "unitPrice" * "quantity");

ALTER TABLE "PaymentAttempt"
  ADD CONSTRAINT "PaymentAttempt_amount_check"
  CHECK ("amount" >= 0);
