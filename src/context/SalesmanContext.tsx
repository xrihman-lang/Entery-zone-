import React, { createContext, useContext, useState, useEffect } from 'react';

export interface Salesman {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface SalesmanContextType {
  salesmen: Salesman[];
  addSalesman: (salesman: Omit<Salesman, 'id'>) => void;
  removeSalesman: (id: string) => void;
  activeSalesman: Salesman | null;
  setActiveSalesman: (salesman: Salesman | null) => void;
}

const INITIAL_SALESMEN: Salesman[] = [
  { id: 's1', name: 'Raju Salesman' },
  { id: 's2', name: 'Vikram Singh' }
];

const SalesmanContext = createContext<SalesmanContextType | undefined>(undefined);

export function SalesmanProvider({ children }: { children: React.ReactNode }) {
  const [salesmen, setSalesmen] = useState<Salesman[]>(INITIAL_SALESMEN);
  const [activeSalesman, setActiveSalesman] = useState<Salesman | null>(null);

  const addSalesman = (salesman: Omit<Salesman, 'id'>) => {
    const newSalesman = {
      ...salesman,
      id: Date.now().toString()
    };
    setSalesmen(prev => [...prev, newSalesman]);
  };

  const removeSalesman = (id: string) => {
    setSalesmen(prev => prev.filter(s => s.id !== id));
    if (activeSalesman?.id === id) {
      setActiveSalesman(null);
    }
  };

  return (
    <SalesmanContext.Provider value={{ salesmen, addSalesman, removeSalesman, activeSalesman, setActiveSalesman }}>
      {children}
    </SalesmanContext.Provider>
  );
}

export function useSalesmen() {
  const context = useContext(SalesmanContext);
  if (context === undefined) {
    throw new Error('useSalesmen must be used within a SalesmanProvider');
  }
  return context;
}
