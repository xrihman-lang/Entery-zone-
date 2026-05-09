import React, { useState } from 'react';
import { useProducts, Product } from '../context/ProductsContext';
import { useCustomers } from '../context/CustomerContext';
import { useSalesmen } from '../context/SalesmanContext';
import { Package, DollarSign, Users, ChevronRight, Check, AlertCircle, UserPlus, Trash2 } from 'lucide-react';

export function AdminDashboard() {
  const { products, updateProduct } = useProducts();
  const { customers, updateCreditLimit } = useCustomers();
  const { salesmen, addSalesman, removeSalesman } = useSalesmen();
  const [activeTab, setActiveTab] = useState<'prices' | 'credit' | 'salesmen'>('prices');
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editMrp, setEditMrp] = useState<number>(0);

  const [editingCreditId, setEditingCreditId] = useState<string | null>(null);
  const [editCreditLimit, setEditCreditLimit] = useState<number>(0);

  const [newSalesmanName, setNewSalesmanName] = useState('');

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
      </div>

      <div className="p-6">
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
