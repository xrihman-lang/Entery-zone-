import { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { getFirebase } from "../lib/firebase";

export function useProductPrices(user: any) {
  // Map of itemName to its latest price
  const [productPrices, setProductPrices] = useState<Record<string, number>>({});
  const [productNames, setProductNames] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    
    let isMounted = true;
    const fetchPrices = async () => {
      try {
        const { db } = await getFirebase();
        if (!db) return;

        const newProductMap: Record<string, { price: number, date: number }> = {};

        // Fetch from entries where Customer Name is treated as Item Name and Total Amount as price
        const qEntries = query(collection(db, "entries"), where("userId", "==", user.uid));
        const snapEntries = await getDocs(qEntries);
        snapEntries.forEach((doc) => {
          const data = doc.data();
          const name = data.customerName; // used as item name
          const amt = parseFloat(data.totalAmount);
          const date = data.createdAt?.toMillis?.() || new Date(data.date).getTime() || 0;
          if (name && !isNaN(amt) && amt > 0) {
            if (!newProductMap[name] || newProductMap[name].date < date) {
               newProductMap[name] = { price: amt, date };
            }
          }
        });

        // Fetch from invoices items array
        const qInvoices = query(collection(db, "invoices"), where("userId", "==", user.uid));
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
                 newProductMap[name] = { price: rate, date };
               }
             }
          });
        });

        if (isMounted) {
          const finalMap: Record<string, number> = {};
          for (const [key, val] of Object.entries(newProductMap)) {
            finalMap[key] = val.price;
          }
          setProductPrices(finalMap);
          setProductNames(Object.keys(finalMap).sort());
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
