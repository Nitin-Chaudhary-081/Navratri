// Bulletproof in-page scrolling — plain DOM, no router hash behavior.
export function scrollToId(id) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }
  return false;
}

// For site-wide buttons (navbar shows on every page): scroll if home,
// otherwise go home first, then scroll once it renders.
export function goToPasses(navigate, pathname) {
  if (pathname === '/') {
    if (!scrollToId('passes')) window.scrollTo(0, 0);
    return;
  }
  navigate('/');
  setTimeout(() => scrollToId('passes'), 250);
  setTimeout(() => scrollToId('passes'), 600); // second chance if render is slow
}
