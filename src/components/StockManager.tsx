import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Pencil, Save, X, Package } from 'lucide-react';
import { collection, query, where, getDocs, setDoc, doc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebase, handleFirestoreError, OperationType } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

interface StockItem {
  id: string;
  name: string;
  piecesPerCrate: number;
  totalPieces: number;
  soldPieces?: number; // Optional since it might not exist on older records
  marginPerPiece: number;
  createdAt?: any;
  updatedAt?: any;
}

export function StockManager({ user }: { user: any }) {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addStockId, setAddStockId] = useState<string | null>(null);
  
  // Forms
  const [formData, setFormData] = useState({
    name: '',
    piecesPerCrate: 20,
    marginPerPiece: 0,
  });

  const [stockFormData, setStockFormData] = useState({
    crates: 0,
    extraPieces: 0
  });

  const fetchStock = async () => {
    if (!user) return;
    try {
      const { db } = await getFirebase();
      if (!db) return;
      const q = query(collection(db, 'stock'), where('userId', '==', user.uid));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockItem));
      data.sort((a, b) => a.name.localeCompare(b.name));
      setItems(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStock();
  }, [user]);

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.name) return;

    try {
      const { db } = await getFirebase();
      if (!db) return;

      if (editingId) {
        await updateDoc(doc(db, 'stock', editingId), {
          name: formData.name,
          piecesPerCrate: Number(formData.piecesPerCrate),
          marginPerPiece: Number(formData.marginPerPiece),
          updatedAt: serverTimestamp()
        });
        setItems(prev => prev.map(i => i.id === editingId ? { ...i, name: formData.name, piecesPerCrate: Number(formData.piecesPerCrate), marginPerPiece: Number(formData.marginPerPiece) } : i));
        setEditingId(null);
      } else {
        const id = crypto.randomUUID();
        const newItem = {
          id,
          name: formData.name,
          piecesPerCrate: Number(formData.piecesPerCrate),
          totalPieces: 0,
          soldPieces: 0,
          marginPerPiece: Number(formData.marginPerPiece),
          userId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        await setDoc(doc(db, 'stock', id), newItem);
        setShowAdd(false);
      }
      setFormData({ name: '', piecesPerCrate: 20, marginPerPiece: 0 });
      await fetchStock();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'stock');
    }
  };

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !addStockId) return;

    try {
      const { db } = await getFirebase();
      if (!db) return;

      const item = items.find(i => i.id === addStockId);
      if (!item) return;

      const safePiecesPerCrate = item.piecesPerCrate || 20;

      const addedPieces = (Number(stockFormData.crates) * safePiecesPerCrate) + Number(stockFormData.extraPieces);
      const newTotal = (item.totalPieces || 0) + addedPieces;

      await updateDoc(doc(db, 'stock', addStockId), {
        totalPieces: newTotal,
        updatedAt: serverTimestamp()
      });

      setAddStockId(null);
      setStockFormData({ crates: 0, extraPieces: 0 });
      await fetchStock();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'stock');
    }
  };

  const handleDelete = async (id: string) => {
    if (!user || !confirm('Delete this item completely?')) return;
    try {
      const { db } = await getFirebase();
      if (!db) return;
      await deleteDoc(doc(db, 'stock', id));
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `stock/${id}`);
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-sm print:hidden min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-black text-gray-800 flex items-center gap-2 uppercase tracking-tight">
            <Package className="text-blue-600" /> Live Stock Inventory
          </h2>
          <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Manage items, crates, and pieces</p>
        </div>
        <button 
          onClick={() => setShowAdd(!showAdd)}
          className="bg-blue-600 text-white px-4 py-2 rounded-full font-black text-xs uppercase tracking-widest hover:bg-blue-700 shadow-md flex items-center gap-2"
        >
          {showAdd ? 'Close' : <><Plus size={16}/> New Product</>}
        </button>
      </div>

      <AnimatePresence>
        {(showAdd || editingId) && (
          <motion.form 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            onSubmit={handleSaveItem}
            className="mb-6 bg-blue-50 p-4 rounded-xl border border-blue-100 overflow-hidden"
          >
            <h3 className="text-xs font-bold uppercase text-blue-800 mb-3">{editingId ? 'Edit Product' : 'Add New Product'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Item Name</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Pieces per Crate</label>
                <input required type="number" min="1" value={formData.piecesPerCrate} onChange={e => setFormData({ ...formData, piecesPerCrate: Number(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Margin per Piece (₹)</label>
                <input required type="number" min="0" step="any" value={formData.marginPerPiece} onChange={e => setFormData({ ...formData, marginPerPiece: Number(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold" />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded font-black text-xs uppercase tracking-widest hover:bg-green-700 shadow-sm grow flex justify-center items-center gap-1"><Save size={16}/> Save</button>
                {editingId && <button type="button" onClick={() => setEditingId(null)} className="bg-gray-400 text-white px-3 py-2 rounded hover:bg-gray-50"><X size={16}/></button>}
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {loading ? (
          <div className="text-sm font-bold text-gray-500 col-span-3">Loading stock...</div>
        ) : items.length === 0 ? (
          <div className="text-sm font-bold text-gray-500 col-span-3">No products added. Click 'New Product' to start tracking stock.</div>
        ) : (
          items.map(item => {
            const safePiecesPerCrate = item.piecesPerCrate || 20;
            const crates = Math.floor(item.totalPieces / safePiecesPerCrate);
            const extra = item.totalPieces % safePiecesPerCrate;
            
            return (
              <div key={item.id} className="border border-gray-200 p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow bg-white flex flex-col relative overflow-hidden">
                {addStockId === item.id ? (
                  <form onSubmit={handleAddStock} className="flex flex-col gap-3 h-full justify-center">
                    <h4 className="text-xs font-bold text-blue-600 uppercase">Add Stock: {item.name}</h4>
                    <div className="flex gap-2">
                      <div className="grow">
                        <label className="text-[10px] text-gray-500 uppercase font-black">Crates</label>
                        <input type="number" min="0" required value={stockFormData.crates} onChange={e => setStockFormData({ ...stockFormData, crates: Number(e.target.value) })} className="w-full px-2 py-1.5 border rounded text-sm text-center font-bold" />
                      </div>
                      <div className="grow">
                        <label className="text-[10px] text-gray-500 uppercase font-black">Extra Pieces</label>
                        <input type="number" min="0" value={stockFormData.extraPieces} onChange={e => setStockFormData({ ...stockFormData, extraPieces: Number(e.target.value) })} className="w-full px-2 py-1.5 border rounded text-sm text-center font-bold" />
                      </div>
                    </div>
                    <div className="flex gap-2 mt-1">
                      <button type="submit" className="bg-green-600 text-white text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded grow shadow-sm">Confirm</button>
                      <button type="button" onClick={() => setAddStockId(null)} className="bg-gray-200 text-gray-700 px-3 py-1.5 rounded">Cancel</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-black text-gray-800 text-lg">{item.name}</h3>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{item.piecesPerCrate || 20} pcs / crate • Margin: ₹{item.marginPerPiece || 0}</p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => {
                          setFormData({ name: item.name, piecesPerCrate: item.piecesPerCrate || 20, marginPerPiece: item.marginPerPiece || 0 });
                          setEditingId(item.id);
                          setShowAdd(false);
                        }} className="p-1 text-gray-400 hover:text-blue-600"><Pencil size={14}/></button>
                        <button onClick={() => handleDelete(item.id)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={14}/></button>
                      </div>
                    </div>

                    <div className="my-3 bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
                       <div className="text-3xl font-black text-blue-600">{item.totalPieces}</div>
                       <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Total Pieces</div>
                    </div>

                    <div className="mb-4 flex justify-between items-center px-1">
                       <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded">
                         <span className="text-black font-black">{crates}</span> Crates
                       </span>
                       <span className="text-gray-300 font-black">+</span>
                       <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded">
                         <span className="text-black font-black">{extra}</span> Pieces
                       </span>
                    </div>

                    <button
                      onClick={() => {
                        setAddStockId(item.id);
                        setStockFormData({ crates: 0, extraPieces: 0 });
                      }}
                      className="mt-auto w-full border-2 border-dashed border-blue-200 text-blue-600 font-black text-xs uppercase tracking-widest py-2 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors"
                    >
                      + Entry In
                    </button>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
      
      {/* Profit Estimate Summary */}
      {items.length > 0 && (
        <div className="mt-8 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100 p-4 rounded-xl flex justify-between items-center">
            <div>
                <h3 className="text-green-800 font-black text-sm uppercase tracking-widest">Total Profit</h3>
                <p className="text-[10px] text-green-600 font-bold">Total Pieces Sold × Margin</p>
            </div>
            <div className="text-2xl font-black text-green-700">
                ₹{items.reduce((acc, item) => acc + ((item.soldPieces || 0) * item.marginPerPiece), 0).toLocaleString('en-IN')}
            </div>
        </div>
      )}
    </div>
  );
}
