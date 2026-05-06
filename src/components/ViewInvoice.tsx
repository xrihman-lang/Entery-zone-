import React, { useState, useEffect, useMemo } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebase } from '../lib/firebase';
import { Printer, FileDown } from 'lucide-react';
import { Logo } from './Logo';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function numberToWords(amount: number): string {
  const single = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const double = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "Ten", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const formatTenth = (digit: number, prev: number): string => {
    return 0 === digit ? "" : " " + (1 === digit ? double[prev] : tens[digit]);
  };
  const formatOther = (digit: number, next: number, denom: string): string => {
    return 0 !== digit && 1 !== next ? " " + single[digit] + denom : (0 !== next || 0 === digit ? "" : " " + single[digit] + denom);
  };
  const helper = (n: number): string => {
    let res = "";
    if (isNaN(n)) return "";
    let str = n.toString();
    const splitStr = str.split(".");
    str = splitStr[0];
    if (str.length > 9) return "Overflow";
    
    // Pad with zeros to 9 digits
    const arr = ("000000000" + str).slice(-9).match(/.{1,2}(?=.{7})|.{1,2}(?=.{5})|.{1,2}(?=.{3})|.{1,3}/g);
    if (!arr) return "";
    res += formatOther(parseInt(arr[0][0]), parseInt(arr[0][1]), " Crore");
    res += formatTenth(parseInt(arr[0][1]), parseInt(arr[0][0]));
    res += formatOther(parseInt(arr[1][0]), parseInt(arr[1][1]), " Lakh");
    res += formatTenth(parseInt(arr[1][1]), parseInt(arr[1][0]));
    res += formatOther(parseInt(arr[2][0]), parseInt(arr[2][1]), " Thousand");
    res += formatTenth(parseInt(arr[2][1]), parseInt(arr[2][0]));
    res += formatOther(parseInt(arr[3][0]), parseInt(arr[3][1]), " Hundred");
    res += formatTenth(parseInt(arr[3][1]), parseInt(arr[3][0]));
    res += formatOther(parseInt(arr[3][2]), parseInt(arr[3][1]), "");
    return res.trim();
  };
  
  let num = Math.floor(amount);
  if (num === 0) return "Zero Rupees Only";
  return helper(num) + " Rupees Only";
}

