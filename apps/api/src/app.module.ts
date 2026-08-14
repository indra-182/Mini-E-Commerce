import { Global, Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import { CartController, CartService } from "./cart/cart.js";
import { GuestSessionService } from "./common/guest-session.js";
import { ProblemDetailsFilter } from "./common/problem-details.js";
import { environmentProvider } from "./config/environment.js";
import { ArticlesController, CatalogService, ProductsController } from "./catalog/catalog.js";
import { HealthController, HealthService } from "./health/health.js";
import { OrderController, OrderService } from "./order/order.js";
import { PaymentController, PaymentService } from "./payment/payment.js";
import { FakePaymentGateway, PAYMENT_GATEWAY } from "./payment/payment-gateway.js";
import { PrismaService } from "./prisma/prisma.service.js";

@Global()
@Module({
  controllers: [HealthController, ProductsController, ArticlesController, CartController, OrderController, PaymentController],
  providers: [
    environmentProvider,
    PrismaService,
    HealthService,
    CatalogService,
    CartService,
    OrderService,
    PaymentService,
    FakePaymentGateway,
    { provide: PAYMENT_GATEWAY, useExisting: FakePaymentGateway },
    GuestSessionService,
    { provide: APP_FILTER, useClass: ProblemDetailsFilter }
  ],
  exports: [PrismaService, GuestSessionService]
})
export class AppModule {}
