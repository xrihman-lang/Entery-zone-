import React, { useState, useMemo } from 'react';
import { UserPlus, ArrowUpRight, ArrowDownRight, Phone, FileDown, Book, Search, X } from 'lucide-react';
import { useCustomers, Customer, Transaction } from '../context/CustomerContext';

export function CustomerLedger() {
  const { customers, setCustomers } = useCustomers();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState<'diya' | 'liya' | null>(null);

  // New Customer State
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');

  // New Transaction State
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm));
  }, [customers, searchTerm]);

  const getBalance = (transactions: Transaction[]) => {
    return transactions.reduce((acc, t) => {
      // In a ledger: 'Diya' means customer owes you money (positive balance to receive)
      // 'Liya' means customer paid you (decreases balance)
      return t.type === 'diya' ? acc + t.amount : acc - t.amount;
    }, 0);
  };

  const handleAddCustomer = () => {
    if (!newCustomerName) return;
    const newCustomer: Customer = {
      id: Date.now().toString(),
      name: newCustomerName,
      phone: newCustomerPhone,
      creditLimit: 0,
      transactions: []
    };
    setCustomers([newCustomer, ...customers]);
    setNewCustomerName('');
    setNewCustomerPhone('');
    setShowAddCustomer(false);
  };

  const handleAddTransaction = () => {
    if (!selectedCustomer || !amount || !showTransactionModal) return;
    
    const newTx: Transaction = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      amount: Number(amount),
      type: showTransactionModal,
      note
    };

    setCustomers(customers.map(c => {
      if (c.id === selectedCustomer.id) {
        const updatedCustomer = { ...c, transactions: [newTx, ...c.transactions] };
        if (selectedCustomer.id === c.id) setSelectedCustomer(updatedCustomer); // Update selected view
        return updatedCustomer;
      }
      return c;
    }));

    setAmount('');
    setNote('');
    setShowTransactionModal(null);
  };

  const sendWhatsApp = (customer: Customer, balance: number) => {
    if (!customer.phone) {
      alert("No phone number saved for this customer.");
      return;
    }
    const message = `Hello ${customer.name}, your pending balance at Entry Zone is ₹${balance.toLocaleString('en-IN')}. Please pay soon.`;
    const url = `https://wa.me/91${customer.phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="max-w-6xl mx-auto p-4 flex flex-col md:flex-row gap-6 font-sans">
      
      {/* Left Panel: Customer Directory */}
      <div className={`md:w-1/3 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[calc(100vh-180px)] ${selectedCustomer ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <h2 className="text-lg font-black text-gray-800 flex items-center gap-2 tracking-tight uppercase">
            <Book className="text-blue-600" size={20} /> Digital Khata
          </h2>
          <div className="mt-4 relative">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="Search customers..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button 
            onClick={() => setShowAddCustomer(true)}
            className="w-full mt-3 bg-blue-50 text-blue-700 font-bold py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors border border-blue-200 text-sm uppercase tracking-wider"
          >
            <UserPlus size={16} /> New Customer
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredCustomers.length === 0 ? (
             <div className="p-8 text-center text-gray-500 text-sm">No customers found.</div>
          ) : (
            filteredCustomers.map(customer => {
              const balance = getBalance(customer.transactions);
              const isSelected = selectedCustomer?.id === customer.id;
              
              return (
                <div 
                  key={customer.id} 
                  onClick={() => setSelectedCustomer(customer)}
                  className={`p-4 border-b border-gray-100 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'}`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-gray-900">{customer.name}</h3>
                      <p className="text-xs text-gray-500 font-medium tracking-wide mt-0.5">{customer.phone}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Balance</p>
                      <p className={`font-black font-mono ${balance > 0 ? 'text-red-600' : balance < 0 ? 'text-green-600' : 'text-gray-800'}`}>
                        ₹{Math.abs(balance).toLocaleString('en-IN')}
                        {balance > 0 ? ' (Dr)' : balance < 0 ? ' (Cr)' : ''}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Panel: Ledger Details */}
      <div className={`md:w-2/3 bg-white rounded-xl shadow-sm border border-gray-200 h-[calc(100vh-180px)] flex flex-col ${!selectedCustomer ? 'hidden md:flex items-center justify-center bg-gray-50' : 'flex'}`}>
        {!selectedCustomer ? (
          <div className="text-center text-gray-400">
            <Book size={48} className="mx-auto mb-4 opacity-50" />
            <p className="font-bold uppercase tracking-widest text-sm">Select a customer to view ledger</p>
          </div>
        ) : (
          <>
            {/* Ledger Header */}
            <div className="p-6 border-b border-gray-200 bg-gray-50 rounded-t-xl print:bg-white print:border-none">
              <div className="flex items-start justify-between">
                <div>
                  <button onClick={() => setSelectedCustomer(null)} className="md:hidden text-gray-500 hover:text-gray-800 mb-4 flex items-center text-sm font-bold">
                    &larr; Back to list
                  </button>
                  <h2 className="text-2xl font-black text-gray-900 leading-tight">{selectedCustomer.name}</h2>
                  <p className="text-gray-600 font-medium mt-1">{selectedCustomer.phone}</p>
                </div>
                <div className="text-right bg-white p-3 rounded-lg border border-gray-200 shadow-sm print:shadow-none print:border-none">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Net Balance</p>
                  <p className={`text-3xl font-black font-mono ${getBalance(selectedCustomer.transactions) > 0 ? 'text-red-600' : getBalance(selectedCustomer.transactions) < 0 ? 'text-green-600' : 'text-gray-800'}`}>
                    ₹{Math.abs(getBalance(selectedCustomer.transactions)).toLocaleString('en-IN')}
                  </p>
                  <p className="text-xs font-bold mt-1 text-gray-500">
                    {getBalance(selectedCustomer.transactions) > 0 ? 'You will receive' : getBalance(selectedCustomer.transactions) < 0 ? 'You have to pay' : 'Settled'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-6 print:hidden">
                <button 
                  onClick={() => setShowTransactionModal('diya')}
                  className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 py-3 px-4 rounded-xl font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  <ArrowUpRight size={18} /> Diya (Gave)
                </button>
                <button 
                  onClick={() => setShowTransactionModal('liya')}
                  className="flex-1 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 py-3 px-4 rounded-xl font-bold uppercase tracking-wide flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  <ArrowDownRight size={18} /> Liya (Got)
                </button>
              </div>

              <div className="flex gap-2 mt-4 print:hidden">
                <button 
                  onClick={() => sendWhatsApp(selectedCustomer, getBalance(selectedCustomer.transactions))}
                  className="flex-1 bg-gray-50 text-gray-700 border border-gray-300 py-2 rounded-lg font-bold hover:bg-gray-100 flex items-center justify-center gap-2 transition-colors text-sm"
                >
                  <Phone size={16} className="text-green-600" /> WhatsApp Reminder
                </button>
                <button 
                  onClick={() => window.print()}
                  className="bg-gray-50 text-gray-700 border border-gray-300 px-4 py-2 rounded-lg font-bold hover:bg-gray-100 flex items-center gap-2 transition-colors text-sm"
                >
                  <FileDown size={16} /> Report
                </button>
              </div>
            </div>

            {/* Transactions List */}
            <div className="flex-1 overflow-y-auto p-0">
              {selectedCustomer.transactions.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">No transactions yet.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#EEEEEE] sticky top-0 print:border-b print:border-gray-300">
                    <tr>
                      <th className="p-3 text-xs font-bold uppercase tracking-wider text-gray-700">Date</th>
                      <th className="p-3 text-xs font-bold uppercase tracking-wider text-gray-700">Details</th>
                      <th className="p-3 text-xs font-bold uppercase tracking-wider text-gray-700 text-right">Debit (You Gave)</th>
                      <th className="p-3 text-xs font-bold uppercase tracking-wider text-gray-700 text-right">Credit (You Got)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCustomer.transactions.map(tx => (
                      <tr key={tx.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="p-3 text-xs text-gray-500 font-medium">
                          {new Date(tx.date).toLocaleDateString('en-GB')}<br/>
                          <span className="text-[10px]">{new Date(tx.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </td>
                        <td className="p-3 text-sm font-medium text-gray-800">{tx.note || '-'}</td>
                        <td className="p-3 text-right">
                          {tx.type === 'diya' ? (
                            <span className="text-red-600 font-bold font-mono bg-red-50 px-2 py-1 rounded">₹{tx.amount.toLocaleString('en-IN')}</span>
                          ) : '-'}
                        </td>
                        <td className="p-3 text-right">
                          {tx.type === 'liya' ? (
                            <span className="text-green-600 font-bold font-mono bg-green-50 px-2 py-1 rounded">₹{tx.amount.toLocaleString('en-IN')}</span>
                          ) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {showAddCustomer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-xl text-gray-900">Add Customer</h3>
              <button onClick={() => setShowAddCustomer(false)} className="text-gray-400 hover:text-gray-800"><X size={20}/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Customer Name</label>
                <input autoFocus type="text" value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Enter name" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Phone Number</label>
                <input type="tel" value={newCustomerPhone} onChange={e => setNewCustomerPhone(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono" placeholder="10-digit number" />
              </div>
              <button 
                onClick={handleAddCustomer}
                className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 uppercase tracking-widest text-sm mt-2"
              >
                Save Customer
              </button>
            </div>
          </div>
        </div>
      )}

      {showTransactionModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className={`font-black text-xl flex items-center gap-2 ${showTransactionModal === 'diya' ? 'text-red-600' : 'text-green-600'}`}>
                {showTransactionModal === 'diya' ? <ArrowUpRight /> : <ArrowDownRight />}
                {showTransactionModal === 'diya' ? 'You Gave' : 'You Got'}
              </h3>
              <button onClick={() => setShowTransactionModal(null)} className="text-gray-400 hover:text-gray-800"><X size={20}/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Amount (₹)</label>
                <input 
                  autoFocus 
                  type="number" 
                  value={amount} 
                  onChange={e => setAmount(e.target.value)} 
                  className={`w-full px-4 py-3 border-2 rounded-lg font-black text-2xl font-mono outline-none ${showTransactionModal === 'diya' ? 'border-red-200 focus:border-red-500 text-red-600' : 'border-green-200 focus:border-green-500 text-green-600'}`} 
                  placeholder="0" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Note / Description</label>
                <input 
                  type="text" 
                  value={note} 
                  onChange={e => setNote(e.target.value)} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 outline-none" 
                  placeholder="e.g. Bill No 123" 
                />
              </div>
              <button 
                onClick={handleAddTransaction}
                className={`w-full font-bold py-3 rounded-lg uppercase tracking-widest text-sm mt-4 text-white shadow-sm ${showTransactionModal === 'diya' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
