/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Printer, Trash2, Save, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Entry {
  id: string;
  date: string;
  customerName: string;
  type: 'S' | 'O' | 'V';
  totalAmount: number;
  receivedAmount: number;
  pendingAmount: number;
}

export default function App() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeTab, setActiveTab] = useState<'standard' | 'vrs'>('standard');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    customerName: '',
    type: 'S' as 'S' | 'O' | 'V',
    totalAmount: '',
    receivedAmount: '',
  });

  // Load from LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem('daybook_entries');
    if (saved) {
      try {
        setEntries(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load entries', e);
      }
    }
  }, []);

  // Save to LocalStorage
  useEffect(() => {
    localStorage.setItem('daybook_entries', JSON.stringify(entries));
  }, [entries]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAddEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customerName || !formData.totalAmount) return;

    const total = parseFloat(formData.totalAmount);
    const received = parseFloat(formData.receivedAmount || '0');
    
    const newEntry: Entry = {
      id: crypto.randomUUID(),
      date: formData.date,
      customerName: formData.customerName,
      type: formData.type,
      totalAmount: total,
      receivedAmount: received,
      pendingAmount: total - received,
    };

    setEntries(prev => [...prev, newEntry]);
    
    // Auto-switch tab if added to the other one
    if (formData.type === 'V' && activeTab === 'standard') setActiveTab('vrs');
    if (formData.type !== 'V' && activeTab === 'vrs') setActiveTab('standard');

    setFormData({
      date: new Date().toISOString().split('T')[0],
      customerName: '',
      type: formData.type,
      totalAmount: '',
      receivedAmount: '',
    });
  };

  const deleteEntry = (id: string) => {
    setEntries(prev => prev.filter(entry => entry.id !== id));
  };

  // Filter Logic
  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      const matchesTab = activeTab === 'vrs' ? entry.type === 'V' : entry.type !== 'V';
      const matchesSearch = entry.customerName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFromDate = filterFromDate ? entry.date >= filterFromDate : true;
      const matchesToDate = filterToDate ? entry.date <= filterToDate : true;
      return matchesTab && matchesSearch && matchesFromDate && matchesToDate;
    });
  }, [entries, activeTab, searchTerm, filterFromDate, filterToDate]);

  const totals = useMemo(() => {
    return filteredEntries.reduce((acc, curr) => ({
      total: acc.total + curr.totalAmount,
      received: acc.received + curr.receivedAmount,
      pending: acc.pending + curr.pendingAmount,
    }), { total: 0, received: 0, pending: 0 });
  }, [filteredEntries]);

  const handlePrint = () => {
    window.print();
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFilterFromDate('');
    setFilterToDate('');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto bg-white shadow-xl rounded-lg overflow-hidden print:shadow-none print:m-0">
        
        {/* Header */}
        <header className="bg-blue-600 text-white p-6 flex flex-col md:flex-row justify-between items-center gap-4 print:bg-white print:text-black print:border-b-2 print:border-blue-600">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Daily Daybook</h1>
            <p className="text-blue-100 print:hidden text-sm mt-1">Manage your daily transactions and balances</p>
          </div>
          <div className="flex gap-2 print:hidden">
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 bg-white text-blue-600 px-4 py-2 rounded-md font-medium hover:bg-blue-50 transition-colors shadow-sm"
            >
              <Printer size={18} />
              Print / Save PDF
            </button>
          </div>
        </header>

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
        </div>

        {/* Input Form Section */}
        <div className="p-6 bg-gray-50 border-b border-gray-200 print:hidden">
          <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
            <Plus size={20} className="text-blue-600" />
            Add New Entry
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
                <button 
                  type="submit"
                  className="bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700 transition-colors flex-shrink-0"
                  title="Add Entry"
                >
                  <Plus size={24} />
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Dashboard / Summary Cards */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 bg-white">
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r shadow-sm">
            <h3 className="text-blue-600 text-sm font-bold uppercase tracking-wider">Filtered Total</h3>
            <p className="text-2xl font-bold text-gray-800 mt-1">₹{totals.total.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r shadow-sm">
            <h3 className="text-green-600 text-sm font-bold uppercase tracking-wider">Filtered Received</h3>
            <p className="text-2xl font-bold text-gray-800 mt-1">₹{totals.received.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r shadow-sm">
            <h3 className="text-yellow-700 text-sm font-bold uppercase tracking-wider">Filtered Pending</h3>
            <p className="text-2xl font-bold text-gray-800 mt-1">₹{totals.pending.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        {/* Search and Filters Section */}
        <div className="px-6 py-4 bg-gray-50 border-y border-gray-200 flex flex-col lg:flex-row gap-4 items-center print:hidden">
          <div className="relative w-full lg:w-1/3">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Plus className="h-5 w-5 text-gray-400 rotate-45" />
            </span>
            <input 
              type="text" 
              placeholder="Search by Customer Name..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all sm:text-sm"
            />
          </div>
          
          <div className="flex flex-wrap items-center gap-4 w-full lg:w-2/3 justify-end">
            <div className="flex items-center gap-2">
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
            {(searchTerm || filterFromDate || filterToDate) && (
              <button 
                onClick={clearFilters}
                className="text-xs font-bold text-red-500 hover:text-red-700 uppercase tracking-tighter"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Table Container */}
        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className={`${activeTab === 'vrs' ? 'bg-purple-600' : 'bg-[#FFC107]'} text-black print:bg-gray-100`}>
                <th className="p-3 border border-gray-200 first:border-l-0 text-sm font-bold uppercase whitespace-nowrap">Sr. No</th>
                <th className="p-3 border border-gray-200 text-sm font-bold uppercase whitespace-nowrap">Date</th>
                <th className="p-3 border border-gray-200 text-sm font-bold uppercase whitespace-nowrap">Customer Name</th>
                <th className="p-3 border border-gray-200 text-sm font-bold uppercase whitespace-nowrap text-center">Type</th>
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
                      className="hover:bg-gray-50 border-b border-gray-100 transition-colors"
                    >
                      <td className="p-3 border-x border-gray-100 text-sm text-gray-600 font-mono">{index + 1}</td>
                      <td className="p-3 border-x border-gray-100 text-sm text-gray-700 whitespace-nowrap">
                        {new Date(entry.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="p-3 border-x border-gray-100 text-sm font-medium text-gray-900">{entry.customerName}</td>
                      <td className="p-3 border-x border-gray-100 text-sm text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          entry.type === 'S' ? 'bg-green-100 text-green-700' : 
                          entry.type === 'O' ? 'bg-blue-100 text-blue-700' :
                          'bg-purple-100 text-purple-700'
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
                        <button 
                          onClick={() => deleteEntry(entry.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-full hover:bg-red-50"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </tbody>
            {filteredEntries.length > 0 && (
              <tfoot>
                <tr className="bg-gray-800 text-white font-bold text-lg">
                  <td colSpan={4} className="p-4 text-right pr-6 uppercase tracking-wider text-xs">Total on Screen</td>
                  <td className="p-4 text-right font-mono">₹{totals.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="p-4 text-right font-mono text-green-400">₹{totals.received.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="p-4 text-right font-mono text-yellow-400">₹{totals.pending.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="print:hidden"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Footer info for print */}
        <div className="hidden print:block p-8 mt-8 border-t border-gray-200">
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
      </div>

      <footer className="max-w-6xl mx-auto mt-8 text-center text-gray-400 text-sm print:hidden">
        <p>&copy; {new Date().getFullYear()} Daily Daybook. All records are saved locally in your browser.</p>
      </footer>

      {/* Print styles */}
      <style>{`
        @media print {
          @page { margin: 1cm; size: landscape; }
          body { background-color: white; -webkit-print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          header { border-bottom: 2px solid #2563eb !important; padding-bottom: 1rem !important; }
          thead tr { background-color: #f3f4f6 !important; color: black !important; border-bottom: 2px solid black; }
          tfoot tr { background-color: #e5e7eb !important; color: black !important; border-top: 2px solid black; }
          table, th, td { border: 1px solid #e5e7eb !important; }
        }
      `}</style>
    </div>
  );
}
