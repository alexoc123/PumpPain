import { NavLink } from 'react-router-dom';

export default function Header() {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <NavLink to="/" className="flex items-center gap-2 font-bold text-xl text-green-600">
          <span className="text-2xl">⛽</span>
          <span>PumpPain<span className="text-gray-400 font-normal">.ie</span></span>
        </NavLink>
        <nav className="flex items-center gap-6">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `hidden sm:block text-sm font-medium transition-colors ${isActive ? 'text-green-600' : 'text-gray-600 hover:text-gray-900'}`
            }
          >
            Home
          </NavLink>
          <NavLink
            to="/map"
            className={({ isActive }) =>
              `text-sm font-medium transition-colors ${isActive ? 'text-green-600' : 'text-gray-600 hover:text-gray-900'}`
            }
          >
            Price Map
          </NavLink>
          <a
            href="https://wa.me/14155238886"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-green-500 hover:bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-full transition-colors"
          >
            WhatsApp
          </a>
        </nav>
      </div>
    </header>
  );
}
