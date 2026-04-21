/**
 * Shoshan Varod — TypeScript Types
 * Types pour les produits, catégories, et données e-commerce
 */

// ----- Product Types -----

export type ProductCondition = 'Excellent' | 'Très bon' | 'Bon';

export interface Product {
  id: number;
  slug: string;
  name: string;
  brand: string;
  category: string;
  categorySlug: string;
  price: number;
  originalPrice: number;
  size: string;
  color: string;
  material: string;
  condition: ProductCondition;
  description: string;
  shortDescription: string;
  images: string[];
  isFeatured: boolean;
  isNew: boolean;
  isSold: boolean;
  tags: string[];
  createdAt: string;
}

// ----- Category Types -----

export interface Category {
  id: number;
  slug: string;
  name: string;
  description: string;
  image: string;
  count: number;
}

// ----- Brand Types -----

export interface Brand {
  name: string;
  slug: string;
}

// ----- Cart Types -----

export interface CartItem {
  productId: number;
  slug: string;
  name: string;
  brand: string;
  price: number;
  size: string;
  image: string;
}

// ----- Reservation / Contact Types -----

export interface ReservationForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
  items: CartItem[];
}

// ----- WordPress REST API Types -----

export interface WPProduct {
  id: number;
  slug: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  featured_media: number;
  acf?: {
    brand: string;
    original_price: number;
    size: string;
    color: string;
    material: string;
    condition: string;
  };
  _embedded?: {
    'wp:featuredmedia'?: Array<{ source_url: string; alt_text: string }>;
    'wp:term'?: Array<Array<{ id: number; name: string; slug: string }>>;
  };
}

export interface WPCategory {
  id: number;
  slug: string;
  name: string;
  description: string;
  count: number;
  acf?: {
    image: string;
  };
}

export interface WPMedia {
  id: number;
  source_url: string;
  alt_text: string;
  media_details: { width: number; height: number };
}
