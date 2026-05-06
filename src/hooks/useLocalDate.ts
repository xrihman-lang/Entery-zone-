import { useState, useEffect } from 'react';

export function getLocalDateString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function useLocalDate() {
  const [localDate, setLocalDate] = useState(getLocalDateString());

  useEffect(() => {
    // Check every minute if the date has changed (midnight rollover)
    const interval = setInterval(() => {
      const newDate = getLocalDateString();
      if (newDate !== localDate) {
        setLocalDate(newDate);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [localDate]);

  return localDate;
}
