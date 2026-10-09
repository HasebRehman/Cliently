import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { useChatContext } from '../../contexts/ChatContext.js';
import { ChangePasswordModal } from './ChangePasswordModal.js';
import { ProfileModal } from './ProfileModal.js';
import {
  Building2,
  ChevronDown,
  LogOut,
  KeyRound,
  User as UserIcon,
  Menu,
  Check,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils.js';

export const TopNav: React.FC<{ onToggleSidebar: () => void }> = ({ onToggleSidebar }) => {
  const {
    user,
    organizations,
    activeOrgId,
    activeOrg,
    switchOrganization,
    logout,
  } = useAuth();
  const { unreadCount } = useChatContext();
  const navigate = useNavigate();

  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const orgMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (orgMenuRef.current && !orgMenuRef.current.contains(event.target as Node)) {
        setIsOrgDropdownOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'User';
  const initials = (user?.firstName?.[0] || user?.email?.[0] || 'U').toUpperCase();

  return (
    <>
      <header className="h-16 bg-[#070F2B] border-b border-[#1B1A55] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Toggle navigation menu"
            className="md:hidden relative p-2 rounded-xl text-slate-400 hover:text-white hover:bg-[#1B1A55] transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-orange-500 ring-2 ring-[#070F2B] animate-pulse" />
            )}
          </button>

          {/* Organization / Company Switcher Dropdown */}
          <div className="relative" ref={orgMenuRef}>
            <button
              type="button"
              onClick={() => setIsOrgDropdownOpen((prev) => !prev)}
              aria-label="Switch organization"
              className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-[#1B1A55] hover:bg-[#1B1A55]/80 border border-[#535C91]/50 text-white text-sm font-bold transition shadow-sm cursor-pointer"
            >
              <div className="w-6 h-6 rounded-lg bg-[#535C91]/30 border border-[#535C91]/50 flex items-center justify-center text-[#9290C3] shrink-0">
                <Building2 className="w-3.5 h-3.5" />
              </div>
              <span className="truncate max-w-[180px] sm:max-w-[240px] text-white font-bold text-sm tracking-tight font-heading">
                {activeOrg?.name || 'Select Company'}
              </span>
              <ChevronDown
                className={cn(
                  'w-3.5 h-3.5 text-slate-300 shrink-0 transition-transform duration-150',
                  isOrgDropdownOpen && 'rotate-180 text-[#9290C3]'
                )}
              />
            </button>

            {isOrgDropdownOpen && (
              <div className="absolute left-0 top-12 w-64 bg-[#070F2B] border border-[#1B1A55] rounded-2xl shadow-2xl py-2 z-40 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-4 py-2 border-b border-[#1B1A55]">
                  <p className="text-[11px] font-bold text-[#9290C3] uppercase tracking-wider font-heading">
                    Organizations
                  </p>
                </div>
                <div className="max-h-56 overflow-y-auto py-1">
                  {organizations.map((org) => {
                    const isActive = org.id === activeOrgId;
                    return (
                      <button
                        key={org.id}
                        type="button"
                        onClick={() => {
                          switchOrganization(org.id);
                          setIsOrgDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-4 py-2.5 text-xs text-left transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-[#1B1A55] text-white font-bold'
                            : 'text-slate-300 hover:text-white hover:bg-[#1B1A55]/60 font-medium'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="truncate font-heading">{org.name}</span>
                        </div>
                        {isActive && <Check className="w-4 h-4 text-[#9290C3] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* User Profile Avatar & Dropdown */}
        <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setIsUserDropdownOpen((prev) => !prev)}
            aria-label="User account menu"
            className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-[#1B1A55]/60 transition text-left cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#1B1A55] to-[#535C91] text-white flex items-center justify-center text-xs font-black shadow-md shadow-[#070F2B] overflow-hidden border border-[#535C91]/60">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <span className="font-heading">{initials}</span>
              )}
            </div>
            <div className="hidden md:flex flex-col text-left">
              <span className="text-xs font-bold text-white leading-tight font-heading">
                {displayName}
              </span>
              {user?.email && (
                <span className="text-[11px] text-slate-400 leading-tight truncate max-w-[140px] hidden sm:block">
                  {user.email}
                </span>
              )}
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {isUserDropdownOpen && (
            <div className="absolute right-0 top-12 w-60 bg-[#070F2B] border border-[#1B1A55] rounded-2xl shadow-2xl py-2 z-40 animate-in fade-in zoom-in-95 duration-150">
              {/* Header with Photo & Info */}
              <div className="px-4 py-3 border-b border-[#1B1A55] flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1B1A55] to-[#535C91] text-white flex items-center justify-center text-sm font-black overflow-hidden shrink-0 shadow-md shadow-[#070F2B] border border-[#535C91]/60">
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-heading">{initials}</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white truncate font-heading">
                    {displayName}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
                </div>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsUserDropdownOpen(false);
                    setIsProfileOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-[#1B1A55]/60 transition-colors cursor-pointer"
                >
                  <UserIcon className="w-4 h-4 text-[#9290C3]" />
                  Profile Settings
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsUserDropdownOpen(false);
                    setIsChangePasswordOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-[#1B1A55]/60 transition-colors cursor-pointer"
                >
                  <KeyRound className="w-4 h-4 text-[#9290C3]" />
                  Change Password
                </button>
              </div>

              <div className="border-t border-[#1B1A55] pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsUserDropdownOpen(false);
                    handleLogout();
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4 text-rose-400" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
      />

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </>
  );
};
