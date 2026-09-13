import { Link, useNavigate, useLocation } from 'react-router-dom';
import { goToPasses } from '../lib/scroll.js';
export default function Nav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const passes = () => goToPasses(navigate, pathname);
  return (
    <header className="sticky top-0 z-50 bg-night/85 backdrop-blur border-b border-white/10">
      <div className="toran" />
      <nav className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2 font-extrabold text-lg">
          <img src="/img/logo-raasrang.png" className="w-10 h-10 rounded-full object-cover object-center border-2 border-haldi" alt="Raas Rang logo" />
          <span>રાસરંગ<span className="text-haldi text-sm font-semibold"> · પાલનપુર</span></span>
        </Link>
        <div className="flex gap-2 text-sm">
          <button className="btn-ghost" onClick={passes}>Passes</button>
          <button className="btn" onClick={passes}>Buy Pass</button>
        </div>
      </nav>
    </header>
  );
}
