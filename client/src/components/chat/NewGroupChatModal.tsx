import React, { useState, useEffect } from 'react';
import { EligibleUser, ChatRoom } from '../../types/chat.js';
import { api } from '../../lib/apiClient.js';
import { Users, X, Check, Search, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils.js';

interface NewGroupChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRoom: (room: ChatRoom) => void;
}

export const NewGroupChatModal: React.FC<NewGroupChatModalProps> = ({
  isOpen,
  onClose,
  onSelectRoom,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [users, setUsers] = useState<EligibleUser[]>([]);
  const [search, setSearch] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setName('');
    setDescription('');
    setSelectedUserIds([]);
    setSearch('');
    setError(null);

    const fetchEligibleUsers = async () => {
      setIsLoadingUsers(true);
      try {
        const data = await api.get<EligibleUser[]>('/api/v1/chat/eligible-users');
        if (Array.isArray(data)) {
          setUsers(data);
        }
      } catch (err: any) {
        setError(err?.response?.data?.error?.message || 'Failed to load organization members');
      } finally {
        setIsLoadingUsers(false);
      }
    };

    fetchEligibleUsers();
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    if (selectedUserIds.length === users.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(users.map((u) => u.userId));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a group name.');
      return;
    }
    if (selectedUserIds.length === 0) {
      setError('Please select at least one member or client to add to the group.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const room = await api.post<ChatRoom>('/api/v1/chat/rooms/group', {
        name: name.trim(),
        description: description.trim() || undefined,
        memberIds: selectedUserIds,
      });

      if (room && room.id) {
        onSelectRoom(room);
        onClose();
      }
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to create group');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCleanName = (item: EligibleUser) => {
    let userName = item.name || '';
    if (item.email && userName.includes(item.email)) {
      userName = userName.replace(item.email, '').trim();
    }
    return userName || item.email.split('@')[0];
  };

  const filteredUsers = users.filter((u) => {
    const term = search.toLowerCase();
    const cleanName = getCleanName(u).toLowerCase();
    return cleanName.includes(term) || u.email.toLowerCase().includes(term);
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-800 animate-in zoom-in-95 duration-200">
        {/* Header - Matching App Theme */}
        <div className="p-5 border-b border-slate-800 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-800 text-blue-400 border border-slate-700 flex items-center justify-center shadow-inner">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Create Group Chat</h3>
              <p className="text-xs text-slate-400">Add members and clients together in one room</p>
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 space-y-4 overflow-y-auto no-scrollbar flex-1">
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Group Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Project Apollo Updates, Client Collaboration"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Description (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="Brief topic or guidelines for this group..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 resize-none transition"
              />
            </div>

            {/* Member Picker */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Add Participants ({selectedUserIds.length} selected) *
                </label>
                {users.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-xs text-blue-600 hover:text-blue-700 transition-colors font-bold"
                  >
                    {selectedUserIds.length === users.length ? 'Deselect All' : 'Select All'}
                  </button>
                )}
              </div>

              {/* Search */}
              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter members & clients by name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 transition"
                />
              </div>

              {/* User Selection List */}
              <div className="max-h-48 overflow-y-auto no-scrollbar border border-slate-200 rounded-2xl bg-slate-50/50 p-2 space-y-1">
                {isLoadingUsers ? (
                  <div className="py-6 flex items-center justify-center gap-2 text-slate-500 text-xs font-medium">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    <span>Loading available users...</span>
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400 font-medium">
                    No matching users found.
                  </div>
                ) : (
                  filteredUsers.map((item) => {
                    const isSelected = selectedUserIds.includes(item.userId);
                    const cleanName = getCleanName(item);
                    return (
                      <div
                        key={item.userId}
                        onClick={() => toggleUser(item.userId)}
                        className={cn(
                          'flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition text-xs border',
                          isSelected
                            ? 'bg-blue-50/80 border-blue-300 text-slate-900 shadow-sm'
                            : 'bg-white border-transparent hover:border-slate-200 hover:bg-slate-100/70 text-slate-700'
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-[10px] font-bold text-blue-700 overflow-hidden flex-shrink-0">
                            {item.avatarUrl ? (
                              <img src={item.avatarUrl} alt={cleanName} className="w-full h-full object-cover" />
                            ) : (
                              cleanName.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-slate-900 block truncate">{cleanName}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span
                            className={cn(
                              'text-[9px] px-2 py-0.5 rounded-md font-bold border uppercase tracking-wider',
                              item.role === 'MEMBER'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            )}
                          >
                            {item.role === 'MEMBER' ? 'Team' : 'Client'}
                          </span>
                          <div
                            className={cn(
                              'w-4 h-4 rounded border flex items-center justify-center transition-colors',
                              isSelected
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'border-slate-300 bg-white'
                            )}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 px-6 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/50">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || selectedUserIds.length === 0}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating Group...</span>
                </>
              ) : (
                <>
                  <Users className="w-3.5 h-3.5" />
                  <span>Create Group ({selectedUserIds.length} members)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
