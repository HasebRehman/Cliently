import React, { useState, useEffect } from 'react';
import { ChatRoom, ChatParticipant, EligibleUser } from '../../types/chat.js';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useChatContext } from '../../contexts/ChatContext.js';
import { Users, X, UserMinus, UserPlus, ShieldCheck, Loader2, Search, Check, User } from 'lucide-react';
import { cn } from '../../lib/utils.js';

interface GroupDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: ChatRoom;
  onParticipantRemoved?: (userId: string) => void;
  onParticipantsAdded?: (participants: ChatParticipant[]) => void;
}

export const GroupDetailsModal: React.FC<GroupDetailsModalProps> = ({
  isOpen,
  onClose,
  room,
  onParticipantRemoved,
  onParticipantsAdded,
}) => {
  const { user, currentRole } = useAuth();
  const { isUserOnline } = useChatContext();
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [eligibleUsers, setEligibleUsers] = useState<EligibleUser[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [isLoadingEligible, setIsLoadingEligible] = useState(false);
  const [isAddingSubmitting, setIsAddingSubmitting] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [confirmingUserId, setConfirmingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isOwner = currentRole === 'OWNER';

  // Load eligible users when switching to add mode
  useEffect(() => {
    if (isAddingMode && isOwner) {
      const fetchEligible = async () => {
        setIsLoadingEligible(true);
        setError(null);
        try {
          const data = await api.get<EligibleUser[]>('/api/v1/chat/eligible-users');
          if (Array.isArray(data)) {
            // Filter out those already in this group
            const existingIds = new Set(room.participants.map((p) => p.userId));
            setEligibleUsers(data.filter((u) => !existingIds.has(u.userId)));
          }
        } catch (err: any) {
          setError(err?.response?.data?.error?.message || 'Failed to load eligible users');
        } finally {
          setIsLoadingEligible(false);
        }
      };
      fetchEligible();
    }
  }, [isAddingMode, isOwner, room.participants]);

  if (!isOpen) return null;

  const getCleanName = (name?: string, email?: string) => {
    let clean = name || '';
    if (email && clean.includes(email)) {
      clean = clean.replace(email, '').trim();
    }
    return clean || email?.split('@')[0] || 'Member';
  };

  const toggleSelectUser = (id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleAddParticipants = async () => {
    if (selectedUserIds.length === 0) return;
    setIsAddingSubmitting(true);
    setError(null);
    try {
      const res = await api.post<{
        success: boolean;
        addedCount: number;
        participants: ChatParticipant[];
      }>(`/api/v1/chat/rooms/${room.id}/participants`, {
        memberIds: selectedUserIds,
      });

      if (res && res.participants && onParticipantsAdded) {
        onParticipantsAdded(res.participants);
      }
      setIsAddingMode(false);
      setSelectedUserIds([]);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to add members to group');
    } finally {
      setIsAddingSubmitting(false);
    }
  };

  const handleRemoveParticipant = async (targetUserId: string) => {
    setRemovingUserId(targetUserId);
    setError(null);
    try {
      await api.delete(`/api/v1/chat/rooms/${room.id}/participants/${targetUserId}`);
      if (onParticipantRemoved) {
        onParticipantRemoved(targetUserId);
      }
      setConfirmingUserId(null);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to remove member from group');
    } finally {
      setRemovingUserId(null);
    }
  };

  const filteredEligibleUsers = eligibleUsers.filter((u) => {
    const term = search.toLowerCase();
    const cleanName = getCleanName(u.name, u.email).toLowerCase();
    return cleanName.includes(term);
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          if (isAddingMode) {
            setIsAddingMode(false);
            setSelectedUserIds([]);
          } else {
            onClose();
          }
        }
      }}
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-slate-800 animate-in zoom-in-95 duration-200">
        {/* Header - Matching App Slate-900 Standard */}
        <div className="p-5 border-b border-slate-800 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-slate-800 text-blue-400 border border-slate-700 flex items-center justify-center shadow-inner shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white tracking-tight truncate">
                {isAddingMode ? 'Add Members' : room.name}
              </h3>
              <p className="text-xs text-slate-400">
                {isAddingMode
                  ? 'Select team members or clients'
                  : `${room.participants.length} Participants`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (isAddingMode) {
                setIsAddingMode(false);
                setSelectedUserIds([]);
              } else {
                onClose();
              }
            }}
            aria-label="Close modal"
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto no-scrollbar flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
              {error}
            </div>
          )}

          {isAddingMode ? (
            /* Add Members Sub-view */
            <div className="space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search members by name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all font-medium"
                  autoFocus
                />
              </div>

              {/* List */}
              {isLoadingEligible ? (
                <div className="py-10 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                  <span className="text-xs font-semibold text-slate-500">Loading available users...</span>
                </div>
              ) : filteredEligibleUsers.length === 0 ? (
                <div className="py-10 text-center text-slate-500 text-xs font-medium px-4">
                  {search ? 'No users matching your search.' : 'All eligible users are already in this group.'}
                </div>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto no-scrollbar p-1">
                  {filteredEligibleUsers.map((u) => {
                    const isSelected = selectedUserIds.includes(u.userId);
                    const cleanName = getCleanName(u.name, u.email);

                    return (
                      <div
                        key={u.userId}
                        onClick={() => toggleSelectUser(u.userId)}
                        className={cn(
                          'flex items-center justify-between p-2.5 rounded-xl cursor-pointer border transition-all text-xs',
                          isSelected
                            ? 'bg-blue-50/80 border-blue-300 text-slate-900 shadow-sm'
                            : 'bg-white border-transparent hover:border-slate-200 hover:bg-slate-50 text-slate-700'
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 overflow-hidden flex-shrink-0">
                            {u.avatarUrl ? (
                              <img src={u.avatarUrl} alt={cleanName} className="w-full h-full object-cover" />
                            ) : (
                              <User className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-900 truncate block">{cleanName}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span
                            className={cn(
                              'text-[10px] px-2 py-0.5 rounded-md font-bold border',
                              u.role === 'CLIENT'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            )}
                          >
                            {u.role === 'CLIENT' ? 'Client' : 'Team'}
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
                  })}
                </div>
              )}

              {/* Actions */}
              <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingMode(false);
                    setSelectedUserIds([]);
                  }}
                  className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedUserIds.length === 0 || isAddingSubmitting}
                  onClick={handleAddParticipants}
                  className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all shadow-md shadow-blue-600/20 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {isAddingSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <UserPlus className="w-3.5 h-3.5" />
                  )}
                  Add {selectedUserIds.length > 0 ? `(${selectedUserIds.length})` : ''}
                </button>
              </div>
            </div>
          ) : (
            /* Normal Details & Members List */
            <>
              {room.description && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-700">
                  <span className="font-bold text-slate-900 block mb-1">Description</span>
                  <p className="whitespace-pre-wrap text-slate-600 font-normal leading-relaxed">{room.description}</p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    Group Members ({room.participants.length})
                  </span>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => setIsAddingMode(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100/70 px-3 py-1.5 rounded-xl transition-colors border border-blue-200 shadow-xs cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Add Members</span>
                    </button>
                  )}
                </div>

                <div className="space-y-1 divide-y divide-slate-100/80">
                  {room.participants.map((p) => {
                    const isCurrentUser = p.userId === user?.id;
                    const isCreator = p.userId === room.createdById;
                    const isConfirming = confirmingUserId === p.userId;
                    const isRemoving = removingUserId === p.userId;
                    const isOnline = isCurrentUser || isUserOnline(p.userId);
                    const cleanName = getCleanName(p.name, p.email);

                    return (
                      <div
                        key={p.userId}
                        className="pt-2.5 first:pt-0 flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative flex-shrink-0">
                            <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 overflow-hidden flex-shrink-0 shadow-sm">
                              {p.avatarUrl ? (
                                <img src={p.avatarUrl} alt={cleanName} className="w-full h-full object-cover" />
                              ) : (
                                <User className="w-4 h-4 text-slate-600" />
                              )}
                            </div>

                            {/* Online/Offline Status Dot */}
                            <span
                              className={cn(
                                'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white shadow-xs transition-colors',
                                isOnline ? 'bg-emerald-500 ring-2 ring-emerald-500/20' : 'bg-slate-400'
                              )}
                              title={isOnline ? 'Online' : 'Offline'}
                            />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">{cleanName}</span>
                              {isCurrentUser && (
                                <span className="text-[10px] text-slate-400 font-semibold">(You)</span>
                              )}
                              {isCreator && (
                                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold border border-blue-200 flex items-center gap-1">
                                  <ShieldCheck className="w-3 h-3 inline" /> Admin
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 truncate">
                              {isOnline ? (
                                <span className="text-emerald-600 font-semibold">Online</span>
                              ) : (
                                'Offline'
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Owner can remove participants (except themselves) */}
                        {isOwner && !isCurrentUser && !isCreator && (
                          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                            {isConfirming ? (
                              <div className="flex items-center gap-1 bg-white border border-slate-200 shadow-md rounded-lg p-1 animate-in fade-in">
                                <button
                                  type="button"
                                  disabled={isRemoving}
                                  onClick={() => handleRemoveParticipant(p.userId)}
                                  className="px-2 py-0.5 text-[10px] font-bold bg-rose-600 hover:bg-rose-500 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                                >
                                  {isRemoving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirm'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmingUserId(null)}
                                  className="px-1.5 py-0.5 text-[10px] text-slate-500 hover:text-slate-800 rounded cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmingUserId(p.userId)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title={`Remove ${cleanName} from group`}
                              >
                                <UserMinus className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
