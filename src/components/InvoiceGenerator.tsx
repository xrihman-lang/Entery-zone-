import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Printer, Save, FileDown, History, ClipboardList } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getFirebase, handleFirestoreError, OperationType } from '../lib/firebase';
import { Logo } from './Logo';
import { useProductPrices } from '../hooks/useProductPrices';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface InvoiceItem {
  id: string;
  name: string;
  hsn: string;
  quantity: number;
  rate: number;
  gstPercent: number;
}

function numberToWords(amount: number): string {
  const words = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const num = Math.floor(amount);
  if (num === 0) return "Zero Rupees Only";

  function helper(n: number): string {
    if (n < 20) return words[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + words[n % 10] : "");
    if (n < 1000) return words[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " and " + helper(n % 100) : "");
    if (n < 100000) return helper(Math.floor(n / 1000)) + " Thousand" + (n % 1000 !== 0 ? " " + helper(n % 1000) : "");
    if (n < 10000000) return helper(Math.floor(n / 100000)) + " Lakh" + (n % 100000 !== 0 ? " " + helper(n % 100000) : "");
    return helper(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 !== 0 ? " " + helper(n % 10000000) : "");
  }

  return helper(num) + " Rupees Only";
}

export default function InvoiceGenerator({ user, onSaved }: { user: any, onSaved: () => void }) {
  const [billNo, setBillNo] = useState('');
  const [brandName, setBrandName] = useState('zishan gdx');
  const [gstin, setGstin] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [discountPercent, setDiscountPercent] = useState(0);
  
  const { productPrices, productNames } = useProductPrices(user);

  const [items, setItems] = useState<InvoiceItem[]>([
    { id: Date.now().toString(), name: '', hsn: '', quantity: 1, rate: 0, gstPercent: 18 }
  ]);

  const [saving, setSaving] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [bulkImportText, setBulkImportText] = useState("");

  useEffect(() => {
    // Generate a random Bill No on mount
    setBillNo(`INV-${Math.floor(1000 + Math.random() * 9000)}`);
  }, []);

  const handleAddItem = () => {
    setItems([...items, { id: Date.now().toString(), name: '', hsn: '', quantity: 1, rate: 0, gstPercent: 18 }]);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleItemChange = (id: string, field: keyof InvoiceItem, value: any) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };
        if (field === 'name' && productPrices[value] !== undefined) {
           updatedItem.rate = productPrices[value];
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
      line = line.trim();
      if (!line) return;

      const match = line.match(/^(.*?)\s+(\d+)$/);
      if (match) {
        const title = match[1].trim();
        const qty = parseInt(match[2], 10);
        const rate = productPrices[title] || 0;
        
        if (!productPrices[title]) {
           errors.push(`Price missing for: ${title}`);
        }

        importedItems.push({
           id: crypto.randomUUID(),
           name: title,
           hsn: '',
           quantity: qty,
           rate: rate,
           gstPercent: 18
        });
      } else {
        if(line.toLowerCase().includes('store') || line.toLowerCase().includes('mart') || line.toLowerCase().includes('agency')) {
           updatedCustomerName = line;
        } else {
           errors.push(`Could not parse quantity for: ${line}. Assuming it is customer detail.`);
           updatedCustomerName = line; // Assume unparseable things are maybe customer name or details
        }
      }
    });

    if (errors.length > 0) {
       alert("Bulk Import Note:\n" + errors.join('\n'));
    }

    if (importedItems.length > 0) {
      setItems((prevItems) => {
        // Remove empty placeholder if present
        const filtered = prevItems.filter(i => i.name !== '' || prevItems.length > 1);
        return [...filtered, ...importedItems];
      });
      setIsBulkImportOpen(false);
      setBulkImportText('');
    }
    
    if (updatedCustomerName !== customerName) {
       setCustomerName(updatedCustomerName);
    }
  };

  const calculations = useMemo(() => {
    let subtotal = 0;
    let totalTax = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    
    items.forEach(item => {
      const itemTotal = item.quantity * item.rate;
      subtotal += itemTotal;
      const itemTax = itemTotal * (item.gstPercent / 100);
      totalTax += itemTax;
      cgstTotal += itemTax / 2;
      sgstTotal += itemTax / 2;
    });

    const discountAmount = (subtotal + totalTax) * (discountPercent / 100);
    const grandTotal = (subtotal + totalTax) - discountAmount;

    return {
      subtotal,
      cgst: cgstTotal,
      sgst: sgstTotal,
      totalTax,
      discountAmount,
      grandTotal: grandTotal > 0 ? grandTotal : 0
    };
  }, [items, discountPercent]);

  const { subtotal, cgst, sgst, totalTax, discountAmount, grandTotal } = calculations;

  const handleSaveBill = async () => {
    if (!user) {
      alert("Please login to save the bill.");
      return;
    }
    setSaving(true);
    try {
      const { db } = await getFirebase();
      await addDoc(collection(db, 'invoices'), {
        userId: user.uid,
        billNo,
        brandName,
        gstin,
        customerName,
        customerPhone,
        customerAddress,
        invoiceDate,
        items,
        subtotal,
        cgst,
        sgst,
        totalTax,
        discountPercent,
        discountAmount,
        grandTotal,
        createdAt: serverTimestamp(),
      });
      alert('Bill Saved Successfully!');
      onSaved();
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'invoices');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden print:shadow-none print:border-none print:m-0">
      
      {/* Global CSS for Print-specific @page within Invoice Generator */}
      <style>
      {`
        @media print {
          @page { size: A4 portrait; margin: 15mm; }
          .print\\:flex { display: flex !important; }
          .print-fixed-header { position: fixed; top: 0; left: 0; right: 0; height: auto; background: white; z-index: 10; border-bottom: 2px solid #1f2937; padding-bottom: 15px; }
          .print-fixed-footer { position: fixed; bottom: 0; left: 0; right: 0; height: 40px; background: white; z-index: 10; border-top: 1px solid #d1d5db; display: flex; justify-content: space-between; align-items: center; }
          .print-content-spacer { padding-top: 80px; padding-bottom: 60px; }
        }
      `}
      </style>

      {/* Global Print Watermark */}
      <div className="hidden print:flex fixed inset-0 items-center justify-center pointer-events-none" style={{ zIndex: -100 }}>
         <div className="transform -rotate-45 text-[120px] font-bold text-[#eee] whitespace-nowrap" style={{ opacity: 0.2 }}>
            zishan gdx
         </div>
      </div>

      {/* Brand Header for Print */}
      <div className="hidden print:flex print-fixed-header justify-between items-center">
         <div>
           {brandName === 'zishan gdx' || brandName === 'ZISHAN GDX' || !brandName ? (
             <Logo iconClassName="w-12 h-12" textClassName="text-3xl" />
           ) : (
             <h1 className="text-4xl font-black text-gray-900 tracking-tighter uppercase">{brandName}</h1>
           )}
           {gstin && <p className="text-sm text-gray-600 font-bold mt-2">GSTIN: {gstin}</p>}
         </div>
         <div className="text-right">
           <p className="text-gray-900 font-bold tracking-widest uppercase text-xl">Tax Invoice</p>
           <p className="text-sm font-mono mt-1 text-gray-600">Bill No: {billNo}</p>
         </div>
      </div>
      
      {/* Brand Footer for Print */}
      <div className="hidden print:flex print-fixed-footer">
         <span className="text-[10px] text-gray-500 uppercase tracking-widest">Thank You for Your Business!</span>
         <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Official Report by zishan gdx</span>
      </div>

      <div className="p-6 print:p-0 print-content-spacer">
        <div className="flex justify-between items-center mb-6 print:hidden">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <FileDown className="text-blue-500" /> Professional Bill Generator
          </h2>
          <button 
            type="button"
            onClick={() => setIsBulkImportOpen(!isBulkImportOpen)}
            className="flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-2 rounded-lg font-bold hover:bg-purple-200 transition-colors shadow-sm text-sm"
          >
            <ClipboardList size={16} /> {isBulkImportOpen ? 'Close Bulk Import' : 'Bulk Import Orders'}
          </button>
        </div>

        {isBulkImportOpen && (
           <div className="mb-6 bg-purple-50 p-4 rounded-lg border border-purple-200 print:hidden">
             <h3 className="font-bold text-purple-800 mb-2 flex items-center gap-2">
                Paste WhatsApp Order
             </h3>
             <p className="text-xs text-purple-600 mb-3 block">
               Format: <code>Product Name Quantity</code> (e.g. Vanilla Cup 3)<br/>
               Lines without quantity will be checked as Customer Name/Details.
             </p>
             <textarea 
               value={bulkImportText}
               onChange={(e) => setBulkImportText(e.target.value)}
               className="w-full h-32 px-3 py-2 border border-purple-300 rounded focus:ring-2 focus:ring-purple-500 outline-none resize-y mb-3"
               placeholder="Vanilla Cup 2&#10;Apna Store&#10;Strawberry Cone 5"
             />
             <div className="flex justify-end">
               <button
                  onClick={handleBulkImport}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-purple-700 transition-colors shadow-sm"
               >
                  Import Items
               </button>
             </div>
           </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 print:hidden">
           <div className="md:col-span-2">
             <label className="block text-sm font-bold text-gray-700 mb-1">Brand Name</label>
             <input type="text" value={brandName} onChange={e => setBrandName(e.target.value)} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" placeholder="zishan gdx" />
           </div>
           <div>
             <label className="block text-sm font-bold text-gray-700 mb-1">GSTIN</label>
             <input type="text" value={gstin} onChange={e => setGstin(e.target.value)} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" placeholder="22AAAAA0000A1Z5" />
           </div>
           <div>
             <label className="block text-sm font-bold text-gray-700 mb-1">Bill No.</label>
             <input type="text" value={billNo} onChange={e => setBillNo(e.target.value)} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none font-mono" />
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
           <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 print:bg-white print:border-none print:p-0">
             <h3 className="font-bold text-gray-800 border-b pb-2 mb-4 print:border-gray-800 print:mb-2">Billed To:</h3>
             <div className="space-y-3">
               <div>
                 <datalist id="customerNamesListInvoice">
                   {productNames.map(name => <option key={name} value={name} />)}
                 </datalist>
                 <datalist id="productNamesListInvoice">
                   {productNames.map(name => <option key={name} value={name}>{`₹${productPrices[name]}`}</option>)}
                 </datalist>
                 <label className="block text-sm font-bold text-gray-700 mb-1 print:hidden">Customer Name</label>
                 <input type="text" list="customerNamesListInvoice" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none print:border-none print:p-0 print:font-bold print:text-lg" placeholder="Customer Name" />
               </div>
               <div>
                 <label className="block text-sm font-bold text-gray-700 mb-1 print:hidden">Phone</label>
                 <input type="text" value={customerPhone} onChange={e => setCustomerPhone(e.target.value.replace(/\\D/g, ''))} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none print:border-none print:p-0" placeholder="Phone Number" />
               </div>
               <div>
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
          <table className="w-full text-left border-collapse print:border print:border-gray-300">
            <thead>
              <tr className="bg-gray-800 text-white print:bg-gray-200 print:text-black">
                <th className="p-3 border print:border-gray-300 text-sm font-bold w-12 text-center">#</th>
                <th className="p-3 border print:border-gray-300 text-sm font-bold">Item Description</th>
                <th className="p-3 border print:border-gray-300 text-sm font-bold w-24 text-center">HSN</th>
                <th className="p-3 border print:border-gray-300 text-sm font-bold w-20 text-center">Qty</th>
                <th className="p-3 border print:border-gray-300 text-sm font-bold w-28 text-right">Rate</th>
                <th className="p-3 border print:border-gray-300 text-sm font-bold w-24 text-center">GST %</th>
                <th className="p-3 border print:border-gray-300 text-sm font-bold w-32 text-right">Total</th>
                <th className="p-3 border print:border-gray-300 text-sm font-bold w-12 print:hidden"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id} className="border-b print:border-gray-300">
                  <td className="p-3 border-x print:border-gray-300 text-center font-mono text-sm">{idx + 1}</td>
                  <td className="p-2 border-x print:border-gray-300">
                    <input type="text" list="productNamesListInvoice" value={item.name} onChange={e => handleItemChange(item.id, 'name', e.target.value)} className="w-full outline-none bg-transparent print:font-medium text-sm" placeholder="Item Name" />
                  </td>
                  <td className="p-2 border-x print:border-gray-300">
                    <input type="text" value={item.hsn} onChange={e => handleItemChange(item.id, 'hsn', e.target.value)} className="w-full outline-none bg-transparent text-center font-mono text-sm" placeholder="HSN" />
                  </td>
                  <td className="p-2 border-x print:border-gray-300">
                    <input type="number" min="1" value={item.quantity} onChange={e => handleItemChange(item.id, 'quantity', Number(e.target.value))} className="w-full outline-none bg-transparent text-center font-mono text-sm" />
                  </td>
                  <td className="p-2 border-x print:border-gray-300">
                    <input type="number" min="0" value={item.rate || ''} onChange={e => handleItemChange(item.id, 'rate', Number(e.target.value))} className="w-full outline-none bg-transparent text-right font-mono text-sm" placeholder="0.00" />
                  </td>
                  <td className="p-2 border-x print:border-gray-300">
                    <select value={item.gstPercent} onChange={e => handleItemChange(item.id, 'gstPercent', Number(e.target.value))} className="w-full outline-none bg-transparent text-center font-mono text-sm print:appearance-none">
                      <option value={0}>0%</option>
                      <option value={5}>5%</option>
                      <option value={12}>12%</option>
                      <option value={18}>18%</option>
                      <option value={28}>28%</option>
                    </select>
                  </td>
                  <td className="p-3 border-x print:border-gray-300 text-right font-mono tracking-tight text-gray-800 text-sm">
                    {(item.quantity * item.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-2 border-x print:border-gray-300 text-center print:hidden">
                    <button onClick={() => handleRemoveItem(item.id)} className="text-red-500 hover:text-red-700 p-1">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <div className="mt-4 print:hidden">
             <button onClick={handleAddItem} className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-bold text-sm bg-blue-50 px-4 py-2 rounded">
               <Plus size={16} /> Add Row
             </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between gap-8 py-4 border-t-2 border-gray-800 dark:border-gray-200 print:border-none print:py-0">
           
           <div className="w-full md:w-1/2 ml-auto">
              <div className="bg-gray-50 p-6 rounded border border-gray-200 print:bg-transparent print:border-none print:p-0">
                 <div className="flex justify-between mb-2">
                    <span className="font-bold text-gray-600">Subtotal:</span>
                    <span className="font-mono text-gray-800">₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                 </div>
                 {totalTax > 0 && (
                   <>
                     <div className="flex justify-between mb-2 text-sm">
                        <span className="font-medium text-gray-600">Total CGST:</span>
                        <span className="font-mono text-gray-800">₹{cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                     </div>
                     <div className="flex justify-between mb-4 border-b border-gray-300 pb-4 text-sm">
                        <span className="font-medium text-gray-600">Total SGST:</span>
                        <span className="font-mono text-gray-800">₹{sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                     </div>
                   </>
                 )}
                 <div className="flex justify-between items-center mb-4 border-b border-gray-300 pb-4 print:hidden">
                    <span className="font-bold text-gray-600">Discount (%):</span>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" 
                        min="0"
                        max="100"
                        value={discountPercent} 
                        onChange={e => setDiscountPercent(parseFloat(e.target.value) || 0)} 
                        className="w-20 px-2 py-1 border rounded text-right font-mono" 
                      />
                    </div>
                 </div>
                 {discountPercent > 0 && (
                    <div className="flex justify-between mb-2 text-sm text-green-600 text-green-700">
                       <span className="font-bold">Discount ({discountPercent}%):</span>
                       <span className="font-mono font-bold">-₹{discountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                 )}
                 <div className="flex justify-between items-center mt-2">
                    <span className="text-xl font-bold text-gray-900">Grand Total:</span>
                    <span className="text-2xl font-black font-mono text-blue-600 print:text-black">₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                 </div>
              </div>
           </div>
        </div>

        {/* Tax Details Table & Amount in Words */}
        <div className="mt-6 border border-gray-200 rounded p-4 bg-gray-50 print:border-gray-800 print:bg-white print:p-0 print:border-none print:mt-4 pb-8 print:pb-0">
          <h4 className="font-bold text-gray-700 mb-2 uppercase text-sm border-b pb-2">Tax Details & Summary</h4>
          <table className="w-full text-left border-collapse text-sm mb-6 print:border-gray-400">
            <thead>
              <tr className="bg-gray-200 print:bg-gray-100 text-gray-800">
                <th className="p-2 border border-gray-300 print:border-gray-400">Taxable Value</th>
                <th className="p-2 border border-gray-300 print:border-gray-400">CGST</th>
                <th className="p-2 border border-gray-300 print:border-gray-400">SGST</th>
                <th className="p-2 border border-gray-300 print:border-gray-400">Total Tax</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-2 border border-gray-300 print:border-gray-400 font-mono text-gray-800">₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td className="p-2 border border-gray-300 print:border-gray-400 font-mono text-gray-800">₹{cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td className="p-2 border border-gray-300 print:border-gray-400 font-mono text-gray-800">₹{sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td className="p-2 border border-gray-300 print:border-gray-400 font-mono text-gray-800">₹{totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>
          <div className="flex flex-col gap-1">
            <span className="font-bold text-gray-700 text-sm">Amount in Words:</span>
            <span className="font-bold text-gray-900 uppercase italic bg-gray-200 px-3 py-1.5 rounded w-fit print:border print:border-gray-300 print:bg-transparent print:italic print:px-0 print:py-0 border-none">{numberToWords(grandTotal)}</span>
          </div>
        </div>
        
        <div className="mt-8 flex justify-end gap-4 print:hidden">
          <button 
             onClick={() => window.print()}
             className="flex items-center gap-2 bg-blue-100 text-blue-700 px-6 py-3 rounded-md font-bold hover:bg-blue-200 transition-colors"
          >
            <Printer size={18} /> Print Bill
          </button>

          <button 
             onClick={handleSaveBill}
             disabled={saving || !user}
             className="flex items-center gap-2 bg-gray-800 text-white px-6 py-3 rounded-md font-bold hover:bg-gray-900 transition-colors disabled:opacity-50"
          >
            <Save size={18} /> {saving ? 'Saving...' : 'Save Bill'}
          </button>
        </div>
      </div>
    </div>
  );
}
