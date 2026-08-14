import { Controller, Get, HttpStatus, Inject, Injectable, Param, Query, Res } from "@nestjs/common";
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath
} from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import type { Prisma } from "@prisma/client";
import type { Response } from "express";

import { ProblemDetailsDto, ProblemException } from "../common/problem-details.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { createValidationPipe } from "../common/validation.js";

const PRODUCT_SORTS = ["newest", "price_asc", "price_desc"] as const;
const ARTICLE_TYPES = ["product", "news", "other"] as const;
const LOW_STOCK_THRESHOLD = 5;
const ARTICLE_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=86400";

type ProductSort = (typeof PRODUCT_SORTS)[number];
type ArticleQueryType = (typeof ARTICLE_TYPES)[number];
type ProductAvailability = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export class ProductListQueryDto {
  @ApiPropertyOptional({ type: String, description: "Case-insensitive search across product name and description.", maxLength: 100, example: "kopi" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ type: String, description: "Exact product category filter.", example: "coffee" })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  category?: string;

  @ApiPropertyOptional({ type: String, enum: PRODUCT_SORTS, default: "newest", example: "price_asc" })
  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort: ProductSort = "newest";

  @ApiPropertyOptional({ type: "integer", minimum: 1, default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ type: "integer", minimum: 1, maximum: 50, default: 20, example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 20;
}

export class ArticleListQueryDto {
  @ApiPropertyOptional({ type: String, enum: ARTICLE_TYPES, example: "news" })
  @IsOptional()
  @IsIn(ARTICLE_TYPES)
  type?: ArticleQueryType;

  @ApiPropertyOptional({ type: "integer", minimum: 1, default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ type: "integer", minimum: 1, maximum: 50, default: 20, example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 20;
}

export class MoneyDto {
  @ApiProperty({ type: "integer", minimum: 0, example: 85000 })
  amount!: number;

  @ApiProperty({ type: String, enum: ["IDR"], example: "IDR" })
  currency!: "IDR";
}

export class PriceRangeDto {
  @ApiProperty({ type: MoneyDto, example: { amount: 85000, currency: "IDR" } })
  min!: MoneyDto;

  @ApiProperty({ type: MoneyDto, example: { amount: 155000, currency: "IDR" } })
  max!: MoneyDto;
}

export class ProductVariantDto {
  @ApiProperty({ type: String, format: "uuid", example: "20000000-0000-4000-8000-000000000001" })
  id!: string;

  @ApiProperty({ type: String, example: "250 g" })
  optionLabel!: string;

  @ApiProperty({ type: MoneyDto, example: { amount: 85000, currency: "IDR" } })
  price!: MoneyDto;

  @ApiProperty({ type: "integer", minimum: 0, example: 12 })
  availableQuantity!: number;
}

export class ProductSummaryDto {
  @ApiProperty({ type: String, format: "uuid", example: "10000000-0000-4000-8000-000000000001" })
  id!: string;

  @ApiProperty({ type: String, example: "kopi-arabika-gayo" })
  slug!: string;

  @ApiProperty({ type: String, example: "Kopi Arabika Gayo" })
  name!: string;

  @ApiProperty({ type: String, example: "/images/products/kopi-arabika-gayo.webp" })
  thumbnail!: string;

  @ApiProperty({ type: PriceRangeDto, nullable: true, example: { min: { amount: 85000, currency: "IDR" }, max: { amount: 155000, currency: "IDR" } } })
  priceRange!: PriceRangeDto | null;

  @ApiProperty({ type: String, enum: ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"], example: "IN_STOCK" })
  availability!: ProductAvailability;
}

export class ProductDetailDto extends ProductSummaryDto {
  @ApiProperty({ type: String, example: "Biji kopi panggang medium untuk seduhan harian." })
  description!: string;

  @ApiProperty({ type: [String], example: ["/images/products/kopi-arabika-gayo.webp"] })
  images!: string[];

  @ApiProperty({ type: [ProductVariantDto] })
  variants!: ProductVariantDto[];
}

export class ArticleSummaryDto {
  @ApiProperty({ type: String, format: "uuid", example: "30000000-0000-4000-8000-000000000001" })
  id!: string;

  @ApiProperty({ type: String, example: "panduan-menyeduh-kopi" })
  slug!: string;

  @ApiProperty({ type: String, enum: ["PRODUCT", "NEWS", "OTHER"], example: "PRODUCT" })
  type!: "PRODUCT" | "NEWS" | "OTHER";

  @ApiProperty({ type: String, example: "Panduan Menyeduh Kopi di Rumah" })
  title!: string;

  @ApiProperty({ type: String, example: "Beberapa langkah sederhana untuk memulai seduhan kopi." })
  excerpt!: string;

  @ApiProperty({ type: String, example: "/images/articles/panduan-menyeduh-kopi.webp" })
  coverImage!: string;

  @ApiProperty({ type: String, format: "date-time", example: "2025-01-10T00:00:00.000Z" })
  publishedAt!: string;
}

export class ArticleDetailDto extends ArticleSummaryDto {
  @ApiProperty({ type: String, example: "<p>Gunakan air bersih dan takaran kopi yang konsisten.</p>" })
  contentHtml!: string;
}

export class PageInfoDto {
  @ApiProperty({ type: "integer", minimum: 1, example: 1 })
  page!: number;

  @ApiProperty({ type: "integer", minimum: 1, maximum: 50, example: 20 })
  pageSize!: number;

  @ApiProperty({ type: "integer", minimum: 0, example: 3 })
  totalItems!: number;

  @ApiProperty({ type: "integer", minimum: 0, example: 1 })
  totalPages!: number;
}

export class ProductCollectionDto {
  @ApiProperty({ type: [ProductSummaryDto] })
  items!: ProductSummaryDto[];

  @ApiProperty({ type: PageInfoDto })
  pageInfo!: PageInfoDto;
}

export class ArticleCollectionDto {
  @ApiProperty({ type: [ArticleSummaryDto] })
  items!: ArticleSummaryDto[];

  @ApiProperty({ type: PageInfoDto })
  pageInfo!: PageInfoDto;
}

const productSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  imagePaths: true,
  variants: {
    where: { isActive: true },
    orderBy: [{ price: "asc" }, { id: "asc" }],
    select: {
      id: true,
      optionLabel: true,
      price: true,
      currency: true,
      availableQuantity: true
    }
  }
} satisfies Prisma.ProductSelect;

type ProductRecord = Prisma.ProductGetPayload<{ select: typeof productSelect }>;

const articleSelect = {
  id: true,
  slug: true,
  type: true,
  title: true,
  excerpt: true,
  contentHtml: true,
  imagePath: true,
  publishedAt: true
} satisfies Prisma.ArticleSelect;

type ArticleRecord = Prisma.ArticleGetPayload<{ select: typeof articleSelect }>;

function money(amount: number): MoneyDto {
  return { amount, currency: "IDR" };
}

function priceRange(variants: ProductRecord["variants"]): PriceRangeDto | null {
  if (variants.length === 0) return null;
  return { min: money(variants[0].price), max: money(variants[variants.length - 1].price) };
}

function availability(variants: ProductRecord["variants"]): ProductAvailability {
  const quantity = variants.reduce((total, variant) => total + variant.availableQuantity, 0);
  if (quantity === 0) return "OUT_OF_STOCK";
  return quantity <= LOW_STOCK_THRESHOLD ? "LOW_STOCK" : "IN_STOCK";
}

function productSummary(product: ProductRecord): ProductSummaryDto {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    thumbnail: product.imagePaths[0],
    priceRange: priceRange(product.variants),
    availability: availability(product.variants)
  };
}

function productDetail(product: ProductRecord): ProductDetailDto {
  return {
    ...productSummary(product),
    description: product.description,
    images: product.imagePaths,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      optionLabel: variant.optionLabel,
      price: money(variant.price),
      availableQuantity: variant.availableQuantity
    }))
  };
}

function articleSummary(article: ArticleRecord): ArticleSummaryDto {
  return {
    id: article.id,
    slug: article.slug,
    type: article.type,
    title: article.title,
    excerpt: article.excerpt,
    coverImage: article.imagePath,
    publishedAt: article.publishedAt!.toISOString()
  };
}

function pageInfo(page: number, pageSize: number, totalItems: number): PageInfoDto {
  return { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) };
}

