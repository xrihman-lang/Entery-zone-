import React, { createContext, useContext, useState, useEffect } from 'react';

export interface Product {
  id: string;
  title: string;
  category: string;
  wholesalePrice: number;
  mrp: number;
  image: string;
  inStock: boolean;
  gstPercent: number;
}

const INITIAL_PRODUCTS: Product[] = [
  { id: 'p1', title: 'Haldiram Aloo Bhujia 1kg', category: 'Snacks & Namkeen', wholesalePrice: 180, mrp: 220, image: 'https://images.unsplash.com/photo-1604152135912-04a022e23696?auto=format&fit=crop&q=80&w=400&h=300', inStock: true, gstPercent: 12 },
  { id: 'p2', title: 'Britannia Good Day 600g', category: 'Biscuits & Bakery', wholesalePrice: 110, mrp: 140, image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&q=80&w=400&h=300', inStock: true, gstPercent: 18 },
  { id: 'p3', title: 'Coca Cola 2L Pet Drop', category: 'Beverages', wholesalePrice: 85, mrp: 100, image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&q=80&w=400&h=300', inStock: true, gstPercent: 28 },
  { id: 'p4', title: 'Lays Magic Masala Box (60pcs)', category: 'Snacks & Namkeen', wholesalePrice: 240, mrp: 300, image: 'https://images.unsplash.com/photo-1566478989037-eade3f71c1bd?auto=format&fit=crop&q=80&w=400&h=300', inStock: true, gstPercent: 12 },
  { id: 'p5', title: 'Parle-G Gold 1kg', category: 'Biscuits & Bakery', wholesalePrice: 135, mrp: 160, image: 'https://images.unsplash.com/photo-1590080874088-eec64895e423?auto=format&fit=crop&q=80&w=400&h=300', inStock: true, gstPercent: 18 },
  { id: 'p6', title: 'Frooti Mango Drink 1.2L (Pack of 6)', category: 'Beverages', wholesalePrice: 380, mrp: 450, image: 'https://images.unsplash.com/photo-1622543925917-763c34d1a86e?auto=format&fit=crop&q=80&w=400&h=300', inStock: true, gstPercent: 12 },
];

interface ProductsContextType {
  products: Product[];
  updateProduct: (id: string, updates: Partial<Product>) => void;
}

const ProductsContext = createContext<ProductsContextType | undefined>(undefined);

export function ProductsProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);

  const updateProduct = (id: string, updates: Partial<Product>) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  return (
    <ProductsContext.Provider value={{ products, updateProduct }}>
      {children}
    </ProductsContext.Provider>
  );
}

export function useProducts() {
  const context = useContext(ProductsContext);
  if (context === undefined) {
    throw new Error('useProducts must be used within a ProductsProvider');
  }
  return context;
}
