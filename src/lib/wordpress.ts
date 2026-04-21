/**
 * Shoshan Varod — WooCommerce REST API Integration
 *
 * Connects to WooCommerce via REST API (v3) with consumer key authentication.
 * Falls back to mock data if the API is unavailable or if no WC_URL is set.
 *
 * WooCommerce attribute mapping:
 *   - pa_marque  → brand
 *   - pa_taille  → size
 *   - pa_couleur → color
 *   - pa_matiere → material
 *   - pa_etat    → condition
 *
 * WooCommerce price mapping:
 *   - regular_price → originalPrice (prix neuf estimé)
 *   - sale_price    → price (prix friperie)
 *   - If no sale_price, price = regular_price
 */

import type { Product, Category } from './types';
import {
  products as mockProducts,
  categories as mockCategories,
  getProductBySlug as mockGetBySlug,
  getFeaturedProducts as mockGetFeatured,
  getAllAvailableProducts as mockGetAll,
  getRelatedProducts as mockGetRelated,
  getProductsByCategory as mockGetByCategory,
} from './mock-data';

// ----- Config -----

const WC_URL = import.meta.env.WC_URL ?? '';
const WC_KEY = import.meta.env.WC_CONSUMER_KEY ?? '';
const WC_SECRET = import.meta.env.WC_CONSUMER_SECRET ?? '';

const isConfigured = Boolean(WC_URL && WC_KEY && WC_SECRET);

// ----- WooCommerce Types -----

interface WCImage {
  id: number;
  src: string;
  name: string;
  alt: string;
}

interface WCCategory {
  id: number;
  name: string;
  slug: string;
}

interface WCAttribute {
  id: number;
  name: string;
  slug: string;
  options: string[];
}

interface WCProduct {
  id: number;
  name: string;
  slug: string;
  status: string;
  type: string;
  description: string;
  short_description: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  stock_status: string;
  stock_quantity: number | null;
  featured: boolean;
  categories: WCCategory[];
  tags: Array<{ id: number; name: string; slug: string }>;
  images: WCImage[];
  attributes: WCAttribute[];
  date_created: string;
  permalink: string;
}

interface WCCategoryFull {
  id: number;
  name: string;
  slug: string;
  parent: number;
  description: string;
  display: string;
  image: { src: string; alt: string } | null;
  count: number;
}

// ----- HTTP Helpers -----

