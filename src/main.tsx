import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ViewInvoice from './components/ViewInvoice.tsx';
import './index.css';

const isViewInvoiceRoute = window.location.pathname.startsWith('/view-invoice/') || window.location.pathname.startsWith('/view-bill/');
const invoiceId = window.location.pathname.split('/').pop();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isViewInvoiceRoute && invoiceId ? <ViewInvoice invoiceId={invoiceId} /> : <App />}
  </StrictMode>,
);
