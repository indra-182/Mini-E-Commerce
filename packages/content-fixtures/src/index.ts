export type ProductVariantFixture = {
  id: string;
  sku: string;
  optionLabel: string;
  price: number;
  currency: "IDR";
  availableQuantity: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductFixture = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  imagePaths: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  variants: ProductVariantFixture[];
};

export type ArticleFixture = {
  id: string;
  slug: string;
  type: "PRODUCT" | "NEWS" | "OTHER";
  title: string;
  excerpt: string;
  contentHtml: string;
  imagePath: string;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const productFixtures = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    slug: "kopi-arabika-gayo",
    name: "Kopi Arabika Gayo",
    description: "Biji kopi panggang medium untuk seduhan harian.",
    category: "coffee",
    imagePaths: ["/images/products/kopi-arabika-gayo.webp"],
    isActive: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    variants: [
      {
        id: "20000000-0000-4000-8000-000000000001",
        sku: "KOPI-GAYO-250G",
        optionLabel: "250 g",
        price: 85000,
        currency: "IDR",
        availableQuantity: 12,
        isActive: true,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z"
      },
      {
        id: "20000000-0000-4000-8000-000000000002",
        sku: "KOPI-GAYO-500G",
        optionLabel: "500 g",
        price: 155000,
        currency: "IDR",
        availableQuantity: 7,
        isActive: true,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z"
      }
    ]
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    slug: "teh-hijau-melati",
    name: "Teh Hijau Melati",
    description: "Teh hijau dengan aroma melati yang ringan.",
    category: "tea",
    imagePaths: ["/images/products/teh-hijau-melati.webp"],
    isActive: true,
    createdAt: "2025-01-02T00:00:00.000Z",
    updatedAt: "2025-01-02T00:00:00.000Z",
    variants: [
      {
        id: "20000000-0000-4000-8000-000000000003",
        sku: "TEH-MELATI-25S",
        optionLabel: "25 kantong",
        price: 42000,
        currency: "IDR",
        availableQuantity: 20,
        isActive: true,
        createdAt: "2025-01-02T00:00:00.000Z",
        updatedAt: "2025-01-02T00:00:00.000Z"
      }
    ]
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    slug: "botol-minum-stainless",
    name: "Botol Minum Stainless",
    description: "Botol minum tahan lama untuk dibawa sehari-hari.",
    category: "lifestyle",
    imagePaths: ["/images/products/botol-minum-stainless.webp"],
    isActive: true,
    createdAt: "2025-01-03T00:00:00.000Z",
    updatedAt: "2025-01-03T00:00:00.000Z",
    variants: [
      {
        id: "20000000-0000-4000-8000-000000000004",
        sku: "BOTOL-SS-500ML",
        optionLabel: "500 ml",
        price: 125000,
        currency: "IDR",
        availableQuantity: 0,
        isActive: true,
        createdAt: "2025-01-03T00:00:00.000Z",
        updatedAt: "2025-01-03T00:00:00.000Z"
      }
    ]
  }
] satisfies ProductFixture[];

export const articleFixtures = [
  {
    id: "30000000-0000-4000-8000-000000000001",
    slug: "panduan-menyeduh-kopi",
    type: "PRODUCT",
    title: "Panduan Menyeduh Kopi di Rumah",
    excerpt: "Beberapa langkah sederhana untuk memulai seduhan kopi.",
    contentHtml:
      "<p>Gunakan air bersih dan takaran kopi yang konsisten untuk memulai.</p><h2>Mulai dari yang sederhana</h2><p>Catat rasio dan waktu seduh agar mudah mengulang hasil yang disukai.</p>",
    imagePath: "/images/articles/panduan-menyeduh-kopi.webp",
    isPublished: true,
    publishedAt: "2025-01-10T00:00:00.000Z",
    createdAt: "2025-01-10T00:00:00.000Z",
    updatedAt: "2025-01-10T00:00:00.000Z"
  },
  {
    id: "30000000-0000-4000-8000-000000000002",
    slug: "berita-toko-minggu-ini",
    type: "NEWS",
    title: "Berita Toko Minggu Ini",
    excerpt: "Ringkasan pembaruan katalog dan jadwal pengiriman.",
    contentHtml:
      "<p>Katalog diperbarui secara berkala untuk menjaga pilihan tetap ringkas dan mudah dijelajahi.</p>",
    imagePath: "/images/articles/berita-toko-minggu-ini.webp",
    isPublished: true,
    publishedAt: "2025-01-09T00:00:00.000Z",
    createdAt: "2025-01-09T00:00:00.000Z",
    updatedAt: "2025-01-09T00:00:00.000Z"
  },
  {
    id: "30000000-0000-4000-8000-000000000003",
    slug: "tentang-pengiriman-reguler",
    type: "OTHER",
    title: "Tentang Pengiriman Reguler",
    excerpt: "Informasi singkat tentang pilihan pengiriman MVP.",
    contentHtml:
      "<p>Pesanan MVP menggunakan satu pilihan pengiriman reguler dengan biaya tetap.</p>",
    imagePath: "/images/articles/tentang-pengiriman-reguler.webp",
    isPublished: true,
    publishedAt: "2025-01-08T00:00:00.000Z",
    createdAt: "2025-01-08T00:00:00.000Z",
    updatedAt: "2025-01-08T00:00:00.000Z"
  }
] satisfies ArticleFixture[];