async function wcFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
  if (!isConfigured) return null;

  const url = new URL(`${WC_URL}${endpoint}`);
  url.searchParams.set('consumer_key', WC_KEY);
  url.searchParams.set('consumer_secret', WC_SECRET);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      console.warn(`[WC] API error ${res.status}: ${endpoint}`);
      return null;
    }

    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[WC] Failed to fetch ${endpoint}:`, err);
    return null;
  }
}

// ----- Data Transformers -----

/** Extract the first value of a WooCommerce attribute by slug */
function getAttr(attrs: WCAttribute[], slug: string): string {
  const attr = attrs.find(a => a.slug === slug || a.slug === `pa_${slug}`);
  return attr?.options?.[0] ?? '';
}

/** Transform a WooCommerce product into our internal Product type */
function wcToProduct(wc: WCProduct): Product {
  const regularPrice = parseFloat(wc.regular_price) || 0;
  const salePrice = parseFloat(wc.sale_price) || 0;
  const finalPrice = salePrice > 0 ? salePrice : parseFloat(wc.price) || regularPrice;
  const originalPrice = regularPrice > finalPrice ? regularPrice : finalPrice;

  const mainCategory = wc.categories?.[0];
  const conditionRaw = getAttr(wc.attributes, 'etat');
  const condition = (['Excellent', 'Très bon', 'Bon'].includes(conditionRaw)
    ? conditionRaw
    : 'Bon') as Product['condition'];

  // Strip HTML tags from descriptions
  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim();

  return {
    id: wc.id,
    slug: wc.slug,
    name: wc.name,
    brand: getAttr(wc.attributes, 'marque') || 'Marque inconnue',
    category: mainCategory?.name ?? 'Non classé',
    categorySlug: mainCategory?.slug ?? 'non-classe',
    price: finalPrice,
    originalPrice: originalPrice,
    size: getAttr(wc.attributes, 'taille') || 'Unique',
    color: getAttr(wc.attributes, 'couleur') || '',
    material: getAttr(wc.attributes, 'matiere') || '',
    condition,
    description: stripHtml(wc.description),
    shortDescription: stripHtml(wc.short_description),
    images: wc.images.length > 0
      ? wc.images.map(img => img.src)
      : ['/images/placeholder.jpg'],
    isFeatured: wc.featured,
    isNew: isRecentProduct(wc.date_created),
    isSold: wc.stock_status === 'outofstock',
    tags: wc.tags.map(t => t.name),
    createdAt: wc.date_created,
  };
}

/** Check if a product was created in the last 14 days */
function isRecentProduct(dateStr: string): boolean {
  try {
    const created = new Date(dateStr);
    const diffDays = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 14;
  } catch {
    return false;
  }
}

/** Transform a WooCommerce category into our internal Category type */
function wcToCategory(wc: WCCategoryFull): Category {
  return {
    id: wc.id,
    slug: wc.slug,
    name: wc.name.replace(/&amp;/g, '&'),
    description: wc.description,
    image: wc.image?.src ?? '/images/placeholder.jpg',
    count: wc.count,
  };
}

// ----- Public API -----

/** Get all available (in-stock) products */
export async function getProducts(): Promise<Product[]> {
  const wcProducts = await wcFetch<WCProduct[]>('/products', {
    per_page: '100',
    status: 'publish',
    orderby: 'date',
    order: 'desc',
  });

  if (wcProducts && wcProducts.length > 0) {
    return wcProducts.map(wcToProduct);
  }

  return mockGetAll();
}

/** Get a single product by slug */
export async function getProduct(slug: string): Promise<Product | undefined> {
  const wcProducts = await wcFetch<WCProduct[]>('/products', {
    slug,
    status: 'publish',
  });

  if (wcProducts && wcProducts.length > 0) {
    return wcToProduct(wcProducts[0]);
  }

  return mockGetBySlug(slug);
}

/** Get featured products */
export async function getFeaturedProducts(): Promise<Product[]> {
  const wcProducts = await wcFetch<WCProduct[]>('/products', {
    featured: 'true',
    per_page: '8',
    status: 'publish',
  });

  if (wcProducts && wcProducts.length > 0) {
    return wcProducts.map(wcToProduct);
  }

  // S'il n'y a pas de produits "Mis en avant" (étoile) cochée dans WooCommerce,
  // ou qu'on n'en a pas trouvé, on renvoie simplement les derniers produits ajoutés.
  const allProducts = await getProducts();
  return allProducts.slice(0, 8);
}

/** Get products by category slug */
export async function getProductsByCategory(categorySlug: string): Promise<Product[]> {
  // First, get the category ID from its slug
  const categories = await wcFetch<WCCategoryFull[]>('/products/categories', {
    slug: categorySlug,
  });

  if (categories && categories.length > 0) {
    const catId = categories[0].id;
    const wcProducts = await wcFetch<WCProduct[]>('/products', {
      category: String(catId),
      per_page: '50',
      status: 'publish',
    });

    if (wcProducts) {
      return wcProducts.map(wcToProduct);
    }
  }

  return mockGetByCategory(categorySlug);
}

/** Get all product categories (excluding "Non classé") */
export async function getCategories(): Promise<Category[]> {
  const wcCategories = await wcFetch<WCCategoryFull[]>('/products/categories', {
    per_page: '50',
    orderby: 'name',
    order: 'asc',
  });

  if (wcCategories && wcCategories.length > 0) {
    return wcCategories
      .filter(c => c.slug !== 'non-classe')
      .map(wcToCategory);
  }

  return mockCategories;
}

/** Get related products (same category, exclude current) */
export async function getRelatedProducts(product: Product, limit = 4): Promise<Product[]> {
  const allInCategory = await getProductsByCategory(product.categorySlug);

  if (allInCategory.length > 0) {
    return allInCategory
      .filter(p => p.id !== product.id)
      .slice(0, limit);
  }

  return mockGetRelated(product, limit);
}

/** Get all product slugs (for static path generation) */
export async function getAllProductSlugs(): Promise<string[]> {
  const products = await getProducts();
  return products.map(p => p.slug);
}

/** Check if WooCommerce API is reachable */
export async function isWooCommerceConnected(): Promise<boolean> {
  if (!isConfigured) return false;
  try {
    const res = await wcFetch<any>('/products', { per_page: '1' });
    return res !== null;
  } catch {
    return false;
  }
}

/** Get all unique brands from products (for filter sidebar) */
export async function getAllBrands(): Promise<string[]> {
  const products = await getProducts();
  const brands = new Set(products.map(p => p.brand).filter(Boolean));
  return Array.from(brands).sort();
}
