/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Printer, Trash2, Save, X, LogOut, User, Pencil, FileDown, Star, MessageCircle, Send, Crown, ShieldAlert } from 'lucide-react';
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
import { WelcomeScreen } from './components/WelcomeScreen';
import LoginPage from './components/LoginPage';
import InvoiceGenerator from './components/InvoiceGenerator';
import InvoiceHistory from './components/InvoiceHistory';
import { StockManager } from './components/StockManager';
import SubscriptionModal from './components/SubscriptionModal';
import { usePremiumStatus } from './hooks/usePremiumStatus';
import { AdminDashboard } from './components/AdminDashboard';
import { Logo } from './components/Logo';
import { useProductPrices } from './hooks/useProductPrices';
import { useLocalDate, getLocalDateString } from './hooks/useLocalDate';
import { speak } from './lib/speech';

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
  type: string;
  rateType: 'MRP' | 'Normal' | 'Reddi';
  quantity: number;
  rate: number;
  totalAmount: number;
  receivedAmount: number;
  pendingAmount: number;
  createdAt?: any;
}

export interface LedgerTab {
  id: string;
  label: string;
  typeCode: string;
  colorClass: string;
}

const DEFAULT_CUSTOM_TABS: LedgerTab[] = [
  { id: 'vrs', label: 'VRS People Only', typeCode: 'V', colorClass: 'purple' },
  { id: 'aadil', label: 'Aadil', typeCode: 'Aadil', colorClass: 'pink' },
  { id: 'ashish', label: 'Ashish', typeCode: 'Ashish', colorClass: 'teal' }
];

