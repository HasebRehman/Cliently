import React, { useState, useEffect } from 'react';
import { EligibleUser, ChatRoom } from '../../types/chat.js';
import { api } from '../../lib/apiClient.js';
import { useChatContext } from '../../contexts/ChatContext.js';
import { cn } from '../../lib/utils.js';
import { Search, X, MessageSquare, Loader2, ArrowRight, User } from 'lucide-react';

interface NewDirectChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRoom: (room: ChatRoom) => void;
}

export const NewDirectChatModal: React.FC<NewDirectChatModalProps> = ({
  isOpen,
  onClose,
  onSelectRoom,
}) => {
  const { isUserOnline } = useChatContext();
  const [users, setUsers] = useState<EligibleUser[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingUserId, setSubmittingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchEligibleUsers = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await api.get<EligibleUser[]>('/api/v1/chat/eligible-users');
        if (Array.isArray(data)) {
          setUsers(data);
        }
      } catch (err: any) {
        setError(err?.response?.data?.error?.message || 'Failed to load users');
      } finally {
        setIsLoading(false);
      }
    };

    fetchEligibleUsers();
  }, [isOpen]);

  if (!isOpen) return null;

  const getCleanName = (item: EligibleUser) => {
    let name = item.name || '';
    if (item.email && name.includes(item.email)) {
      name = name.replace(item.email, '').trim();
    }
    return name || item.email.split('@')[0];
  };

  const filteredUsers = users.filter((u) => {
    const term = search.toLowerCase();
    const cleanName = getCleanName(u).toLowerCase();
    return cleanName.includes(term);
  });

  const handleStartChat = async (targetUserId: string) => {
    setIsSubmitting(true);
    setSubmittingUserId(targetUserId);
    setError(null);
    try {
      const room = await api.post<ChatRoom>('/api/v1/chat/rooms/direct', {
        targetUserId,
      });
      if (room && room.id) {
        onSelectRoom(room);
        onClose();
      }
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to create conversation');
    } finally {
      setIsSubmitting(false);
      setSubmittingUserId(null);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'OWNER':
        return (
          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-bold border border-purple-200">
            Owner
          </span>
        );
      case 'MEMBER':
        return (
          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold border border-blue-200">
            Team
          </span>
        );
      case 'CLIENT':
        return (
          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold border border-emerald-200">
            Client
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-slate-800 animate-in zoom-in-95 duration-200">
        {/* Top Header - Matching App Theme */}
        <div className="p-5 border-b border-slate-800 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-800 text-blue-400 border border-slate-700 flex items-center justify-center shadow-inner">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">New Message</h3>
              <p className="text-xs text-slate-400">Select someone to start chatting</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all font-medium"
              autoFocus
            />
          </div>
        </div>

        {/* User List */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-1.5 divide-y divide-slate-100/80">
          {isLoading ? (
            <div className="py-14 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <span className="text-xs font-semibold text-slate-500">Loading contacts...</span>
            </div>
          ) : error ? (
            <div className="p-4 text-center text-xs font-medium text-rose-700 bg-rose-50 rounded-xl border border-rose-200 m-2">
              {error}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs px-4">
              <p className="font-semibold text-slate-700 mb-1">
                {search ? 'No contacts found' : 'No available contacts'}
              </p>
              <p className="text-slate-400">
                {search
                  ? 'Try searching with a different name.'
                  : 'There are currently no other members or clients available.'}
              </p>
            </div>
          ) : (
            filteredUsers.map((item) => {
              const cleanName = getCleanName(item);
              const isItemSubmitting = isSubmitting && submittingUserId === item.userId;
              const isOnline = isUserOnline(item.userId);

              return (
                <button
                  key={item.userId}
                  disabled={isSubmitting}
                  onClick={() => handleStartChat(item.userId)}
                  className="w-full pt-2.5 first:pt-0 flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200/80 transition-all text-left group disabled:opacity-50 cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative flex-shrink-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 overflow-hidden flex-shrink-0 group-hover:border-blue-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors shadow-sm">
                        {item.avatarUrl ? (
                          <img src={item.avatarUrl} alt={cleanName} className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-5 h-5" />
                        )}
                      </div>

                      {/* Status Dot */}
                      <span
                        className={cn(
                          'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs transition-colors',
                          isOnline ? 'bg-emerald-500 ring-2 ring-emerald-500/20' : 'bg-slate-400'
                        )}
                        title={isOnline ? 'Online' : 'Offline'}
                      />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                          {cleanName}
                        </span>
                        {getRoleBadge(item.role)}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">
                        {isOnline ? (
                          <span className="text-emerald-600 font-semibold">Online</span>
                        ) : (
                          'Offline'
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="ml-2 flex-shrink-0 text-slate-300 group-hover:text-blue-600 transition-colors">
                    {isItemSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    ) : (
                      <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:translate-x-0.5" />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