export default function ViewInvoice({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    docPdf.text('zishan gdx', 35, 150, { angle: -45 });

    // Header Branding
    docPdf.setTextColor(0, 0, 0);
    docPdf.setFontSize(28);
    docPdf.setFont("helvetica", "bold");
    docPdf.text(invoice.brandName || "zishan gdx", 14, 25);
    
    docPdf.setFontSize(10);
    docPdf.setFont("helvetica", "normal");
    docPdf.text("TAX INVOICE", 14, 32);

    if(invoice.gstin) {
       docPdf.text(`GSTIN: ${invoice.gstin}`, 14, 38);
    }
    
    // Details right
    docPdf.setFontSize(10);
    docPdf.setFont("helvetica", "normal");
    docPdf.text(`Bill No: ${invoice.billNo}`, 150, 25);
    if(invoice.invoiceDate) {
      docPdf.text(`Date: ${invoice.invoiceDate}`, 150, 32);
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
    
    const tableData = (invoice.items || []).map((item: any, index: number) => [
      index + 1,
      item.name,
      item.hsn || '-',
      item.quantity.toString(),
      item.rate.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      item.gstPercent + '%',
      (item.quantity * item.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })
    ]);

    autoTable(docPdf, {
      startY: 85,
      head: [['S.No', 'Item Name', 'HSN', 'Qty', 'Rate', 'GST %', 'Total']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        2: { halign: 'center', cellWidth: 20 },
        3: { halign: 'center', cellWidth: 15 },
        4: { halign: 'right', cellWidth: 25 },
        5: { halign: 'center', cellWidth: 20 },
        6: { halign: 'right', cellWidth: 35 },
      }
    });

    const finalY = (docPdf as any).lastAutoTable.finalY + 10;
    
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
    docPdf.text("Official Report by zishan gdx", 105, 280, { align: 'center' });

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
        <div className="flex justify-end gap-4 mb-4 print:hidden">
          <button 
             onClick={() => window.print()}
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

        {/* Invoice Container */}
        <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden print:shadow-none print:border-none print:m-0">
          
          <style>
          {`
            @media print {
              @page { size: A4 portrait; margin: 15mm; }
              body { background-color: white; }
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
               {invoice.brandName === 'zishan gdx' || invoice.brandName === 'ZISHAN GDX' || !invoice.brandName ? (
                 <Logo iconClassName="w-12 h-12" textClassName="text-3xl" />
               ) : (
                 <h1 className="text-4xl font-black text-gray-900 tracking-tighter uppercase">{invoice.brandName}</h1>
               )}
               {invoice.gstin && <p className="text-sm text-gray-600 font-bold mt-2">GSTIN: {invoice.gstin}</p>}
             </div>
             <div className="text-right">
               <p className="text-gray-900 font-bold tracking-widest uppercase text-xl">Tax Invoice</p>
               <p className="text-sm font-mono mt-1 text-gray-600">Bill No: {invoice.billNo}</p>
             </div>
          </div>
          
          {/* Brand Footer for Print */}
          <div className="hidden print:flex print-fixed-footer">
             <span className="text-[10px] text-gray-500 uppercase tracking-widest">Thank You for Your Business!</span>
             <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Official Report by zishan gdx</span>
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

             <div className="grid grid-cols-2 gap-4 mb-6 mt-4 print:mt-0">
               <div>
                 <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Billed To</h3>
                 <p className="font-bold text-gray-900 text-base mb-0.5">{invoice.customerName}</p>
                 {invoice.customerPhone && <p className="text-gray-600 text-xs">{invoice.customerPhone}</p>}
                 {invoice.customerAddress && <p className="text-gray-600 mt-1 whitespace-pre-line text-xs">{invoice.customerAddress}</p>}
               </div>
               <div className="text-right text-xs">
                 <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Date Details</h3>
                 <p className="font-bold text-gray-900 inline-block mr-2">Invoice Date:</p>
                 <p className="text-gray-600 inline-block">{invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString('en-IN') : '-'}</p>
               </div>
             </div>

             <table className="w-full mb-6 border border-gray-300">
               <thead>
                 <tr className="bg-gray-800 text-white print:bg-gray-200 print:text-gray-900">
                   <th className="py-2 px-3 text-left font-bold text-xs">#</th>
                   <th className="py-2 px-3 text-left font-bold text-xs border-l border-gray-700 print:border-gray-300">Item Name</th>
                   <th className="py-2 px-2 text-center font-bold text-xs border-l border-gray-700 print:border-gray-300">HSN</th>
                   <th className="py-2 px-2 text-center font-bold text-xs border-l border-gray-700 print:border-gray-300">Qty</th>
                   <th className="py-2 px-3 text-right font-bold text-xs border-l border-gray-700 print:border-gray-300">Rate</th>
                   <th className="py-2 px-2 text-center font-bold text-xs border-l border-gray-700 print:border-gray-300">GST %</th>
                   <th className="py-2 px-3 text-right font-bold text-xs border-l border-gray-700 print:border-gray-300">Total</th>
                 </tr>
               </thead>
               <tbody>
                 {(invoice.items || []).map((item: any, idx: number) => (
                   <tr key={idx} className="border-b border-gray-200">
                     <td className="py-2 px-3 text-xs text-gray-800">{idx + 1}</td>
                     <td className="py-2 px-3 text-xs font-medium text-gray-900 border-l border-gray-200">{item.name}</td>
                     <td className="py-2 px-2 text-xs text-center font-mono text-gray-700 border-l border-gray-200">{item.hsn || '-'}</td>
                     <td className="py-2 px-2 text-xs text-center font-mono text-gray-800 border-l border-gray-200">{item.quantity}</td>
                     <td className="py-2 px-3 text-xs text-right font-mono text-gray-800 border-l border-gray-200">{item.rate?.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                     <td className="py-2 px-2 text-xs text-center font-mono text-gray-800 border-l border-gray-200">{item.gstPercent}%</td>
                     <td className="py-2 px-3 text-xs text-right font-mono font-bold text-gray-900 border-l border-gray-200">{(item.quantity * item.rate).toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                   </tr>
                 ))}
               </tbody>
             </table>

             <div className="flex flex-col md:flex-row justify-between items-start gap-6 print:flex-row">
                <div className="w-full md:w-1/2 mt-2 print:w-1/2">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Amount in Words:</p>
                  <p className="font-bold text-gray-900 text-xs uppercase italic p-2 bg-gray-50 border border-gray-200 rounded print:border-none print:px-0 print:bg-transparent">{numberToWords(invoice.grandTotal)}</p>
                </div>
                
                <div className="w-full md:w-2/5 print:w-2/5">
                  <div className="space-y-2">
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
