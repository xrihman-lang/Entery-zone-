/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Printer, Trash2, Save, X, LogOut, User, Pencil, FileDown, Star } from 'lucide-react';
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
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  orderBy,
  setDoc
} from 'firebase/firestore';
import { getFirebase } from './lib/firebase';
import LoginPage from './components/LoginPage';
import InvoiceGenerator from './components/InvoiceGenerator';

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
  totalAmount: number;
  receivedAmount: number;
  pendingAmount: number;
  createdAt?: any;
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [localMode, setLocalMode] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeTab, setActiveTab] = useState<'standard' | 'vrs' | 'invoice'>('standard');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    customerName: '',
    type: 'S' as 'S' | 'O' | 'V' | 'K' | 'D' | 'SU' | 'OM',
    totalAmount: '',
    receivedAmount: '',
  });

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

  // Sync with Firestore or LocalStorage
  useEffect(() => {
    if (!user) {
      // Logic for Guest / Local Mode
      if (!authLoading) {
        localStorage.setItem('daybook_entries_local', JSON.stringify(entries));
      }
      return;
    }

    let unsubscribe: any;
    const syncData = async () => {
      const { db } = await getFirebase();
      if (!db) return;

      const q = query(
        collection(db, 'entries'),
        where('userId', '==', user.uid)
      );

      unsubscribe = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id,
        })) as Entry[];
        docs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setEntries(docs);
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'entries');
      });
    };

    syncData();
    return () => unsubscribe && unsubscribe();
  }, [user, entries, authLoading]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customerName || !formData.totalAmount) return;

    const total = parseFloat(formData.totalAmount);
    const received = parseFloat(formData.receivedAmount || '0');
    
    // IF NOT LOGGED IN / NO DB - USE LOCAL
    if (!user) {
      const newEntry: Entry = {
        id: crypto.randomUUID(),
        date: formData.date,
        customerName: formData.customerName,
        type: formData.type,
        totalAmount: total,
        receivedAmount: received,
        pendingAmount: total - received,
      };
      
      if (editingId) {
        setEntries(prev => prev.map(e => e.id === editingId ? newEntry : e));
        setEditingId(null);
      } else {
        setEntries(prev => [newEntry, ...prev]);
        // Auto-switch tab if added to the other one
        if (formData.type === 'V' && activeTab === 'standard') setActiveTab('vrs');
        if (formData.type !== 'V' && activeTab === 'vrs') setActiveTab('standard');
      }

      setFormData({
        date: new Date().toISOString().split('T')[0],
        customerName: '',
        type: formData.type,
        totalAmount: '',
        receivedAmount: '',
      });
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
          totalAmount: total,
          receivedAmount: received,
          pendingAmount: total - received,
          updatedAt: serverTimestamp(),
        }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `entries/${editingId}`));
        
        setEditingId(null);
      } else {
        const entryId = crypto.randomUUID();
        const entryData = {
          id: entryId,
          date: formData.date,
          customerName: formData.customerName,
          type: formData.type,
          totalAmount: total,
          receivedAmount: received,
          pendingAmount: total - received,
          userId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        // Use setDoc with ID to keep it consistent
        await setDoc(doc(db, 'entries', entryId), entryData)
          .catch(err => handleFirestoreError(err, OperationType.CREATE, `entries/${entryId}`));
        
        // Auto-switch tab if added to the other one
        if (formData.type === 'V' && activeTab === 'standard') setActiveTab('vrs');
        if (formData.type !== 'V' && activeTab === 'vrs') setActiveTab('standard');
      }

      setFormData({
        date: new Date().toISOString().split('T')[0],
        customerName: '',
        type: formData.type,
        totalAmount: '',
        receivedAmount: '',
      });
    } catch (err) {
      console.error(err);
    }
  };

  const startEdit = (entry: Entry) => {
    setEditingId(entry.id);
    setFormData({
      date: entry.date,
      customerName: entry.customerName,
      type: entry.type,
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
      date: new Date().toISOString().split('T')[0],
      customerName: '',
      type: 'S',
      totalAmount: '',
      receivedAmount: '',
    });
  };

  const deleteEntry = async (id: string) => {
    if (!user) {
      setEntries(prev => prev.filter(e => e.id !== id));
      return;
    }
    try {
      const { db } = await getFirebase();
      if (!db) return;
      await deleteDoc(doc(db, 'entries', id))
        .catch(err => handleFirestoreError(err, OperationType.DELETE, `entries/${id}`));
    } catch (err) {
      console.error(err);
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
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans print:p-0 print:bg-white">
      <div className="max-w-6xl mx-auto bg-white shadow-xl rounded-lg overflow-hidden print:overflow-visible print:shadow-none print:m-0">
        
        {/* Header */}
        <header className="bg-blue-600 text-white p-6 flex flex-col md:flex-row justify-between items-center gap-4 print:hidden">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-xl print:hidden">
              <User size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Daily Daybook</h1>
              <p className="text-blue-100 print:hidden text-sm mt-1">
                {user ? `Welcome, ${user.displayName || user.email}` : 'Guest Mode (Local Only)'}
              </p>
              {!user && (
                <div className="mt-2 inline-flex items-center gap-1 bg-amber-500/30 text-amber-100 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide border border-amber-500/50 print:hidden">
                  <X size={10} /> Not Syncing
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2 print:hidden">
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 bg-white/10 text-white border border-white/20 px-3 py-2 rounded-md font-medium hover:bg-white/20 transition-colors shadow-sm text-sm"
            >
              <Printer size={16} />
              Print
            </button>
            <button 
              onClick={generatePDF}
              className="flex items-center gap-2 bg-green-500 text-white border border-green-400 px-3 py-2 rounded-md font-medium hover:bg-green-600 transition-colors shadow-sm text-sm"
            >
              <FileDown size={16} />
              Download Report
            </button>
            {user ? (
              <button 
                onClick={handleSignOut}
                className="flex items-center gap-2 bg-white text-blue-600 px-3 py-2 rounded-md font-medium hover:bg-blue-50 transition-colors shadow-sm text-sm"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            ) : (
              <button 
                onClick={() => setLocalMode(false)}
                className="flex items-center gap-2 bg-white text-blue-600 px-3 py-2 rounded-md font-medium hover:bg-blue-50 transition-colors shadow-sm text-sm"
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
        <div className="hidden print:flex fixed inset-0 items-center justify-center pointer-events-none" style={{ zIndex: -100 }}>
          <div className="transform -rotate-45 text-[150px] font-bold text-[#eee]" style={{ opacity: 0.1 }}>
            zishan gdx
          </div>
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
            Create Invoice
          </button>
        </div>

        {activeTab === 'invoice' ? (
          <InvoiceGenerator user={user} />
        ) : (
          <>
            {/* Input Form Section */}
            <div className={`p-6 border-b border-gray-200 print:hidden ${editingId ? 'bg-orange-50' : 'bg-gray-50'}`}>
          <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
            {editingId ? (
              <>
                <Pencil size={20} className="text-orange-600" />
                Edit Entry
              </>
            ) : (
              <>
                <Plus size={20} className="text-blue-600" />
                Add New Entry
              </>
            )}
          </h2>
          <form onSubmit={handleAddEntry} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</label>
              <input 
                type="date" 
                name="date"
                value={formData.date}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
            </div>
            <div className="md:col-span-2 space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer Name</label>
              <input 
                type="text" 
                name="customerName"
                placeholder="Enter name"
                value={formData.customerName}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Type (S/O/V)</label>
              <select 
                name="type"
                value={formData.type}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="S">Sale (S)</option>
                <option value="O">Other (O)</option>
                <option value="V">VRS (V)</option>
                <option value="K">Kunal (K)</option>
                <option value="D">Dev (D)</option>
                <option value="SU">Sunny (SU)</option>
                <option value="OM">OMG (OM)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Amount</label>
              <input 
                type="number" 
                name="totalAmount"
                placeholder="0.00"
                value={formData.totalAmount}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Received (Jama)</label>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  name="receivedAmount"
                  placeholder="0.00"
                  value={formData.receivedAmount}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                />
                
                {editingId ? (
                  <div className="flex gap-1">
                    <button 
                      type="submit"
                      className="bg-orange-600 text-white p-2 rounded-md hover:bg-orange-700 transition-colors flex-shrink-0"
                      title="Update Entry"
                    >
                      <Save size={24} />
                    </button>
                    <button 
                      type="button"
                      onClick={cancelEdit}
                      className="bg-gray-400 text-white p-2 rounded-md hover:bg-gray-500 transition-colors flex-shrink-0"
                      title="Cancel Edit"
                    >
                      <X size={24} />
                    </button>
                  </div>
                ) : (
                  <button 
                    type="submit"
                    className="bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700 transition-colors flex-shrink-0"
                    title="Add Entry"
                  >
                    <Plus size={24} />
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>

        {/* Dashboard / Summary Cards */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 bg-white print:hidden">
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r shadow-sm">
            <h3 className="text-blue-600 text-sm font-bold uppercase tracking-wider">Total Monthly Sales</h3>
            <p className="text-2xl font-bold text-gray-800 mt-1">₹{totals.total.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r shadow-sm">
            <h3 className="text-green-600 text-sm font-bold uppercase tracking-wider">Total Monthly Received</h3>
            <p className="text-2xl font-bold text-gray-800 mt-1">₹{totals.received.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r shadow-sm">
            <h3 className="text-yellow-700 text-sm font-bold uppercase tracking-wider">Total Monthly Pending</h3>
            <p className="text-2xl font-bold text-gray-800 mt-1">₹{totals.pending.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
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
                <th className="p-3 border border-gray-200 text-sm font-bold uppercase whitespace-nowrap">Customer Name</th>
                <th className="p-3 border border-gray-200 text-sm font-bold uppercase whitespace-nowrap text-center print:hidden">Type</th>
                <th className="p-3 border border-gray-200 text-sm font-bold uppercase whitespace-nowrap text-right">Total Amount</th>
                <th className="p-3 border border-gray-200 text-sm font-bold uppercase whitespace-nowrap text-right">Received</th>
                <th className="p-3 border border-gray-200 text-sm font-bold uppercase whitespace-nowrap text-right">Pending</th>
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
                  <td colSpan={4} className="p-4 text-right pr-6 uppercase tracking-wider text-xs print:hidden">Total on Screen</td>
                  <td colSpan={3} className="hidden print:table-cell p-4 text-right pr-6 uppercase tracking-wider text-xs">Total for Period</td>
                  <td className="p-4 text-right font-mono">₹{totals.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="p-4 text-right font-mono text-green-400 print:text-gray-800">₹{totals.received.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="p-4 text-right font-mono text-yellow-400 print:text-gray-800">₹{totals.pending.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
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

      <footer className="max-w-6xl mx-auto mt-8 text-center text-gray-400 text-sm print:hidden">
        <p>&copy; {new Date().getFullYear()} Daily Daybook. Your data is securely stored in the cloud.</p>
      </footer>

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
