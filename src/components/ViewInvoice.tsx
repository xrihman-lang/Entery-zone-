import React, { useState, useEffect, useMemo } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebase } from '../lib/firebase';
import { Printer, FileDown, Settings } from 'lucide-react';
import { Logo } from './Logo';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { speak } from '../lib/speech';

import { numberToWords } from '../lib/numberToWords';

export default function ViewInvoice({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Print Settings
  const [showPhone, setShowPhone] = useState(true);
  const [showAddress, setShowAddress] = useState(true);
  const [showGST, setShowGST] = useState(true);

  const handleToggleSetting = (setter: React.Dispatch<React.SetStateAction<boolean>>, value: boolean) => {
    setter(!value);
    speak('Setting badal di gayi hai', 'professional');
  };

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        const { db } = await getFirebase();
        if (!db) {
          setError('Database connection error');
          setLoading(false);
          return;
        }

        const invoiceRef = doc(db, 'invoices', invoiceId);
        const invoiceSnap = await getDoc(invoiceRef);

        if (invoiceSnap.exists()) {
          setInvoice({ id: invoiceSnap.id, ...invoiceSnap.data() });
        } else {
          setError('Access Denied or Invoice not found');
        }
      } catch (err: any) {
        console.error(err);
        if (err.message.includes('permission')) {
          setError('Access Denied');
        } else {
          setError('Failed to load invoice');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchInvoice();
  }, [invoiceId]);

  const generatePDF = () => {
    if (!invoice) return;
    const docPdf = new jsPDF();
    
    // Watermark
    docPdf.setTextColor(240, 240, 240);
    docPdf.setFontSize(100);
    docPdf.text('GDX', 35, 150, { angle: -45 });

    // Header Branding
    docPdf.setTextColor(0, 0, 0);
    docPdf.setFontSize(10);
    docPdf.setFont("helvetica", "bold");
    docPdf.text("SALES INVOICE", 105, 15, { align: 'center' });

    docPdf.setFontSize(28);
    docPdf.text(invoice.brandName || "GDX", 14, 25);
    
    docPdf.setFontSize(14);
    docPdf.setTextColor(37, 99, 235);
    docPdf.text("TWINKLE ENTERPRISES", 196, 25, { align: 'right' });
    docPdf.setTextColor(0, 0, 0);

    docPdf.setFontSize(10);
    docPdf.setFont("helvetica", "normal");
    docPdf.text(`Bill No: ${invoice.billNo}`, 196, 32, { align: 'right' });
    if(invoice.invoiceDate) {
      docPdf.text(`Date: ${new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}`, 196, 38, { align: 'right' });
    }

    // Customer Details
    docPdf.setFontSize(12);
    docPdf.setFont("helvetica", "bold");
    docPdf.text("Billed To:", 14, 50);
    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(11);
    docPdf.text(`Name: ${invoice.customerName}`, 14, 57);
    if(invoice.customerPhone) docPdf.text(`Phone: ${invoice.customerPhone}`, 14, 63);
    if(invoice.customerAddress) {
      const addressLines = docPdf.splitTextToSize(`Address: ${invoice.customerAddress}`, 80);
      docPdf.text(addressLines, 14, invoice.customerPhone ? 69 : 63);
    }
    
    const tableData = (invoice.items || []).map((item: any, index: number) => {
      const row = [
        index + 1,
        item.name,
        item.quantity.toString(),
        item.rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })
      ];
      if (invoice.gstEnabled !== false) {
        row.push(item.gstPercent + '%');
      }
      row.push((item.quantity * item.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 }));
      return row;
    });

    const head = ['S.No', 'Item Name', 'Qty', 'Rate'];
    if (invoice.gstEnabled !== false) head.push('GST %');
    head.push('Total');

    autoTable(docPdf, {
      startY: 85,
      head: [head],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        2: { halign: 'center', cellWidth: 15 },
        3: { halign: 'right', cellWidth: 25 },
        ...(invoice.gstEnabled !== false ? { 4: { halign: 'center', cellWidth: 20 } } : {}),
        [invoice.gstEnabled !== false ? 5 : 4]: { halign: 'right', cellWidth: 35 },
      }
    });

    const finalY = (docPdf as any).lastAutoTable.finalY + 10;
    
    docPdf.setFont("helvetica", "bold");
    docPdf.text(`Total Boxes: ${invoice.totalBoxes || invoice.totalQty || 0}`, 14, finalY);

    docPdf.setFont("helvetica", "normal");
    docPdf.text(`Subtotal:`, 140, finalY);
    docPdf.text(`Rs ${invoice.subtotal?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 170, finalY, { align: 'left' });

    if(invoice.totalTax > 0) {
       docPdf.text(`CGST:`, 140, finalY + 8);
       docPdf.text(`Rs ${invoice.cgst?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 170, finalY + 8, { align: 'left' });
       
       docPdf.text(`SGST:`, 140, finalY + 16);
       docPdf.text(`Rs ${invoice.sgst?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 170, finalY + 16, { align: 'left' });
    }
    
    let currentY = finalY + (invoice.totalTax > 0 ? 24 : 8);

    if(invoice.discountAmount > 0) {
       docPdf.setTextColor(220, 38, 38); // red for discount
       docPdf.text(`Discount (${invoice.discountPercent}%):`, 130, currentY);
       docPdf.text(`-Rs ${invoice.discountAmount?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 170, currentY, { align: 'left' });
       docPdf.setTextColor(0, 0, 0);
       currentY += 8;
    }
    
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(14);
    docPdf.text(`Grand Total:`, 130, currentY + 4);
    docPdf.text(`Rs ${invoice.grandTotal?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 170, currentY + 4, { align: 'left' });

    docPdf.setFontSize(10);
    docPdf.setFont("helvetica", "normal");
    docPdf.setTextColor(150, 150, 150);
    docPdf.text("Official Report by GDX", 105, 280, { align: 'center' });

    docPdf.save(`Invoice_${invoice.billNo}.pdf`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 font-bold uppercase tracking-widest text-sm animate-pulse">Loading Invoice...</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-red-100">
           <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
           </div>
           <h1 className="text-2xl font-black text-gray-900 mb-2">Access Denied</h1>
           <p className="text-gray-500">{error || "This invoice does not exist or you don't have permission to view it."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-6 px-2 print:p-0 print:bg-white text-sm">
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4 print:hidden">
          <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex flex-wrap gap-4 items-center">
            <Settings size={16} className="text-gray-400" />
            <label className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={showPhone} onChange={() => handleToggleSetting(setShowPhone, showPhone)} className="w-4 h-4 text-blue-600 rounded" />
              <span className="text-xs font-bold text-gray-600">Show Phone</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={showAddress} onChange={() => handleToggleSetting(setShowAddress, showAddress)} className="w-4 h-4 text-blue-600 rounded" />
              <span className="text-xs font-bold text-gray-600">Show Address</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={showGST} onChange={() => handleToggleSetting(setShowGST, showGST)} className="w-4 h-4 text-blue-600 rounded" />
              <span className="text-xs font-bold text-gray-600">Show GST</span>
            </label>
          </div>

          <div className="flex gap-4">
            <button 
               onClick={() => {
                 speak('Bill taiyar hai, ab aap print kar sakte hain', 'professional');
                 window.print();
               }}
               className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg font-bold hover:bg-gray-50 transition-colors shadow-sm"
            >
              <Printer size={18} /> Print
            </button>

            <button 
               onClick={generatePDF}
               className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-sm"
            >
              <FileDown size={18} /> Download PDF
            </button>
          </div>
        </div>

        {/* Invoice Container */}
        <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden print:shadow-none print:border-none print:m-0">
          
          <style>
          {`
            @media print {
              @page { size: A4 portrait; margin: 10mm; }
              body { background-color: white; }
              .print\\:flex { display: flex !important; }
              .print-fixed-header { position: static; top: auto; left: auto; right: auto; height: auto; background: white; z-index: 10; border-bottom: 2px solid #1f2937; padding-bottom: 4px; margin-bottom: 4px; }
              .print-fixed-footer { position: fixed; bottom: 0; left: 0; right: 0; height: 30px; background: white; z-index: 10; border-top: 1px solid #d1d5db; display: flex; justify-content: space-between; align-items: center; }
              .print-content-spacer { padding-top: 0px; padding-bottom: 30px; }
            }
          `}
          </style>

          {/* Global Watermark (Subtle on web, prominent on print) */}
          <div className="watermark-text">
             GDX
          </div>
          
          {/* Brand Header for Print */}
          <div className="hidden print:flex flex-col border-b-2 border-gray-900 pb-1 mb-2" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
             <div className="w-full text-center py-1">
                <h2 className="text-sm font-black text-gray-900 tracking-[0.3em] uppercase">SALES INVOICE</h2>
             </div>
             <div className="w-full flex justify-between items-start mt-1">
                <div className="w-1/2">
                   <h1 className="text-4xl font-black text-gray-900 tracking-tighter uppercase leading-none">{invoice.brandName || "GDX"}</h1>
                   <p className="text-[10px] text-gray-600 font-bold mt-0.5 uppercase">{invoice.brandAddress}</p>
                   {invoice.gstin && showGST && <p className="text-[10px] text-gray-500 font-bold">GSTIN: {invoice.gstin}</p>}
                </div>
                <div className="w-1/2 text-right">
                   <h2 className="text-lg font-black text-blue-600 tracking-tight leading-none uppercase">TWINKLE ENTERPRISES</h2>
                   <div className="mt-1 text-[10px] text-gray-700 space-y-0.5">
                     <p className="font-black">BILL NO: {invoice.billNo}</p>
                     <p className="font-bold uppercase">DATE: {invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString('en-IN') : '-'}</p>
                   </div>
                </div>
             </div>
          </div>
          
          {/* Brand Footer for Print */}
          <div className="hidden print:flex print-fixed-footer">
             <span className="text-[10px] text-gray-500 uppercase tracking-widest">Thank You for Your Business!</span>
             <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Official Report by GDX</span>
          </div>

          <div className="p-6 print:p-0 print-content-spacer">
             {/* Header (Screen only) */}
             <div className="flex justify-between items-start border-b-2 border-gray-100 pb-4 mb-6 print:hidden">
                <div>
                  {invoice.brandName === 'zishan gdx' || invoice.brandName === 'ZISHAN GDX' || !invoice.brandName ? (
                    <Logo iconClassName="w-10 h-10" textClassName="text-3xl" />
                  ) : (
                    <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">{invoice.brandName}</h1>
                  )}
                  {invoice.gstin && <p className="text-xs text-gray-600 mt-2 font-medium">GSTIN: <span className="font-mono">{invoice.gstin}</span></p>}
                </div>
                <div className="text-right">
                  <h2 className="text-xl font-bold text-gray-800 uppercase tracking-widest mb-1">Tax Invoice</h2>
                  <p className="font-mono text-gray-600 bg-gray-100 px-2 py-0.5 rounded inline-block text-xs">Bill No: {invoice.billNo}</p>
                </div>
             </div>

             <div className="hidden print:grid print:grid-cols-1 print:gap-0 border-y border-gray-300 py-1 mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase text-gray-500 w-24">Customer:</span>
                  <span className="text-[11px] font-black uppercase text-gray-900">{invoice.customerName}</span>
                </div>
                {showPhone && invoice.customerPhone && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-gray-500 w-24">Phone:</span>
                    <span className="text-[11px] font-bold text-gray-900">{invoice.customerPhone}</span>
                  </div>
                )}
                {showAddress && invoice.customerAddress && (
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-black uppercase text-gray-500 w-24">Address:</span>
                    <span className="text-[10px] font-medium text-gray-800 line-clamp-1">{invoice.customerAddress}</span>
                  </div>
                )}
             </div>

             <table className="w-full mb-6 border border-gray-300">
               <thead>
                 <tr className="bg-gray-800 text-white print:bg-gray-200 print:text-gray-900">
                   <th className="py-2 px-3 text-left font-bold text-xs">#</th>
                   <th className="py-2 px-3 text-left font-bold text-xs border-l border-gray-700 print:border-gray-300">Item Name</th>
                   <th className="py-2 px-2 text-center font-bold text-xs border-l border-gray-700 print:border-gray-300">Qty</th>
                   <th className="py-2 px-3 text-right font-bold text-xs border-l border-gray-700 print:border-gray-300">Rate</th>
                   {invoice.gstEnabled !== false && <th className="py-2 px-2 text-center font-bold text-xs border-l border-gray-700 print:border-gray-300">GST %</th>}
                   <th className="py-2 px-3 text-right font-bold text-xs border-l border-gray-700 print:border-gray-300">Total</th>
                 </tr>
               </thead>
               <tbody>
                 {(invoice.items || []).map((item: any, idx: number) => (
                   <tr key={idx} className="border-b border-gray-200">
                     <td className="py-2 px-3 text-xs text-gray-800">{idx + 1}</td>
                     <td className="py-2 px-3 text-xs font-medium text-gray-900 border-l border-gray-200">{item.name}</td>
                     <td className="py-2 px-2 text-xs text-center font-mono text-gray-800 border-l border-gray-200">{item.quantity}</td>
                     <td className="py-2 px-3 text-xs text-right font-mono text-gray-800 border-l border-gray-200">{item.rate?.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                     {invoice.gstEnabled !== false && <td className="py-2 px-2 text-xs text-center font-mono text-gray-800 border-l border-gray-200">{item.gstPercent}%</td>}
                     <td className="py-2 px-3 text-xs text-right font-mono font-bold text-gray-900 border-l border-gray-200">{(item.quantity * item.rate).toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                   </tr>
                 ))}
                 {/* Summary row for total dabba qty in print */}
                 <tr className="bg-gray-50 print:bg-gray-100 hidden print:table-row">
                    <td colSpan={2} className="p-2 text-right font-bold text-xs uppercase tracking-tighter">Total Qty (Dabba):</td>
                    <td className="p-2 text-center font-black text-xs border border-gray-300">{invoice.totalQty || 0}</td>
                    <td colSpan={invoice.gstEnabled !== false ? 3 : 2} className="p-2 text-right font-bold text-xs">Summary</td>
                 </tr>
               </tbody>
             </table>

             <div className="flex flex-col md:flex-row justify-between items-start gap-6 print:flex-col print:items-end print:text-right">
                <div className="w-full md:w-1/2 mt-2 print:w-1/2 print:text-left print:mr-auto">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 print:text-black text-xs">Amount in Words:</p>
                  <p className="font-bold text-gray-900 text-xs uppercase italic p-2 bg-gray-50 border border-gray-200 rounded print:border-none print:px-0 print:bg-transparent print:text-black">{numberToWords(invoice.grandTotal)}</p>
                </div>
                
                <div className="w-full md:w-2/5 print:w-2/5">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-gray-600 uppercase tracking-tighter">Total Boxes:</span>
                      <span className="font-black text-gray-900 border-b-2 border-blue-200">{invoice.totalBoxes || invoice.totalQty || 0}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-gray-600">Subtotal:</span>
                      <span className="font-mono text-gray-900">₹{invoice.subtotal?.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
                    </div>
                    {invoice.totalTax > 0 && (
                      <>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-600">Total CGST:</span>
                          <span className="font-mono text-gray-800">₹{invoice.cgst?.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
                        </div>
                        <div className="flex justify-between text-xs border-b border-gray-200 pb-2">
                          <span className="text-gray-600">Total SGST:</span>
                          <span className="font-mono text-gray-800">₹{invoice.sgst?.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
                        </div>
                      </>
                    )}
                    {invoice.discountAmount > 0 && (
                        <div className="flex justify-between text-xs text-green-700">
                          <span className="font-bold">Discount ({invoice.discountPercent}%):</span>
                          <span className="font-mono font-bold">-₹{invoice.discountAmount?.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
                        </div>
                    )}
                    <div className="flex justify-between bg-gray-100 p-2 rounded border border-gray-200 print:bg-gray-100 print:border-gray-500">
                      <span className="font-black text-gray-900 text-base uppercase">Grand Total:</span>
                      <span className="font-black font-mono text-gray-900 text-base">₹{invoice.grandTotal?.toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
                    </div>
                  </div>
                </div>
             </div>

             <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between items-end print:hidden">
               <div>
                 <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Powered by zishan gdx</p>
               </div>
               <div className="text-center">
                 <div className="w-48 border-b border-gray-400 mb-2 mx-auto"></div>
                 <p className="text-sm font-bold text-gray-600">Authorized Signatory</p>
               </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
