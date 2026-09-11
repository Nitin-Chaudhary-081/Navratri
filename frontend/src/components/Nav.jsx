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
          <img src="/img/hero-durga-eyes.jpeg" className="w-9 h-9 rounded-full object-cover border border-haldi" alt="logo" />
          Garba<span className="text-haldi">2026</span>
        </Link>
        <div className="flex gap-2 text-sm">
          <button className="btn-ghost" onClick={passes}>Passes</button>
          <button className="btn" onClick={passes}>Buy Pass</button>
        </div>
      </nav>
    </header>
  );
}
