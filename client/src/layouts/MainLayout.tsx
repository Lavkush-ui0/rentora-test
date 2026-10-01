import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Home, Compass, Package, List, MessageSquare, Shield, LogOut,
  Book, TestTube, Calculator, Cpu, User, PlusCircle
} from 'lucide-react';
import Navbar from '../components/Navbar';
import MobileBottomNav from '../components/MobileBottomNav';
import TestimonialPopup from '../components/TestimonialPopup';
import NotificationPermissionBanner from '../components/NotificationPermissionBanner';
import chatService from '../services/chatService';
import { RentoraWordmark } from '../components/RentoraBrand';

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [unreadMessages, setUnreadMessages] = useState(0);

  const isProfileIncomplete = 
    user && user.role !== 'ADMIN' && (
      !user.fullName || 
      !user.course || 
      !user.branch || 
      user.branch === 'Not Set' || 
      !user.year
    );

  // Global redirect: if profile is incomplete, user cannot browse any pages besides /settings
  useEffect(() => {
    if (isProfileIncomplete && location.pathname !== '/settings') {
      navigate('/settings', { state: { incompleteProfile: true }, replace: true });
    }
  }, [isProfileIncomplete, location.pathname, navigate]);

  // Fetch unread chat messages for live counter badge
  useEffect(() => {
    if (user) {
      const fetchUnread = async () => {
        try {
          const res = await chatService.getConversations();
          if (res.data?.success) {
            const count = res.data.conversations.filter((c: any) => 
              c.lastMessage && !c.lastMessage.readAt && c.lastMessage.sender !== user.id
            ).length;
            setUnreadMessages(count);
          }
        } catch (err) {
          console.warn('[MainLayout] Error fetching unread messages count:', err);
        }
      };
      fetchUnread();
      const timer = setInterval(fetchUnread, 15000);
      return () => clearInterval(timer);
    }
  }, [user]);

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { label: 'Home', path: '/', icon: Home },
    { label: 'Explore Catalog', path: '/explore', icon: Compass },
    { label: 'My Listings', path: '/my-listings', icon: Package },
    { label: 'Rentals & Exchanges', path: '/my-rentals', icon: List },
    { label: 'Messages', path: '/messages', icon: MessageSquare, badge: unreadMessages },
  ];

  const categories = [
    { label: 'Books', path: '/explore?category=Books', icon: Book },
    { label: 'Lab Gear', path: '/explore?category=Lab%20Gear', icon: TestTube },
    { label: 'Calculators', path: '/explore?category=Calculators', icon: Calculator },
    { label: 'Electronics', path: '/explore?category=Electronics', icon: Cpu },
    { label: 'Campus Life', path: '/explore?category=Campus%20Life', icon: User },
  ];

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-slate-900 dark:bg-[#161B22] dark:text-slate-100 font-sans flex transition-colors duration-200">
      
      {/* 1. Desktop Fixed Left Sidebar (236px) */}
      <aside className="hidden lg:flex flex-col w-[236px] bg-[#202B36] border-r border-[#293342] text-slate-300 flex-shrink-0 h-screen sticky top-0 self-start">
        
        {/* Top Logo Panel */}
        <div className="px-5 pt-6 pb-4 border-b border-[#293342]">
          <Link to="/" className="block mb-3">
            <RentoraWordmark dark size={21} />
          </Link>
          <div className="flex items-center gap-1.5 bg-[#293342] border border-[#293342] rounded-xl px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 font-display truncate">
              NIET Student Exchange
            </span>
          </div>
        </div>

        {/* Action Button: List Item */}
        <div className="px-4 pt-4 pb-3">
          {isProfileIncomplete ? (
            <div
              className="flex items-center justify-center space-x-2 bg-slate-700/50 text-slate-500 py-2.5 px-4 rounded-xl text-xs font-bold uppercase tracking-wider cursor-not-allowed w-full font-display opacity-50"
              title="Complete your profile to list items"
            >
              <PlusCircle className="h-4 w-4" />
              <span>+ List an Item</span>
            </div>
          ) : (
            <Link
              to="/list-item"
              className="flex items-center justify-center space-x-2 bg-[#9E1B1B] hover:bg-[#801414] text-white py-2.5 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-150 shadow-crimson hover:shadow-lg active:scale-[0.98] w-full font-display"
            >
              <PlusCircle className="h-4 w-4" />
              <span>+ List an Item</span>
            </Link>
          )}
        </div>

        {/* Main Navigation Links */}
        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              if (isProfileIncomplete) {
                return (
                  <div
                    key={item.label}
                    className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[12.5px] font-medium text-slate-500 cursor-not-allowed select-none opacity-45"
                    title="Complete your profile to unlock navigation"
                  >
                    <div className="flex items-center space-x-3">
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="font-display tracking-tight">{item.label}</span>
                    </div>
                  </div>
                );
              }
              return (
                <Link
                  key={item.label}
                  to={item.path}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[12.5px] font-medium transition-all duration-150 group ${
                    active 
                      ? 'bg-[#9E1B1B] text-white font-bold' 
                      : 'hover:bg-white/[0.05] hover:text-white text-slate-400'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className={`h-4 w-4 flex-shrink-0 ${active ? 'text-white' : 'text-slate-500 group-hover:text-white'}`} />
                    <span className="font-display tracking-tight">{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className={`px-2 py-0.5 text-[9px] font-black rounded-full ${
                      active ? 'bg-white text-[#9E1B1B]' : 'bg-[#9E1B1B] text-white'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}

            {/* Moderator Hub link (if admin user) */}
            {user?.role === 'ADMIN' && (
              <Link
                to="/admin"
                className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 group ${
                  isActive('/admin') 
                    ? 'bg-[#22716E] text-white' 
                    : 'hover:bg-[#263743] hover:text-white text-slate-400'
                }`}
              >
                <Shield className="h-4.5 w-4.5 flex-shrink-0" />
                <span className="font-display tracking-tight">Moderator Hub</span>
              </Link>
            )}
          </div>

          {/* Divider */}
          <div className="my-5 border-t border-[#42525B]/20"></div>

          {/* Category Shortcuts */}
          <div className="space-y-1.5">
            <span className="px-3.5 text-[9px] font-black uppercase tracking-[0.18em] text-[#42525B] block mb-2">
              Shortcuts
            </span>
            {categories.map((cat) => {
              const Icon = cat.icon;
              if (isProfileIncomplete) {
                return (
                  <div
                    key={cat.label}
                    className="flex items-center space-x-3 px-3.5 py-2 text-xs font-bold text-slate-650 cursor-not-allowed select-none opacity-30"
                    title="Complete your profile to unlock shortcuts"
                  >
                    <Icon className="h-4 w-4 text-[#42525B]" />
                    <span className="font-display tracking-tight">{cat.label}</span>
                  </div>
                );
              }
              return (
                <Link
                  key={cat.label}
                  to={cat.path}
                  className="flex items-center space-x-3 px-3.5 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors duration-150 group"
                >
                  <Icon className="h-4 w-4 text-[#42525B] group-hover:text-white transition-colors" />
                  <span className="font-display tracking-tight">{cat.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Bottom Profile / Settings */}
        <div className="p-4 border-t border-[#293342] bg-[#1a2330]/50">
          {user ? (
            <div className="flex items-center justify-between">
              <Link to={`/profile/${user.id}`} className="flex items-center space-x-2.5 group">
                <img 
                  src={user.avatar} 
                  alt={user.fullName} 
                  className="h-9 w-9 rounded-full object-cover border border-[#42525B]/40 group-hover:border-[#9E1B1B] transition-colors" 
                />
                <div className="text-left leading-tight">
                  <p className="text-[12px] font-bold text-white truncate max-w-[100px] font-display">{user.fullName}</p>
                  <p className="text-[10px] text-slate-500 font-medium truncate max-w-[100px]">CSE Yr {user.year || 3}</p>
                </div>
              </Link>
              <button 
                onClick={handleLogout}
                className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-[#293342] transition-all"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Link 
              to="/login"
              className="flex items-center justify-center space-x-2 text-xs font-bold text-slate-200 hover:text-white bg-white/5 hover:bg-[#9E1B1B] px-4 py-2.5 rounded-xl transition-all border border-[#293342] hover:border-transparent w-full"
            >
              <span>Student Sign In</span>
            </Link>
          )}
        </div>
      </aside>

      {/* 2. Main Content Wrapper */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        
        {/* Sticky Top Header Navbar */}
        <Navbar />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-12 max-w-7xl w-full mx-auto">
          {children}
        </main>

        {/* Premium Campus Footer */}
        <footer className="hidden md:block bg-[#202B36] text-slate-400 border-t border-[#42525B]/30 py-12 mt-auto transition-colors duration-200">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
              
              {/* Col 1: Logo & Description */}
              <div className="space-y-4">
                <RentoraWordmark dark size={22} />
                <p className="text-xs text-slate-400 leading-relaxed font-sans">
                  Rentora is a peer-to-peer campus marketplace designed specifically for NIET college students to borrow reference textbooks, calculators, and lab tools directly from classmates.
                </p>
                <div className="flex items-center space-x-2 bg-[#263743] border border-[#42525B]/30 px-3 py-1.5 rounded-2xl w-fit">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-wider font-display">
                    Plot 19 · Plot 15 · Plot 14
                  </span>
                </div>
              </div>

              {/* Col 2: Navigation Links */}
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4 border-l-2 border-[#9E1B1B] pl-2 font-display">
                  Platform
                </h4>
                <ul className="space-y-2.5 text-xs font-medium">
                  <li><Link to="/" className="hover:text-white transition-colors">Home Page</Link></li>
                  <li><Link to="/explore" className="hover:text-white transition-colors">Explore Gear</Link></li>
                  <li><Link to="/my-listings" className="hover:text-white transition-colors">Manage Listings</Link></li>
                  <li><Link to="/my-rentals" className="hover:text-white transition-colors">Rental Tracker</Link></li>
                </ul>
              </div>

              {/* Col 3: Popular Categories */}
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4 border-l-2 border-[#22716E] pl-2 font-display">
                  Categories
                </h4>
                <ul className="space-y-2.5 text-xs font-medium">
                  <li><Link to="/explore?category=Books" className="hover:text-white transition-colors">Books & Study Material</Link></li>
                  <li><Link to="/explore?category=Calculators" className="hover:text-white transition-colors">Lab & Sci Calculators</Link></li>
                  <li><Link to="/explore?category=Lab%20Gear" className="hover:text-white transition-colors">Engineering & Lab Tools</Link></li>
                  <li><Link to="/explore?category=Electronics" className="hover:text-white transition-colors">Electronics & Gear</Link></li>
                </ul>
              </div>

              {/* Col 4: Safety & Support */}
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4 border-l-2 border-[#F5B46E] pl-2 font-display">
                  Trust & Safety
                </h4>
                <ul className="space-y-2.5 text-xs font-medium">
                  <li><Link to="/terms" className="hover:text-white transition-colors">Terms & Conditions</Link></li>
                  <li><Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                  <li><span className="text-slate-400">Handover OTP Verification</span></li>
                  <li><span className="text-slate-400">Offline Cash/UPI Only</span></li>
                </ul>
              </div>

            </div>

            {/* Copyright Banner */}
            <div className="pt-6 border-t border-[#42525B]/20 flex flex-col md:flex-row justify-between items-center text-xs text-slate-500 gap-4 font-sans">
              <p>&copy; {new Date().getFullYear()} Rentora (NIET Edition). Circular campus sharing & reuse.</p>
              <div className="flex space-x-4">
                <Link to="/terms" className="hover:text-slate-400 transition-colors">Terms of Service</Link>
                <span>&middot;</span>
                <Link to="/privacy" className="hover:text-slate-400 transition-colors">Privacy Policy</Link>
                <span>&middot;</span>
                <Link to="/explore" className="hover:text-slate-400 transition-colors">Plot Locations</Link>
              </div>
            </div>
          </div>
        </footer>

        {/* Mobile Bottom Navigation Bar */}
        <MobileBottomNav />

        {/* Classmate dynamic popup announcements */}
        <TestimonialPopup />

        {/* Global notification permission prompt on initial website visit */}
        <NotificationPermissionBanner />

      </div>
    </div>
  );
};

export default MainLayout;
