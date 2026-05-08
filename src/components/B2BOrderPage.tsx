import React, { useState, useMemo } from 'react';
import { ShoppingCart, Plus, Minus, CheckCircle2, FileText, Gift, Building2, PackageCheck, X, MapPin, Loader2 } from 'lucide-react';
import { Logo } from './Logo';
import { useProducts, Product } from '../context/ProductsContext';
import { useSalesmen } from '../context/SalesmanContext';
import { getFirebase } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const CATEGORIES = ['All', 'Snacks & Namkeen', 'Biscuits & Bakery', 'Beverages'];

export function B2BOrderPage({ onCheckout }: { onCheckout: (items: any[]) => void }) {
  const { products: PRODUCTS } = useProducts();
  const { salesmen, activeSalesman, setActiveSalesman } = useSalesmen();
  const [activeCategory, setActiveCategory] = useState('All');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedSalesmanId, setSelectedSalesmanId] = useState<string>(activeSalesman?.id || '');

  const [showOrderModal, setShowOrderModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderForm, setOrderForm] = useState({
    customerName: '',
    address: '',
    phone: ''
  });
  const [orderSuccess, setOrderSuccess] = useState<{ id: string, message: string } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationSuccess, setLocationSuccess] = useState(false);

  const fetchLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    setIsLocating(true);
    setLocationSuccess(false);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await response.json();
          if (data && data.display_name) {
            setOrderForm(prev => ({ ...prev, address: data.display_name }));
            setLocationSuccess(true);
            setTimeout(() => setLocationSuccess(false), 3000); // Hide checkmark after 3 seconds
          } else {
            alert("Could not fetch address. Please try again or type manually.");
          }
        } catch (error) {
          console.error(error);
          alert("Error fetching address. Please try again or type manually.");
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        setIsLocating(false);
        alert("Unable to retrieve your location. Please check browser permissions.");
        console.error(error);
      }
    );
  };

  // Keep them synced
  React.useEffect(() => {
    if (selectedSalesmanId) {
      const s = salesmen.find(x => x.id === selectedSalesmanId);
      if (s) setActiveSalesman(s);
    }
  }, [selectedSalesmanId, salesmen, setActiveSalesman]);

  const filteredProducts = activeCategory === 'All' 
    ? PRODUCTS 
    : PRODUCTS.filter(p => p.category === activeCategory);

  const handleQuantityChange = (id: string, delta: number) => {
    setQuantities(prev => ({
      ...prev,
      [id]: Math.max(1, (prev[id] || 1) + delta)
    }));
  };

  const handleAddToCart = (product: Product) => {
    const qty = quantities[product.id] || 1;
    setCart(prev => ({
      ...prev,
      [product.id]: (prev[product.id] || 0) + qty
    }));
    setQuantities(prev => ({ ...prev, [product.id]: 1 })); // Reset selector
  };

  const cartItems = useMemo(() => {
    return Object.entries(cart).map(([id, quantity]) => {
      const product = PRODUCTS.find(p => p.id === id)!;
      return { ...product, quantity };
    }).filter((item: Product & { quantity: number }) => item.quantity > 0);
  }, [cart]);

  const { totalItems, subtotal, totalTax, grandTotal } = useMemo(() => {
    let items = 0;
    let sub = 0;
    let tax = 0;
    cartItems.forEach(item => {
      items += item.quantity;
      const itemTotal = item.wholesalePrice * item.quantity;
      sub += itemTotal;
      tax += itemTotal * (item.gstPercent / 100);
    });
    return {
      totalItems: items,
      subtotal: sub,
      totalTax: tax,
      grandTotal: sub + tax
    };
  }, [cartItems]);

  const handlePlaceOrder = () => {
    if (cartItems.length === 0) return;
    setShowOrderModal(true);
  };

  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (orderForm.phone.length !== 10) {
      alert("Please enter a valid 10-digit phone number.");
      return;
    }

    setIsProcessing(true);
    
    const orderId = Math.floor(1000 + Math.random() * 9000).toString();
    const now = new Date();
    
    let deliveryStatus = "";
    if (now.getHours() < 17) {
      // Before 5 PM
      const tomorrow = new Date();
      tomorrow.setDate(now.getDate() + 1);
      deliveryStatus = 'Tomorrow';
    } else {
      // After 5 PM
      const dayAfter = new Date();
      dayAfter.setDate(now.getDate() + 2);
      deliveryStatus = 'Day After Tomorrow';
    }

    // Save to Database
    try {
      const { db } = await getFirebase();
      if (db) {
        await addDoc(collection(db, 'orders'), {
          orderId,
          customerName: orderForm.customerName,
          phone: orderForm.phone,
          address: orderForm.address,
          items: cartItems.map(item => ({ id: item.id, name: item.name, quantity: item.quantity, price: item.wholesalePrice })),
          totalAmount: grandTotal,
          status: 'Pending/WhatsApp',
          createdAt: serverTimestamp(),
          salesmanId: selectedSalesmanId || null,
          salesmanName: salesmen.find(s => s.id === selectedSalesmanId)?.name || null
        });
      }
    } catch (error) {
      console.error("Error saving order:", error);
    }
    
    // Items text
    const itemsList = cartItems.map(item => `- ${item.name} (Qty: ${item.quantity})`).join('\n');

    // Build WhatsApp message
    const whatsappMessage = `New Order from Entry Zone
Customer: ${orderForm.customerName}
Phone: ${orderForm.phone}
Address: ${orderForm.address}
Items:
${itemsList}
Total Amount: ₹${grandTotal.toFixed(2)}`;

    // Success Message
    setOrderSuccess({
      id: orderId,
      message: `Order Placed Successfully! Your Order ID is #${orderId}. Check WhatsApp.`
    });

    const whatsappUrl = `https://wa.me/917065162279?text=${encodeURIComponent(whatsappMessage)}`;
    window.open(whatsappUrl, '_blank');
    
    setCart({});
    setIsProcessing(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24 md:pb-0 font-sans">
      {/* Order Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200">
            <div className="bg-orange-500 text-white p-6 flex justify-between items-center">
              <h3 className="font-black text-xl flex items-center gap-2">
                 <PackageCheck size={24} /> Confirm Your Order
              </h3>
              <button 
                onClick={() => {
                  setShowOrderModal(false);
                  setOrderSuccess(null);
                }} 
                className="text-white/80 hover:text-white"
              >
                <X size={24}/>
              </button>
            </div>
            
            <div className="p-6">
              {orderSuccess ? (
                <div className="text-center py-8">
                  <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={40} />
                  </div>
                  <h4 className="text-2xl font-black text-gray-900 mb-2">Order Confirmed!</h4>
                  <p className="text-gray-600 font-medium">{orderSuccess.message}</p>
                  <p className="text-sm text-gray-500 mt-2">A WhatsApp confirmation has been sent.</p>
                  <button 
                    onClick={() => {
                      setShowOrderModal(false);
                      setOrderSuccess(null);
                    }}
                    className="mt-8 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-xl shadow-sm transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleOrderSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Customer Name *</label>
                    <input 
                      required
                      type="text" 
                      value={orderForm.customerName}
                      onChange={e => setOrderForm(prev => ({...prev, customerName: e.target.value}))}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:border-orange-500 focus:ring-4 focus:ring-orange-100 outline-none transition-all bg-gray-50 font-medium" 
                      placeholder="Enter full name" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Phone Number *</label>
                    <input 
                      required
                      type="number" 
                      value={orderForm.phone}
                      onChange={e => setOrderForm(prev => ({...prev, phone: e.target.value}))}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:border-orange-500 focus:ring-4 focus:ring-orange-100 outline-none transition-all bg-gray-50 font-medium" 
                      placeholder="10-digit WhatsApp number" 
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Full Address *</label>
                      <button 
                        type="button" 
                        onClick={fetchLocation} 
                        disabled={isLocating}
                        className="text-xs font-bold flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-50"
                      >
                        {isLocating ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                        {locationSuccess ? <span className="text-green-600 flex items-center gap-1"><CheckCircle2 size={12}/> Captured</span> : 'Use My Location'}
                      </button>
                    </div>
                    <textarea 
                      required
                      value={orderForm.address}
                      onChange={e => setOrderForm(prev => ({...prev, address: e.target.value}))}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:border-orange-500 focus:ring-4 focus:ring-orange-100 outline-none transition-all bg-gray-50 font-medium min-h-[80px]" 
                      placeholder="Detailed delivery address" 
                    ></textarea>
                  </div>
                  <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 mt-6 text-center">
                    <p className="text-sm font-bold text-orange-800 uppercase tracking-wider mb-1">Payment Summary</p>
                    <p className="text-3xl font-black text-orange-600 font-mono">₹{grandTotal.toFixed(2)}</p>
                  </div>
                  <div className="pt-4">
                    <button 
                      type="submit"
                      disabled={isProcessing}
                      className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-opacity-50 text-white font-black py-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 uppercase tracking-wide"
                    >
                      <CheckCircle2 size={24} /> {isProcessing ? 'Confirming...' : 'Confirm Order'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Special Offer Banner */}
      <div className="bg-gradient-to-r from-orange-500 flex items-center justify-center gap-2 to-orange-600 text-white text-sm font-bold py-2 px-4 text-center">
        <Gift size={16} /> Order above ₹5000 and get Free Billing Software Subscription for 1 Month!
      </div>

      <div className="max-w-7xl mx-auto p-4 flex flex-col md:flex-row gap-6">
        
        {/* Main Content */}
        <div className="flex-1">
          {/* Header */}
          <header className="bg-white rounded-xl shadow-sm p-6 mb-6 flex flex-col md:flex-row items-center md:items-start justify-between gap-4 border border-blue-100">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center border-2 border-blue-200">
                <Building2 size={32} />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Entry Zone</h1>
                <p className="text-blue-600 font-bold uppercase tracking-widest text-xs mt-1">Wholesale Merchant Portal</p>
              </div>
            </div>
          </header>

          {/* Categories */}
          <div className="flex overflow-x-auto hide-scrollbar gap-3 mb-6 pb-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`whitespace-nowrap px-6 py-3 rounded-full font-bold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  activeCategory === cat 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'bg-white text-gray-600 hover:bg-blue-50 border border-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProducts.map(product => {
              const currentQty = quantities[product.id] || 1;
              const cartQty = cart[product.id] || 0;
              
              return (
                <div key={product.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col transition-transform hover:-translate-y-1 hover:shadow-md">
                  <div className="relative h-48 w-full bg-gray-100">
                    <img src={product.image} alt={product.title} className="w-full h-full object-cover" />
                    {product.inStock && (
                      <span className="absolute top-3 right-3 bg-green-500 text-white text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded shadow-sm">
                        <PackageCheck size={12} className="inline mr-1" />
                        In Stock
                      </span>
                    )}
                  </div>
                  
                  <div className="p-4 flex flex-col flex-1">
                    <h3 className="font-bold text-gray-900 text-lg leading-tight mb-2">{product.title}</h3>
                    
                    <div className="mt-auto">
                      <div className="flex items-baseline gap-2 mb-3">
                        <span className="text-2xl font-black text-blue-700 font-mono">₹{product.wholesalePrice}</span>
                        <span className="text-sm font-medium text-gray-400 line-through font-mono">MRP ₹{product.mrp}</span>
                        <span className="text-[10px] font-bold text-orange-600 ml-auto bg-orange-50 px-2 py-0.5 rounded">Margin {Math.round(((product.mrp - product.wholesalePrice)/product.mrp)*100)}%</span>
                      </div>

                      <div className="flex items-center justify-between gap-3 bg-gray-50 p-2 rounded-lg mb-3 border border-gray-100">
                        <span className="text-xs font-bold text-gray-600 uppercase">Quantity</span>
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={() => handleQuantityChange(product.id, -1)}
                            className="w-8 h-8 flex items-center justify-center bg-white rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50 border border-gray-200 shadow-sm transition-colors"
                          >
                            <Minus size={16} />
                          </button>
                          <span className="w-6 text-center font-bold text-gray-900 font-mono select-none">{currentQty}</span>
                          <button 
                            onClick={() => handleQuantityChange(product.id, 1)}
                            className="w-8 h-8 flex items-center justify-center bg-white rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50 border border-gray-200 shadow-sm transition-colors"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={() => handleAddToCart(product)}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors active:scale-95 shadow-sm"
                      >
                        <ShoppingCart size={18} />
                        Add to Order {cartQty > 0 ? `(${cartQty} in cart)` : ''}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Order Summary Sidebar (Desktop) */}
        <div className="hidden md:block w-80 shrink-0">
          <div className="sticky top-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight mb-4 flex items-center gap-2">
              <FileText className="text-orange-500" /> Order Summary
            </h2>
            
            {salesmen.length > 0 && (
              <div className="mb-6 bg-red-50 p-4 rounded-xl border border-red-100">
                <label className="block text-xs font-bold text-red-700 uppercase tracking-wider mb-2">Order Taken By</label>
                <select 
                  value={selectedSalesmanId} 
                  onChange={e => setSelectedSalesmanId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg border-red-200 focus:ring-2 focus:ring-red-500 outline-none font-bold text-gray-900 bg-white"
                >
                  <option value="">-- Select Salesman --</option>
                  {salesmen.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-3 text-sm mb-6 border-b border-gray-100 pb-6">
              <div className="flex justify-between font-medium">
                <span className="text-gray-600">Total Items</span>
                <span className="font-mono text-gray-900">{totalItems}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-mono text-gray-900">₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-medium text-orange-600">
                <span>Tax (GST) Avg.</span>
                <span className="font-mono">+₹{totalTax.toFixed(2)}</span>
              </div>
            </div>
            
            <div className="flex justify-between items-center mb-6">
              <span className="font-bold text-gray-900 uppercase">Grand Total</span>
              <span className="text-3xl font-black text-blue-700 font-mono">₹{grandTotal.toFixed(2)}</span>
            </div>

            <button
              disabled={cartItems.length === 0}
              onClick={handlePlaceOrder}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm uppercase tracking-wide"
            >
              <CheckCircle2 size={24} />
              Place Order & Invoice
            </button>
            {cartItems.length === 0 && (
              <p className="text-center text-xs text-gray-500 mt-3 font-bold uppercase tracking-wider">Your order is empty</p>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] p-4 z-50">
        <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase">Total ({totalItems} items)</p>
            <p className="text-2xl font-black text-blue-700 font-mono leading-none">₹{grandTotal.toFixed(2)}</p>
          </div>
          <button
            disabled={cartItems.length === 0}
            onClick={handlePlaceOrder}
            className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-black py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm uppercase text-sm"
          >
            <CheckCircle2 size={20} />
            Place Order
          </button>
        </div>
      </div>

    </div>
  );
}
