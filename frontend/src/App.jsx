import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Nav from './components/Nav.jsx';
import Home from './pages/Home.jsx';
import Checkout from './pages/Checkout.jsx';
import Success from './pages/Success.jsx';
import TicketView from './pages/TicketView.jsx';
import Scanner from './pages/Scanner.jsx';
import Admin from './pages/Admin.jsx';

// React Router doesn't scroll to #anchors on its own — without this,
// buttons like "Buy Pass" (→ /#passes) appear completely dead.
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.querySelector(hash);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollManager />
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/checkout/:passId" element={<Checkout />} />
        <Route path="/success" element={<Success />} />
        <Route path="/t/:id" element={<TicketView />} />
        <Route path="/scan" element={<Scanner />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  );
}
