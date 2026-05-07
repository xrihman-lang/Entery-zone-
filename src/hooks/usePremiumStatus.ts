import React, { useState, useEffect } from 'react';
import { getFirebase, OperationType } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';

interface SubscriptionData {
  isPremium: boolean;
  expiryDate: any;
}

export const usePremiumStatus = (user: FirebaseUser | null) => {
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsPremium(false);
      setLoading(false);
      return;
    }

    const fetchPremiumStatus = async () => {
      try {
        const { db } = await getFirebase();
        if (!db) {
          setLoading(false);
          return;
        }

        const userRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(userRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.isPremium && data.expiryDate) {
            const expiry = data.expiryDate.toDate ? data.expiryDate.toDate() : new Date(data.expiryDate);
            if (expiry > new Date()) {
              setIsPremium(true);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching premium status', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPremiumStatus();
  }, [user]);

  return { isPremium, loading };
};
