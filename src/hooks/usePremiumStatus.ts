import React, { useState, useEffect } from 'react';
import { getFirebase } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';

export const usePremiumStatus = (user: FirebaseUser | null) => {
  const [isPremium, setIsPremium] = useState(false);
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsPremium(false);
      setExpiryDate(null);
      setPlanName(null);
      setLoading(false);
      return;
    }

    let unsubscribe: () => void;

    const setupListener = async () => {
      try {
        const { db } = await getFirebase();
        if (!db) {
          setLoading(false);
          return;
        }

        const userRef = doc(db, 'users', user.uid);
        
        unsubscribe = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.isPremium && data.expiryDate) {
              const expiry = data.expiryDate.toDate ? data.expiryDate.toDate() : new Date(data.expiryDate);
              setExpiryDate(expiry);
              setPlanName(data.planName || 'Basic');
              if (expiry > new Date()) {
                setIsPremium(true);
              } else {
                setIsPremium(false);
              }
            } else {
              setIsPremium(false);
              setExpiryDate(null);
              setPlanName(null);
            }
          } else {
            setIsPremium(false);
            setExpiryDate(null);
            setPlanName(null);
          }
          setLoading(false);
        }, (error) => {
          console.error('Error fetching premium status', error);
          setLoading(false);
        });
      } catch (error) {
        console.error('Error in setupListener', error);
        setLoading(false);
      }
    };

    setupListener();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

  return { isPremium, expiryDate, planName, loading };
};
