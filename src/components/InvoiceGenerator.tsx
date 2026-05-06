import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Printer, Save, FileDown } from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getFirebase } from '../lib/firebase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface InvoiceItem {
  id: string;
  name: string;
  quantity: number;
  rate: number;
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

export default function InvoiceGenerator({ user }: { user: any }) {
  const [brandName, setBrandName] = useState('zishan gdx');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [taxRate, setTaxRate] = useState<number>(18); // Default 18% GST (9% CGST, 9% SGST)
  
  const [items, setItems] = useState<InvoiceItem[]>([
    { id: Date.now().toString(), name: '', quantity: 1, rate: 0 }
  ]);

  const [saving, setSaving] = useState(false);

  const handleAddItem = () => {
    setItems([...items, { id: Date.now().toString(), name: '', quantity: 1, rate: 0 }]);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleItemChange = (id: string, field: keyof InvoiceItem, value: any) => {
    setItems(items.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const subtotal = useMemo(() => {
    return items.reduce((acc, item) => acc + (item.quantity * item.rate), 0);
  }, [items]);

  const cgst = useMemo(() => subtotal * (taxRate / 2) / 100, [subtotal, taxRate]);
  const sgst = useMemo(() => subtotal * (taxRate / 2) / 100, [subtotal, taxRate]);
  const grandTotal = subtotal + cgst + sgst;

  const handleSaveToFirestore = async () => {
    if (!user) {
      alert("Please login to save the invoice to history.");
      return;
    }
    setSaving(true);
    try {
      const { db } = await getFirebase();
      await addDoc(collection(db, 'invoices'), {
        userId: user.uid,
        brandName,
        customerName,
        customerPhone,
        customerAddress,
        items,
        subtotal,
        taxRate,
        cgst,
        sgst,
        grandTotal,
        date: new Date().toISOString(),
        createdAt: serverTimestamp(),
      });
      alert('Invoice Saved Successfully!');
    } catch (e) {
      console.error(e);
      alert('Failed to save invoice.');
    } finally {
      setSaving(false);
    }
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    
    // Watermark
    doc.setTextColor(230, 230, 230);
    doc.setFontSize(100);
    doc.text('zishan gdx', 35, 150, { angle: -45, opacity: 0.1 });

    // Header Branding
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(28);
    doc.setFont("helvetica", "bold");
    doc.text(brandName, 14, 25);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("TAX INVOICE", 14, 32);

    // Customer Details
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Billed To:", 14, 45);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Name: ${customerName}`, 14, 52);
    doc.text(`Phone: ${customerPhone}`, 14, 58);
    doc.text(`Address: ${customerAddress}`, 14, 64);
    
    doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, 150, 45);

    const tableData = items.map((item, index) => [
      index + 1,
      item.name,
      item.quantity.toString(),
      item.rate.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      (item.quantity * item.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })
    ]);

    autoTable(doc, {
      startY: 75,
      head: [['S.No', 'Item Name', 'Qty', 'Rate', 'Total']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        2: { halign: 'center', cellWidth: 20 },
        3: { halign: 'right', cellWidth: 35 },
        4: { halign: 'right', cellWidth: 40 },
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    
    doc.setFont("helvetica", "normal");
    doc.text(`Subtotal:`, 140, finalY);
    doc.text(`Rs ${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 170, finalY, { align: 'left' });

    doc.text(`CGST (${taxRate / 2}%):`, 140, finalY + 8);
    doc.text(`Rs ${cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 170, finalY + 8, { align: 'left' });
    
    doc.text(`SGST (${taxRate / 2}%):`, 140, finalY + 16);
    doc.text(`Rs ${sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 170, finalY + 16, { align: 'left' });
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(`Grand Total:`, 130, finalY + 28);
    doc.text(`Rs ${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 170, finalY + 28, { align: 'left' });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.text("Official Report by zishan gdx", 105, 280, { align: 'center' });

    doc.save(`Invoice_${customerName}_${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}.pdf`);
  };

  return (
    <div className="relative bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden print:shadow-none print:border-none print:m-0">
      
      {/* Global CSS for Print-specific @page within Invoice Generator */}
      <style className="print:block hidden">
      {`
        @media print {
          @page { size: A4 portrait; margin: 1cm; }
          .print\\:flex { display: flex !important; }
        }
      `}
      </style>

      {/* Global Print Watermark */}
      <div className="hidden print:flex fixed inset-0 items-center justify-center pointer-events-none" style={{ zIndex: -100 }}>
         <div className="transform -rotate-45 text-[140px] font-bold text-[#eee] whitespace-nowrap" style={{ opacity: 0.2 }}>
            zishan gdx
         </div>
      </div>

      {/* Brand Header for Print */}
      <div className="hidden print:block p-8 border-b-2 border-gray-800 bg-gray-50">
         <div className="flex justify-between items-end">
           <div>
             <h1 className="text-5xl font-black text-gray-900 tracking-tighter uppercase">{brandName || 'zishan gdx'}</h1>
             <p className="text-gray-500 font-bold tracking-widest mt-2 uppercase">Tax Invoice</p>
           </div>
           <p className="text-xs text-gray-400 uppercase tracking-widest text-right">Official Document by zishan gdx</p>
         </div>
      </div>

      <div className="p-6">
        {/* Pro Feature Marketing Banner */}
        <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 p-4 rounded-xl print:hidden">
           <h3 className="font-bold text-blue-800 flex items-center gap-2 mb-2">
             <span className="bg-blue-600 text-white px-2 py-0.5 rounded text-xs uppercase tracking-widest">Premium Feature</span>
             Why use this Professional Bill Generator?
           </h3>
           <ul className="text-sm text-blue-700 space-y-1 ml-2 list-disc list-inside">
             <li><strong>GST Ready:</strong> Auto-calculates CGST/SGST instantly.</li>
             <li><strong>Professionalism:</strong> Deliver clean, branded invoices (Powered by "zishan gdx") to boost business credibility.</li>
             <li><strong>Future Ready:</strong> Coming soon - Inventory Sync (Auto-deduct stock on bill generation).</li>
           </ul>
        </div>

        <h2 className="text-2xl font-bold text-gray-800 mb-6 print:hidden flex items-center gap-2">
          <FileDown className="text-blue-500" /> Professional Bill Generator
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 print:hidden">
           <div>
             <label className="block text-sm font-bold text-gray-700 mb-1">Brand / Company Name</label>
             <input type="text" value={brandName} onChange={e => setBrandName(e.target.value)} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none" placeholder="zishan gdx" />
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
           <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
             <h3 className="font-bold text-gray-800 border-b pb-2 mb-4">Billed To</h3>
             <div className="space-y-4">
               <div>
                 <label className="block text-sm font-bold text-gray-700 mb-1 print:hidden">Customer Name</label>
                 <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none print:border-none print:p-0 print:font-bold print:text-lg" placeholder="Customer Name" />
               </div>
               <div>
                 <label className="block text-sm font-bold text-gray-700 mb-1 print:hidden">Phone</label>
                 <input type="text" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none print:border-none print:p-0" placeholder="Phone Number" />
               </div>
               <div>
                 <label className="block text-sm font-bold text-gray-700 mb-1 print:hidden">Address</label>
                 <textarea value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none print:border-none print:p-0 resize-none" rows={2} placeholder="Full Address"></textarea>
               </div>
             </div>
           </div>
           
           <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 print:bg-white print:border-none">
             <div className="flex flex-col gap-4 text-right">
                <div>
                   <p className="text-sm font-bold text-gray-500 uppercase">Date</p>
                   <p className="font-bold text-gray-900">{new Date().toLocaleDateString('en-IN')}</p>
                </div>
             </div>
           </div>
        </div>

        <div className="mb-6">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th className="p-3 border text-sm font-bold w-16 text-center">S.No</th>
                <th className="p-3 border text-sm font-bold">Item Description</th>
                <th className="p-3 border text-sm font-bold w-24 text-center">Qty</th>
                <th className="p-3 border text-sm font-bold w-32 text-right">Rate</th>
                <th className="p-3 border text-sm font-bold w-32 text-right">Total</th>
                <th className="p-3 border text-sm font-bold w-12 print:hidden"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id} className="border-b">
                  <td className="p-3 border-x text-center font-mono">{idx + 1}</td>
                  <td className="p-3 border-x">
                    <input type="text" value={item.name} onChange={e => handleItemChange(item.id, 'name', e.target.value)} className="w-full outline-none bg-transparent print:font-medium" placeholder="Item Name" />
                  </td>
                  <td className="p-3 border-x">
                    <input type="number" min="1" value={item.quantity} onChange={e => handleItemChange(item.id, 'quantity', Number(e.target.value))} className="w-full outline-none bg-transparent text-center font-mono" />
                  </td>
                  <td className="p-3 border-x">
                    <input type="number" min="0" value={item.rate || ''} onChange={e => handleItemChange(item.id, 'rate', Number(e.target.value))} className="w-full outline-none bg-transparent text-right font-mono" placeholder="0.00" />
                  </td>
                  <td className="p-3 border-x text-right font-mono tracking-tight text-gray-800">
                    {(item.quantity * item.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-3 border-x text-center print:hidden">
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
               <Plus size={16} /> Add Item Row
             </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between gap-8 py-4 border-t-2 border-gray-800 dark:border-gray-200">
           <div className="w-full md:w-1/3 print:hidden">
             <label className="block text-sm font-bold text-gray-700 mb-1">Set GST Rate (%)</label>
             <select value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none">
               <option value={0}>0% (No GST)</option>
               <option value={5}>5%</option>
               <option value={12}>12%</option>
               <option value={18}>18%</option>
               <option value={28}>28%</option>
             </select>
             <p className="text-xs text-gray-500 mt-2">GST Ready: System auto-calculates CGST and SGST equal halves.</p>
           </div>
           
           <div className="w-full md:w-1/2 ml-auto">
              <div className="bg-gray-50 p-6 rounded border border-gray-200 print:bg-transparent print:border-none print:p-0">
                 <div className="flex justify-between mb-2">
                    <span className="font-bold text-gray-600">Subtotal:</span>
                    <span className="font-mono text-gray-800">₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                 </div>
                 {taxRate > 0 && (
                   <>
                     <div className="flex justify-between mb-2">
                        <span className="font-bold text-gray-600">CGST ({taxRate/2}%):</span>
                        <span className="font-mono text-gray-800">₹{cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                     </div>
                     <div className="flex justify-between mb-4 border-b border-gray-300 pb-4">
                        <span className="font-bold text-gray-600">SGST ({taxRate/2}%):</span>
                        <span className="font-mono text-gray-800">₹{sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                     </div>
                   </>
                 )}
                 <div className="flex justify-between items-center mt-2">
                    <span className="text-xl font-bold text-gray-900">Grand Total:</span>
                    <span className="text-2xl font-black font-mono text-blue-600 print:text-black">₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                 </div>
              </div>
           </div>
        </div>

        {/* Tax Details Table & Amount in Words */}
        <div className="mt-6 border border-gray-200 rounded p-4 bg-gray-50 print:border-gray-800 print:bg-white pb-8">
          <h4 className="font-bold text-gray-700 mb-2 uppercase text-sm border-b pb-2">Tax Details & Summary</h4>
          <table className="w-full text-left border-collapse text-sm mb-6 print:border-gray-400">
            <thead>
              <tr className="bg-gray-200 print:bg-gray-100 text-gray-800">
                <th className="p-2 border border-gray-300 print:border-gray-400">Taxable Value</th>
                <th className="p-2 border border-gray-300 print:border-gray-400">CGST ({taxRate/2}%)</th>
                <th className="p-2 border border-gray-300 print:border-gray-400">SGST ({taxRate/2}%)</th>
                <th className="p-2 border border-gray-300 print:border-gray-400">Total Tax</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-2 border border-gray-300 print:border-gray-400 font-mono text-gray-800">₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td className="p-2 border border-gray-300 print:border-gray-400 font-mono text-gray-800">₹{cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td className="p-2 border border-gray-300 print:border-gray-400 font-mono text-gray-800">₹{sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td className="p-2 border border-gray-300 print:border-gray-400 font-mono text-gray-800">₹{(cgst + sgst).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>
          <div className="flex flex-col gap-1">
            <span className="font-bold text-gray-700 text-sm">Amount in Words:</span>
            <span className="font-bold text-gray-900 uppercase italic bg-gray-200 px-3 py-1.5 rounded w-fit print:border print:border-gray-300 print:bg-transparent print:italic">{numberToWords(grandTotal)}</span>
          </div>
        </div>
        
        {/* Print-only Footer Notes */}
        <div className="hidden print:block mt-8 text-center text-xs text-gray-500 uppercase tracking-widest pt-4 border-t border-gray-200">
           Thank You for Your Business! | Official Document by zishan gdx
        </div>

        <div className="mt-8 flex justify-end gap-4 print:hidden">
          <button 
             onClick={handleSaveToFirestore}
             disabled={saving || !user}
             className="flex items-center gap-2 bg-gray-800 text-white px-6 py-3 rounded-md font-bold hover:bg-gray-900 transition-colors disabled:opacity-50"
          >
            <Save size={18} /> {saving ? 'Saving...' : 'Save Invoice'}
          </button>
          
          <button 
             onClick={() => window.print()}
             className="flex items-center gap-2 bg-blue-100 text-blue-700 px-6 py-3 rounded-md font-bold hover:bg-blue-200 transition-colors"
          >
            <Printer size={18} /> Print
          </button>

          <button 
             onClick={generatePDF}
             className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-md font-bold hover:bg-blue-700 transition-colors shadow-lg"
          >
            <FileDown size={18} /> Generate PDF
          </button>
        </div>
      </div>
    </div>
  );
}
