import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Printer, Save, FileDown, History, ClipboardList, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { addDoc, collection, serverTimestamp, writeBatch, query, where, getDocs, doc, increment } from 'firebase/firestore';
import { getFirebase, handleFirestoreError, OperationType } from '../lib/firebase';
import { Logo } from './Logo';
import { useProductPrices } from '../hooks/useProductPrices';
import { useLocalDate, getLocalDateString } from '../hooks/useLocalDate';
import { useSalesmen } from '../context/SalesmanContext';
import { speak } from '../lib/speech';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { numberToWords } from '../lib/numberToWords';

type IndustryType = 'Cafe/Restaurant' | 'Clothing Store' | 'General Grocery' | 'Service Center';

interface InvoiceItem {
  id: string;
  name: string;
  quantity: number;
  rate: number;
  gstPercent: number;
  // Clothing Specific
  size?: string;
  color?: string;
  hsnCode?: string;
  itemDiscountPercent?: number;
}


export default function InvoiceGenerator({ 
  user, 
  onSaved, 
  isPremium, 
  planName, 
  onRequirePremium,
  totalEntryCount,
  dailyEntryCount
}: { 
  user: any, 
  onSaved: () => void, 
  isPremium: boolean, 
  planName: string | null, 
  onRequirePremium: () => void,
  totalEntryCount: number,
  dailyEntryCount: number
}) {
  const [billNo, setBillNo] = useState('');
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [dailyInvoiceCount, setDailyInvoiceCount] = useState(0);
  const [brandName, setBrandName] = useState('GDX');
  const [brandAddress, setBrandAddress] = useState('Main Bazaar, New Delhi - 110001');
  const [industry, setIndustry] = useState<IndustryType>('General Grocery');
  const [gstin, setGstin] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  
  // Cafe specific
  const [tableNumber, setTableNumber] = useState('');
  const [waiterName, setWaiterName] = useState('');

  // Service specific
  const [jobNo, setJobNo] = useState('');
  const [technician, setTechnician] = useState('');
  
  // Print Settings
  const [showPhone, setShowPhone] = useState(true);
  const [showAddress, setShowAddress] = useState(true);
  const [showGST, setShowGST] = useState(true);

  const { salesmen } = useSalesmen();
  // We no longer use selectedSalesmanId as per user request to remove "Order by" section

  const localDate = useLocalDate();
  const [invoiceDate, setInvoiceDate] = useState(getLocalDateString());
  const prevLocalDate = React.useRef(localDate);

  useEffect(() => {
    if (prevLocalDate.current !== localDate) {
      if (invoiceDate === prevLocalDate.current) {
        setInvoiceDate(localDate);
      }
      prevLocalDate.current = localDate;
    }
  }, [localDate, invoiceDate]);

  const [discountPercent, setDiscountPercent] = useState(0);
  const [globalTaxPercent, setGlobalTaxPercent] = useState(18);
  const [gstEnabled, setGstEnabled] = useState(true);
  const [globalRateType, setGlobalRateType] = useState<'MRP' | 'Normal' | 'Reddi'>('Normal');
  
  const { productPrices, productNames } = useProductPrices(user);

  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' }[]>([]);
  const [quickAdd, setQuickAdd] = useState<{ name: string; quantity: number | ''; rate: number | '' }>({ name: '', quantity: 1, rate: '' });
  const quickAddRef = React.useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [bulkImportText, setBulkImportText] = useState("");

  useEffect(() => {
    // Generate a random Bill No on mount
    setBillNo(`INV-${Math.floor(1000 + Math.random() * 9000)}`);
    
    // Fetch total invoice count for limit check
    if (user) {
      const fetchCount = async () => {
        const { db } = await getFirebase();
        if (!db) return;
        const q = query(collection(db, 'invoices'), where('userId', '==', user.uid));
        const snap = await getDocs(q);
        setInvoiceCount(snap.size);

        const todayDateStr = getLocalDateString();
        const dailySnap = snap.docs.filter(doc => (doc.data().invoiceDate || doc.data().date) === todayDateStr);
        setDailyInvoiceCount(dailySnap.length);
      };
      fetchCount();
    }
  }, [user, isPremium]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);

    // We now use more specific speech triggers in the handler functions
    // so we can remove the generic toast speech here.

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const handleToggleSetting = (setter: React.Dispatch<React.SetStateAction<boolean>>, value: boolean) => {
    setter(!value);
    speak('Setting badal di gayi hai', 'professional');
  };

  const handleAddItem = () => {
    speak('Nayi entry joad di gayi hai', 'professional');
    const newItem = { id: Date.now().toString(), name: '', quantity: 1, rate: 0, gstPercent: gstEnabled ? 18 : 0 };
    setItems([...items, newItem]);
  };

  const handleQuickAdd = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!quickAdd.name) return;

    speak('Nayi entry joad di gayi hai', 'professional');
    const rate = quickAdd.rate !== '' ? Number(quickAdd.rate) : (productPrices[quickAdd.name] ? productPrices[quickAdd.name][globalRateType] : 0);
    const newItem: InvoiceItem = {
      id: crypto.randomUUID(),
      name: quickAdd.name,
      quantity: quickAdd.quantity === '' ? 1 : Number(quickAdd.quantity),
      rate: rate,
      gstPercent: gstEnabled ? 18 : 0
    };

    setItems(prev => [...prev, newItem]);
    setQuickAdd({ name: '', quantity: 1, rate: '' });
    showToast('Item Added!');
    quickAddRef.current?.focus();
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleGlobalRateTypeChange = (type: 'MRP' | 'Normal' | 'Reddi') => {
    setGlobalRateType(type);
    setItems(items.map(item => {
      if (item.name && productPrices[item.name]) {
        return { ...item, rate: productPrices[item.name][type] };
      }
      return item;
    }));
  };

  const handleItemChange = (id: string, field: keyof InvoiceItem, value: any) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };
        if (field === 'name' && productPrices[value] !== undefined) {
           updatedItem.rate = productPrices[value][globalRateType];
        }
        return updatedItem;
      }
      return item;
    }));
  };

  const handleBulkImport = () => {
    const lines = bulkImportText.trim().split('\n');
    let importedItems: InvoiceItem[] = [];
    let updatedCustomerName = customerName;
    let errors: string[] = [];

    lines.forEach((line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      // Ignore lines that look like totals or balance summaries
      if (/balance|total|udhaari|jama|summary/i.test(trimmedLine)) return;

      // WhatsApp / Flexible format processing
      // Find all numbers (integers or decimals)
      const numberMatches = trimmedLine.match(/(\d+(\.\d+)?)/g);
      
      if (numberMatches && numberMatches.length > 0) {
         // Flexible Quantity Detection: Use the last number as quantity as per user request
         const quantityStr = numberMatches[numberMatches.length - 1];
         const quantity = parseFloat(quantityStr);
         
         // Product Name Extraction: Remove the quantity number from the line to get the name
         const lastOccurrenceIndex = trimmedLine.lastIndexOf(quantityStr);
         let name = (trimmedLine.substring(0, lastOccurrenceIndex) + trimmedLine.substring(lastOccurrenceIndex + quantityStr.length))
            .replace(/^\s+|\s+$/g, '') // trim
            .replace(/[.-:\(\)]+\s*$/, '') // remove trailing punctuation
            .trim();

         // If the line started with a name and ended with a number or vice versa, the name should be relatively clean now.
         if (name) {
            // Auto-Match Price: Try exact match or case-insensitive search
            let rate = 0;
            const foundName = productNames.find(pn => pn.toLowerCase() === name.toLowerCase());
            if (foundName) {
               const prices = productPrices[foundName];
               rate = prices[globalRateType] || prices?.Normal || prices?.MRP || 0;
               name = foundName; // Use the canonical name from DB
            } else {
               // Try partial match if no exact match
               const partialMatch = productNames.find(pn => name.toLowerCase().includes(pn.toLowerCase()) || pn.toLowerCase().includes(name.toLowerCase()));
               if (partialMatch) {
                  const prices = productPrices[partialMatch];
                  rate = prices[globalRateType] || prices?.Normal || prices?.MRP || 0;
                  name = partialMatch;
               }
            }

            importedItems.push({
              id: crypto.randomUUID(),
              name: name,
              quantity,
              rate: rate,
              gstPercent: gstEnabled ? 18 : 0
            });
         }
      } else {
         // Line has no numbers, might be a header or customer name
         if (trimmedLine.toLowerCase().includes('store') || trimmedLine.toLowerCase().includes('mart') || trimmedLine.toLowerCase().includes('agency')) {
            updatedCustomerName = trimmedLine;
         }
      }
    });

    if (importedItems.length > 0) {
      setItems((prevItems) => {
        return [...prevItems, ...importedItems];
      });
      speak('Data successfully paste ho gaya hai', 'professional');
      showToast(`${importedItems.length} items imported!`);
      setIsBulkImportOpen(false);
      setBulkImportText('');
    }
    
    if (updatedCustomerName !== customerName) {
       setCustomerName(updatedCustomerName);
    }
  };

  const calculations = useMemo(() => {
    let subtotal = 0;
    
    items.forEach(item => {
      const itemTotal = item.quantity * item.rate;
      const itemDiscount = item.itemDiscountPercent ? (itemTotal * (item.itemDiscountPercent / 100)) : 0;
      subtotal += (itemTotal - itemDiscount);
    });

    const taxAmount = gstEnabled ? (subtotal * (globalTaxPercent / 100)) : 0;
    const cgstTotal = taxAmount / 2;
    const sgstTotal = taxAmount / 2;
    
    const totalBoxes = items.reduce((acc, item) => acc + item.quantity, 0);
    const discountAmount = (subtotal + taxAmount) * (discountPercent / 100);
    const grandTotal = (subtotal + taxAmount) - discountAmount;

    return {
      subtotal,
      cgst: cgstTotal,
      sgst: sgstTotal,
      totalTax: taxAmount,
      totalBoxes,
      discountAmount,
      grandTotal: grandTotal > 0 ? grandTotal : 0
    };
  }, [items, discountPercent, globalTaxPercent, gstEnabled]);

  const { subtotal, cgst, sgst, totalTax, totalBoxes, discountAmount, grandTotal } = calculations;

  const handleSaveBill = async () => {
    if (!user) {
      alert("Please login to save the bill.");
      return;
    }

    if (!isPremium && (totalEntryCount + invoiceCount) >= 20) {
      speak('Aapki free entry limit khatam ho gayi hai. Kripya premium subscription lein.', 'professional');
      onRequirePremium();
      return;
    }

    if (isPremium && planName === 'Lite' && (dailyEntryCount + dailyInvoiceCount) >= 100) {
      speak('Aapki aaj ki 100 entry ki limit khatam ho gayi hai. Kal dobara koshish karein ya business plan lein.', 'professional');
      onRequirePremium();
      return;
    }

    if (isPremium && planName === 'Plus' && (dailyEntryCount + dailyInvoiceCount) >= 200) {
      speak('Aapki aaj ki 200 entry ki limit khatam ho gayi hai. Kal dobara koshish karein ya business plan lein.', 'professional');
      onRequirePremium();
      return;
    }

    setSaving(true);
    try {
      const { db } = await getFirebase();
      if (!db) return;

      const batch = writeBatch(db);

      // Create new invoice document
      const invoiceRef = doc(collection(db, 'invoices'));
      batch.set(invoiceRef, {
        userId: user.uid,
        billNo,
        brandName,
        brandAddress,
        industry,
        tableNumber: tableNumber || null,
        waiterName: waiterName || null,
        jobNo: jobNo || null,
        technician: technician || null,
        salesmanName: null,
        salesmanId: null,
        gstin,
        customerName,
        customerPhone,
        customerAddress,
        invoiceDate,
        gstEnabled,
        globalTaxPercent,
        rateType: globalRateType,
        items,
        totalBoxes,
        subtotal,
        totalTax,
        discountPercent,
        discountAmount,
        grandTotal,
        createdAt: serverTimestamp(),
      });

      // Deduct stock for each item
      const itemNames = items.filter(i => i.name.trim() !== '').map(i => i.name);
      if (itemNames.length > 0) {
         // Query stock items
         // Note: If user has > 30 unique items in a bill, 'in' query fails, but 30 is plenty for standard bill.
         // We do chunks of 10 just to be safe
         const chunks = [];
         for (let i = 0; i < itemNames.length; i += 10) {
            chunks.push(itemNames.slice(i, i + 10));
         }

         for (const chunk of chunks) {
            const q = query(
               collection(db, 'stock'),
               where('userId', '==', user.uid),
               where('name', 'in', chunk)
            );
            const snap = await getDocs(q);
            const stockDocs = snap.docs;

            stockDocs.forEach(stockDoc => {
               const stockName = stockDoc.data().name;
               // Find all items with this name in the invoice (in case of duplicates)
               const qtyToDeduct = items.filter(i => i.name === stockName).reduce((acc, curr) => acc + curr.quantity, 0);
               
               if (qtyToDeduct > 0) {
                  batch.update(stockDoc.ref, {
                     totalPieces: increment(-qtyToDeduct),
                     soldPieces: increment(qtyToDeduct),
                     updatedAt: serverTimestamp()
                  });
               }
            });
         }
      }

      await batch.commit();

      speak('Data GDX cloud par save ho gaya hai', 'professional');
      showToast('Bill Saved Successfully! Stock deducted.');
      // Auto refresh form
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      setItems([]);
      setDiscountPercent(0);
      
      onSaved();
    } catch (e) {
      showToast('Failed to save bill or deduct stock', 'error');
      handleFirestoreError(e, OperationType.WRITE, 'invoices_and_stock');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden print:shadow-none print:border-none print:m-0 print:overflow-visible print:h-auto">
      
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
              {toast.type === 'success' ? <ClipboardList size={18} /> : <Trash2 size={18} />}
              <div className="flex flex-col">
                <span>{toast.message}</span>
                {(toast.message.toLowerCase().includes('saved') || toast.message.toLowerCase().includes('added') || toast.message.toLowerCase().includes('successful')) && (
                  <span className="text-[8px] opacity-70 uppercase tracking-widest font-black">AI Voice Active</span>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Global CSS for Print-specific @page within Invoice Generator */}
      <style>
      {`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          html, body { height: auto !important; overflow: visible !important; min-height: 100% !important; margin: 0 !important; padding: 0 !important; color: black !important; background: white !important; }
          .print\\:flex { display: flex !important; }
          .print-fixed-header { position: static; top: auto; left: auto; right: auto; height: auto; background: white; z-index: 10; border-bottom: 2px solid #1f2937; padding-bottom: 4px; margin-bottom: 4px; }
          .print-fixed-footer { position: fixed; bottom: 0; left: 0; right: 0; height: 35px; background: white; z-index: 10; border-top: 1px solid #d1d5db; display: flex; justify-content: space-between; align-items: center; font-size: 10px; padding: 0 10mm; }
          .print-content-spacer { padding-top: 0px; padding-bottom: 35px; height: auto !important; display: block !important; overflow: visible !important; }
          table { page-break-inside: auto; width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid #d1d5db; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; background-color: #f3f4f6; }
          tfoot { display: table-footer-group; }
          th { border: 1px solid #d1d5db; border-bottom: 2px solid #374151; padding: 8px; font-weight: 900; }
          td { border: 1px solid #d1d5db; padding: 8px; }
          .print-avoid-break { page-break-inside: avoid !important; }
          .watermark-container { position: relative; z-index: 1; }
          .watermark-text { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 12rem; font-weight: 900; color: rgba(0,0,0,0.03); z-index: -1; pointer-events: none; text-shadow: 2px 2px 5px rgba(0,0,0,0.01); white-space: nowrap; }
          input, select, textarea { border: none !important; padding: 0 !important; background: transparent !important; appearance: none !important; -webkit-appearance: none; color: black !important; }
          .print-summary-label { font-weight: 800 !important; color: black !important; text-transform: uppercase; font-size: 14px; }
          .print-grand-total { font-size: 1.5rem !important; font-weight: 900 !important; color: black !important; border-top: 2px solid black !important; margin-top: 4px; padding-top: 4px; }
          .print\\:hidden { display: none !important; }
        }
      `}
      </style>

      {/* Brand Header for Print */}
      <div className="hidden print:flex print-fixed-header flex-col border-b-2 border-gray-900 pb-1 mb-2" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
         <div className="w-full text-center py-1">
            <h2 className="text-sm font-black text-gray-900 tracking-[0.3em] uppercase">SALES INVOICE</h2>
         </div>
         <div className="w-full flex justify-between items-start mt-1">
            <div className="w-1/2">
               <h1 className="text-4xl font-black text-gray-900 tracking-tighter uppercase leading-none">{brandName}</h1>
               <p className="text-[10px] text-gray-600 font-bold mt-0.5 uppercase">{brandAddress}</p>
               {gstin && showGST && <p className="text-[10px] text-gray-500 font-bold">GSTIN: {gstin}</p>}
            </div>
            <div className="w-1/2 text-right">
               <h2 className="text-lg font-black text-blue-600 tracking-tight leading-none">TWINKLE ENTERPRISES</h2>
               <div className="mt-1 text-[10px] text-gray-700 space-y-0.5">
                 <p className="font-black">BILL NO: {billNo}</p>
                 <p className="font-bold uppercase">DATE: {invoiceDate || localDate}</p>
               </div>
            </div>
         </div>
      </div>
      
      {/* Brand Footer for Print */}
      <div className="hidden print:flex print-fixed-footer">
         <span className="font-black text-gray-700 bg-gray-100 px-3 py-1 rounded text-xs uppercase border border-gray-300">Payment Status: <span className="text-green-700">PAID VIA UPI</span></span>
         <span className="text-xs text-gray-500 uppercase tracking-widest font-bold">Thank You for Your Business! | Official Report by GDX</span>
      </div>

      <div className="p-6 print:p-0 print-content-spacer">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 print:hidden">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <FileDown className="text-blue-500" /> Multi-Industry Billing
              <span className="bg-gray-900 text-white text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-tighter leading-none ml-2">Standard Wide Invoice Active</span>
            </h2>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Select your business type for custom layouts</p>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <select 
              value={industry}
              onChange={(e) => setIndustry(e.target.value as IndustryType)}
              className="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg font-bold border border-blue-100 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="Cafe/Restaurant">Cafe/Restaurant</option>
              <option value="Clothing Store">Clothing Store</option>
              <option value="General Grocery">General Grocery</option>
              <option value="Service Center">Service Center</option>
            </select>

            <button 
              type="button"
              onClick={() => setIsBulkImportOpen(!isBulkImportOpen)}
              className="flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-2 rounded-lg font-bold hover:bg-purple-200 transition-colors shadow-sm text-sm"
            >
              <ClipboardList size={16} /> {isBulkImportOpen ? 'Close Import' : 'Quick Import'}
            </button>
          </div>
        </div>

        {isBulkImportOpen && (
           <motion.div 
             initial={{ height: 0, opacity: 0 }}
             animate={{ height: 'auto', opacity: 1 }}
             exit={{ height: 0, opacity: 0 }}
             className="mb-8 overflow-hidden"
           >
             <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-6 rounded-xl border border-blue-100 shadow-sm print:hidden">
               <div className="flex justify-between items-center mb-3">
                 <div>
                   <h3 className="font-black text-indigo-900 flex items-center gap-2 uppercase tracking-tighter text-lg">
                      <ClipboardList className="text-indigo-600" /> WhatsApp Smart Import
                   </h3>
                   <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-widest mt-0.5">
                     Auto-detects quantity and item name from any line
                   </p>
                 </div>
                 <div className="bg-white px-2 py-1 rounded text-[10px] font-mono text-indigo-400 border border-indigo-100">
                    EX: "8 Kulfi" OR "Kulfi 8"
                 </div>
               </div>
               
               <div className="relative">
                 <textarea 
                   value={bulkImportText}
                   onChange={(e) => setBulkImportText(e.target.value)}
                   className="w-full h-40 px-4 py-3 border-2 border-indigo-100 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 outline-none resize-none mb-4 bg-white/80 backdrop-blur-sm transition-all text-sm font-medium"
                   placeholder="Paste your WhatsApp message here...&#10;8 Vanilla Cup&#10;Choco Bar 12&#10;...and so on"
                 />
                 <div className="absolute top-3 right-3 text-indigo-200 pointer-events-none">
                    <Send size={24} />
                 </div>
               </div>
               
               <div className="flex justify-end gap-3">
                 <button
                    onClick={() => {
                      setBulkImportText('');
                      setIsBulkImportOpen(false);
                    }}
                    onMouseEnter={() => speak('Thank you for using GDX Website', 'sweet')}
                    className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors"
                 >
                    Discard
                 </button>
                 <button
                    onClick={handleBulkImport}
                    className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95"
                 >
                    Import Now
                 </button>
               </div>
             </div>
           </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 print:hidden">
           <div className="md:col-span-4 bg-gray-50 p-4 rounded-xl border border-gray-200 mb-2">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Printer size={12} /> Print Display Settings
              </h3>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative inline-flex items-center">
                    <input 
                      type="checkbox" 
                      checked={showPhone} 
                      onChange={() => handleToggleSetting(setShowPhone, showPhone)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </div>
                  <span className="text-sm font-bold text-gray-600 group-hover:text-blue-600 transition-colors">Show Phone</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative inline-flex items-center">
                    <input 
                      type="checkbox" 
                      checked={showAddress} 
                      onChange={() => handleToggleSetting(setShowAddress, showAddress)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </div>
                  <span className="text-sm font-bold text-gray-600 group-hover:text-blue-600 transition-colors">Show Address</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative inline-flex items-center">
                    <input 
                      type="checkbox" 
                      checked={showGST} 
                      onChange={() => handleToggleSetting(setShowGST, showGST)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </div>
                  <span className="text-sm font-bold text-gray-600 group-hover:text-blue-600 transition-colors">Show GST Details</span>
                </label>
              </div>
           </div>

           <div className="md:col-span-2">
             <label className="block text-sm font-bold text-gray-700 mb-1">Company / Shop Name</label>
             <input type="text" value={brandName} onChange={e => setBrandName(e.target.value)} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none font-bold" placeholder="GDX" />
           </div>
           <div className="md:col-span-2">
             <label className="block text-sm font-bold text-gray-700 mb-1">Shop Address</label>
             <input type="text" value={brandAddress} onChange={e => setBrandAddress(e.target.value)} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" placeholder="123 Street, City" />
           </div>
           <div>
             <label className="block text-sm font-bold text-gray-700 mb-1">GSTIN (Optional)</label>
             <input type="text" value={gstin} onChange={e => setGstin(e.target.value)} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" placeholder="22AAAAA0000A1Z5" />
           </div>
           <div>
             <label className="block text-sm font-bold text-gray-700 mb-1">Bill No.</label>
             <input type="text" value={billNo} onChange={e => setBillNo(e.target.value)} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none font-mono" />
           </div>
           
           {industry === 'Cafe/Restaurant' && (
             <>
               <div>
                 <label className="block text-sm font-bold text-gray-700 mb-1">Table No.</label>
                 <input type="text" value={tableNumber} onChange={e => setTableNumber(e.target.value)} className="w-full px-3 py-2 border border-amber-200 rounded focus:ring-2 focus:ring-amber-500 outline-none" placeholder="T-01" />
               </div>
               <div>
                 <label className="block text-sm font-bold text-gray-700 mb-1">Waiter Name</label>
                 <input type="text" value={waiterName} onChange={e => setWaiterName(e.target.value)} className="w-full px-3 py-2 border border-amber-200 rounded focus:ring-2 focus:ring-amber-500 outline-none" placeholder="Rahul" />
               </div>
             </>
           )}

           {industry === 'Service Center' && (
             <>
               <div>
                 <label className="block text-sm font-bold text-gray-700 mb-1">Job/Vehicle No.</label>
                 <input type="text" value={jobNo} onChange={e => setJobNo(e.target.value)} className="w-full px-3 py-2 border border-indigo-200 rounded focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="TN 01 AB 1234" />
               </div>
               <div>
                 <label className="block text-sm font-bold text-gray-700 mb-1">Technician</label>
                 <input type="text" value={technician} onChange={e => setTechnician(e.target.value)} className="w-full px-3 py-2 border border-indigo-200 rounded focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Kumar" />
               </div>
             </>
           )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 print:mb-0 print:border-t-2 print:border-gray-900 pt-1">
           <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 print:bg-white print:border-none print:p-0">
             <h3 className="font-bold text-gray-800 border-b pb-2 mb-4 print:border-gray-800 print:mb-2">Billed To:</h3>
             <div className="space-y-3">
               <div>
                 <datalist id="customerNamesListInvoice">
                   {productNames.map(name => <option key={name} value={name} />)}
                 </datalist>
                 <datalist id="productNamesListInvoice">
                   {productNames.map(name => {
                     const prices = productPrices[name];
                     return (
                       <option key={name} value={name}>
                         {`N: ₹${prices?.Normal || 0} | M: ₹${prices?.MRP || 0} | R: ₹${prices?.Reddi || 0}`}
                       </option>
                     );
                   })}
                 </datalist>
                 <label className="block text-sm font-bold text-gray-700 mb-1 print:hidden">Customer Name</label>
                 <input type="text" list="customerNamesListInvoice" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none print:border-none print:p-0 print:font-bold print:text-lg" placeholder="Customer Name" />
               </div>
               <div className={!showPhone ? 'print:hidden' : ''}>
                 <label className="block text-sm font-bold text-gray-700 mb-1 print:hidden">Phone</label>
                 <input type="text" value={customerPhone} onChange={e => setCustomerPhone(e.target.value.replace(/\D/g, ''))} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none print:border-none print:p-0" placeholder="Phone Number" />
               </div>
               <div className={!showAddress ? 'print:hidden' : ''}>
                 <label className="block text-sm font-bold text-gray-700 mb-1 print:hidden">Address</label>
                 <textarea value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none print:border-none print:p-0 resize-none print:min-h-0" rows={2} placeholder="Full Address"></textarea>
               </div>
             </div>
           </div>
           
           <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 print:bg-white print:border-none print:p-0 print:flex print:flex-col print:items-end">
             <div className="flex flex-col gap-4 text-right print:text-left print:mt-10">
                <div className="print:flex print:gap-4 print:items-center">
                   <label className="block text-sm font-bold text-gray-700 mb-1 uppercase print:mb-0">Date:</label>
                   <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none font-bold text-gray-900 print:border-none print:p-0" />
                </div>
             </div>
           </div>
        </div>

        <div className="mb-6">
          <div className="flex flex-wrap gap-4 items-center mb-4">
             <div className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg">
                <input 
                  type="checkbox" 
                  id="gstToggle" 
                  checked={gstEnabled} 
                  onChange={(e) => setGstEnabled(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <label htmlFor="gstToggle" className="text-sm font-bold text-gray-700 cursor-pointer">GST Active</label>
             </div>

             <div className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg">
                <span className="text-sm font-bold text-gray-700">Rate Type:</span>
                <select 
                  value={globalRateType} 
                  onChange={(e) => handleGlobalRateTypeChange(e.target.value as any)}
                  className="text-sm font-bold text-blue-600 bg-transparent outline-none cursor-pointer"
                >
                  <option value="Normal">Normal</option>
                  <option value="MRP">MRP (Full)</option>
                  <option value="Reddi">Reddi Tier</option>
                </select>
             </div>
          </div>

          <div className="relative watermark-container z-10">
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 -rotate-[30deg] text-[6rem] sm:text-[12rem] font-black text-black opacity-[0.03] pointer-events-none z-0 whitespace-nowrap select-none">
                GDX
            </div>
            <table className="w-full text-left border-collapse relative z-10 print:border print:border-gray-300">
              <thead>
                <tr className="bg-[#EEEEEE] text-black print:bg-gray-200 print:text-black">
                  <th className="p-1 print:p-2 border print:border-gray-300 text-[10px] font-black w-8 text-center uppercase">#</th>
                  <th className="p-1 print:p-2 border print:border-gray-300 text-[10px] font-black uppercase">ITEM PARTICULARS</th>
                  <th className="p-1 print:p-2 border print:border-gray-300 text-[10px] font-black w-20 text-center uppercase">QTY</th>
                  <th className="p-1 print:p-2 border print:border-gray-300 text-[10px] font-black w-28 text-right uppercase">PRICE</th>
                  <th className="p-1 print:p-2 border print:border-gray-300 text-[10px] font-black w-28 text-right uppercase">TOTAL</th>
                  <th className="p-1 border print:border-gray-300 text-[10px] font-black w-8 print:hidden"></th>
                </tr>
              </thead>
              <tbody className="print:text-[11px]">
                {/* Quick Add Row */}
                <tr className="bg-blue-50/50 print:hidden border-b-2 border-blue-100">
                  <td className="p-2 text-center text-blue-400"><Plus size={16} className="mx-auto" /></td>
                  <td className="p-2">
                    <input 
                      ref={quickAddRef}
                      type="text" 
                      list="productNamesListInvoice" 
                      value={quickAdd.name} 
                      onChange={e => {
                        const val = e.target.value;
                        setQuickAdd(prev => {
                          let newRate = prev.rate;
                          if (productPrices[val] !== undefined) {
                            newRate = productPrices[val][globalRateType];
                          }
                          return { ...prev, name: val, rate: newRate };
                        });
                      }}
                      onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
                      className="w-full outline-none bg-transparent font-bold text-sm py-1.5 px-2" 
                      placeholder="Quick Add Item..." 
                    />
                  </td>
                  
                  <td className="p-2">
                    <input 
                      type="number" 
                      value={quickAdd.quantity} 
                      onChange={e => setQuickAdd(prev => ({ ...prev, quantity: e.target.value === '' ? '' : Number(e.target.value) }))}
                      onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
                      className="w-full outline-none bg-transparent text-center font-bold text-sm py-1.5" 
                    />
                  </td>
                  
                  <td className="p-2 text-right font-mono text-sm">
                    <input 
                      type="number" 
                      min="0"
                      value={quickAdd.rate} 
                      onChange={e => setQuickAdd(prev => ({ ...prev, rate: e.target.value === '' ? '' : Number(e.target.value) }))}
                      onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
                      className="w-full outline-none bg-transparent text-right py-1.5"
                      placeholder="Price"
                    />
                  </td>

                  <td colSpan={2} className="p-2 text-right pr-4">
                     <button 
                      onClick={() => handleQuickAdd()}
                      className="bg-blue-600 text-white px-4 py-2 rounded text-xs font-black uppercase tracking-widest shadow-sm hover:bg-blue-700 transition"
                     >
                       Add Item
                     </button>
                  </td>
                </tr>

                {items.map((item, idx) => (
                  <tr key={item.id} className="border-bottom print:border-gray-300">
                    <td className="p-1 print:p-1.5 print:border text-center font-mono text-[11px] text-gray-500">{idx + 1}</td>
                    <td className="p-1 print:p-1.5 print:border">
                      <input type="text" value={item.name} onChange={e => handleItemChange(item.id, 'name', e.target.value)} className="w-full outline-none bg-transparent print:font-bold text-xs py-0.5" placeholder="Item Name" />
                    </td>
                    <td className="p-1 print:p-1.5 print:border">
                      <input type="number" min="1" value={item.quantity} onChange={e => handleItemChange(item.id, 'quantity', Number(e.target.value))} className="w-full outline-none bg-transparent text-center font-mono text-[11px] py-0.5" />
                    </td>
                    <td className="p-1 print:p-1.5 print:border text-right font-mono text-[11px]">
                      <input type="number" min="0" value={item.rate || ''} onChange={e => handleItemChange(item.id, 'rate', Number(e.target.value))} className="w-full outline-none bg-transparent text-right py-0.5" placeholder="0.00" />
                    </td>
                    <td className="p-1 print:p-1.5 print:border text-right font-mono tracking-tight text-gray-800 text-[11px] font-bold">
                      {(item.quantity * item.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-1 text-center print:hidden">
                      <button onClick={() => handleRemoveItem(item.id)} className="text-red-500 hover:text-red-700 p-1">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-4 print:hidden">
             <button onClick={handleAddItem} className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-bold text-sm bg-blue-50 px-4 py-2 rounded">
               <Plus size={16} /> Add Row
             </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between gap-8 py-4 print:py-0 print:items-end print:text-right print-avoid-break mt-6">
           
           <div className="hidden print:block w-1/2 text-left">
             <div className="border border-gray-300 p-4 rounded-lg bg-gray-50">
               <span className="font-bold text-gray-700 text-sm uppercase block mb-1">Amount in Words:</span>
               <span className="font-bold text-gray-900 uppercase italic text-sm">{numberToWords(grandTotal)}</span>
             </div>
           </div>

           <div className="w-full md:w-1/2 ml-auto print:w-1/2 print:ml-auto">
              <div className="bg-gray-50 p-6 rounded border border-gray-200 print:bg-transparent print:border-none print:p-0">
                  <div className="flex justify-between mb-3 border-b border-gray-200 print:border-gray-400 pb-2 print:text-black">
                    <span className="font-bold text-gray-600 print:text-black print-summary-label">TOTAL BOXES:</span>
                    <span className="font-mono font-bold text-gray-800 print:text-black text-base">{totalBoxes}</span>
                  </div>

                  <div className="flex justify-between mb-3 border-b border-gray-200 print:border-gray-400 pb-2 print:text-black">
                    <span className="font-bold text-gray-600 print:text-black print-summary-label">GROSS AMOUNT:</span>
                    <span className="font-mono font-bold text-gray-800 print:text-black text-base">₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>

                  <div className="flex justify-between items-center mb-2 print:hidden">
                    <span className="font-bold text-gray-600 text-xs italic">Tax Rate (%):</span>
                    <input 
                      type="number" 
                      value={globalTaxPercent} 
                      onChange={e => setGlobalTaxPercent(parseFloat(e.target.value) || 0)} 
                      className="w-16 px-1 py-0.5 border rounded text-right font-mono text-xs" 
                    />
                  </div>

                  {gstEnabled && totalTax > 0 && (
                    <>
                      <div className="flex justify-between mb-3 border-b border-gray-200 print:border-gray-400 pb-2 text-sm print:text-black">
                         <span className="font-bold text-gray-600 print:text-black print-summary-label">TOTAL SGST + CGST:</span>
                         <span className="font-mono font-bold text-gray-800 print:text-black text-base">₹{totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </>
                  )}
                  
                  <div className="flex justify-between items-center mb-4 border-b border-gray-300 print:border-gray-400 pb-4 print:hidden">
                    <span className="font-bold text-gray-600 text-sm">Discount (%):</span>
                    <div className="flex items-center gap-2">
                       <input 
                        type="number" 
                        min="0"
                        max="100"
                        value={discountPercent} 
                        onChange={e => {
                          const val = parseFloat(e.target.value) || 0;
                          if (val > 0) speak('Discount apply kar diya gaya hai', 'professional');
                          setDiscountPercent(val);
                        }} 
                        className="w-24 px-2 py-1 border-2 border-green-200 rounded text-right font-mono font-bold bg-green-50 text-green-700 outline-none focus:ring-2 focus:ring-green-400" 
                        placeholder="0%"
                      />
                    </div>
                  </div>

                  {discountAmount > 0 && (
                    <div className="flex justify-between mb-3 text-sm text-green-700 print:text-black border-b border-gray-200 print:border-gray-400 pb-2">
                       <span className="font-bold print-summary-label">DISCOUNT ({discountPercent}%):</span>
                       <span className="font-mono font-bold text-base">-₹{discountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center mt-4 print-grand-total">
                     <span className="text-xl font-black text-gray-900 print:text-black print-summary-label">NET PAYABLE:</span>
                     <span className="text-3xl font-black font-mono text-blue-600 print:text-black">₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
              </div>
           </div>
        </div>

        <div className="mt-4 print:hidden flex flex-col gap-1">
          <span className="font-bold text-gray-700 text-xs">Amount in Words:</span>
          <span className="font-bold text-gray-900 uppercase italic bg-gray-50 px-3 py-1.5 rounded w-fit text-sm border-l-4 border-blue-600 print:border-none print:px-0 print:bg-transparent">{numberToWords(grandTotal)}</span>
        </div>
        
        <div className="mt-8 flex flex-wrap justify-end gap-4 print:hidden">
          <button 
             onClick={() => {
                speak('Sales Invoice taiyar hai', 'professional');
                window.print();
             }}
             className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-md font-bold hover:bg-green-700 transition-colors shadow-sm"
          >
            <Printer size={18} /> PRINT INVOICE
          </button>

          <button 
             onClick={handleSaveBill}
             disabled={saving || !user}
             className="flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-md font-bold hover:bg-gray-800 transition-colors disabled:opacity-50 shadow-sm"
          >
            <Save size={18} /> {saving ? 'SAVING...' : 'SAVE CLOUD'}
          </button>
          
          <button 
             onClick={() => {
                const message = `*Invoice: ${billNo}*\nAmount: ₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\nDate: ${invoiceDate}\nThank you!`;
                window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
             }}
             className="flex items-center gap-2 bg-[#25D366] text-white px-6 py-3 rounded-md font-bold hover:bg-[#128C7E] transition-colors shadow-sm"
          >
            <Send size={18} /> SHARE VIA WHATSAPP BUSINESS
          </button>
        </div>
      </div>
    </div>
  );
}
