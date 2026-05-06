import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { Search, Download, FileText, IndianRupee, PieChart, MessageCircle } from 'lucide-react';
import { getFirebase, handleFirestoreError, OperationType } from '../lib/firebase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Invoice {
  id: string;
  billNo: string;
  customerName: string;
  customerPhone?: string;
  invoiceDate: string;
  grandTotal: number;
  totalTax: number;
  subtotal: number;
}

export default function InvoiceHistory({ user }: { user: any }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [timeFilter, setTimeFilter] = useState('This Month'); // 'Today', 'All Time', '1'-'12'

  useEffect(() => {
    if (!user) return;
    const fetchInvoices = async () => {
      try {
        setLoading(true);
        const { db } = await getFirebase();
        const q = query(
          collection(db, 'invoices'),
          where('userId', '==', user.uid)
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Invoice[];
        // Sort the data client-side by createdAt descending
        data.sort((a: any, b: any) => {
          const dateA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.invoiceDate || 0).getTime();
          const dateB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.invoiceDate || 0).getTime();
          return dateB - dateA;
        });
        setInvoices(data);
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'invoices');
      } finally {
        setLoading(false);
      }
    };
    fetchInvoices();
  }, [user]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      // 1. Search Filter
      const matchesSearch = inv.billNo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            inv.customerName?.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      // 2. Time Filter
      if (timeFilter === 'All Time') return true;
      
      const invDate = new Date(inv.invoiceDate || new Date());
      const today = new Date();
      
      if (timeFilter === 'Today') {
        return invDate.toDateString() === today.toDateString();
      }
      
      if (timeFilter === 'This Month') {
        return invDate.getMonth() === today.getMonth() && invDate.getFullYear() === today.getFullYear();
      }

      // Check specific month (1-12)
      const monthNum = parseInt(timeFilter);
      if (!isNaN(monthNum)) {
        return invDate.getMonth() + 1 === monthNum && invDate.getFullYear() === today.getFullYear(); 
      }

      return true;
    });
  }, [invoices, searchTerm, timeFilter]);

  const summary = useMemo(() => {
    let totalSales = 0;
    let totalGST = 0;
    filteredInvoices.forEach(inv => {
      totalSales += inv.grandTotal || 0;
      totalGST += inv.totalTax || 0;
    });
    return { totalSales, totalGST, count: filteredInvoices.length };
  }, [filteredInvoices]);

  const downloadSummaryInfo = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(`Monthly Summary (${timeFilter})`, 14, 22);
    
    doc.setFontSize(12);
    doc.text(`Total Invoices: ${summary.count}`, 14, 32);
    doc.text(`Total Sales: Rs ${summary.totalSales.toLocaleString('en-IN')}`, 14, 40);
    doc.text(`Total GST: Rs ${summary.totalGST.toLocaleString('en-IN')}`, 14, 48);

    const tableData = filteredInvoices.map(inv => [
      inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('en-IN') : '',
      inv.billNo || '',
      inv.customerName || 'N/A',
      `Rs ${(inv.totalTax || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`,
      `Rs ${(inv.grandTotal || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}`
    ]);

    autoTable(doc, {
      startY: 55,
      head: [['Date', 'Bill No', 'Customer Name', 'Tax (GST)', 'Grand Total']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235] },
      columnStyles: {
        3: { halign: 'right' },
        4: { halign: 'right' },
      }
    });

    doc.save(`Invoice_Summary_${timeFilter.replace(/\s+/g, '_')}.pdf`);
  };

  const shareWhatsApp = (inv: Invoice) => {
    const url = `${window.location.origin}/view-bill/${inv.id}`;
    const text = `Hello ${inv.customerName}! Aapka zishan gdx bill taiyar hai. Total: Rs.${inv.grandTotal.toLocaleString('en-IN')}. Apna bill yahan dekhen: ${url}`;
    
    let link = `https://wa.me/`;
    if (inv.customerPhone) {
      link += `${inv.customerPhone}`;
    }
    link += `?text=${encodeURIComponent(text)}`;
    window.open(link, '_blank');
  };

  if (loading) {
    return <div className="p-12 text-center text-gray-500 font-bold uppercase tracking-widest text-sm">Loading Invoice History...</div>;
  }

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-screen">
      {/* Search and Filter Row */}
      <div className="flex flex-col md:flex-row gap-4 mb-6 justify-between items-end md:items-center">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-4 top-3 text-gray-400" size={20} />
          <input 
            type="text" 
            placeholder="Search by Bill No or Customer..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <select 
            value={timeFilter}
            onChange={e => setTimeFilter(e.target.value)}
            className="px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-white shadow-sm font-medium text-gray-700 outline-none w-full sm:w-auto"
          >
            <option value="Today">Today</option>
            <option value="This Month">This Month</option>
            <option value="All Time">All Time</option>
            <option disabled>──────────</option>
            <option value="1">January</option>
            <option value="2">February</option>
            <option value="3">March</option>
            <option value="4">April</option>
            <option value="5">May</option>
            <option value="6">June</option>
            <option value="7">July</option>
            <option value="8">August</option>
            <option value="9">September</option>
            <option value="10">October</option>
            <option value="11">November</option>
            <option value="12">December</option>
          </select>

          <button 
            onClick={downloadSummaryInfo}
            disabled={filteredInvoices.length === 0}
            className="flex justify-center items-center gap-2 bg-blue-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Download size={18} /> Download Summary
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
              <FileText size={20} />
            </div>
            <p className="font-bold text-gray-500 text-sm uppercase tracking-wider">Total Invoices</p>
          </div>
          <p className="text-4xl font-black text-gray-900">{summary.count}</p>
        </div>
        
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-50 text-green-600 rounded-xl shrink-0">
              <IndianRupee size={20} />
            </div>
            <p className="font-bold text-gray-500 text-sm uppercase tracking-wider">Total Sales (Gross)</p>
          </div>
          <p className="text-4xl font-black text-gray-900 tracking-tight">₹{summary.totalSales.toLocaleString('en-IN', {minimumFractionDigits: 2})}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-50 text-orange-600 rounded-xl shrink-0">
              <PieChart size={20} />
            </div>
            <p className="font-bold text-gray-500 text-sm uppercase tracking-wider">GST Collected</p>
          </div>
          <p className="text-4xl font-black text-gray-900 tracking-tight">₹{summary.totalGST.toLocaleString('en-IN', {minimumFractionDigits: 2})}</p>
        </div>
      </div>

      {/* Invoice List Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="py-4 px-6 font-bold text-xs uppercase tracking-wider text-gray-500">Date</th>
                <th className="py-4 px-6 font-bold text-xs uppercase tracking-wider text-gray-500">Bill No</th>
                <th className="py-4 px-6 font-bold text-xs uppercase tracking-wider text-gray-500">Customer Name</th>
                <th className="py-4 px-6 font-bold text-xs uppercase tracking-wider text-gray-500 text-right">Tax (GST)</th>
                <th className="py-4 px-6 font-bold text-xs uppercase tracking-wider text-gray-500 text-right">Grand Total</th>
                <th className="py-4 px-6 font-bold text-xs uppercase tracking-wider text-gray-500 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.length > 0 ? (
                filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-100 hover:bg-blue-50/30 transition-colors">
                    <td className="py-4 px-6 text-gray-600 text-sm whitespace-nowrap">
                      {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                    </td>
                    <td className="py-4 px-6 font-mono text-sm font-bold text-gray-900">{inv.billNo || 'N/A'}</td>
                    <td className="py-4 px-6 text-sm font-medium text-gray-800">{inv.customerName || 'Cash Sale'}</td>
                    <td className="py-4 px-6 text-right font-mono text-sm text-gray-500">₹{(inv.totalTax || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                    <td className="py-4 px-6 text-right font-mono font-bold text-gray-900">₹{(inv.grandTotal || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                    <td className="py-4 px-6 text-center">
                      <div className="flex items-center justify-center gap-3">
                        <button 
                          onClick={() => window.open(`/view-bill/${inv.id}`, '_blank')}
                          className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center justify-center gap-1"
                          title="View Bill"
                        >
                          <FileText size={16} /> <span className="hidden sm:inline">View</span>
                        </button>
                        <button 
                          onClick={() => shareWhatsApp(inv)}
                          className="text-green-600 hover:text-green-800 font-medium text-sm flex items-center justify-center gap-1"
                          title="Share on WhatsApp"
                        >
                          <MessageCircle size={16} /> <span className="hidden sm:inline">Share</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 px-6 text-center text-gray-400 font-medium text-sm">
                    {searchTerm ? 'No invoices match your search.' : 'No invoices found for the selected view.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
