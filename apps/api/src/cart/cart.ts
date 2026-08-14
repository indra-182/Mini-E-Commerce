import {
  ApiCookieAuth,
  ApiExtraModels,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiResponse,
  ApiTags,
  getSchemaPath
} from "@nestjs/swagger";
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Injectable,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Res
} from "@nestjs/common";
import { IsInt, IsUUID, Max, Min } from "class-validator";
import { Prisma } from "@prisma/client";
import type { Response } from "express";

import { MoneyDto } from "../catalog/catalog.js";
import { GuestSessionService } from "../common/guest-session.js";
import { ProblemDetailsDto, ProblemException } from "../common/problem-details.js";
import { createValidationPipe } from "../common/validation.js";
import { PrismaService } from "../prisma/prisma.service.js";

const CART_QUANTITY_MIN = 1;
const CART_QUANTITY_MAX = 99;

export class AddCartItemDto {
  @ApiProperty({ type: String, format: "uuid", example: "20000000-0000-4000-8000-000000000001" })
  @IsUUID()
  productVariantId!: string;

  @ApiProperty({ type: "integer", minimum: CART_QUANTITY_MIN, maximum: CART_QUANTITY_MAX, example: 2 })
  @IsInt()
  @Min(CART_QUANTITY_MIN)
  @Max(CART_QUANTITY_MAX)
  quantity!: number;
}

export class UpdateCartItemDto {
  @ApiProperty({ type: "integer", minimum: CART_QUANTITY_MIN, maximum: CART_QUANTITY_MAX, example: 2 })
  @IsInt()
  @Min(CART_QUANTITY_MIN)
  @Max(CART_QUANTITY_MAX)
  quantity!: number;
}

export class CartItemDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, format: "uuid" })
  productVariantId!: string;

  @ApiProperty({ type: String, format: "uuid" })
  productId!: string;

  @ApiProperty({ type: String, example: "kopi-arabika-gayo" })
  productSlug!: string;

  @ApiProperty({ type: String, example: "Kopi Arabika Gayo" })
  productName!: string;

  @ApiProperty({ type: String, example: "/images/products/kopi-arabika-gayo.webp" })
  thumbnail!: string;

  @ApiProperty({ type: String, example: "250 g" })
  optionLabel!: string;

  @ApiProperty({ type: "integer", minimum: CART_QUANTITY_MIN, maximum: CART_QUANTITY_MAX, example: 2 })
  quantity!: number;

  @ApiProperty({ type: MoneyDto, example: { amount: 85000, currency: "IDR" } })
  unitPrice!: MoneyDto;

  @ApiProperty({ type: MoneyDto, example: { amount: 170000, currency: "IDR" } })
  lineTotal!: MoneyDto;

  @ApiProperty({ type: "integer", minimum: 0, example: 12 })
  availableQuantity!: number;

  @ApiProperty({ type: Boolean, example: true })
  isAvailable!: boolean;
}

export class CartDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: "integer", minimum: 1, example: 4 })
  version!: number;

  @ApiProperty({ type: [CartItemDto] })
  items!: CartItemDto[];

  @ApiProperty({ type: MoneyDto, example: { amount: 170000, currency: "IDR" } })
  subtotal!: MoneyDto;
}

export const cartSelect = {
  id: true,
  version: true,
  items: {
    orderBy: { id: "asc" },
    select: {
      id: true,
      quantity: true,
      productVariant: {
        select: {
          id: true,
          sku: true,
          optionLabel: true,
          price: true,
          isActive: true,
          availableQuantity: true,
          product: {
            select: {
              id: true,
              slug: true,
              name: true,
              imagePaths: true,
              isActive: true
            }
          }
        }
      }
    }
  }
} satisfies Prisma.CartSelect;

export type CartRecord = Prisma.CartGetPayload<{ select: typeof cartSelect }>;
export type CartClient = PrismaService | Prisma.TransactionClient;

function money(amount: number): MoneyDto {
  return { amount, currency: "IDR" };
}

export function cartEtag(version: number): string {
  return `"${version}"`;
}

