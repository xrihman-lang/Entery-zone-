import React, { useState } from 'react';
import { useProducts, Product } from '../context/ProductsContext';
import { useCustomers } from '../context/CustomerContext';
import { useSalesmen } from '../context/SalesmanContext';
import { Package, DollarSign, Users, ChevronRight, Check, AlertCircle, UserPlus, Trash2, Crown, Search, Mail } from 'lucide-react';
import { motion } from 'motion/react';
import { getFirebase } from '../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { speak } from '../lib/speech';

export function AdminDashboard() {
  const { products, updateProduct } = useProducts();
  const { customers, updateCreditLimit } = useCustomers();
  const { salesmen, addSalesman, removeSalesman } = useSalesmen();
  const [activeTab, setActiveTab] = useState<'prices' | 'credit' | 'salesmen' | 'subscriptions'>('prices');
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editMrp, setEditMrp] = useState<number>(0);

  const [editingCreditId, setEditingCreditId] = useState<string | null>(null);
  const [editCreditLimit, setEditCreditLimit] = useState<number>(0);

  const [newSalesmanName, setNewSalesmanName] = useState('');

  // Subscription Manual Override
  const [emailToActivate, setEmailToActivate] = useState('');
  const [activationMonths, setActivationMonths] = useState(12);
  const [isActivating, setIsActivating] = useState(false);
  const [activationResult, setActivationResult] = useState<{success: boolean, message: string} | null>(null);

  const handleManualActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailToActivate.trim()) return;

    setIsActivating(true);
    setActivationResult(null);

    try {
      const { db } = await getFirebase();
      if (!db) throw new Error("Database not connected");

      const q = query(collection(db, 'users'), where('email', '==', emailToActivate.trim()));
      const snap = await getDocs(q);

      if (snap.empty) {
        setActivationResult({ success: false, message: "User not found with this email. Ask them to login once first." });
        return;
      }

      const userDoc = snap.docs[0];
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + activationMonths);

      await updateDoc(doc(db, 'users', userDoc.id), {
        isPremium: true,
        planName: 'Admin Activated',
        expiryDate: expiryDate.toISOString(),
        updatedAt: new Date().toISOString()
      });

      speak('Premium status successfully activated for user', 'professional');
      setActivationResult({ success: true, message: `Activated premium for ${emailToActivate} until ${expiryDate.toLocaleDateString()}` });
      setEmailToActivate('');
    } catch (error: any) {
      console.error(error);
      setActivationResult({ success: false, message: "Error: " + error.message });
    } finally {
      setIsActivating(false);
    }
  };

  const handleAddSalesman = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSalesmanName.trim()) {
      addSalesman({ name: newSalesmanName.trim() });
      setNewSalesmanName('');
    }
  };

  const startEdit = (p: Product) => {
    setEditingId(p.id);
    setEditPrice(p.wholesalePrice);
    setEditMrp(p.mrp);
  };

  const saveEdit = (id: string) => {
    updateProduct(id, { wholesalePrice: editPrice, mrp: editMrp });
    setEditingId(null);
  };

  const startEditCredit = (id: string, limit: number) => {
    setEditingCreditId(id);
    setEditCreditLimit(limit);
  };

  const saveEditCredit = (id: string) => {
    updateCreditLimit(id, editCreditLimit);
    setEditingCreditId(null);
  };

  const getBalance = (transactions: any[]) => {
    return transactions.reduce((acc, t) => t.type === 'diya' ? acc + t.amount : acc - t.amount, 0);
  };

  const [changePwdOpen, setChangePwdOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const handlePasswordChange = () => {
    if (newPassword.trim().length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }
    localStorage.setItem('admin_password', newPassword);
    setNewPassword('');
    setChangePwdOpen(false);
    alert('Master password updated locally!');
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden font-sans">
      <div className="bg-gray-900 text-white p-6 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black flex items-center gap-2 tracking-tight">
            System Administration
          </h2>
          <p className="text-gray-400 text-sm mt-1">Management Dashboard for Admin only</p>
        </div>
        <button 
          onClick={() => setChangePwdOpen(!changePwdOpen)}
          className="bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded text-sm font-bold border border-gray-700 transition"
        >
          Change Master Password
        </button>
      </div>

      {changePwdOpen && (
        <div className="bg-gray-50 border-b border-gray-200 p-4 flex items-center justify-center gap-4">
          <input 
            type="password" 
            placeholder="Enter new password" 
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
          />
          <button 
            onClick={handlePasswordChange}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm"
          >
            Save Password
          </button>
          <button 
            onClick={() => setChangePwdOpen(false)}
            className="text-gray-500 hover:text-gray-900 font-bold px-2 py-2"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="flex border-b border-gray-200">
        <button 
          onClick={() => setActiveTab('prices')} 
          className={`flex-1 py-3 px-4 font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 ${activeTab === 'prices' ? 'bg-gray-50 border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          <DollarSign size={16} /> Prices & Inventory
        </button>
        <button 
          onClick={() => setActiveTab('salesmen')} 
          className={`flex-1 py-3 px-4 font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 ${activeTab === 'salesmen' ? 'bg-gray-50 border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          <Users size={16} /> Salesmen
        </button>
        <button 
          onClick={() => setActiveTab('credit')} 
          className={`flex-1 py-3 px-4 font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 ${activeTab === 'credit' ? 'bg-gray-50 border-b-2 border-red-600 text-red-600' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          <Users size={16} /> Credit Manager
        </button>
        <button 
          onClick={() => setActiveTab('subscriptions')} 
          className={`flex-1 py-3 px-4 font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 ${activeTab === 'subscriptions' ? 'bg-gray-50 border-b-2 border-yellow-600 text-yellow-600' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          <Crown size={16} /> Subscriptions
        </button>
      </div>

      <div className="p-6">
        {activeTab === 'subscriptions' && (
          <div className="max-w-2xl mx-auto">
            <h3 className="text-lg font-black text-gray-900 mb-6 flex items-center gap-2">
              <Crown className="text-yellow-600" /> Manual Premium Activation
            </h3>
            
            <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-2xl shadow-sm">
                <form onSubmit={handleManualActivate} className="space-y-4">
                  <div>
                    <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-2">Customer Registered Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input 
                        type="email" 
                        required
                        value={emailToActivate}
                        onChange={e => setEmailToActivate(e.target.value)}
                        placeholder="customer@example.com"
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:border-yellow-500 focus:ring-4 focus:ring-yellow-100 outline-none transition-all font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-gray-700 uppercase tracking-widest mb-2">Subscription Duration</label>
                    <select 
                      value={activationMonths}
                      onChange={e => setActivationMonths(Number(e.target.value))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:border-yellow-500 outline-none font-medium"
                    >
                      <option value={1}>1 Month (Trial/Monthly)</option>
                      <option value={3}>3 Months (Quarterly)</option>
                      <option value={6}>6 Months (Half-Yearly)</option>
                      <option value={12}>12 Months (Yearly Business Elite)</option>
                      <option value={120}>10 Years (Lifetime/Special)</option>
                    </select>
                  </div>

                  <button 
                    type="submit"
                    disabled={isActivating}
                    className="w-full bg-gray-900 hover:bg-black text-white font-black py-4 rounded-xl shadow-lg shadow-gray-200 transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
                  >
                    {isActivating ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <Crown className="text-yellow-500 group-hover:scale-125 transition-transform" /> 
                        Activate Premium Instantly
                      </>
                    )}
                  </button>
                </form>

                {activationResult && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mt-6 p-4 rounded-xl flex items-start gap-3 ${activationResult.success ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}
                  >
                    {activationResult.success ? <Check className="mt-1 flex-shrink-0" /> : <AlertCircle className="mt-1 flex-shrink-0" />}
                    <p className="text-sm font-bold">{activationResult.message}</p>
                  </motion.div>
                )}
            </div>

            <div className="mt-8 bg-gray-50 border border-gray-200 p-4 rounded-xl">
               <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Instructions:</h4>
               <ul className="text-xs text-gray-600 space-y-1 font-medium">
                 <li>• Enter the exact email the customer uses to log in.</li>
                 <li>• If they haven't logged in yet, ask them to sign in once so their profile is created.</li>
                 <li>• This override bypasses Razorpay and activates premium immediately.</li>
                 <li>• Status is synced in real-time to the user's device.</li>
               </ul>
            </div>
          </div>
        )}
        {activeTab === 'prices' && (
          <div>
            <h3 className="text-lg font-black text-gray-900 mb-4">Product Price Management</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-xs font-bold uppercase tracking-wider text-gray-600">Product</th>
                    <th className="p-3 text-xs font-bold uppercase tracking-wider text-gray-600">Category</th>
                    <th className="p-3 text-xs font-bold uppercase tracking-wider text-gray-600">Wholesale (₹)</th>
                    <th className="p-3 text-xs font-bold uppercase tracking-wider text-gray-600">MRP (₹)</th>
                    <th className="p-3 text-xs font-bold uppercase tracking-wider text-gray-600 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {products.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="p-3 font-bold text-gray-900">{p.title}</td>
                      <td className="p-3 text-sm text-gray-500">{p.category}</td>
                      <td className="p-3">
                        {editingId === p.id ? (
                          <input type="number" className="w-20 px-2 py-1 border rounded text-right font-mono text-sm" value={editPrice} onChange={e => setEditPrice(Number(e.target.value))} />
                        ) : (
                          <span className="font-mono font-medium text-blue-600">₹{p.wholesalePrice}</span>
                        )}
                      </td>
                      <td className="p-3">
                        {editingId === p.id ? (
                          <input type="number" className="w-20 px-2 py-1 border rounded text-right font-mono text-sm" value={editMrp} onChange={e => setEditMrp(Number(e.target.value))} />
                        ) : (
                          <span className="font-mono font-medium text-gray-500">₹{p.mrp}</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {editingId === p.id ? (
                          <button onClick={() => saveEdit(p.id)} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 ml-auto">
                            <Check size={14} /> Save
                          </button>
                        ) : (
                          <button onClick={() => startEdit(p)} className="text-blue-600 hover:text-blue-800 text-sm font-bold ml-auto flex items-center gap-1">
                            Edit Price <ChevronRight size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'salesmen' && (
          <div>
            <h3 className="text-lg font-black text-gray-900 mb-4">Salesmen Management</h3>
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6 flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">New Salesman Name</label>
                <input 
                  type="text" 
                  value={newSalesmanName}
                  onChange={e => setNewSalesmanName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>
              <button onClick={handleAddSalesman} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded shadow-sm flex items-center justify-center gap-2 h-[42px]">
                <UserPlus size={18} /> Add Salesman
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-xs font-bold uppercase tracking-wider text-gray-600">Salesman Name</th>
                    <th className="p-3 text-xs font-bold uppercase tracking-wider text-gray-600 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {salesmen.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="p-3 font-bold text-gray-900 flex items-center gap-2">
                        <Users size={16} className="text-gray-400" /> {s.name}
                      </td>
                      <td className="p-3 text-right">
                        <button onClick={() => removeSalesman(s.id)} className="text-red-600 hover:text-red-800 text-sm font-bold ml-auto flex items-center gap-1">
                          <Trash2 size={16} /> Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                  {salesmen.length === 0 && (
                     <tr>
                       <td colSpan={2} className="p-6 text-center text-gray-500">No salesmen added yet.</td>
                     </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'credit' && (
          <div>
            <div className="flex flex-col md:flex-row justify-between md:items-end mb-4 gap-4">
              <h3 className="text-lg font-black text-gray-900">Customer Credit Limits & Outstanding</h3>
              <div className="bg-red-50 px-4 py-2 rounded-lg border border-red-100 flex items-center gap-3 shadow-sm">
                <span className="text-sm font-bold text-gray-600 uppercase tracking-wide">Total Market Outstanding</span>
                <span className="text-xl font-black text-red-600 font-mono">
                  ₹{customers.reduce((acc, c) => acc + (getBalance(c.transactions) > 0 ? getBalance(c.transactions) : 0), 0).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-xs font-bold uppercase tracking-wider text-gray-600">Customer</th>
                    <th className="p-3 text-xs font-bold uppercase tracking-wider text-gray-600">Outstanding Balance</th>
                    <th className="p-3 text-xs font-bold uppercase tracking-wider text-gray-600">Credit Limit (₹)</th>
                    <th className="p-3 text-xs font-bold uppercase tracking-wider text-gray-600 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {customers.map(c => {
                    const balance = getBalance(c.transactions);
                    const isOverLimit = c.creditLimit > 0 && balance > c.creditLimit;
                    return (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="p-3 font-bold text-gray-900">{c.name}</td>
                        <td className="p-3">
                          <span className={`font-mono font-medium ${balance > 0 ? (isOverLimit ? 'text-red-700 font-bold flex items-center gap-1' : 'text-red-500') : 'text-green-600'}`}>
                            ₹{balance.toLocaleString('en-IN')}
                            {isOverLimit && <AlertCircle size={14} className="inline" />}
                          </span>
                        </td>
                        <td className="p-3">
                          {editingCreditId === c.id ? (
                            <input type="number" className="w-24 px-2 py-1 border rounded text-right font-mono text-sm" value={editCreditLimit} onChange={e => setEditCreditLimit(Number(e.target.value))} />
                          ) : (
                            <span className="font-mono font-medium text-gray-600">
                              {c.creditLimit > 0 ? `₹${c.creditLimit.toLocaleString('en-IN')}` : 'No Limit'}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {editingCreditId === c.id ? (
                            <button onClick={() => saveEditCredit(c.id)} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1 ml-auto">
                              <Check size={14} /> Save
                            </button>
                          ) : (
                            <button onClick={() => startEditCredit(c.id, c.creditLimit || 0)} className="text-blue-600 hover:text-blue-800 text-sm font-bold ml-auto flex items-center gap-1">
                              Edit Limit <ChevronRight size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