function compareProductsByPrice(left: ProductSummaryDto, right: ProductSummaryDto, descending: boolean): number {
  const leftPrice = left.priceRange?.min.amount;
  const rightPrice = right.priceRange?.min.amount;
  if (leftPrice === undefined && rightPrice !== undefined) return 1;
  if (rightPrice === undefined && leftPrice !== undefined) return -1;
  if (leftPrice === undefined || rightPrice === undefined) return left.id.localeCompare(right.id);
  return (descending ? rightPrice - leftPrice : leftPrice - rightPrice) || left.id.localeCompare(right.id);
}

@Injectable()
export class CatalogService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listProducts(query: ProductListQueryDto): Promise<ProductCollectionDto> {
    const search = query.search?.trim();
    const sort = query.sort ?? "newest";
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ProductWhereInput = { isActive: true };

    if (query.category) where.category = query.category;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } }
      ];
    }

    const products = await this.prisma.product.findMany({
      where,
      orderBy: sort === "newest" ? [{ createdAt: "desc" }, { id: "asc" }] : { id: "asc" },
      select: productSelect
    });
    const summaries = products.map(productSummary);

    // ponytail: price sorting stays in memory for the small seeded catalog; move the aggregate into SQL when catalog size requires it.
    if (sort === "price_asc") summaries.sort((left, right) => compareProductsByPrice(left, right, false));
    if (sort === "price_desc") summaries.sort((left, right) => compareProductsByPrice(left, right, true));

    const start = (page - 1) * pageSize;
    return {
      items: summaries.slice(start, start + pageSize),
      pageInfo: pageInfo(page, pageSize, summaries.length)
    };
  }

  async getProduct(slug: string): Promise<ProductDetailDto> {
    const product = await this.prisma.product.findFirst({ where: { slug, isActive: true }, select: productSelect });
    if (!product) {
      throw new ProblemException({ status: HttpStatus.NOT_FOUND, code: "PRODUCT_NOT_FOUND", detail: "The requested product was not found." });
    }
    return productDetail(product);
  }

  async listArticles(query: ArticleListQueryDto): Promise<ArticleCollectionDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ArticleWhereInput = { isPublished: true };
    if (query.type) where.type = query.type.toUpperCase() as Prisma.ArticleWhereInput["type"];

    const [totalItems, articles] = await Promise.all([
      this.prisma.article.count({ where }),
      this.prisma.article.findMany({
        where,
        orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: articleSelect
      })
    ]);

    return { items: articles.map(articleSummary), pageInfo: pageInfo(page, pageSize, totalItems) };
  }

  async getArticle(slug: string): Promise<ArticleDetailDto> {
    const article = await this.prisma.article.findFirst({ where: { slug, isPublished: true }, select: articleSelect });
    if (!article) {
      throw new ProblemException({ status: HttpStatus.NOT_FOUND, code: "ARTICLE_NOT_FOUND", detail: "The requested article was not found." });
    }
    return { ...articleSummary(article), contentHtml: article.contentHtml };
  }
}

