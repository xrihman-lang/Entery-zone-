/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Printer, Trash2, Save, X, LogOut, User, Pencil, FileDown, Star, MessageCircle, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  onAuthStateChanged, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  getDocs,
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  orderBy,
  setDoc,
  writeBatch,
  increment
} from 'firebase/firestore';
import { getFirebase } from './lib/firebase';
import LoginPage from './components/LoginPage';
import InvoiceGenerator from './components/InvoiceGenerator';
import InvoiceHistory from './components/InvoiceHistory';
import { StockManager } from './components/StockManager';
import { Logo } from './components/Logo';
import { useProductPrices } from './hooks/useProductPrices';
import { useLocalDate, getLocalDateString } from './hooks/useLocalDate';

// --- Error Handling Utility ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

async function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const { auth } = await getFirebase();
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
// -----------------------------

interface Entry {
  id: string;
  date: string;
  customerName: string;
  type: 'S' | 'O' | 'V' | 'K' | 'D' | 'SU' | 'OM';
  rateType: 'MRP' | 'Normal' | 'Reddi';
  quantity: number;
  rate: number;
  totalAmount: number;
  receivedAmount: number;
  pendingAmount: number;
  createdAt?: any;
}

export default function App() {
  const localDate = useLocalDate();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [localMode, setLocalMode] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeTab, setActiveTab] = useState<'standard' | 'vrs' | 'invoice' | 'history' | 'stock'>('standard');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Use dynamically updated localDate instead of static initialization
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterFromDate, setFilterFromDate] = useState(getLocalDateString()); // Defaults to today
  const [filterToDate, setFilterToDate] = useState(getLocalDateString());     // Defaults to today
  
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const prevLocalDate = React.useRef(localDate);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [bulkPreview, setBulkPreview] = useState<Entry[]>([]);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' }[]>([]);
  const [supportName, setSupportName] = useState('');
  const customerInputRef = React.useRef<HTMLInputElement>(null);
  const [supportMessage, setSupportMessage] = useState('');
  const [supportSaving, setSupportSaving] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const handleSupportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportName || !supportMessage) {
      alert("Please fill all fields.");
      return;
    }
    setSupportSaving(true);
    try {
      const { db } = await getFirebase();
      if (!db) throw new Error('Database not connected');
      await addDoc(collection(db, 'support_tickets'), {
        userId: user?.uid || null,
        userEmail: user?.email || null,
        name: supportName,
        message: supportMessage,
        createdAt: serverTimestamp(),
      });
      showToast('Support ticket submitted!');
      setSupportName('');
      setSupportMessage('');
      setIsSupportOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'support_tickets');
    } finally {
      setSupportSaving(false);
    }
  };
  
  const [formData, setFormData] = useState({
    date: getLocalDateString(),
    customerName: '',
    type: 'S' as 'S' | 'O' | 'V' | 'K' | 'D' | 'SU' | 'OM',
    quantity: '1',
    totalAmount: '',
    receivedAmount: '',
  });

  // Sync dates at midnight (auto-refresh)
  useEffect(() => {
    if (prevLocalDate.current !== localDate) {
      setFormData(prev => {
        // Only auto-update the date if it was still set to the old 'today'
        if (prev.date === prevLocalDate.current) {
          return { ...prev, date: localDate };
        }
        return prev;
      });
      // also update filter if it was set to old today
      setFilterFromDate(f => f === prevLocalDate.current ? localDate : f);
      setFilterToDate(f => f === prevLocalDate.current ? localDate : f);
      
      prevLocalDate.current = localDate;
    }
  }, [localDate]);

  const { productPrices, productNames } = useProductPrices(user);

  // Handle Auth State
  useEffect(() => {
    let unsubscribe: any;
    const setupAuth = async () => {
      try {
        const { auth } = await getFirebase();
        if (!auth) {
          console.warn("Auth not available - running in local mode");
          setAuthLoading(false);
          // Load local entries if no cloud user
          const saved = localStorage.getItem('daybook_entries_local');
          if (saved) setEntries(JSON.parse(saved));
          return;
        }
        unsubscribe = onAuthStateChanged(auth, (u) => {
          setUser(u);
          setAuthLoading(false);
        });
      } catch (err) {
        console.error("Auth setup error:", err);
        setAuthLoading(false);
      }
    };
    setupAuth();
    return () => unsubscribe && unsubscribe();
  }, []);

  // Handle Local Storage for Guest Mode
  useEffect(() => {
    if (!user && !authLoading) {
      localStorage.setItem('daybook_entries_local', JSON.stringify(entries));
    }
  }, [entries, user, authLoading]);

  // Sync with Firestore (Optimized: No real-time listeners for all data)
  useEffect(() => {
    if (!user) return;

    const syncData = async () => {
      const { db } = await getFirebase();
      if (!db) return;

      let from = filterFromDate;
      let to = filterToDate;

      // If no explicit dates are set, fallback to month/year range
      if (!from && !to && filterMonth !== 0) {
         const firstDay = new Date(filterYear, filterMonth - 1, 1);
         const lastDay = new Date(filterYear, filterMonth, 0);
         from = new Date(firstDay.getTime() - (firstDay.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
         to = new Date(lastDay.getTime() - (lastDay.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
      }

      let q = query(collection(db, 'entries'), where('userId', '==', user.uid));
      
      try {
        const snapshot = await getDocs(q);
        let docs = snapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id,
        })) as Entry[];

        // Perform date filtering locally since composite indexes aren't created by default
        if (from) docs = docs.filter(doc => doc.date >= from!);
        if (to) docs = docs.filter(doc => doc.date <= to!);

        docs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        setEntries(docs);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'entries');
      }
    };

    syncData();
  }, [user, filterFromDate, filterToDate, filterMonth, filterYear, refreshTrigger]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Auto-sync the table filter with the form date!
    if (name === 'date') {
      setFilterFromDate(value);
      setFilterToDate(value);
    }
  };

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customerName || !formData.totalAmount) return;

    const total = parseFloat(formData.totalAmount || '0');
    const received = parseFloat(formData.receivedAmount || '0');
    const qty = parseFloat(formData.quantity || '0');
    
    // IF NOT LOGGED IN / NO DB - USE LOCAL
    if (!user) {
      const newEntry: Entry = {
        id: crypto.randomUUID(),
        date: formData.date,
        customerName: formData.customerName,
        type: formData.type,
        rateType: 'Normal',
        quantity: qty,
        rate: qty > 0 ? total / qty : 0,
        totalAmount: total,
        receivedAmount: received,
        pendingAmount: total - received,
      };
      
      if (editingId) {
        setEntries(prev => prev.map(e => e.id === editingId ? newEntry : e));
        setEditingId(null);
        showToast('Entry updated!');
      } else {
        setEntries(prev => [newEntry, ...prev]);
        showToast('Entry saved!');
        // Auto-switch tab if added to the other one
        if (formData.type === 'V' && activeTab === 'standard') setActiveTab('vrs');
        if (formData.type !== 'V' && activeTab === 'vrs') setActiveTab('standard');
      }

      setFormData({
        date: formData.date, // keep date for next entry
        customerName: '',
        type: formData.type,
        totalAmount: '',
        receivedAmount: '',
        quantity: '1',
      });
      setRefreshTrigger(prev => prev + 1);
      customerInputRef.current?.focus();
      return;
    }

    try {
      const { db } = await getFirebase();
      if (!db) throw new Error('Database not connected');

      if (editingId) {
        const entryRef = doc(db, 'entries', editingId);
        await updateDoc(entryRef, {
          date: formData.date,
          customerName: formData.customerName,
          type: formData.type,
          quantity: qty,
          rate: qty > 0 ? total / qty : 0,
          totalAmount: total,
          receivedAmount: received,
          pendingAmount: total - received,
          updatedAt: serverTimestamp(),
        } as any).catch(err => handleFirestoreError(err, OperationType.UPDATE, `entries/${editingId}`));
        
        setEditingId(null);
        showToast('Entry updated!');
      } else {
        const entryId = crypto.randomUUID();
        const entryData = {
          id: entryId,
          date: formData.date,
          customerName: formData.customerName,
          type: formData.type,
          quantity: qty,
          rate: qty > 0 ? total / qty : 0,
          totalAmount: total,
          receivedAmount: received,
          pendingAmount: total - received,
          userId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        const qStock = query(collection(db, 'stock'), where('userId', '==', user.uid), where('name', '==', formData.customerName));
        const stockSnap = await getDocs(qStock);

        if (!stockSnap.empty && qty > 0 && formData.type === 'S') { // Deduct only for sales
           const batch = writeBatch(db);
           const entryRef = doc(db, 'entries', entryId);
           batch.set(entryRef, entryData);
           
           stockSnap.forEach(stockDoc => {
             batch.update(stockDoc.ref, {
               totalPieces: increment(-qty),
               soldPieces: increment(qty),
               updatedAt: serverTimestamp()
             });
           });
           
           await batch.commit().catch(err => handleFirestoreError(err, OperationType.CREATE, `entries/${entryId}`));
        } else {
           await setDoc(doc(db, 'entries', entryId), entryData)
             .catch(err => handleFirestoreError(err, OperationType.CREATE, `entries/${entryId}`));
        }
        
        showToast('Entry saved!');
        // Auto-switch tab if added to the other one
        if (formData.type === 'V' && activeTab === 'standard') setActiveTab('vrs');
        if (formData.type !== 'V' && activeTab === 'vrs') setActiveTab('standard');
      }

      setFormData({
        date: formData.date, // keep date for next entry
        customerName: '',
        type: formData.type,
        totalAmount: '',
        receivedAmount: '',
        quantity: '1',
      });
      setRefreshTrigger(prev => prev + 1);
      customerInputRef.current?.focus();
    } catch (err) {
      showToast('Error saving entry', 'error');
      console.error(err);
    }
  };

  const startEdit = (entry: Entry) => {
    setEditingId(entry.id);
    setFormData({
      date: entry.date,
      customerName: entry.customerName,
      type: entry.type,
      quantity: (entry.quantity || 1).toString(),
      totalAmount: entry.totalAmount.toString(),
      receivedAmount: entry.receivedAmount.toString(),
    });
    // Ensure we are on the right tab to see it
    if (entry.type === 'V') setActiveTab('vrs');
    else setActiveTab('standard');
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({
      date: getLocalDateString(),
      customerName: '',
      type: 'S',
      quantity: '1',
      totalAmount: '',
      receivedAmount: '',
    });
  };

  const deleteEntry = async (id: string) => {
    if (!user) {
      setEntries(prev => prev.filter(e => e.id !== id));
      showToast('Entry deleted');
      return;
    }
    try {
      const { db } = await getFirebase();
      if (!db) return;
      await deleteDoc(doc(db, 'entries', id))
        .catch(err => handleFirestoreError(err, OperationType.DELETE, `entries/${id}`));
      showToast('Entry deleted');
    } catch (err) {
      showToast('Error deleting entry', 'error');
      console.error(err);
    }
  };

  const processBulkData = () => {
    if (!bulkInput.trim()) return;
    const lines = bulkInput.trim().split('\n');
    const processed: Entry[] = [];

    lines.forEach(line => {
      // Split by tab (Excel/Google Sheets standard) or comma
      const columns = line.split(/\t|,/);
      if (columns.length < 2) return;

      const dateStr = columns[0]?.trim() || formData.date;
      const name = columns[1]?.trim() || 'Unknown';
      const totalAmount = parseFloat(columns[2]?.replace(/[^0-9.]/g, '') || '0');
      const receivedAmount = parseFloat(columns[3]?.replace(/[^0-9.]/g, '') || '0');
      
      // Attempt to normalize date if it's in DD/MM/YYYY or DD-MM format
      let finalDate = dateStr;
      if (dateStr.includes('/') || dateStr.includes('-')) {
         const parts = dateStr.split(/[/-]/);
         if (parts.length === 3) {
            // Assume DD/MM/YYYY or YYYY/MM/DD
            if (parts[0].length === 4) finalDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
            else finalDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
         } else if (parts.length === 2) {
            // Assume DD/MM, add current year
            finalDate = `${new Date().getFullYear()}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
         }
      }

      processed.push({
        id: crypto.randomUUID(),
        date: finalDate,
        customerName: name,
        type: 'S',
        rateType: 'Normal',
        quantity: 1,
        rate: totalAmount,
        totalAmount,
        receivedAmount,
        pendingAmount: totalAmount - receivedAmount,
      });
    });

    setBulkPreview(processed);
  };

  const saveBulkEntries = async () => {
    if (bulkPreview.length === 0) return;
    
    if (!user) {
      setEntries(prev => [...bulkPreview, ...prev]);
      setBulkPreview([]);
      setBulkInput('');
      setIsBulkOpen(false);
      showToast(`Imported ${bulkPreview.length} entries locally`);
      return;
    }

    try {
      const { db } = await getFirebase();
      if (!db) return;

      const promises = bulkPreview.map(entry => {
        const entryId = entry.id;
        const entryData = {
          ...entry,
          userId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        return setDoc(doc(db, 'entries', entryId), entryData);
      });

      await Promise.all(promises);
      showToast(`${bulkPreview.length} entries saved to Cloud!`);
      setBulkPreview([]);
      setBulkInput('');
      setIsBulkOpen(false);
    } catch (err) {
      showToast('Bulk import failed', 'error');
      handleFirestoreError(err, OperationType.WRITE, 'entries_bulk');
    }
  };

  // Filter Logic
  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      const entryDate = new Date(entry.date);
      const matchesTab = activeTab === 'vrs' ? entry.type === 'V' : entry.type !== 'V';
      const matchesSearch = entry.customerName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesMonth = filterMonth === 0 ? true : (entryDate.getMonth() + 1 === filterMonth && entryDate.getFullYear() === filterYear);
      const matchesFromDate = filterFromDate ? entry.date >= filterFromDate : true;
      const matchesToDate = filterToDate ? entry.date <= filterToDate : true;
      return matchesTab && matchesSearch && matchesMonth && matchesFromDate && matchesToDate;
    });
  }, [entries, activeTab, searchTerm, filterMonth, filterYear, filterFromDate, filterToDate]);

  const totals = useMemo(() => {
    return filteredEntries.reduce((acc, curr) => ({
      total: acc.total + curr.totalAmount,
      received: acc.received + curr.receivedAmount,
      pending: acc.pending + curr.pendingAmount,
    }), { total: 0, received: 0, pending: 0 });
  }, [filteredEntries]);

  const topCustomer = useMemo(() => {
    const customerTotals: Record<string, number> = {};
    filteredEntries.forEach(entry => {
      if (!customerTotals[entry.customerName]) {
        customerTotals[entry.customerName] = 0;
      }
      customerTotals[entry.customerName] += entry.totalAmount;
    });

    let maxCustomer = '';
    let maxAmount = 0;
    Object.entries(customerTotals).forEach(([customer, amount]) => {
      if (amount > maxAmount) {
        maxAmount = amount;
        maxCustomer = customer;
      }
    });
    return maxCustomer;
  }, [filteredEntries]);

  const generatePDF = () => {
    const doc = new jsPDF();
    
    const monthName = filterMonth === 0 ? 'All Months' : new Date(filterYear, filterMonth - 1).toLocaleString('default', { month: 'long' });
    const title = `Daily Daybook Report - ${monthName} ${filterYear}`;
    
    doc.setFontSize(20);
    doc.text("Daily Daybook", 14, 20);
    
    doc.setFontSize(14);
    doc.setTextColor(100);
    doc.text(title, 14, 28);
    
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(`Total Sales: Rs ${totals.total.toLocaleString('en-IN')}`, 14, 40);
    doc.text(`Total Received: Rs ${totals.received.toLocaleString('en-IN')}`, 14, 46);
    doc.text(`Total Pending: Rs ${totals.pending.toLocaleString('en-IN')}`, 14, 52);

    const tableData = filteredEntries.map((e, index) => [
      index + 1,
      new Date(e.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      e.customerName,
      e.type,
      e.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      e.receivedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      e.pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })
    ]);

    autoTable(doc, {
      startY: 60,
      head: [['Sr. No', 'Date', 'Customer Name', 'Type', 'Total Amount', 'Received', 'Pending']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, halign: 'center' },
      columnStyles: {
        0: { halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      }
    });

    const safeMonthName = monthName.replace(/\s+/g, '_');
    doc.save(`Daybook_Report_${safeMonthName}_${filterYear}.pdf`);
  };

  const handlePrint = () => {
    window.print();
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFilterFromDate('');
    setFilterToDate('');
    setFilterMonth(new Date().getMonth() + 1);
    setFilterYear(new Date().getFullYear());
  };

  const handleSignOut = async () => {
    const { auth } = await getFirebase();
    if (auth) signOut(auth);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 font-medium">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (!user && !localMode) {
    return <LoginPage onLoginSuccess={() => {}} onSkipLogin={() => setLocalMode(true)} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-2 md:p-4 font-sans print:p-0 print:bg-white">
      <div className="max-w-6xl mx-auto bg-white shadow-xl rounded-lg overflow-hidden print:overflow-visible print:shadow-none print:m-0">
        
        {/* Toast Notifications */}
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
          <AnimatePresence>
            {toasts.map(toast => (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, x: 20, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 font-bold text-sm min-w-[200px] ${
                  toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                }`}
              >
                {toast.type === 'success' ? <Star size={18} fill="currentColor" /> : <X size={18} />}
                {toast.message}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Header */}
        <header className="bg-white border-b border-gray-100 p-4 flex flex-col items-center md:flex-row justify-between gap-4 print:hidden rounded-t-lg">
          <div className="flex items-center gap-4">
            <Logo iconClassName="w-12 h-12" textClassName="text-2xl" />
            <div className="border-l-2 border-gray-100 pl-4">
              <h1 className="text-xl font-bold tracking-tight text-gray-800">Daily Daybook</h1>
              <p className="text-gray-500 print:hidden text-sm mt-0.5 font-medium">
                {user ? `Welcome, ${user.displayName || user.email}` : 'Guest Mode (Local Only)'}
              </p>
              {!user && (
                <div className="mt-1 inline-flex items-center gap-1 bg-amber-100/50 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide border border-amber-200 print:hidden">
                  <X size={10} /> Not Syncing
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2 print:hidden">
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 bg-gray-50 text-gray-700 border border-gray-200 px-3 py-2 rounded-lg font-bold hover:bg-gray-100 transition-colors shadow-sm text-sm"
            >
              <Printer size={16} />
              Print
            </button>
            <button 
              onClick={generatePDF}
              className="flex items-center gap-2 bg-green-50 text-green-700 border border-green-200 px-3 py-2 rounded-lg font-bold hover:bg-green-100 transition-colors shadow-sm text-sm"
            >
              <FileDown size={16} />
              Report
            </button>
            {user ? (
              <button 
                onClick={handleSignOut}
                className="flex items-center gap-2 bg-gray-50 text-blue-600 border border-gray-200 px-3 py-2 rounded-lg font-bold hover:bg-gray-100 transition-colors shadow-sm text-sm"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            ) : (
              <button 
                onClick={() => setLocalMode(false)}
                className="flex items-center gap-2 bg-blue-600 text-white border border-blue-600 px-3 py-2 rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-sm text-sm"
              >
                <User size={16} />
                Login
              </button>
            )}
          </div>
        </header>

        {/* Print-only Header */}
        <div className="hidden print:flex flex-col items-center justify-center p-8 mb-4 border-b border-gray-400">
          <p className="text-xs text-gray-400 mb-2 uppercase tracking-widest">Official Report by zishan gdx</p>
          <h1 className="text-4xl font-bold uppercase tracking-widest text-black">Daily Daybook Report</h1>
          <p className="text-gray-500 mt-2 text-lg font-medium tracking-widest uppercase">Powered by zishan gdx</p>
          <div className="mt-4 text-sm text-gray-500 font-medium font-mono">
            PERIOD: {filterMonth === 0 ? 'ALL MONTHS' : new Date(filterYear, filterMonth - 1).toLocaleString('default', { month: 'long' }).toUpperCase()} {filterYear}
          </div>
        </div>

        {/* Global Print Watermark */}
        <div className="watermark-text">
          zishan gdx
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-gray-100 border-b border-gray-200 print:hidden">
          <button
            onClick={() => setActiveTab('standard')}
            className={`px-6 py-3 font-bold text-sm uppercase tracking-wider transition-all border-b-2 ${
              activeTab === 'standard' 
              ? 'bg-white border-blue-600 text-blue-600' 
              : 'text-gray-500 hover:text-gray-700 border-transparent'
            }`}
          >
            Standard Sheet
          </button>
          <button
            onClick={() => setActiveTab('vrs')}
            className={`px-6 py-3 font-bold text-sm uppercase tracking-wider transition-all border-b-2 ${
              activeTab === 'vrs' 
              ? 'bg-white border-purple-600 text-purple-600' 
              : 'text-gray-500 hover:text-gray-700 border-transparent'
            }`}
          >
            VRS People Only
          </button>
          <button
            onClick={() => setActiveTab('invoice')}
            className={`px-6 py-3 font-bold text-sm uppercase tracking-wider transition-all border-b-2 ml-auto ${
              activeTab === 'invoice' 
              ? 'bg-white border-blue-600 text-blue-600' 
              : 'text-gray-500 hover:text-gray-700 border-transparent'
            }`}
          >
            Generate Bill
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-6 py-3 font-bold text-sm uppercase tracking-wider transition-all border-b-2 ${
              activeTab === 'history' 
              ? 'bg-white border-green-600 text-green-600' 
              : 'text-gray-500 hover:text-gray-700 border-transparent'
            }`}
          >
            Invoice History
          </button>
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-6 py-3 font-bold text-sm uppercase tracking-wider transition-all border-b-2 ${
              activeTab === 'stock' 
              ? 'bg-white border-orange-600 text-orange-600' 
              : 'text-gray-500 hover:text-gray-700 border-transparent'
            }`}
          >
            Stock
          </button>
        </div>

        {activeTab === 'invoice' ? (
          <InvoiceGenerator user={user} onSaved={() => setActiveTab('standard')} />
        ) : activeTab === 'history' ? (
          <InvoiceHistory user={user} />
        ) : activeTab === 'stock' ? (
          <StockManager user={user} />
        ) : (
          <>
            {/* Input Form Section */}
            <div className={`p-4 border-b border-gray-200 print:hidden ${editingId ? 'bg-orange-50' : 'bg-gray-50'}`}>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-3 gap-2">
                <h2 className="text-base font-black text-gray-700 flex items-center gap-2 uppercase tracking-tight">
                  {editingId ? (
                    <>
                      <Pencil size={18} className="text-orange-600" />
                      Edit Entry
                    </>
                  ) : (
                    <>
                      <Plus size={18} className="text-blue-600" />
                      Add New Entry
                    </>
                  )}
                </h2>
                
                {!editingId && (
                  <button 
                    onClick={() => setIsBulkOpen(!isBulkOpen)}
                    className={`text-[10px] font-black px-4 py-1.5 rounded-full transition-all border uppercase tracking-widest ${
                      isBulkOpen 
                      ? 'bg-blue-600 text-white border-blue-600' 
                      : 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50'
                    }`}
                  >
                    {isBulkOpen ? '← Switch to Single' : 'Excel/Sheet Import'}
                  </button>
                )}
              </div>

              {!isBulkOpen ? (
                <form onSubmit={handleAddEntry} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                  <datalist id="customerNamesListApp">
                    {productNames.map(name => <option key={name} value={name} />)}
                  </datalist>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Date</label>
                    <input 
                      type="date" 
                      name="date"
                      value={formData.date}
                      onChange={handleInputChange}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      required
                    />
                  </div>
                  <div className="md:col-span-1 space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Customer/Item</label>
                    <input 
                      ref={customerInputRef}
                      type="text" 
                      name="customerName"
                      list="customerNamesListApp"
                      placeholder="Name"
                      value={formData.customerName}
                      onChange={handleInputChange}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Type</label>
                    <select 
                      name="type"
                      value={formData.type}
                      onChange={handleInputChange}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white text-xs font-bold"
                    >
                      <option value="S">S (Regular)</option>
                      <option value="V">V (VRS)</option>
                      <option value="O">O (Others)</option>
                      <option value="K">K (Khalis)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Total</label>
                    <input 
                      type="number" 
                      name="totalAmount"
                      placeholder="0.00"
                      step="any"
                      value={formData.totalAmount}
                      onChange={handleInputChange}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none font-bold text-blue-600 text-sm"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Received</label>
                    <div className="flex gap-1">
                      <input 
                        type="number" 
                        name="receivedAmount"
                        placeholder="0.00"
                        step="any"
                        value={formData.receivedAmount}
                        onChange={handleInputChange}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold text-green-600"
                      />
                      
                      {editingId ? (
                        <div className="flex gap-1">
                          <button 
                            type="submit"
                            className="bg-orange-600 text-white p-2 rounded-md hover:bg-orange-700 transition-colors flex-shrink-0"
                            title="Update Entry"
                          >
                            <Save size={20} />
                          </button>
                          <button 
                            type="button"
                            onClick={cancelEdit}
                            className="bg-gray-400 text-white p-2 rounded-md hover:bg-gray-500 transition-colors flex-shrink-0"
                            title="Cancel Edit"
                          >
                            <X size={20} />
                          </button>
                        </div>
                      ) : (
                        <button 
                          type="submit"
                          className="bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700 transition-colors flex-shrink-0 shadow-md"
                          title="Add Entry"
                        >
                          <Save size={20} />
                        </button>
                      )}
                    </div>
                  </div>
                </form>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <textarea 
                      placeholder="Paste columns from Google Sheets / Excel here...&#10;Date [Tab] Name [Tab] Total [Tab] Received"
                      value={bulkInput}
                      onChange={(e) => setBulkInput(e.target.value)}
                      className="w-full h-24 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-xs font-mono bg-white"
                    />
                    <button 
                      onClick={processBulkData}
                      className="absolute bottom-2 right-2 bg-blue-600 text-white px-4 py-1.5 rounded-md font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-md"
                    >
                      Scan Data
                    </button>
                  </div>

                  {bulkPreview.length > 0 && (
                    <div className="border border-blue-100 rounded-lg overflow-hidden bg-white shadow-lg">
                      <div className="p-2 bg-blue-50 border-b border-blue-100 flex justify-between items-center px-4">
                        <span className="text-[10px] font-black text-blue-700 uppercase tracking-widest">Preview ({bulkPreview.length} items)</span>
                        <div className="flex gap-4">
                          <button 
                             onClick={() => setBulkPreview([])}
                             className="text-[10px] font-black text-red-600 hover:underline uppercase"
                          >
                             Discard
                          </button>
                          <button 
                            onClick={saveBulkEntries}
                            className="bg-green-600 text-white px-5 py-1 rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-green-700 flex items-center gap-2 shadow-sm"
                          >
                            <Save size={14} />
                            Save All to Cloud
                          </button>
                        </div>
                      </div>
                      <div className="max-h-52 overflow-y-auto">
                        <table className="w-full text-[10px]">
                          <thead className="bg-gray-100 sticky top-0 font-black uppercase text-gray-500">
                            <tr>
                              <th className="p-2 text-left border-r w-24">Date</th>
                              <th className="p-2 text-left border-r">Customer</th>
                              <th className="p-2 text-right border-r w-20">Total</th>
                              <th className="p-2 text-right w-20">Received</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {bulkPreview.map((item, idx) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="p-2 border-r">{item.date}</td>
                                <td className="p-2 border-r font-bold">{item.customerName}</td>
                                <td className="p-2 border-r text-right font-black text-blue-600">₹{item.totalAmount}</td>
                                <td className="p-2 text-right font-black text-green-600">₹{item.receivedAmount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

        {/* Dashboard / Summary Cards */}
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 bg-white print:hidden">
          <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded shadow-sm">
            <h3 className="text-blue-600 text-[10px] font-black uppercase tracking-widest">Total Sales</h3>
            <p className="text-lg font-black text-gray-800 mt-1">₹{totals.total.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-green-50 border-l-4 border-green-500 p-3 rounded shadow-sm">
            <h3 className="text-green-600 text-[10px] font-black uppercase tracking-widest">Total Jama</h3>
            <p className="text-lg font-black text-gray-800 mt-1">₹{totals.received.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3 rounded shadow-sm">
            <h3 className="text-yellow-700 text-[10px] font-black uppercase tracking-widest">Total Udhaari</h3>
            <p className="text-lg font-black text-gray-800 mt-1 text-red-600">₹{totals.pending.toLocaleString('en-IN')}</p>
          </div>
        </div>

        {/* Search and Filters Section */}
        <div className="px-6 py-4 bg-gray-50 border-y border-gray-200 flex flex-col lg:flex-row gap-4 items-center print:hidden">
          <div className="relative w-full lg:w-1/4">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Plus className="h-5 w-5 text-gray-400 rotate-45" />
            </span>
            <input 
              type="text" 
              placeholder="Search Customer..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all sm:text-sm"
            />
          </div>
          
          <div className="flex flex-wrap items-center gap-4 w-full lg:w-3/4 justify-end">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500 uppercase">Year:</span>
              <select 
                value={filterYear}
                onChange={(e) => setFilterYear(Number(e.target.value))}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm outline-none focus:border-blue-500 bg-white"
              >
                <option value={new Date().getFullYear()}>{new Date().getFullYear()}</option>
                <option value={new Date().getFullYear() - 1}>{new Date().getFullYear() - 1}</option>
                <option value={new Date().getFullYear() - 2}>{new Date().getFullYear() - 2}</option>
              </select>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500 uppercase">Month:</span>
              <select 
                value={filterMonth}
                onChange={(e) => setFilterMonth(Number(e.target.value))}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm outline-none focus:border-blue-500 bg-white"
              >
                <option value={0}>All Months</option>
                <option value={1}>January</option>
                <option value={2}>February</option>
                <option value={3}>March</option>
                <option value={4}>April</option>
                <option value={5}>May</option>
                <option value={6}>June</option>
                <option value={7}>July</option>
                <option value={8}>August</option>
                <option value={9}>September</option>
                <option value={10}>October</option>
                <option value={11}>November</option>
                <option value={12}>December</option>
              </select>
            </div>

            <div className="flex items-center gap-2 border-l border-gray-300 pl-4">
              <span className="text-xs font-bold text-gray-500 uppercase">From:</span>
              <input 
                type="date" 
                value={filterFromDate}
                onChange={(e) => setFilterFromDate(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500 uppercase">To:</span>
              <input 
                type="date" 
                value={filterToDate}
                onChange={(e) => setFilterToDate(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm outline-none focus:border-blue-500"
              />
            </div>
            {(searchTerm || filterFromDate || filterToDate || filterMonth !== (new Date().getMonth() + 1)) && (
              <button 
                onClick={clearFilters}
                className="text-xs font-bold text-red-500 hover:text-red-700 uppercase tracking-tighter"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Table Container */}
        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className={`${activeTab === 'vrs' ? 'bg-purple-600' : 'bg-[#FFC107]'} text-black print:bg-gray-100`}>
                <th className="p-3 border border-gray-200 first:border-l-0 text-sm font-bold uppercase whitespace-nowrap print:hidden">Sr. No</th>
                <th className="p-3 border border-gray-200 text-sm font-bold uppercase whitespace-nowrap">Date</th>
                <th className="p-3 border border-gray-200 text-sm font-bold uppercase whitespace-nowrap hidden print:table-cell">Time</th>
                <th className="p-3 border border-gray-200 text-sm font-bold uppercase whitespace-nowrap">Name</th>
                <th className="p-3 border border-gray-200 text-sm font-bold uppercase whitespace-nowrap text-center print:hidden">Type</th>
                <th className="p-3 border border-gray-200 text-sm font-bold uppercase whitespace-nowrap text-right text-blue-800">Total</th>
                <th className="p-3 border border-gray-200 text-sm font-bold uppercase whitespace-nowrap text-right text-green-800">Jama</th>
                <th className="p-3 border border-gray-200 text-sm font-bold uppercase whitespace-nowrap text-right text-red-800">Udhari</th>
                <th className="p-3 border border-gray-200 last:border-r-0 text-sm font-bold uppercase whitespace-nowrap text-center print:hidden">Action</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {filteredEntries.length === 0 ? (
                  <motion.tr
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <td colSpan={8} className="p-24 text-center">
                      <div className="flex flex-col items-center justify-center text-gray-400">
                        <Plus size={48} className="mb-4 opacity-20 rotate-45" />
                        <p className="text-lg font-medium">No record found</p>
                        <p className="text-sm">Try adjusting your search or filters.</p>
                      </div>
                    </td>
                  </motion.tr>
                ) : (
                  filteredEntries.map((entry, index) => (
                    <motion.tr 
                      key={entry.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={`hover:bg-gray-50 border-b border-gray-100 transition-colors ${entry.pendingAmount > 10000 ? 'bg-red-50 hover:bg-red-100' : ''}`}
                    >
                      <td className="p-3 border-x border-gray-100 text-sm text-gray-600 font-mono print:hidden">{index + 1}</td>
                      <td className="p-3 border-x border-gray-100 text-sm text-gray-700 whitespace-nowrap">
                        {new Date(entry.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="p-3 border-x border-gray-100 text-sm text-gray-700 whitespace-nowrap hidden print:table-cell font-mono">
                        {entry.createdAt?.toDate ? entry.createdAt.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '---'}
                      </td>
                      <td className="p-3 border-x border-gray-100 text-sm font-medium text-gray-900 group">
                        <div className="flex items-center gap-2">
                          {entry.customerName}
                          {entry.customerName === topCustomer && (
                            <div className="inline-flex items-center print:hidden" title="Top Customer of the Month">
                              <Star className="text-yellow-500 fill-yellow-500" size={14} />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-3 border-x border-gray-100 text-sm text-center print:hidden">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          entry.type === 'S' ? 'bg-green-100 text-green-700' : 
                          entry.type === 'O' ? 'bg-blue-100 text-blue-700' :
                          entry.type === 'V' ? 'bg-purple-100 text-purple-700' :
                          entry.type === 'K' ? 'bg-indigo-100 text-indigo-700' :
                          entry.type === 'D' ? 'bg-teal-100 text-teal-700' :
                          entry.type === 'SU' ? 'bg-orange-100 text-orange-700' :
                          'bg-pink-100 text-pink-700'
                        }`}>
                          {entry.type}
                        </span>
                      </td>
                      <td className="p-3 border-x border-gray-100 text-sm text-right font-mono">₹{entry.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 border-x border-gray-100 text-sm text-right font-mono text-green-600">₹{entry.receivedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className={`p-3 border-x border-gray-100 text-sm text-right font-mono ${entry.pendingAmount > 0 ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                        ₹{entry.pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 border-x border-gray-100 text-center print:hidden">
                        <div className="flex items-center justify-center gap-1">
                          <button 
                            onClick={() => startEdit(entry)}
                            className="p-1.5 text-blue-400 hover:text-blue-600 transition-colors rounded-full hover:bg-blue-50"
                            title="Edit"
                          >
                            <Pencil size={16} />
                          </button>
                          <button 
                            onClick={() => deleteEntry(entry.id)}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-full hover:bg-red-50"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </tbody>
            {filteredEntries.length > 0 && (
              <tfoot>
                <tr className="bg-gray-800 text-white font-bold text-lg print:text-black print:bg-gray-100">
                  <td colSpan={4} className="p-4 text-right pr-6 uppercase tracking-wider text-[10px] print:hidden">Summary</td>
                  <td className="p-4 text-right font-mono text-sm">₹{totals.total.toLocaleString('en-IN', { minimumFractionDigits: 1 })}</td>
                  <td className="p-4 text-right font-mono text-green-400 print:text-gray-800 text-sm">₹{totals.received.toLocaleString('en-IN', { minimumFractionDigits: 1 })}</td>
                  <td className="p-4 text-right font-mono text-yellow-400 print:text-gray-800 text-sm">₹{totals.pending.toLocaleString('en-IN', { minimumFractionDigits: 1 })}</td>
                  <td className="print:hidden"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Footer info for print */}
        <div className="hidden print:block p-8 mt-8 border-t border-gray-200">
          <div className="text-center mb-8">
            <p className="text-xs text-gray-500 uppercase tracking-widest">Official Report by zishan gdx</p>
          </div>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-sm text-gray-500">Report generated on {new Date().toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1 italic">This is a computer generated document.</p>
            </div>
            <div className="text-right">
              <div className="w-48 border-b border-gray-400 mb-2 mt-12"></div>
              <p className="font-semibold text-gray-700">Authorized Signature</p>
            </div>
          </div>
        </div>
          </>
        )}
      </div>

      <footer className="max-w-6xl mx-auto mt-8 mb-12 text-center text-gray-500 text-sm print:hidden">
        <p className="mb-2">&copy; {new Date().getFullYear()} Daily Daybook. Your data is securely stored in the cloud.</p>
        <div className="flex justify-center gap-4 text-xs font-semibold">
          <button onClick={() => setIsAboutOpen(true)} className="hover:text-gray-800 hover:underline transition-colors focus:outline-none">About Us</button>
          <span>&middot;</span>
          <button onClick={() => setIsPrivacyOpen(true)} className="hover:text-gray-800 hover:underline transition-colors focus:outline-none">Privacy Policy</button>
          <span>&middot;</span>
          <button onClick={() => setIsSupportOpen(true)} className="hover:text-gray-800 hover:underline transition-colors focus:outline-none">Support</button>
        </div>
      </footer>

      {/* About Us Modal */}
      {isAboutOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-8 relative animate-in fade-in zoom-in duration-200">
            <button onClick={() => setIsAboutOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 focus:outline-none">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="text-2xl font-black text-gray-900 mb-4 tracking-tight">About Us</h2>
            <div className="space-y-4 text-gray-600 leading-relaxed text-sm">
              <p>
                <strong className="text-gray-900">zishan gdx</strong> ek professional digital ledger aur billing solution hai jo chhote aur bade businesses ko unka hisaab-kitaab digital karne mein madad karta hai.
              </p>
              <p>
                Hamara maksad billing ko aasan, fast, aur error-free banana hai taaki aap sirf apne business ki growth par focus kar saken. Paper registers aur manual hisaab ko bhool jaiye aur ek modern digital daybook ka anubhav lijiye.
              </p>
            </div>
            <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
              <button onClick={() => setIsAboutOpen(false)} className="px-6 py-2 bg-gray-900 text-white font-bold rounded-lg hover:bg-gray-800 transition-colors focus:outline-none">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Policy Modal */}
      {isPrivacyOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-8 relative overflow-y-auto max-h-[90vh] animate-in fade-in zoom-in duration-200">
            <button onClick={() => setIsPrivacyOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 focus:outline-none">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="text-2xl font-black text-gray-900 mb-6 tracking-tight">Privacy Policy</h2>
            <div className="space-y-6 text-gray-600 text-sm">
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-start gap-4">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0"></div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">Data Security</h3>
                  <p>Aapka saara data (Bills aur Daybook entries) Firebase ke secure cloud servers par save hota hai. Hum modern encryption methods use karte hain taaki aapka data poori tarah surakshit rahe.</p>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-start gap-4">
                <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 shrink-0"></div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">User Privacy</h3>
                  <p>Hum aapka personal data aur sensitive business details kisi teesre bande (third party) ya advertiser ko kabhi nahi bechte.</p>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-start gap-4">
                <div className="w-2 h-2 rounded-full bg-orange-500 mt-1.5 shrink-0"></div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">Google Login</h3>
                  <p>Hum sirf login authentication (secure access) ke liye Google Authentication ka use karte hain, taaki password yaad rakhne ka jhanjhat na rahe.</p>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-start gap-4">
                <div className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 shrink-0"></div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">Your Control</h3>
                  <p>User apna data kabhi bhi delete kar sakta hai aur jarurat padne par use as a PDF export karke apne paas rakh sakta hai.</p>
                </div>
              </div>
            </div>
            
            <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
              <button onClick={() => setIsPrivacyOpen(false)} className="px-6 py-2 bg-gray-900 text-white font-bold rounded-lg hover:bg-gray-800 transition-colors focus:outline-none">Understood</button>
            </div>
          </div>
        </div>
      )}

      {/* Support Modal */}
      {isSupportOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 print:hidden overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 relative my-8 animate-in fade-in zoom-in duration-200">
            <button onClick={() => setIsSupportOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 focus:outline-none">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">Support & Contact</h2>
            <p className="text-gray-500 text-sm mb-6">Need help with the app? We are here for you.</p>

            <a 
              href="https://wa.me/917065162279?text=Hello%20zishan%20gdx%2C%20mujhe%20app%20mein%20kuch%20help%20chahiye." 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full bg-[#25D366] text-white py-3 px-4 rounded-xl font-bold hover:bg-[#128C7E] transition-colors mb-6 shadow-sm"
            >
              <MessageCircle size={20} />
              Chat on WhatsApp
            </a>

            <div className="relative flex py-4 items-center">
              <div className="flex-grow border-t border-gray-200"></div>
              <span className="flex-shrink-0 mx-4 text-gray-400 text-xs font-semibold uppercase tracking-wider">Or leave a message</span>
              <div className="flex-grow border-t border-gray-200"></div>
            </div>

            <form onSubmit={handleSupportSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Your Name</label>
                <input 
                  type="text" 
                  value={supportName}
                  onChange={(e) => setSupportName(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                  placeholder="John Doe"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Message / Issue</label>
                <textarea 
                  value={supportMessage}
                  onChange={(e) => setSupportMessage(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow min-h-[100px] resize-none"
                  placeholder="Please describe your issue..."
                  required
                ></textarea>
              </div>
              <button 
                type="submit" 
                disabled={supportSaving}
                className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-3 px-4 rounded-xl font-bold hover:bg-gray-800 transition-colors shadow-sm disabled:opacity-50"
              >
                {supportSaving ? 'Submitting...' : <><Send size={18} /> Submit Ticket</>}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400 font-medium tracking-wide">Supported by zishan gdx Team.</p>
              <p className="text-xs text-gray-400 mt-0.5">We usually reply within 24 hours.</p>
            </div>
          </div>
        </div>
      )}

      {/* Print styles */}
      <style>{`
        @media print {
          @page { margin: 1cm; size: a4 portrait; }
          body { background-color: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          .print\\:flex { display: flex !important; }
          .print\\:table-cell { display: table-cell !important; }
          thead tr { background-color: #f3f4f6 !important; color: black !important; }
          tfoot tr { background-color: #f3f4f6 !important; color: black !important; }
          table, th, td { border: 1px solid #d1d5db !important; }
          th { border-bottom: 2px solid #374151 !important; }
          tfoot td { border-top: 2px solid #374151 !important; }
        }
      `}</style>
    </div>
  );
}