export default function App() {
  const localDate = useLocalDate();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [localMode, setLocalMode] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [totalEntryCount, setTotalEntryCount] = useState(0);
  const [dailyEntryCount, setDailyEntryCount] = useState(0);
  const [totalInvoiceCount, setTotalInvoiceCount] = useState(0);
  const [dailyInvoiceCount, setDailyInvoiceCount] = useState(0);
  const [activeTab, setActiveTab] = useState<string>('standard');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Custom Tabs State
  const [customTabs, setCustomTabs] = useState<LedgerTab[]>([]);
  const [tabsLoading, setTabsLoading] = useState(true);
  const [isTabsManagerOpen, setIsTabsManagerOpen] = useState(false);
  const [newTabLabel, setNewTabLabel] = useState('');
  const [newTabTypeCode, setNewTabTypeCode] = useState('');
  const [newTabColor, setNewTabColor] = useState('purple');
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabLabel, setEditingTabLabel] = useState('');
  const [editingTabTypeCode, setEditingTabTypeCode] = useState('');
  const [editingTabColor, setEditingTabColor] = useState('purple');

  // Sync custom tabs from Firestore or localStorage
  useEffect(() => {
    let isMounted = true;
    const loadTabs = async () => {
      setTabsLoading(true);
      if (!user) {
        const saved = localStorage.getItem('gdx_custom_tabs');
        if (saved) {
          try {
            if (isMounted) setCustomTabs(JSON.parse(saved));
          } catch (e) {
            if (isMounted) setCustomTabs(DEFAULT_CUSTOM_TABS);
          }
        } else {
          if (isMounted) {
            setCustomTabs(DEFAULT_CUSTOM_TABS);
            localStorage.setItem('gdx_custom_tabs', JSON.stringify(DEFAULT_CUSTOM_TABS));
          }
        }
        setTabsLoading(false);
        return;
      }

      try {
        const { db } = await getFirebase();
        if (!db) {
          if (isMounted) setCustomTabs(DEFAULT_CUSTOM_TABS);
          setTabsLoading(false);
          return;
        }

        const q = query(collection(db, 'ledger_tabs'), where('userId', '==', user.uid));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          const batch = writeBatch(db);
          DEFAULT_CUSTOM_TABS.forEach(tab => {
            const docRef = doc(collection(db, 'ledger_tabs'));
            batch.set(docRef, {
              ...tab,
              id: docRef.id,
              userId: user.uid,
              createdAt: serverTimestamp()
            });
          });
          await batch.commit();
          
          const newSnapshot = await getDocs(q);
          const loaded = newSnapshot.docs.map(d => ({
            id: d.id,
            label: d.data().label,
            typeCode: d.data().typeCode,
            colorClass: d.data().colorClass
          } as LedgerTab));
          if (isMounted) setCustomTabs(loaded);
        } else {
          const loaded = snapshot.docs.map(d => ({
            id: d.id,
            label: d.data().label,
            typeCode: d.data().typeCode,
            colorClass: d.data().colorClass
          } as LedgerTab));
          if (isMounted) setCustomTabs(loaded);
        }
      } catch (err) {
        console.error("Error loading ledger tabs:", err);
        if (isMounted) setCustomTabs(DEFAULT_CUSTOM_TABS);
      } finally {
        if (isMounted) setTabsLoading(false);
      }
    };

    loadTabs();
    return () => { isMounted = false; };
  }, [user]);

  const addCustomTab = async (newTab: Omit<LedgerTab, 'id'>) => {
    const tabId = crypto.randomUUID();
    const tabData: LedgerTab = {
      ...newTab,
      id: tabId
    };

    if (!user) {
      const updated = [...customTabs, tabData];
      setCustomTabs(updated);
      localStorage.setItem('gdx_custom_tabs', JSON.stringify(updated));
      showToast('Tab added locally!');
      return;
    }

    try {
      const { db } = await getFirebase();
      if (!db) return;

      await setDoc(doc(db, 'ledger_tabs', tabId), {
        ...tabData,
        userId: user.uid,
        createdAt: serverTimestamp()
      });
      setCustomTabs(prev => [...prev, tabData]);
      showToast('Tab added to Cloud!');
    } catch (err) {
      showToast('Failed to add tab', 'error');
      console.error(err);
    }
  };

  const updateCustomTab = async (tabId: string, updatedFields: Partial<Omit<LedgerTab, 'id'>>) => {
    if (!user) {
      const updated = customTabs.map(t => t.id === tabId ? { ...t, ...updatedFields } : t);
      setCustomTabs(updated);
      localStorage.setItem('gdx_custom_tabs', JSON.stringify(updated));
      showToast('Tab updated locally!');
      return;
    }

    try {
      const { db } = await getFirebase();
      if (!db) return;

      await updateDoc(doc(db, 'ledger_tabs', tabId), {
        ...updatedFields,
        updatedAt: serverTimestamp()
      });
      setCustomTabs(prev => prev.map(t => t.id === tabId ? { ...t, ...updatedFields } : t));
      showToast('Tab updated in Cloud!');
    } catch (err) {
      showToast('Failed to update tab', 'error');
      console.error(err);
    }
  };

  const deleteCustomTab = async (tabId: string) => {
    if (customTabs.length <= 1) {
      showToast('At least one tab must remain!', 'error');
      return;
    }

    if (!user) {
      const updated = customTabs.filter(t => t.id !== tabId);
      setCustomTabs(updated);
      localStorage.setItem('gdx_custom_tabs', JSON.stringify(updated));
      showToast('Tab deleted locally!');
      if (activeTab === tabId) {
        setActiveTab('standard');
      }
      return;
    }

    try {
      const { db } = await getFirebase();
      if (!db) return;

      await deleteDoc(doc(db, 'ledger_tabs', tabId));
      setCustomTabs(prev => prev.filter(t => t.id !== tabId));
      showToast('Tab deleted from Cloud!');
      if (activeTab === tabId) {
        setActiveTab('standard');
      }
    } catch (err) {
      showToast('Failed to delete tab', 'error');
      console.error(err);
    }
  };

  // Admin logic
  const [hasEnteredApp, setHasEnteredApp] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const isAdminEmail = user?.email === 'xrihman@gmail.com' || user?.email === 'mohdalikhan990x@gmail.com';

  // Use dynamically updated localDate instead of static initialization
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterFromDate, setFilterFromDate] = useState(getLocalDateString()); // Defaults to today
  const [filterToDate, setFilterToDate] = useState(getLocalDateString());     // Defaults to today
  
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const prevLocalDate = React.useRef(localDate);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isRefundOpen, setIsRefundOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const { isPremium, expiryDate, planName, loading: premiumLoading } = usePremiumStatus(user);
  const [bulkInput, setBulkInput] = useState('');

  // --- No Auto-popup for Subscription (Replaced with persistent banner) ---
  useEffect(() => {
    if (premiumLoading || !user) return;
    
    // We only show the modal once on login if not premium
    const initialTimeout = setTimeout(() => {
      if (!isPremium) {
        setIsSubscriptionModalOpen(true);
      }
    }, 5000);

    return () => clearTimeout(initialTimeout);
  }, [isPremium, premiumLoading, user]);

  // --- Exit Intent Guidance ---
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const message = "Are you sure you want to close GDX Website? Please confirm your action.";
      speak('GDX Zishan website istemal karne ke liye shukriya', 'professional');
      e.preventDefault();
      e.returnValue = message;
      return message;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);
  // -----------------------------
  // ------------------------------------
  const isNearExpiry = useMemo(() => {
    if (!isPremium || !expiryDate) return false;
    const now = new Date();
    const timeLeft = expiryDate.getTime() - now.getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    return timeLeft > 0 && timeLeft <= oneDayMs;
  }, [isPremium, expiryDate]);

  const [bulkPreview, setBulkPreview] = useState<Entry[]>([]);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' }[]>([]);
  const [supportName, setSupportName] = useState('');
  const customerInputRef = React.useRef<HTMLInputElement>(null);
  const [supportMessage, setSupportMessage] = useState('');
  const [supportSaving, setSupportSaving] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
    
    // We now use more specific speech triggers in the handler functions
    // so we can remove the generic toast speech here.

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
        recipientEmail: 'xrihman@gmail.com',
        name: supportName,
        message: supportMessage,
        createdAt: serverTimestamp(),
      });

      const whatsappNumber = "917065162279";
      const text = `Hello Zishan, my name is ${supportName}. I have an issue: ${supportMessage}`;
      const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`;
      
      speak('Aapka message WhatsApp par bheja ja raha hai', 'professional');
      
      // Open WhatsApp and close modal
      setTimeout(() => {
        window.open(whatsappUrl, '_blank');
      }, 1000);

      showToast('Message redirected to WhatsApp!');
      setSupportName('');
      setSupportMessage('');
      setIsSupportOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'support_tickets');
    } finally {
      setSupportSaving(false);
    }
  };

  const handleAdminTitleClick = () => {
    if (isAdminEmail) {
      if (isAdminAuthenticated) {
        setActiveTab('admin');
      } else {
        setIsAdminModalOpen(true);
      }
    } else {
      if (!user) {
        showToast('You must be logged in as an Admin (Local Guest mode restricts this).', 'error');
      } else {
        showToast('Unauthorized. You are not an admin.', 'error');
      }
    }
  };

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    const storedPassword = localStorage.getItem('admin_password') || 'zishan@001';
    if (adminPasswordInput === storedPassword) {
      setIsAdminAuthenticated(true);
      setIsAdminModalOpen(false);
      setAdminPasswordInput('');
      setActiveTab('admin');
      showToast('Admin access granted');
    } else {
      showToast('Incorrect password', 'error');
    }
  };

  const [formData, setFormData] = useState({
    date: getLocalDateString(),
    customerName: '',
    type: 'S' as string,
    quantity: '1',
    totalAmount: '',
    receivedAmount: '',
  });

  useEffect(() => {
    if (!editingId) {
      setFormData(prev => {
        let newType = prev.type;
        const matchedTab = customTabs.find(t => t.id === activeTab);
        if (matchedTab) {
          newType = matchedTab.typeCode;
        } else if (activeTab === 'standard' && customTabs.some(t => t.typeCode === prev.type)) {
          newType = 'S';
        }
        
        if (newType !== prev.type) {
          return { ...prev, type: newType };
        }
        return prev;
      });
    }
  }, [activeTab, editingId, customTabs]);

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
          // Fetch Entries
          const entrySnapshot = await getDocs(q);
          const allEntryDocs = entrySnapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
          })) as Entry[];

          setTotalEntryCount(allEntryDocs.length);

          // Fetch Invoices
          const invoiceQuery = query(collection(db, 'invoices'), where('userId', '==', user.uid));
          const invoiceSnapshot = await getDocs(invoiceQuery);
          const allInvoiceDocs = invoiceSnapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
          })) as any[];
          setTotalInvoiceCount(allInvoiceDocs.length);

          // Compute daily counts
          const todayDateStr = getLocalDateString();
          const todayEntryCount = allEntryDocs.filter(doc => doc.date === todayDateStr).length;
          const todayInvoiceCount = allInvoiceDocs.filter(doc => (doc.invoiceDate || doc.date) === todayDateStr).length;

          setDailyEntryCount(todayEntryCount);
          setDailyInvoiceCount(todayInvoiceCount);

          // Perform date filtering locally since composite indexes aren't created by default
          let docs = [...allEntryDocs];
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
      setFilterMonth(0);
    }
  };

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customerName || !formData.totalAmount) return;

    if (!editingId) {
      // Free User Entry Limit (20 total across entries and invoices)
      if (!isPremium && (totalEntryCount + totalInvoiceCount) >= 20) {
        speak('Aapki free entry limit khatam ho gayi hai. Kripya premium subscription lein.', 'professional');
        setIsSubscriptionModalOpen(true);
        showToast('Free limit reached (Max 20 total entries)', 'error');
        return;
      }
      
      // Lite Plan Daily Limit (100 total across entries and invoices)
      if (isPremium && planName === 'Lite' && (dailyEntryCount + dailyInvoiceCount) >= 100) {
        speak('Aapki aaj ki 100 entry ki limit khatam ho gayi hai. Kal dobara koshish karein ya business plan lein.', 'professional');
        setIsSubscriptionModalOpen(true);
        showToast('Daily limit reached (Max 100 total entries today)', 'error');
        return;
      }

      // Plus Plan Daily Limit (200 total across entries and invoices)
      if (isPremium && planName === 'Plus' && (dailyEntryCount + dailyInvoiceCount) >= 200) {
        speak('Aapki aaj ki 200 entry ki limit khatam ho gayi hai. Kal dobara koshish karein ya business plan lein.', 'professional');
        setIsSubscriptionModalOpen(true);
        showToast('Daily limit reached (Max 200 total entries today)', 'error');
        return;
      }
      
      speak('Nayi entry joad di gayi hai', 'professional');
    } else {
      speak('Entry surakshit kar li gayi hai', 'professional');
    }

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
        // Auto-switch tab
        const matchedTab = customTabs.find(t => t.typeCode === formData.type);
        if (matchedTab) {
          setActiveTab(matchedTab.id);
        } else {
          setActiveTab('standard');
        }
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
        // Auto-switch tab
        const matchedTab = customTabs.find(t => t.typeCode === formData.type);
        if (matchedTab) {
          setActiveTab(matchedTab.id);
        } else {
          setActiveTab('standard');
        }
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
    else if (entry.type === 'Aadil') setActiveTab('aadil');
    else if (entry.type === 'Ashish') setActiveTab('ashish');
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
      speak('Data successfully paste ho gaya hai', 'professional');
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
    const customTabCodes = customTabs.map(t => t.typeCode);
    return entries.filter(entry => {
      const entryDate = new Date(entry.date);
      let matchesTab = false;
      const matchedTab = customTabs.find(t => t.id === activeTab);
      if (matchedTab) {
        matchesTab = entry.type === matchedTab.typeCode;
      } else if (activeTab === 'standard') {
        matchesTab = !customTabCodes.includes(entry.type);
      } else {
        matchesTab = true;
      }

      const matchesSearch = entry.customerName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesMonth = (!filterFromDate && !filterToDate && filterMonth !== 0) 
                           ? (entryDate.getMonth() + 1 === filterMonth && entryDate.getFullYear() === filterYear) 
                           : true;
      const matchesFromDate = filterFromDate ? entry.date >= filterFromDate : true;
      const matchesToDate = filterToDate ? entry.date <= filterToDate : true;
      return matchesTab && matchesSearch && matchesMonth && matchesFromDate && matchesToDate;
    });
  }, [entries, activeTab, searchTerm, filterMonth, filterYear, filterFromDate, filterToDate, customTabs]);

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
    speak('Bill taiyar hai, ab aap print kar sakte hain', 'professional');
  };

  const handlePrint = () => {
    speak('Bill taiyar hai, ab aap print kar sakte hain', 'professional');
    window.print();
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFilterFromDate(getLocalDateString());
    setFilterToDate(getLocalDateString());
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
    return (
      <AnimatePresence mode="wait">
        {!hasEnteredApp ? (
          <WelcomeScreen key="welcome" onEnter={() => setHasEnteredApp(true)} />
        ) : (
          <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full h-full">
            <LoginPage onLoginSuccess={() => {}} onSkipLogin={() => setLocalMode(true)} />
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {!hasEnteredApp ? (
        <WelcomeScreen key="welcome" onEnter={() => setHasEnteredApp(true)} />
      ) : (
        <motion.div key="app" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} className="min-h-screen bg-gray-50 p-2 md:p-4 font-sans text-gray-900 print:p-0 print:bg-white print:text-black">
          <div className="max-w-6xl mx-auto bg-white border border-gray-200 shadow-xl rounded-lg overflow-hidden print:overflow-visible print:shadow-none print:m-0 print:border-none">
        
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
                <div className="flex flex-col">
                  <span>{toast.message}</span>
                  {isPremium && (toast.message.toLowerCase().includes('saved') || toast.message.toLowerCase().includes('successful') || toast.message.toLowerCase().includes('updated')) && (
                    <span className="text-[8px] opacity-70 uppercase tracking-widest font-black">AI Voice Active</span>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Persistent Premium Banner */}
        {user && !isPremium && !premiumLoading && (
          <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white p-2 px-4 flex flex-wrap items-center justify-between gap-3 text-sm font-bold print:hidden">
            <div className="flex items-center gap-2">
              <Crown size={16} className="text-amber-200 animate-pulse" />
              <span>
                ✨ Unlock the Full Power of GDX! Upgrade to Premium for Unlimited Billing & Secure Cloud Backup.
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[10px] opacity-80 uppercase tracking-tighter">Usage: {(totalEntryCount + totalInvoiceCount)}/20</span>
              <button 
                onClick={() => setIsSubscriptionModalOpen(true)}
                className="bg-white text-orange-600 px-4 py-1 rounded-full text-xs font-black uppercase hover:scale-105 transition-all shadow-sm active:scale-95"
              >
                Upgrade Now
              </button>
            </div>
          </div>
        )}

        {user && isPremium && (planName === 'Lite' || planName === 'Plus') && !premiumLoading && (
          <div className={`bg-gradient-to-r ${planName === 'Lite' ? 'from-blue-600 to-indigo-600' : 'from-purple-600 to-violet-600'} text-white p-2 px-4 flex flex-wrap items-center justify-between gap-3 text-sm font-bold print:hidden`}>
            <div className="flex items-center gap-2">
              <Crown size={16} className="text-blue-200" />
              <span>
                ⚡ GDX {planName} Active: {(dailyEntryCount + dailyInvoiceCount)}/{planName === 'Lite' ? '100' : '200'} Daily Units Consumed.
              </span>
            </div>
            <div className="flex items-center gap-4 text-[10px] opacity-80 uppercase font-black">
              <span>Limit Resets at Dawn</span>
              <button 
                onClick={() => setIsSubscriptionModalOpen(true)}
                className="bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-full transition-colors border border-white/20"
              >
                Upgrade
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="bg-white border-b border-gray-200 p-4 flex flex-col items-center md:flex-row justify-between gap-4 print:hidden rounded-t-lg">
          <div className="flex items-center gap-4">
            <div onClick={handleAdminTitleClick} className="cursor-pointer">
              <Logo iconClassName="w-12 h-12 text-blue-600" textClassName="text-2xl text-gray-900" />
            </div>
            <div className="border-l-2 border-gray-200 pl-4">
              <h1 onClick={handleAdminTitleClick} className="text-xl font-bold tracking-tight text-gray-900 cursor-pointer hover:text-blue-600 transition-colors">
                GDX
              </h1>
              <p className="text-gray-500 print:hidden text-sm mt-0.5 font-medium">
                {user ? `Welcome, ${user.displayName || user.email}` : 'Guest Mode (Local Only)'}
              </p>
              {!user && (
                <div className="mt-1 inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide border border-amber-200 print:hidden">
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
            <button 
              onClick={() => setIsSubscriptionModalOpen(true)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg font-bold transition-all shadow-sm text-sm group relative ${
                isPremium 
                ? 'bg-yellow-100 text-yellow-700 border border-yellow-200 hover:bg-yellow-200' 
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border border-blue-700 hover:from-blue-500 hover:to-indigo-500'
              }`}
            >
              {isPremium && (
                <div className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                </div>
              )}
              <Crown size={16} className={isPremium ? "text-yellow-600" : "animate-bounce"} />
              {isPremium ? (
                <div className="flex flex-col items-start leading-tight">
                  <span className="text-[10px] uppercase opacity-70">Premium Active</span>
                  {expiryDate && (
                    <span className="text-[11px] font-black">
                      {Math.ceil((expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} Days Remaining
                    </span>
                  )}
                </div>
              ) : (
                "Premium"
              )}
            </button>
            {user ? (
              <button 
                onClick={handleSignOut}
                className="flex items-center gap-2 bg-gray-50 text-gray-700 border border-gray-200 px-3 py-2 rounded-lg font-bold hover:bg-gray-100 transition-colors shadow-sm text-sm"
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
          <p className="text-xs text-gray-400 mb-2 uppercase tracking-widest">Official Report by GDX</p>
          <h1 className="text-4xl font-bold uppercase tracking-widest text-black">GDX Report</h1>
          <p className="text-gray-500 mt-2 text-lg font-medium tracking-widest uppercase">Powered by GDX</p>
          <div className="mt-4 text-sm text-gray-500 font-medium font-mono">
            PERIOD: {filterMonth === 0 ? 'ALL MONTHS' : new Date(filterYear, filterMonth - 1).toLocaleString('default', { month: 'long' }).toUpperCase()} {filterYear}
          </div>
        </div>

        {/* Global Print Watermark */}
        <div className="watermark-text">
          zishan gdx
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-gray-100 border-b border-gray-200 print:hidden overflow-x-auto items-center">
          <button
            onClick={() => setActiveTab('standard')}
            className={`whitespace-nowrap px-6 py-3 font-bold text-sm uppercase tracking-wider transition-all border-b-2 ${
              activeTab === 'standard' 
              ? 'bg-white border-blue-600 text-blue-600' 
              : 'text-gray-500 hover:text-gray-700 border-transparent'
            }`}
          >
            Standard Sheet
          </button>
          {customTabs.map(tab => {
            let activeColorClass = 'border-purple-600 text-purple-600';
            if (tab.colorClass === 'pink') activeColorClass = 'border-pink-600 text-pink-600';
            else if (tab.colorClass === 'teal') activeColorClass = 'border-teal-600 text-teal-600';
            else if (tab.colorClass === 'blue') activeColorClass = 'border-blue-600 text-blue-600';
            else if (tab.colorClass === 'indigo') activeColorClass = 'border-indigo-600 text-indigo-600';
            else if (tab.colorClass === 'orange') activeColorClass = 'border-orange-600 text-orange-600';
            else if (tab.colorClass === 'red') activeColorClass = 'border-red-600 text-red-600';
            else if (tab.colorClass === 'green') activeColorClass = 'border-green-600 text-green-600';

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap px-6 py-3 font-bold text-sm uppercase tracking-wider transition-all border-b-2 ${
                  activeTab === tab.id 
                  ? `bg-white ${activeColorClass}` 
                  : 'text-gray-500 hover:text-gray-700 border-transparent'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
          <button
            onClick={() => setIsTabsManagerOpen(true)}
            className="whitespace-nowrap px-4 py-3 font-bold text-xs uppercase tracking-wider text-blue-600 hover:text-blue-800 flex items-center gap-1 border-b-2 border-transparent hover:border-blue-200 transition-all bg-blue-50/50"
            title="Edit, Add, or Remove Ledger Tabs"
          >
            <Pencil size={12} />
            Manage Tabs
          </button>
          <button
            onClick={() => setActiveTab('invoice')}
            className={`whitespace-nowrap px-6 py-3 font-bold text-sm uppercase tracking-wider transition-all border-b-2 ${
              activeTab === 'invoice' 
              ? 'bg-white border-blue-600 text-blue-600' 
              : 'text-gray-500 hover:text-gray-700 border-transparent'
            }`}
          >
            Generate Bill
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`whitespace-nowrap px-6 py-3 font-bold text-sm uppercase tracking-wider transition-all border-b-2 ${
              activeTab === 'history' 
              ? 'bg-white border-green-600 text-green-600' 
              : 'text-gray-500 hover:text-gray-700 border-transparent'
            }`}
          >
            Invoice History
          </button>
          <button
            onClick={() => setActiveTab('stock')}
            className={`whitespace-nowrap px-6 py-3 font-bold text-sm uppercase tracking-wider transition-all border-b-2 ${
              activeTab === 'stock' 
              ? 'bg-white border-orange-600 text-orange-600' 
              : 'text-gray-500 hover:text-gray-700 border-transparent'
            }`}
          >
            Stock
          </button>
        </div>

        {activeTab === 'admin' ? (
          <AdminDashboard />
        ) : activeTab === 'invoice' ? (
          <InvoiceGenerator 
            user={user} 
            onSaved={() => setActiveTab('standard')} 
            isPremium={isPremium} 
            planName={planName} 
            onRequirePremium={() => setIsSubscriptionModalOpen(true)}
            totalEntryCount={totalEntryCount}
            dailyEntryCount={dailyEntryCount}
          />
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
                      {customTabs.map(tab => (
                        <option key={tab.id} value={tab.typeCode}>
                          {tab.typeCode} ({tab.label})
                        </option>
                      ))}
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
          <div className="bg-white border border-gray-200 p-4 rounded-lg shadow-sm border-l-4 border-l-blue-600">
            <h3 className="text-gray-500 text-[10px] font-black uppercase tracking-widest">Total Sales</h3>
            <p className="text-2xl font-black text-gray-900 mt-1">₹{totals.total.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-white border border-gray-200 p-4 rounded-lg shadow-sm border-l-4 border-l-green-600">
            <h3 className="text-gray-500 text-[10px] font-black uppercase tracking-widest">Total Jama</h3>
            <p className="text-2xl font-black text-gray-900 mt-1">₹{totals.received.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-white border border-gray-200 p-4 rounded-lg shadow-sm border-l-4 border-l-red-600">
            <h3 className="text-gray-500 text-[10px] font-black uppercase tracking-widest">Total Udhaari</h3>
            <p className="text-2xl font-black text-red-600 mt-1">₹{totals.pending.toLocaleString('en-IN')}</p>
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
                onChange={(e) => {
                  setFilterMonth(Number(e.target.value));
                  setFilterFromDate('');
                  setFilterToDate('');
                }}
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
                onChange={(e) => {
                  setFilterFromDate(e.target.value);
                  setFilterMonth(0);
                }}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500 uppercase">To:</span>
              <input 
                type="date" 
                value={filterToDate}
                onChange={(e) => {
                  setFilterToDate(e.target.value);
                  setFilterMonth(0);
                }}
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
        <div className="overflow-x-auto min-h-[300px] border-t border-gray-200">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#EEEEEE] text-black print:bg-gray-100">
                <th className="p-3 border border-gray-200 first:border-l-0 text-xs font-bold uppercase whitespace-nowrap print:hidden">Sr. No</th>
                <th className="p-3 border border-gray-200 text-xs font-bold uppercase whitespace-nowrap">Date</th>
                <th className="p-3 border border-gray-200 text-xs font-bold uppercase whitespace-nowrap hidden print:table-cell">Time</th>
                <th className="p-3 border border-gray-200 text-xs font-bold uppercase whitespace-nowrap">Name</th>
                <th className="p-3 border border-gray-200 text-xs font-bold uppercase whitespace-nowrap text-center print:hidden">Type</th>
                <th className="p-3 border border-gray-200 text-xs font-bold uppercase whitespace-nowrap text-right text-black">Total</th>
                <th className="p-3 border border-gray-200 text-xs font-bold uppercase whitespace-nowrap text-right text-black">Jama</th>
                <th className="p-3 border border-gray-200 text-xs font-bold uppercase whitespace-nowrap text-right text-black">Udhari</th>
                <th className="p-3 border border-gray-200 last:border-r-0 text-xs font-bold uppercase whitespace-nowrap text-center print:hidden">Action</th>
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
                        {(() => {
                          const matchedTab = customTabs.find(t => t.typeCode === entry.type);
                          let colorClasses = 'bg-gray-100 text-gray-700';
                          if (entry.type === 'S') colorClasses = 'bg-green-100 text-green-700';
                          else if (entry.type === 'O') colorClasses = 'bg-blue-100 text-blue-700';
                          else if (entry.type === 'K') colorClasses = 'bg-indigo-100 text-indigo-700';
                          else if (entry.type === 'D') colorClasses = 'bg-orange-100 text-orange-700';
                          else if (entry.type === 'SU') colorClasses = 'bg-yellow-100 text-yellow-700';
                          else if (matchedTab) {
                            const color = matchedTab.colorClass;
                            if (color === 'purple') colorClasses = 'bg-purple-100 text-purple-700';
                            else if (color === 'pink') colorClasses = 'bg-pink-100 text-pink-700';
                            else if (color === 'teal') colorClasses = 'bg-teal-100 text-teal-700';
                            else if (color === 'blue') colorClasses = 'bg-blue-100 text-blue-700';
                            else if (color === 'indigo') colorClasses = 'bg-indigo-100 text-indigo-700';
                            else if (color === 'orange') colorClasses = 'bg-orange-100 text-orange-700';
                            else if (color === 'red') colorClasses = 'bg-red-100 text-red-700';
                            else if (color === 'green') colorClasses = 'bg-green-100 text-green-700';
                          }
                          return (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${colorClasses}`}>
                              {entry.type}
                            </span>
                          );
                        })()}
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
                <tr className="bg-gray-100 text-black border-t-2 border-gray-300 font-bold text-lg print:bg-gray-100">
                  <td colSpan={4} className="p-4 text-right pr-6 uppercase tracking-wider text-[10px] print:hidden">Summary</td>
                  <td className="p-4 text-right font-mono text-sm">₹{totals.total.toLocaleString('en-IN', { minimumFractionDigits: 1 })}</td>
                  <td className="p-4 text-right font-mono text-green-700 print:text-gray-800 text-sm">₹{totals.received.toLocaleString('en-IN', { minimumFractionDigits: 1 })}</td>
                  <td className="p-4 text-right font-mono text-red-600 print:text-gray-800 text-sm">₹{totals.pending.toLocaleString('en-IN', { minimumFractionDigits: 1 })}</td>
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
        <p className="mb-2">&copy; {new Date().getFullYear()} GDX. Your data is securely stored in the cloud.</p>
        <div className="flex justify-center items-center gap-2 md:gap-4 text-xs font-semibold flex-wrap px-4">
          <button onClick={() => setIsAboutOpen(true)} className="hover:text-gray-800 hover:underline transition-colors focus:outline-none">About Us</button>
          <span>&middot;</span>
          <button onClick={() => setIsPrivacyOpen(true)} className="hover:text-gray-800 hover:underline transition-colors focus:outline-none">Privacy Policy</button>
          <span>&middot;</span>
          <button onClick={() => setIsTermsOpen(true)} className="hover:text-gray-800 hover:underline transition-colors focus:outline-none">Terms & Conditions</button>
          <span>&middot;</span>
          <button onClick={() => setIsRefundOpen(true)} className="hover:text-gray-800 hover:underline transition-colors focus:outline-none">Refund & Cancellation</button>
          <span>&middot;</span>
          <button onClick={() => setIsSupportOpen(true)} className="hover:text-gray-800 hover:underline transition-colors focus:outline-none">Contact Us</button>
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
                <strong className="text-gray-900">GDX</strong> ek professional digital ledger aur billing solution hai jo chhote aur bade businesses ko unka hisaab-kitaab digital karne mein madad karta hai.
              </p>
              <p>
                Hamara maksad billing ko aasan, fast, aur error-free banana hai taaki aap sirf apne business ki growth par focus kar saken. Paper registers aur manual hisaab ko bhool jaiye aur ek modern digital daybook ka anubhav lijiye.
              </p>
            </div>
            <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
              <button 
                onMouseEnter={() => isPremium && speak('GDX Website istemal karne ke liye shukriya', 'sweet')}
                onClick={() => setIsAboutOpen(false)} 
                className="px-6 py-2 bg-gray-900 text-white font-bold rounded-lg hover:bg-gray-800 transition-colors focus:outline-none relative group"
              >
                {isPremium && (
                  <span className="absolute -top-2 -right-2 bg-yellow-400 text-[8px] text-black px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter shadow-sm border border-black/10 opacity-0 group-hover:opacity-100 transition-opacity">Voice Active</span>
                )}
                Close
              </button>
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
              <button 
                onMouseEnter={() => isPremium && speak('GDX Website istemal karne ke liye shukriya', 'sweet')}
                onClick={() => setIsPrivacyOpen(false)} 
                className="px-6 py-2 bg-gray-900 text-white font-bold rounded-lg hover:bg-gray-800 transition-colors focus:outline-none relative group"
              >
                {isPremium && (
                  <span className="absolute -top-2 -right-2 bg-yellow-400 text-[8px] text-black px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter shadow-sm border border-black/10 opacity-0 group-hover:opacity-100 transition-opacity">Voice Active</span>
                )}
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Terms & Conditions Modal */}
      {isTermsOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 print:hidden overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-8 relative max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
            <button onClick={() => setIsTermsOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 focus:outline-none">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="text-2xl font-black text-gray-900 mb-6 tracking-tight">Terms & Conditions</h2>
            <div className="space-y-6 text-gray-600 text-sm">
              <p>Welcome to GDX. By accessing and using our application, you accept and agree to be bound by the terms and provision of this agreement.</p>
              
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-start gap-4">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0"></div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">Service Usage</h3>
                  <p>You agree to use this service only for lawful purposes, and in a way that does not infringe the rights of, restrict or inhibit anyone else's use and enjoyment of GDX.</p>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-start gap-4">
                <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 shrink-0"></div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">Account Responsibility</h3>
                  <p>You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.</p>
                </div>
              </div>
            </div>
            
            <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
              <button 
                onMouseEnter={() => isPremium && speak('GDX Website istemal karne ke liye shukriya', 'sweet')}
                onClick={() => setIsTermsOpen(false)} 
                className="px-6 py-2 bg-gray-900 text-white font-bold rounded-lg hover:bg-gray-800 transition-colors focus:outline-none relative group"
              >
                {isPremium && (
                  <span className="absolute -top-2 -right-2 bg-yellow-400 text-[8px] text-black px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter shadow-sm border border-black/10 opacity-0 group-hover:opacity-100 transition-opacity">Voice Active</span>
                )}
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund & Cancellation Policy Modal */}
      {isRefundOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 print:hidden overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-8 relative max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
            <button onClick={() => setIsRefundOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 focus:outline-none">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="text-2xl font-black text-gray-900 mb-6 tracking-tight">Refund & Cancellation Policy</h2>
            <div className="space-y-6 text-gray-600 text-sm">
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-start gap-4">
                <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0"></div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">Non-Refundable</h3>
                  <p>Digital services are non-refundable once activated. Due to the nature of digital goods and subscriptions, all sales are final.</p>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-start gap-4">
                <div className="w-2 h-2 rounded-full bg-orange-500 mt-1.5 shrink-0"></div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">Cancellation</h3>
                  <p>You may cancel your subscription at any time, but your premium access will remain active until the end of your current billing period. No partial refunds will be provided.</p>
                </div>
              </div>
            </div>
            
            <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
              <button 
                onMouseEnter={() => isPremium && speak('GDX Website istemal karne ke liye shukriya', 'sweet')}
                onClick={() => setIsRefundOpen(false)} 
                className="px-6 py-2 bg-gray-900 text-white font-bold rounded-lg hover:bg-gray-800 transition-colors focus:outline-none relative group"
              >
                {isPremium && (
                  <span className="absolute -top-2 -right-2 bg-yellow-400 text-[8px] text-black px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter shadow-sm border border-black/10 opacity-0 group-hover:opacity-100 transition-opacity">Voice Active</span>
                )}
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Support Modal */}
      {isSupportOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 print:hidden overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 relative my-8 animate-in fade-in zoom-in duration-200">
            <button 
              onMouseEnter={() => isPremium && speak('GDX Website istemal karne ke liye shukriya', 'sweet')}
              onClick={() => setIsSupportOpen(false)} 
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 focus:outline-none group"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              {isPremium && (
                <span className="absolute -bottom-4 right-0 bg-yellow-400 text-[6px] text-black px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter shadow-sm border border-black/10 opacity-0 group-hover:opacity-100 transition-opacity">Voice Active</span>
              )}
            </button>
            <h2 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">Support & Contact</h2>
            <p className="text-gray-500 text-sm mb-6">Need help with the app? We are here for you.</p>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-6 space-y-3">
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase">Email Us</h3>
                <p className="text-gray-900 font-medium">Xrihman@gmail.com</p>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase">Call or WhatsApp</h3>
                <p className="text-gray-900 font-medium">+91 7075162279</p>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase">Business</h3>
                <p className="text-gray-900 font-medium">GDX</p>
              </div>
            </div>

            <a 
              href="https://wa.me/917075162279?text=Hello%20GDX%2C%20mujhe%20app%20mein%20kuch%20help%20chahiye." 
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
                className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-4 px-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-black transition-all shadow-lg shadow-gray-200 disabled:opacity-50 active:scale-[0.98]"
              >
                {supportSaving ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <MessageCircle size={18} className="text-green-400" />
                    Submit Ticket via WhatsApp
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400 font-medium tracking-wide">Supported by GDX Team.</p>
              <p className="text-xs text-gray-400 mt-0.5">We usually reply within 24 hours.</p>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Ledger Tabs Manager Modal */}
      {isTabsManagerOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg border border-gray-100 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-xl text-gray-900 flex items-center gap-2 uppercase tracking-tight">
                <Pencil size={20} className="text-blue-600" /> Manage Ledger Tabs
              </h3>
              <button 
                onClick={() => {
                  setIsTabsManagerOpen(false);
                  setEditingTabId(null);
                }} 
                className="text-gray-400 hover:text-gray-800 transition-colors p-1 hover:bg-gray-100 rounded-full"
              >
                <X size={20}/>
              </button>
            </div>
            
            <p className="text-xs text-gray-500 font-medium mb-4">
              Aap naye Ledger Tabs (jaise VRS, Aadil, Ashish) yahan se add kar sakte hain, purane edit kar sakte hain, ya unhe delete kar sakte hain.
            </p>

            {/* List of current tabs */}
            <div className="flex-1 overflow-y-auto mb-4 border border-gray-100 rounded-xl p-3 bg-gray-50 space-y-2">
              <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Current Custom Tabs</span>
              {customTabs.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center font-medium">No custom tabs found. Add some below!</p>
              ) : (
                customTabs.map(tab => (
                  <div key={tab.id} className="bg-white border border-gray-200 rounded-lg p-2.5 flex items-center justify-between gap-3 shadow-sm hover:border-gray-300 transition-all">
                    {editingTabId === tab.id ? (
                      <div className="flex-1 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[9px] font-bold text-gray-400 uppercase">Label Name</label>
                            <input 
                              type="text" 
                              value={editingTabLabel} 
                              onChange={e => setEditingTabLabel(e.target.value)} 
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none font-bold"
                              placeholder="e.g. VRS People"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-gray-400 uppercase">Type Code (stores in DB)</label>
                            <input 
                              type="text" 
                              value={editingTabTypeCode} 
                              onChange={e => setEditingTabTypeCode(e.target.value)} 
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none font-bold"
                              placeholder="e.g. V"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-bold text-gray-400 uppercase">Color:</span>
                            <div className="flex gap-1">
                              {['purple', 'pink', 'teal', 'blue', 'indigo', 'orange', 'red', 'green'].map(c => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => setEditingTabColor(c)}
                                  className={`w-4 h-4 rounded-full border transition-all ${
                                    c === 'purple' ? 'bg-purple-500' :
                                    c === 'pink' ? 'bg-pink-500' :
                                    c === 'teal' ? 'bg-teal-500' :
                                    c === 'blue' ? 'bg-blue-500' :
                                    c === 'indigo' ? 'bg-indigo-500' :
                                    c === 'orange' ? 'bg-orange-500' :
                                    c === 'red' ? 'bg-red-500' :
                                    'bg-green-500'
                                  } ${editingTabColor === c ? 'ring-2 ring-offset-1 ring-gray-950 scale-110' : 'opacity-80 border-transparent'}`}
                                />
                              ))}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => {
                                if (!editingTabLabel.trim() || !editingTabTypeCode.trim()) {
                                  showToast('Please fill all fields', 'error');
                                  return;
                                }
                                updateCustomTab(tab.id, {
                                  label: editingTabLabel.trim(),
                                  typeCode: editingTabTypeCode.trim(),
                                  colorClass: editingTabColor
                                });
                                setEditingTabId(null);
                              }}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-black text-[9px] uppercase px-2 py-1 rounded transition-colors"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingTabId(null)}
                              className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-black text-[9px] uppercase px-2 py-1 rounded transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span className={`w-3 h-3 rounded-full ${
                            tab.colorClass === 'purple' ? 'bg-purple-500' :
                            tab.colorClass === 'pink' ? 'bg-pink-500' :
                            tab.colorClass === 'teal' ? 'bg-teal-500' :
                            tab.colorClass === 'blue' ? 'bg-blue-500' :
                            tab.colorClass === 'indigo' ? 'bg-indigo-500' :
                            tab.colorClass === 'orange' ? 'bg-orange-500' :
                            tab.colorClass === 'red' ? 'bg-red-500' :
                            'bg-green-500'
                          }`} />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-gray-900">{tab.label}</span>
                            <span className="text-[9px] font-mono text-gray-500 uppercase tracking-wider">CODE: {tab.typeCode}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingTabId(tab.id);
                              setEditingTabLabel(tab.label);
                              setEditingTabTypeCode(tab.typeCode);
                              setEditingTabColor(tab.colorClass);
                            }}
                            className="p-1 text-blue-500 hover:bg-blue-50 rounded transition-all"
                            title="Edit Tab"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete tab "${tab.label}"?`)) {
                                deleteCustomTab(tab.id);
                              }
                            }}
                            className="p-1 text-red-500 hover:bg-red-50 rounded transition-all"
                            title="Delete Tab"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Add New Tab form */}
            <div className="border-t border-gray-200 pt-4 space-y-3">
              <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Add New Tab</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] font-bold text-gray-400 uppercase">Tab Name (Label)</label>
                  <input 
                    type="text" 
                    value={newTabLabel} 
                    onChange={e => setNewTabLabel(e.target.value)} 
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 transition-shadow font-bold"
                    placeholder="e.g. Ashish Only"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-gray-400 uppercase">Type Code (stores in DB)</label>
                  <input 
                    type="text" 
                    value={newTabTypeCode} 
                    onChange={e => setNewTabTypeCode(e.target.value)} 
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 transition-shadow font-bold"
                    placeholder="e.g. Ashish"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold text-gray-400 uppercase">Color:</span>
                  <div className="flex gap-1">
                    {['purple', 'pink', 'teal', 'blue', 'indigo', 'orange', 'red', 'green'].map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewTabColor(c)}
                        className={`w-5 h-5 rounded-full border transition-all ${
                          c === 'purple' ? 'bg-purple-500' :
                          c === 'pink' ? 'bg-pink-500' :
                          c === 'teal' ? 'bg-teal-500' :
                          c === 'blue' ? 'bg-blue-500' :
                          c === 'indigo' ? 'bg-indigo-500' :
                          c === 'orange' ? 'bg-orange-500' :
                          c === 'red' ? 'bg-red-500' :
                          'bg-green-500'
                        } ${newTabColor === c ? 'ring-2 ring-offset-2 ring-gray-950 scale-110' : 'opacity-80 border-transparent'}`}
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!newTabLabel.trim() || !newTabTypeCode.trim()) {
                      showToast('Please enter both label and type code', 'error');
                      return;
                    }
                    if (customTabs.some(t => t.typeCode === newTabTypeCode.trim())) {
                      showToast('This Type Code already exists!', 'error');
                      return;
                    }
                    addCustomTab({
                      label: newTabLabel.trim(),
                      typeCode: newTabTypeCode.trim(),
                      colorClass: newTabColor
                    });
                    setNewTabLabel('');
                    setNewTabTypeCode('');
                    setNewTabColor('purple');
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] uppercase tracking-wider py-2.5 px-4 rounded-lg shadow transition-colors flex items-center gap-1"
                >
                  <Plus size={12} /> Add Tab
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Auth Modal */}
      {isAdminModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm border border-red-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-2xl text-gray-900 flex items-center gap-2">
                <ShieldAlert className="text-red-600" /> System Admin
              </h3>
              <button onClick={() => setIsAdminModalOpen(false)} className="text-gray-400 hover:text-gray-800"><X size={20}/></button>
            </div>
            <p className="text-sm text-gray-500 font-medium mb-6">Enter master password for GDX administrator access.</p>
            <form onSubmit={handleAdminAuth}>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Master Password</label>
                  <input 
                    autoFocus 
                    type="password" 
                    value={adminPasswordInput} 
                    onChange={e => setAdminPasswordInput(e.target.value)} 
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:border-red-500 focus:ring-4 focus:ring-red-100 outline-none font-mono text-center transition-all bg-gray-50" 
                    placeholder="Enter password" 
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition-all shadow-sm flex items-center justify-center gap-2"
                >
                  Verify Identity
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Subscription Modal */}
      <SubscriptionModal 
        isOpen={isSubscriptionModalOpen} 
        onClose={() => setIsSubscriptionModalOpen(false)} 
        user={user} 
        isNearExpiry={isNearExpiry}
      />

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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