@ApiExtraModels(ProblemDetailsDto, MoneyDto, PriceRangeDto, ProductVariantDto, ProductSummaryDto, ProductDetailDto, PageInfoDto, ProductCollectionDto)
@ApiTags("Products")
@Controller("products")
export class ProductsController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @Get()
  @ApiOperation({ operationId: "products_list", summary: "List active products" })
  @ApiQuery({ name: "search", required: false, type: String, description: "Case-insensitive search across product name and description.", example: "kopi" })
  @ApiQuery({ name: "category", required: false, type: String, description: "Exact product category filter.", example: "coffee" })
  @ApiQuery({ name: "sort", required: false, type: String, enum: PRODUCT_SORTS, example: "newest" })
  @ApiQuery({ name: "page", required: false, schema: { type: "integer", minimum: 1, example: 1 } })
  @ApiQuery({ name: "pageSize", required: false, schema: { type: "integer", minimum: 1, maximum: 50, example: 20 } })
  @ApiOkResponse({
    type: ProductCollectionDto,
    headers: {
      "Cache-Control": { description: "Product data is never cached.", schema: { type: "string", example: "no-store" } },
      "X-Request-Id": { description: "Request ID propagated by the API.", schema: { type: "string" } }
    }
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    content: { "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } }
  })
  list(@Query(createValidationPipe(ProductListQueryDto)) query: ProductListQueryDto, @Res({ passthrough: true }) response: Response): Promise<ProductCollectionDto> {
    response.setHeader("Cache-Control", "no-store");
    return this.catalog.listProducts(query);
  }

  @Get(":slug")
  @ApiOperation({ operationId: "products_getBySlug", summary: "Get an active product by slug" })
  @ApiParam({ name: "slug", type: String, example: "kopi-arabika-gayo" })
  @ApiOkResponse({
    type: ProductDetailDto,
    headers: {
      "Cache-Control": { description: "Product data is never cached.", schema: { type: "string", example: "no-store" } },
      "X-Request-Id": { description: "Request ID propagated by the API.", schema: { type: "string" } }
    }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Product was not found or is inactive.",
    content: { "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } }
  })
  get(@Param("slug") slug: string, @Res({ passthrough: true }) response: Response): Promise<ProductDetailDto> {
    response.setHeader("Cache-Control", "no-store");
    return this.catalog.getProduct(slug);
  }
}

@ApiExtraModels(ProblemDetailsDto, ArticleSummaryDto, ArticleDetailDto, PageInfoDto, ArticleCollectionDto)
@ApiTags("Articles")
@Controller("articles")
export class ArticlesController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @Get()
  @ApiOperation({ operationId: "articles_list", summary: "List published articles" })
  @ApiQuery({ name: "type", required: false, type: String, enum: ARTICLE_TYPES, example: "news" })
  @ApiQuery({ name: "page", required: false, schema: { type: "integer", minimum: 1, example: 1 } })
  @ApiQuery({ name: "pageSize", required: false, schema: { type: "integer", minimum: 1, maximum: 50, example: 20 } })
  @ApiOkResponse({
    type: ArticleCollectionDto,
    headers: {
      "Cache-Control": { description: "Published article cache policy.", schema: { type: "string", example: ARTICLE_CACHE_CONTROL } },
      "X-Request-Id": { description: "Request ID propagated by the API.", schema: { type: "string" } }
    }
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    content: { "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } }
  })
  list(@Query(createValidationPipe(ArticleListQueryDto)) query: ArticleListQueryDto, @Res({ passthrough: true }) response: Response): Promise<ArticleCollectionDto> {
    response.setHeader("Cache-Control", ARTICLE_CACHE_CONTROL);
    return this.catalog.listArticles(query);
  }

  @Get(":slug")
  @ApiOperation({ operationId: "articles_getBySlug", summary: "Get a published article by slug" })
  @ApiParam({ name: "slug", type: String, example: "panduan-menyeduh-kopi" })
  @ApiOkResponse({
    type: ArticleDetailDto,
    headers: {
      "Cache-Control": { description: "Published article cache policy.", schema: { type: "string", example: ARTICLE_CACHE_CONTROL } },
      "X-Request-Id": { description: "Request ID propagated by the API.", schema: { type: "string" } }
    }
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Article was not found or is unpublished.",
    content: { "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } }
  })
  get(@Param("slug") slug: string, @Res({ passthrough: true }) response: Response): Promise<ArticleDetailDto> {
    response.setHeader("Cache-Control", ARTICLE_CACHE_CONTROL);
    return this.catalog.getArticle(slug);
  }
}