export function parseCartVersion(value: string): number | null {
  const match = /^"([1-9][0-9]*)"$/.exec(value.trim());
  if (!match) return null;
  const version = Number(match[1]);
  return Number.isSafeInteger(version) ? version : null;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function guestSessionRequired(detail = "A valid guest session is required."): never {
  throw new ProblemException({ status: HttpStatus.UNAUTHORIZED, code: "GUEST_SESSION_REQUIRED", detail });
}

function cartVersionMismatch(cart: CartRecord): never {
  const currentCart = toCart(cart);
  throw new ProblemException({
    status: HttpStatus.PRECONDITION_FAILED,
    code: "CART_VERSION_MISMATCH",
    detail: "The Cart changed. Refresh it before retrying the mutation.",
    currentCart: currentCart as unknown as Record<string, unknown>
  });
}

function cartItemNotFound(): never {
  throw new ProblemException({ status: HttpStatus.NOT_FOUND, code: "CART_ITEM_NOT_FOUND", detail: "The requested Cart Item was not found." });
}

function productVariantNotFound(): never {
  throw new ProblemException({ status: HttpStatus.NOT_FOUND, code: "PRODUCT_NOT_FOUND", detail: "The requested Product Variant was not found." });
}

function quantityLimitExceeded(): never {
  throw new ProblemException({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    code: "VALIDATION_FAILED",
    detail: "Request validation failed.",
    errors: { quantity: [`Cart quantity must be between ${CART_QUANTITY_MIN} and ${CART_QUANTITY_MAX}.`] }
  });
}

export function toCart(record: CartRecord): CartDto {
  const items = record.items.map((item) => {
    const variant = item.productVariant;
    const product = variant.product;
    const lineTotal = variant.price * item.quantity;
    return {
      id: item.id,
      productVariantId: variant.id,
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      thumbnail: product.imagePaths[0],
      optionLabel: variant.optionLabel,
      quantity: item.quantity,
      unitPrice: money(variant.price),
      lineTotal: money(lineTotal),
      availableQuantity: variant.availableQuantity,
      isAvailable: variant.isActive && product.isActive && variant.availableQuantity > 0
    } satisfies CartItemDto;
  });

  return {
    id: record.id,
    version: record.version,
    items,
    subtotal: money(items.reduce((total, item) => total + item.lineTotal.amount, 0))
  };
}

export function findActiveCart(client: CartClient, guestSessionId: string): Promise<CartRecord | null> {
  return client.cart.findFirst({
    where: { guestSessionId, status: "ACTIVE" },
    select: cartSelect
  });
}

@Injectable()
export class CartService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(GuestSessionService) private readonly sessions: GuestSessionService
  ) {}

  async bootstrap(cookieHeader: string | undefined): Promise<{ cart: CartDto; setCookie?: string }> {
    const existingSessionId = await this.sessions.findSessionId(cookieHeader);
    const session = existingSessionId
      ? { id: existingSessionId, setCookie: undefined }
      : await this.sessions.createSession();
    const cart = await this.ensureActiveCart(session.id);
    return { cart: toCart(cart), ...(session.setCookie ? { setCookie: session.setCookie } : {}) };
  }

  async get(cookieHeader: string | undefined): Promise<CartDto> {
    const sessionId = await this.requireSession(cookieHeader);
    const cart = await findActiveCart(this.prisma, sessionId);
    if (!cart) guestSessionRequired("Bootstrap the current Cart before reading it.");
    return toCart(cart);
  }

  async add(cookieHeader: string | undefined, ifMatch: string | undefined, input: AddCartItemDto): Promise<CartDto> {
    return this.mutate(cookieHeader, ifMatch, async (transaction, cartId) => {
      const variant = await transaction.productVariant.findFirst({
        where: { id: input.productVariantId, isActive: true, product: { isActive: true } },
        select: { id: true }
      });
      if (!variant) productVariantNotFound();

      const existing = await transaction.cartItem.findUnique({
        where: { cartId_productVariantId: { cartId, productVariantId: input.productVariantId } },
        select: { id: true, quantity: true }
      });
      const nextQuantity = (existing?.quantity ?? 0) + input.quantity;
      if (nextQuantity > CART_QUANTITY_MAX) quantityLimitExceeded();

      if (existing) {
        await transaction.cartItem.update({ where: { id: existing.id }, data: { quantity: nextQuantity } });
      } else {
        await transaction.cartItem.create({
          data: { cartId, productVariantId: input.productVariantId, quantity: input.quantity }
        });
      }
    });
  }

  async update(cookieHeader: string | undefined, ifMatch: string | undefined, itemId: string, input: UpdateCartItemDto): Promise<CartDto> {
    return this.mutate(cookieHeader, ifMatch, async (transaction, cartId) => {
      const item = await transaction.cartItem.findFirst({ where: { id: itemId, cartId }, select: { id: true } });
      if (!item) cartItemNotFound();
      await transaction.cartItem.update({ where: { id: itemId }, data: { quantity: input.quantity } });
    });
  }

  async remove(cookieHeader: string | undefined, ifMatch: string | undefined, itemId: string): Promise<CartDto> {
    return this.mutate(cookieHeader, ifMatch, async (transaction, cartId) => {
      const item = await transaction.cartItem.findFirst({ where: { id: itemId, cartId }, select: { id: true } });
      if (!item) cartItemNotFound();
      await transaction.cartItem.delete({ where: { id: itemId } });
    });
  }

  private async requireSession(cookieHeader: string | undefined): Promise<string> {
    const sessionId = await this.sessions.findSessionId(cookieHeader);
    if (!sessionId) guestSessionRequired();
    return sessionId;
  }

  private async ensureActiveCart(guestSessionId: string): Promise<CartRecord> {
    const current = await findActiveCart(this.prisma, guestSessionId);
    if (current) return current;

    try {
      return await this.prisma.cart.create({ data: { guestSessionId }, select: cartSelect });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const winner = await findActiveCart(this.prisma, guestSessionId);
      if (winner) return winner;
      throw error;
    }
  }

  private async mutate(
    cookieHeader: string | undefined,
    ifMatch: string | undefined,
    action: (transaction: Prisma.TransactionClient, cartId: string) => Promise<void>
  ): Promise<CartDto> {
    const sessionId = await this.requireSession(cookieHeader);
    if (ifMatch === undefined) {
      throw new ProblemException({
        status: HttpStatus.PRECONDITION_REQUIRED,
        code: "PRECONDITION_REQUIRED",
        detail: "If-Match is required for Cart mutations."
      });
    }

    const cart = await findActiveCart(this.prisma, sessionId);
    if (!cart) guestSessionRequired("Bootstrap the current Cart before mutating it.");
    const expectedVersion = parseCartVersion(ifMatch);
    if (expectedVersion === null) cartVersionMismatch(cart);

    return this.prisma.$transaction(async (transaction) => {
      const guarded = await transaction.cart.updateMany({
        where: { id: cart.id, guestSessionId: sessionId, status: "ACTIVE", version: expectedVersion },
        data: { version: { increment: 1 } }
      });
      if (guarded.count !== 1) {
        const current = await findActiveCart(transaction, sessionId);
        if (!current) guestSessionRequired();
        cartVersionMismatch(current);
      }

      await action(transaction, cart.id);
      const updated = await findActiveCart(transaction, sessionId);
      if (!updated) guestSessionRequired();
      return toCart(updated);
    });
  }
}

