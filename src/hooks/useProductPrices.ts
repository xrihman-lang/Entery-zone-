import { useState, useEffect } from "react";
import { collection, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { getFirebase } from "../lib/firebase";

// Global in-memory cache to prevent multiple fetches across components
let globalProductPrices: Record<string, { MRP: number, Normal: number, Reddi: number }> | null = null;
let globalProductNames: string[] = [];

export function useProductPrices(user: any) {
  const [productPrices, setProductPrices] = useState<Record<string, { MRP: number, Normal: number, Reddi: number }>>(globalProductPrices || {});
  const [productNames, setProductNames] = useState<string[]>(globalProductNames || []);

  useEffect(() => {
    if (!user) return;
    if (globalProductPrices) return; // Already fetched
    
    let isMounted = true;
    const fetchPrices = async () => {
      try {
        const { db } = await getFirebase();
        if (!db) return;

        const newProductMap: Record<string, { prices: { MRP: number, Normal: number, Reddi: number }, date: number }> = {};

        // Fetch from entries (Limit to recent 200 to save reads)
        const qEntries = query(
          collection(db, "entries"), 
          where("userId", "==", user.uid)
        );
        const snapEntries = await getDocs(qEntries);
        snapEntries.forEach((doc) => {
          const data = doc.data();
          const name = data.customerName; 
          const amt = parseFloat(data.totalAmount);
          const date = data.createdAt?.toMillis?.() || new Date(data.date).getTime() || 0;
          if (name && !isNaN(amt) && amt > 0) {
            if (!newProductMap[name] || newProductMap[name].date < date) {
               newProductMap[name] = { 
                 prices: { MRP: amt, Normal: amt, Reddi: amt }, 
                 date 
               };
            }
          }
        });

        // Fetch from invoices items array (Limit to recent 200 to save reads)
        const qInvoices = query(
           collection(db, "invoices"), 
           where("userId", "==", user.uid)
        );
        const snapInvoices = await getDocs(qInvoices);
        snapInvoices.forEach((doc) => {
          const data = doc.data();
          const items = data.items || [];
          const date = data.createdAt?.toMillis?.() || new Date(data.invoiceDate).getTime() || 0;
          items.forEach((item: any) => {
             const name = item.name;
             const rate = parseFloat(item.rate);
             if (name && !isNaN(rate) && rate > 0) {
               if (!newProductMap[name] || newProductMap[name].date < date) {
                 const existing = newProductMap[name]?.prices || { MRP: rate, Normal: rate * 0.9, Reddi: rate * 0.8 };
                 newProductMap[name] = { 
                   prices: existing, 
                   date 
                 };
               }
             }
          });
        });

        // Fetch from stock
        const qStock = query(collection(db, "stock"), where("userId", "==", user.uid));
        const snapStock = await getDocs(qStock);
        snapStock.forEach((doc) => {
          const name = doc.data().name;
          if (name && !newProductMap[name]) {
            newProductMap[name] = {
              prices: { MRP: 0, Normal: 0, Reddi: 0 },
              date: 0
            };
          }
        });

        if (isMounted) {
          const finalMap: Record<string, { MRP: number, Normal: number, Reddi: number }> = {};
          for (const [key, val] of Object.entries(newProductMap)) {
            finalMap[key] = val.prices;
          }
          globalProductPrices = finalMap;
          globalProductNames = Object.keys(finalMap).sort();
          setProductPrices(globalProductPrices);
          setProductNames(globalProductNames);
        }
      } catch (error) {
        console.error("Error fetching product prices:", error);
      }
    };

    fetchPrices();
    return () => {
      isMounted = false;
    };
  }, [user]);

  return { productPrices, productNames };
}
