import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.js';
import { useChatContext } from '../../contexts/ChatContext.js';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  FolderKanban,
  CheckSquare,
  FileText,
  Video,
  MessageSquare,
  Settings,
  X,
  CreditCard,
} from 'lucide-react';
import { cn } from '../../lib/utils.js';

export interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { currentRole, activeOrg } = useAuth();
  const { unreadCount } = useChatContext();

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    ...(currentRole === 'OWNER'
      ? [{ name: 'Clients', path: '/clients', icon: Users }]
      : []),
    ...(currentRole !== 'CLIENT'
      ? [{ name: 'Team', path: '/team', icon: UserCheck }]
      : []),
    { name: 'Projects', path: '/projects', icon: FolderKanban },
    ...(currentRole !== 'CLIENT'
      ? [{ name: 'Tasks', path: '/tasks', icon: CheckSquare }]
      : []),
    { name: 'Invoices', path: '/invoices', icon: FileText },
    { name: 'Meetings', path: '/meetings', icon: Video },
    { name: 'Messages', path: '/chat', icon: MessageSquare },
    ...(currentRole === 'OWNER'
      ? [{ name: 'Settings', path: '/settings', icon: Settings }]
      : []),
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm md:hidden animate-in fade-in"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container - Brand Theme (#070F2B primary, #1B1A55 secondary, #535C91 accent) */}
      <aside
        className={cn(
          'fixed md:sticky md:top-0 md:h-screen shrink-0 inset-y-0 left-0 z-50 w-64 bg-[#070F2B] border-r border-[#1B1A55] flex flex-col transition-transform duration-200 ease-in-out md:translate-x-0 shadow-2xl',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand Header */}
        <div className="h-16 px-6 flex items-center justify-between border-b border-[#1B1A55] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#1B1A55] to-[#535C91] border border-[#535C91]/60 flex items-center justify-center font-extrabold text-white shadow-md shadow-[#070F2B]">
              C
            </div>
            <div>
              <span className="font-extrabold text-base text-white tracking-tight font-heading">Cliently</span>
              <span className="block text-[10px] text-[#9290C3] font-bold uppercase tracking-wider">
                {activeOrg?.plan || 'Free'} Plan
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation sidebar"
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1B1A55] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto no-scrollbar">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isMessageItem = item.path === '/chat';
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => onClose()}
                className={({ isActive }) =>
                  cn(
                    'relative flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ease-out group font-heading active:scale-[0.98] select-none',
                    isActive
                      ? 'bg-gradient-to-r from-[#1B1A55] to-[#24236e] text-white border border-[#535C91]/80 shadow-lg shadow-[#070F2B]/70'
                      : 'text-slate-300 hover:text-white hover:bg-[#1B1A55]/60 hover:border hover:border-[#535C91]/30 border border-transparent'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Active Glowing Left Pill Indicator */}
                    {isActive && (
                      <span className="absolute left-0 inset-y-1.5 w-1 rounded-r-full bg-[#9290C3] shadow-[0_0_8px_rgba(146,144,195,0.8)]" />
                    )}

                    <div className="flex items-center gap-3 transition-transform duration-200 group-hover:translate-x-0.5">
                      <Icon
                        className={cn(
                          'w-4 h-4 shrink-0 transition-all duration-200 group-hover:scale-110',
                          isActive ? 'text-[#9290C3]' : 'text-slate-400 group-hover:text-white'
                        )}
                      />
                      <span>{item.name}</span>
                    </div>

                    {isMessageItem && unreadCount > 0 && (
                      <span
                        className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-black rounded-full bg-orange-500 text-white min-w-[20px] shadow-sm animate-pulse"
                        title={`${unreadCount} unread message${unreadCount > 1 ? 's' : ''}`}
                      >
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer info banner */}
        <div className="p-4 border-t border-[#1B1A55] shrink-0">
          <div className="p-3 bg-[#030719]/80 rounded-xl border border-[#1B1A55] text-xs">
            <div className="flex items-center gap-2 text-[#9290C3] font-bold mb-1">
              <CreditCard className="w-3.5 h-3.5 text-[#9290C3]" />
              <span className="font-heading">Multi-Tenant Invoicing</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Role: <strong className="text-[#9290C3] font-bold">{currentRole || 'CLIENT'}</strong>
            </p>
          </div>
        </div>
      </aside>
    </>
  );
};
