import React, { createContext, useContext, useState } from 'react';

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  type: 'diya' | 'liya';
  note: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  creditLimit: number;
  transactions: Transaction[];
}

interface CustomerContextType {
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  updateCreditLimit: (id: string, limit: number) => void;
}

const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'c1',
    name: 'Ramesh Kumar',
    phone: '9876543210',
    creditLimit: 10000,
    transactions: [
      { id: 't1', date: new Date().toISOString(), amount: 5000, type: 'diya', note: 'Groceries' },
    ]
  },
  {
    id: 'c2',
    name: 'Suresh Traders',
    phone: '8765432109',
    creditLimit: 20000,
    transactions: [
      { id: 't2', date: new Date().toISOString(), amount: 12000, type: 'diya', note: 'Wholesale items' },
      { id: 't3', date: new Date().toISOString(), amount: 2000, type: 'liya', note: 'Cash payment' },
    ]
  }
];

const CustomerContext = createContext<CustomerContextType | undefined>(undefined);

export function CustomerProvider({ children }: { children: React.ReactNode }) {
  const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS);

  const updateCreditLimit = (id: string, limit: number) => {
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, creditLimit: limit } : c));
  };

  return (
    <CustomerContext.Provider value={{ customers, setCustomers, updateCreditLimit }}>
      {children}
    </CustomerContext.Provider>
  );
}

export function useCustomers() {
  const context = useContext(CustomerContext);
  if (context === undefined) {
    throw new Error('useCustomers must be used within a CustomerProvider');
  }
  return context;
}