function setCartHeaders(response: Response, cart: CartDto): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("ETag", cartEtag(cart.version));
}

@ApiExtraModels(ProblemDetailsDto, MoneyDto, CartItemDto, CartDto)
@ApiTags("Cart")
@Controller("cart")
export class CartController {
  constructor(@Inject(CartService) private readonly cart: CartService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "cart_bootstrap", summary: "Bootstrap the current guest Cart" })
  @ApiOkResponse({
    type: CartDto,
    headers: {
      ETag: { description: "Quoted Cart version.", schema: { type: "string", example: '"1"' } },
      "Cache-Control": { description: "Cart responses are never cached.", schema: { type: "string", example: "no-store" } }
    }
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    content: { "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } }
  })
  bootstrap(@Headers("cookie") cookieHeader: string | undefined, @Res({ passthrough: true }) response: Response): Promise<CartDto> {
    return this.cart.bootstrap(cookieHeader).then(({ cart, setCookie }) => {
      if (setCookie) response.setHeader("Set-Cookie", setCookie);
      setCartHeaders(response, cart);
      return cart;
    });
  }

  @Get()
  @ApiCookieAuth("guest_session")
  @ApiOperation({ operationId: "cart_getCurrent", summary: "Get the current guest Cart" })
  @ApiOkResponse({
    type: CartDto,
    headers: {
      ETag: { description: "Quoted Cart version.", schema: { type: "string", example: '"1"' } },
      "Cache-Control": { description: "Cart responses are never cached.", schema: { type: "string", example: "no-store" } }
    }
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    content: { "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } }
  })
  get(@Headers("cookie") cookieHeader: string | undefined, @Res({ passthrough: true }) response: Response): Promise<CartDto> {
    return this.cart.get(cookieHeader).then((cart) => {
      setCartHeaders(response, cart);
      return cart;
    });
  }

  @Post("items")
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth("guest_session")
  @ApiOperation({ operationId: "cart_addItem", summary: "Add a Product Variant to the current Cart" })
  @ApiHeader({ name: "If-Match", required: true, description: "Quoted Cart version, for example \"1\"." })
  @ApiOkResponse({
    type: CartDto,
    headers: {
      ETag: { description: "Quoted Cart version.", schema: { type: "string", example: '"2"' } },
      "Cache-Control": { description: "Cart responses are never cached.", schema: { type: "string", example: "no-store" } }
    }
  })
  @ApiResponse({
    status: HttpStatus.PRECONDITION_REQUIRED,
    content: { "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } }
  })
  @ApiResponse({
    status: HttpStatus.PRECONDITION_FAILED,
    content: { "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } }
  })
  add(
    @Headers("cookie") cookieHeader: string | undefined,
    @Headers("if-match") ifMatch: string | undefined,
    @Body(createValidationPipe(AddCartItemDto)) input: AddCartItemDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<CartDto> {
    return this.cart.add(cookieHeader, ifMatch, input).then((cart) => {
      setCartHeaders(response, cart);
      return cart;
    });
  }

  @Patch("items/:itemId")
  @ApiCookieAuth("guest_session")
  @ApiOperation({ operationId: "cart_updateItem", summary: "Update a current Cart Item quantity" })
  @ApiParam({ name: "itemId", type: String, format: "uuid" })
  @ApiHeader({ name: "If-Match", required: true, description: "Quoted Cart version, for example \"1\"." })
  @ApiOkResponse({
    type: CartDto,
    headers: {
      ETag: { description: "Quoted Cart version.", schema: { type: "string", example: '"2"' } },
      "Cache-Control": { description: "Cart responses are never cached.", schema: { type: "string", example: "no-store" } }
    }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    content: { "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } }
  })
  @ApiResponse({
    status: HttpStatus.PRECONDITION_REQUIRED,
    content: { "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } }
  })
  @ApiResponse({
    status: HttpStatus.PRECONDITION_FAILED,
    content: { "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } }
  })
  update(
    @Headers("cookie") cookieHeader: string | undefined,
    @Headers("if-match") ifMatch: string | undefined,
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
    @Body(createValidationPipe(UpdateCartItemDto)) input: UpdateCartItemDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<CartDto> {
    return this.cart.update(cookieHeader, ifMatch, itemId, input).then((cart) => {
      setCartHeaders(response, cart);
      return cart;
    });
  }

  @Delete("items/:itemId")
  @ApiCookieAuth("guest_session")
  @ApiOperation({ operationId: "cart_removeItem", summary: "Remove a current Cart Item" })
  @ApiParam({ name: "itemId", type: String, format: "uuid" })
  @ApiHeader({ name: "If-Match", required: true, description: "Quoted Cart version, for example \"1\"." })
  @ApiOkResponse({
    type: CartDto,
    headers: {
      ETag: { description: "Quoted Cart version.", schema: { type: "string", example: '"2"' } },
      "Cache-Control": { description: "Cart responses are never cached.", schema: { type: "string", example: "no-store" } }
    }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    content: { "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } }
  })
  @ApiResponse({
    status: HttpStatus.PRECONDITION_REQUIRED,
    content: { "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } }
  })
  @ApiResponse({
    status: HttpStatus.PRECONDITION_FAILED,
    content: { "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } }
  })
  remove(
    @Headers("cookie") cookieHeader: string | undefined,
    @Headers("if-match") ifMatch: string | undefined,
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
    @Res({ passthrough: true }) response: Response
  ): Promise<CartDto> {
    return this.cart.remove(cookieHeader, ifMatch, itemId).then((cart) => {
      setCartHeaders(response, cart);
      return cart;
    });
  }
}
