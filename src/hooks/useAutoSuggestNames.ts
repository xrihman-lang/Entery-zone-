import { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { getFirebase } from "../lib/firebase";

export function useAutoSuggestNames(user: any) {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    
    let isMounted = true;
    const fetchNames = async () => {
      try {
        const { db } = await getFirebase();
        if (!db) return;

        const uniqueNames = new Set<string>();

        // Fetch from entries
        const qEntries = query(collection(db, "entries"), where("userId", "==", user.uid));
        const snapEntries = await getDocs(qEntries);
        snapEntries.forEach((doc) => {
          const name = doc.data().customerName;
          if (name) uniqueNames.add(name);
        });

        // Fetch from invoices
        const qInvoices = query(collection(db, "invoices"), where("userId", "==", user.uid));
        const snapInvoices = await getDocs(qInvoices);
        snapInvoices.forEach((doc) => {
          const name = doc.data().customerName;
          if (name) uniqueNames.add(name);
        });

        if (isMounted) {
          setNames(Array.from(uniqueNames).sort());
        }
      } catch (error) {
        console.error("Error fetching auto-suggest names:", error);
      }
    };

    fetchNames();
    return () => {
      isMounted = false;
    };
  }, [user]);

  return names;
}
