import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { useChatContext } from '../../contexts/ChatContext.js';
import { useChatSocket } from '../../hooks/useChatSocket.js';
import { api } from '../../lib/apiClient.js';
import { ChatRoom, ChatMessage } from '../../types/chat.js';
import { ChatMessageBubble } from '../../components/chat/ChatMessageBubble.js';
import { TypingIndicator } from '../../components/chat/TypingIndicator.js';
import { WhatsAppDoubleTick } from '../../components/chat/WhatsAppDoubleTick.js';
import { NewDirectChatModal } from '../../components/chat/NewDirectChatModal.js';
import { NewGroupChatModal } from '../../components/chat/NewGroupChatModal.js';
import { GroupDetailsModal } from '../../components/chat/GroupDetailsModal.js';
import { JitsiMeetingModal } from '../../components/meetings/JitsiMeetingModal.js';
import {
  MessageSquare,
  Users,
  User,
  Plus,
  Search,
  Send,
  Paperclip,
  X,
  ArrowLeft,
  Loader2,
  FileText,
  WifiOff,
  Sparkles,
  Info,
} from 'lucide-react';
import { cn } from '../../lib/utils.js';

export const ChatPage: React.FC = () => {
  const { user, currentRole } = useAuth();
  const { refreshUnreadCount, isUserOnline } = useChatContext();

  // State
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [search, setSearch] = useState('');
  const [inputText, setInputText] = useState('');
  const [attachment, setAttachment] = useState<{
    file: File;
    previewUrl?: string;
    isUploading: boolean;
    uploadedData?: {
      url: string;
      name: string;
      type: string;
      size: number;
    };
  } | null>(null);

  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showDirectModal, setShowDirectModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showGroupDetailsModal, setShowGroupDetailsModal] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(true);
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef<boolean>(false);

  // Active room data
  const activeRoom = rooms.find((r) => r.id === activeRoomId) || null;
  const activeOtherParticipant = activeRoom && activeRoom.type !== 'GROUP'
    ? activeRoom.participants.find((p) => p.userId !== user?.id)
    : null;
  const activeOtherUserId = activeRoom?.otherUserId || activeOtherParticipant?.userId;
  const isActiveOtherOnline = isUserOnline(activeOtherUserId);

  // Scroll to bottom without moving parent window
  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'nearest' });
    }
  };

  // WebSocket event handlers
  const handleNewMessage = useCallback(
    (msg: ChatMessage) => {
      // If message is in active room, append to messages
      if (msg.roomId === activeRoomId) {
        setMessages((prev) => {
          // Prevent duplicates
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, { ...msg, isSender: msg.senderId === user?.id }];
        });

        // Mark read immediately if we are viewing the room
        if (msg.senderId !== user?.id && markRead) {
          markRead(msg.roomId);
        }

        setTimeout(() => scrollToBottom(true), 50);
      }

      // Update room list preview
      setRooms((prev) => {
        return prev.map((r) => {
          if (r.id === msg.roomId) {
            const isCurrentActive = r.id === activeRoomId;
            return {
              ...r,
              unreadCount: isCurrentActive || msg.senderId === user?.id ? 0 : (r.unreadCount || 0) + 1,
              lastMessage: {
                id: msg.id,
                content: msg.content,
                attachmentName: msg.attachmentName,
                attachmentType: msg.attachmentType,
                senderId: msg.senderId,
                senderName: msg.senderName,
                createdAt: msg.createdAt,
                isReadByAll: false,
              },
              updatedAt: msg.createdAt,
            };
          }
          return r;
        });
      });
    },
    [activeRoomId, user?.id]
  );

  const handleMessagesRead = useCallback(
    (payload: { roomId: string; userId: string; messageIds: string[] }) => {
      if (payload.roomId === activeRoomId) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.isSender || msg.senderId === user?.id) {
              return { ...msg, isRead: true };
            }
            return msg;
          })
        );
      }

      // Also update last message tick in conversation sidebar
      setRooms((prev) =>
        prev.map((r) => {
          if (r.id === payload.roomId && r.lastMessage && r.lastMessage.senderId === user?.id) {
            return {
              ...r,
              lastMessage: { ...r.lastMessage, isReadByAll: true },
            };
          }
          return r;
        })
      );
    },
    [activeRoomId, user?.id]
  );

  const handleRoomCreated = useCallback((newRoom: ChatRoom) => {
    setRooms((prev) => {
      if (prev.some((r) => r.id === newRoom.id)) return prev;
      return [newRoom, ...prev];
    });
  }, []);

  const handleConversationUpdated = useCallback((payload: { roomId: string; lastMessage: any }) => {
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id === payload.roomId) {
          return {
            ...r,
            lastMessage: payload.lastMessage,
            updatedAt: payload.lastMessage.createdAt,
          };
        }
        return r;
      })
    );
  }, []);

  const handleMessageDeleted = useCallback(
    (payload: { roomId: string; messageId: string }) => {
      if (payload.roomId === activeRoomId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === payload.messageId
              ? {
                  ...m,
                  isDeleted: true,
                  content: null,
                  attachmentUrl: null,
                  attachmentName: null,
                  attachmentType: null,
                  attachmentSize: null,
                }
              : m
          )
        );
      }

      setRooms((prev) =>
        prev.map((r) => {
          if (r.id === payload.roomId && r.lastMessage && r.lastMessage.id === payload.messageId) {
            return {
              ...r,
              lastMessage: {
                ...r.lastMessage,
                isDeleted: true,
                content: null,
                attachmentName: null,
                attachmentType: null,
              },
            };
          }
          return r;
        })
      );
    },
    [activeRoomId]
  );

  const handleParticipantsAdded = useCallback(
    (payload: { roomId: string; participants: any[] }) => {
      setRooms((prev) =>
        prev.map((r) => {
          if (r.id === payload.roomId) {
            const existingIds = new Set(r.participants.map((p) => p.userId));
            const newOnes = (payload.participants || []).filter((p) => !existingIds.has(p.userId));
            const updatedParticipants = [...r.participants, ...newOnes];
            return {
              ...r,
              participantsCount: updatedParticipants.length,
              participants: updatedParticipants,
            };
          }
          return r;
        })
      );
    },
    []
  );

  const handleParticipantRemoved = useCallback(
    (payload: { roomId: string; userId: string }) => {
      setRooms((prev) =>
        prev.map((r) => {
          if (r.id === payload.roomId) {
            const updatedParticipants = r.participants.filter((p) => p.userId !== payload.userId);
            return {
              ...r,
              participantsCount: updatedParticipants.length,
              participants: updatedParticipants,
            };
          }
          return r;
        })
      );
    },
    []
  );

  const handleRemovedFromRoom = useCallback(
    (payload: { roomId: string }) => {
      setRooms((prev) => prev.filter((r) => r.id !== payload.roomId));
      if (activeRoomId === payload.roomId) {
        setActiveRoomId(null);
      }
    },
    [activeRoomId]
  );

  // Initialize socket hook
  const { isConnected, typingUsers, sendTyping, markRead } = useChatSocket({
    activeRoomId,
    onNewMessage: handleNewMessage,
    onMessagesRead: handleMessagesRead,
    onRoomCreated: handleRoomCreated,
    onConversationUpdated: handleConversationUpdated,
    onMessageDeleted: handleMessageDeleted,
    onParticipantsAdded: handleParticipantsAdded,
    onParticipantRemoved: handleParticipantRemoved,
    onRemovedFromRoom: handleRemovedFromRoom,
  });

  // Fetch Rooms
  const fetchRooms = async () => {
    setIsLoadingRooms(true);
    try {
      const data = await api.get<ChatRoom[]>('/api/v1/chat/rooms');
      if (Array.isArray(data)) {
        setRooms(data);

        // Auto select first room if none selected on desktop
        if (!activeRoomId && data.length > 0 && window.innerWidth >= 768) {
          setActiveRoomId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setIsLoadingRooms(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  // Fetch Messages for active room
  const fetchMessages = useCallback(async (roomId: string) => {
    setIsLoadingMessages(true);
    try {
      const data = await api.get<{
        messages: ChatMessage[];
        nextCursor: string | null;
      }>(`/api/v1/chat/rooms/${roomId}/messages?limit=50`);

      if (data && Array.isArray(data.messages)) {
        setMessages(data.messages);
        // Mark room as read locally
        setRooms((prev) =>
          prev.map((r) => (r.id === roomId ? { ...r, unreadCount: 0 } : r))
        );
        refreshUnreadCount();
        setTimeout(() => scrollToBottom(false), 50);
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [refreshUnreadCount]);

  useEffect(() => {
    if (!activeRoomId) {
      setMessages([]);
      return;
    }

    fetchMessages(activeRoomId);
    setShowMobileSidebar(false);
  }, [activeRoomId, fetchMessages]);

  // Handle typing debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);

    if (!activeRoomId) return;

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      sendTyping(activeRoomId, true);
    }

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      sendTyping(activeRoomId, false);
    }, 2000);
  };

  // Handle Attachment Selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      alert('File size exceeds the maximum limit of 15MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    let previewUrl: string | undefined;
    if (file.type.startsWith('image/')) {
      previewUrl = URL.createObjectURL(file);
    }

    setAttachment({
      file,
      previewUrl,
      isUploading: true,
    });

    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadData = await api.post<{
        url: string;
        relativePath: string;
        name: string;
        type: string;
        size: number;
      }>('/api/v1/chat/upload', formData);

      if (uploadData && uploadData.url) {
        setAttachment((prev) =>
          prev
            ? {
                ...prev,
                isUploading: false,
                uploadedData: uploadData,
              }
            : null
        );
      }
    } catch (err: any) {
      alert(err?.response?.data?.error?.message || 'Failed to upload attachment.');
      setAttachment(null);
    }
  };

  const removeAttachment = () => {
    if (attachment?.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Handle Send Message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeRoomId) return;

    const trimmed = inputText.trim();
    if (!trimmed && !attachment?.uploadedData) return;
    if (attachment?.isUploading) return;

    setIsSending(true);

    if (isTypingRef.current) {
      isTypingRef.current = false;
      sendTyping(activeRoomId, false);
    }

    try {
      const payload = {
        content: trimmed || undefined,
        attachmentUrl: attachment?.uploadedData?.url,
        attachmentName: attachment?.uploadedData?.name,
        attachmentType: attachment?.uploadedData?.type,
        attachmentSize: attachment?.uploadedData?.size,
      };

      const resMsg = await api.post<ChatMessage>(
        `/api/v1/chat/rooms/${activeRoomId}/messages`,
        payload
      );

      if (resMsg && resMsg.id) {
        setInputText('');
        removeAttachment();
        setTimeout(() => scrollToBottom(true), 50);
      }
    } catch (err: any) {
      alert(err?.response?.data?.error?.message || 'Failed to send message.');
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!activeRoomId) return;
    try {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                isDeleted: true,
                content: null,
                attachmentUrl: null,
                attachmentName: null,
                attachmentType: null,
                attachmentSize: null,
              }
            : m
        )
      );
      await api.delete(`/api/v1/chat/rooms/${activeRoomId}/messages/${messageId}`);
    } catch (err: any) {
      alert(err?.response?.data?.error?.message || 'Failed to delete message.');
    }
  };

  const handleParticipantsAddedLocally = (addedParticipants: any[]) => {
    if (!activeRoomId) return;
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id === activeRoomId) {
          const existingIds = new Set(r.participants.map((p) => p.userId));
          const newOnes = addedParticipants.filter((p) => !existingIds.has(p.userId));
          const updated = [...r.participants, ...newOnes];
          return {
            ...r,
            participantsCount: updated.length,
            participants: updated,
          };
        }
        return r;
      })
    );
  };

  const handleParticipantRemovedLocally = (userId: string) => {
    if (!activeRoomId) return;
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id === activeRoomId) {
          const updated = r.participants.filter((p) => p.userId !== userId);
          return {
            ...r,
            participantsCount: updated.length,
            participants: updated,
          };
        }
        return r;
      })
    );
  };

  // Filtered Rooms
  const filteredRooms = rooms.filter((r) => {
    if (!search) return true;
    return r.name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="w-full h-full flex-1 flex overflow-hidden bg-[#070F2B] border border-[#1B1A55] rounded-2xl shadow-2xl text-white">
      {/* 1. Conversations List Sidebar */}
      <div
        className={cn(
          'w-full md:w-80 lg:w-96 border-r border-[#1B1A55] bg-[#070F2B] flex flex-col flex-shrink-0 transition-all duration-200 ease-out',
          !showMobileSidebar && 'hidden md:flex'
        )}
      >
        {/* Top bar */}
        <div className="p-4 border-b border-[#1B1A55] space-y-3 bg-[#070F2B]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold text-white tracking-tight font-heading">Messages</h2>
              {!isConnected && (
                <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-950/70 px-2 py-0.5 rounded-full border border-amber-800/80 font-bold">
                  <WifiOff className="w-3 h-3" /> Connecting...
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Owner can create group chat */}
              {currentRole === 'OWNER' && (
                <button
                  onClick={() => setShowGroupModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-[#1B1A55] hover:bg-[#1B1A55]/80 text-[#9290C3] hover:text-white transition-all duration-200 border border-[#535C91]/40 flex items-center gap-1.5 text-xs font-bold cursor-pointer active:scale-95 font-heading"
                  title="Create Group Chat"
                >
                  <Users className="w-3.5 h-3.5 text-[#9290C3]" />
                  <span className="hidden sm:inline">Group</span>
                </button>
              )}

              {/* Start new direct chat */}
              <button
                onClick={() => setShowDirectModal(true)}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#1B1A55] to-[#535C91] hover:from-[#141344] hover:to-[#434b7a] text-white border border-[#535C91]/60 shadow-md shadow-[#1B1A55]/30 transition-all duration-200 flex items-center gap-1 text-xs font-bold cursor-pointer active:scale-95 font-heading"
                title="New Message"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New</span>
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#030719] border border-[#1B1A55] rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#535C91] focus:ring-2 focus:ring-[#535C91]/25 focus:bg-[#030719] transition-all font-medium"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto no-scrollbar divide-y divide-[#1B1A55]/40 p-2 space-y-1 bg-[#070F2B]">
          {isLoadingRooms ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#9290C3]" />
              <span className="text-xs font-medium text-slate-400 font-heading">Loading conversations...</span>
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="py-16 text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-[#1B1A55] mx-auto flex items-center justify-center text-[#9290C3] mb-3 border border-[#535C91]/50 shadow-inner">
                <MessageSquare className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-white font-heading">No conversations yet</p>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Start a direct conversation with team or clients.
              </p>
            </div>
          ) : (
            filteredRooms.map((room) => {
              const isActive = room.id === activeRoomId;
              const hasUnread = (room.unreadCount || 0) > 0;
              const isGroup = room.type === 'GROUP';
              const otherParticipant = !isGroup
                ? room.participants.find((p) => p.userId !== user?.id)
                : null;
              const otherUserId = room.otherUserId || otherParticipant?.userId;
              const isOtherOnline = isUserOnline(otherUserId);

              return (
                <div
                  key={room.id}
                  onClick={() => {
                    setActiveRoomId(room.id);
                    setShowMobileSidebar(false);
                  }}
                  className={cn(
                    'p-3 rounded-2xl cursor-pointer transition-all duration-200 ease-out flex items-center gap-3 relative group active:scale-[0.98] select-none',
                    isActive
                      ? 'bg-gradient-to-r from-[#1B1A55] to-[#25246e] border border-[#535C91]/80 shadow-md shadow-[#070F2B]/60'
                      : 'hover:bg-[#1B1A55]/50 border border-transparent'
                  )}
                >
                  {/* Avatar with Status Dot on Bottom-Right */}
                  <div className="relative flex-shrink-0">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden shadow-sm shrink-0 bg-[#1B1A55] text-slate-200 border border-[#535C91]/50 transition-transform duration-200 group-hover:scale-105">
                      {room.avatarUrl ? (
                        <img src={room.avatarUrl} alt={room.name} className="w-full h-full object-cover" />
                      ) : isGroup ? (
                        <Users className="w-5 h-5 text-[#9290C3]" />
                      ) : (
                        <User className="w-5 h-5 text-[#9290C3]" />
                      )}
                    </div>

                    {/* Online/Offline Status Dot */}
                    {!isGroup && (
                      <span
                        className={cn(
                          'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#070F2B] shadow-xs transition-colors duration-200',
                          isOtherOnline
                            ? 'bg-emerald-500 ring-2 ring-emerald-500/20'
                            : 'bg-slate-500'
                        )}
                        title={isOtherOnline ? 'Online' : 'Offline'}
                      />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <h4
                        className={cn(
                          'text-xs sm:text-sm font-bold truncate font-heading transition-colors duration-200',
                          isActive ? 'text-[#9290C3] font-extrabold' : 'text-slate-200 group-hover:text-white'
                        )}
                      >
                        {room.name}
                      </h4>
                      {room.lastMessage && (
                        <span className="text-[10px] text-slate-400 font-medium shrink-0 ml-1">
                          {new Date(room.lastMessage.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-400 truncate flex items-center gap-1 font-normal">
                        {room.lastMessage?.senderId === user?.id && (
                          <WhatsAppDoubleTick
                            isRead={Boolean(room.lastMessage?.isReadByAll)}
                            className={cn(
                              'w-3.5 h-3.5 shrink-0',
                              room.lastMessage?.isReadByAll ? 'text-[#9290C3]' : 'text-slate-500'
                            )}
                          />
                        )}
                        <span className={room.lastMessage?.isDeleted ? 'italic text-slate-500' : 'truncate'}>
                          {room.lastMessage
                            ? room.lastMessage.isDeleted
                              ? 'This message was deleted'
                              : room.lastMessage.content ||
                                (room.lastMessage.attachmentName
                                  ? `📎 ${room.lastMessage.attachmentName}`
                                  : 'Attachment')
                            : 'No messages yet'}
                        </span>
                      </p>

                      {hasUnread && (
                        <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-orange-500 text-white shadow-xs shrink-0 font-heading animate-pulse">
                          {room.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Active Chat View */}
      <div
        className={cn(
          'flex-1 flex flex-col bg-[#030617] overflow-hidden',
          showMobileSidebar && 'hidden md:flex'
        )}
      >
        {activeRoom ? (
          <>
            {/* Room Header */}
            <div className="h-16 px-4 md:px-6 border-b border-[#1B1A55] bg-[#070F2B] flex items-center justify-between shrink-0 shadow-md">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setShowMobileSidebar(true)}
                  className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1B1A55] cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden shadow-sm shrink-0 bg-[#1B1A55] text-slate-200 border border-[#535C91]/50">
                    {activeRoom.avatarUrl ? (
                      <img src={activeRoom.avatarUrl} alt={activeRoom.name} className="w-full h-full object-cover" />
                    ) : activeRoom.type === 'GROUP' ? (
                      <Users className="w-5 h-5 text-[#9290C3]" />
                    ) : (
                      <User className="w-5 h-5 text-[#9290C3]" />
                    )}
                  </div>

                  {activeRoom.type !== 'GROUP' && (
                    <span
                      className={cn(
                        'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#070F2B] shadow-xs transition-colors duration-200',
                        isActiveOtherOnline
                          ? 'bg-emerald-500 ring-2 ring-emerald-500/20'
                          : 'bg-slate-500'
                      )}
                      title={isActiveOtherOnline ? 'Online' : 'Offline'}
                    />
                  )}
                </div>

                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-extrabold text-white truncate font-heading">
                    {activeRoom.name}
                  </h3>
                  {activeRoom.type === 'GROUP' ? (
                    <p className="text-[11px] text-slate-400 truncate font-medium">
                      {activeRoom.participants.map((p) => p.name).join(', ')}
                    </p>
                  ) : (
                    <p className="text-[11px] truncate font-medium flex items-center gap-1.5">
                      {isActiveOtherOnline ? (
                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Online
                        </span>
                      ) : (
                        <span className="text-slate-400 font-medium">Offline</span>
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* Group Info Action */}
              {activeRoom.type === 'GROUP' && (
                <button
                  type="button"
                  onClick={() => setShowGroupDetailsModal(true)}
                  className="px-3.5 py-1.5 rounded-xl text-slate-200 hover:text-white bg-[#1B1A55] hover:bg-[#1B1A55]/80 transition-colors flex items-center gap-1.5 text-xs font-bold border border-[#535C91]/40 cursor-pointer shadow-xs font-heading"
                  title="View group members & details"
                >
                  <Info className="w-4 h-4 text-[#9290C3]" />
                  <span className="hidden sm:inline">Details</span>
                </button>
              )}
            </div>

            {isLoadingMessages ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2 bg-[#030617] overflow-hidden">
                <Loader2 className="w-6 h-6 animate-spin text-[#9290C3]" />
                <span className="text-xs font-medium text-slate-400 font-heading">Loading message history...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-[#030617] overflow-hidden select-none">
                <div className="w-14 h-14 rounded-2xl bg-[#070F2B] border border-[#1B1A55] flex items-center justify-center text-[#9290C3] mb-3 shadow-inner">
                  <Sparkles className="w-7 h-7 text-[#9290C3]" />
                </div>
                <h4 className="text-base font-bold text-white font-heading">This is the start of your chat</h4>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-sm">
                  Send a message, file, image, or video to begin communicating in real-time.
                </p>
              </div>
            ) : (
              /* Messages Feed */
              <div className="flex-1 overflow-y-auto no-scrollbar p-4 md:p-6 space-y-4 bg-[#030617] scroll-smooth">
                {messages.map((msg) => (
                  <ChatMessageBubble
                    key={msg.id}
                    message={msg}
                    isGroup={activeRoom.type === 'GROUP'}
                    onDelete={handleDeleteMessage}
                    onJoinMeeting={(mId) => setActiveMeetingId(mId)}
                  />
                ))}

                {/* Typing Indicator */}
                <TypingIndicator typingUsers={typingUsers} />

                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Attachment Preview Banner */}
            {attachment && (
              <div className="px-4 py-2 bg-[#070F2B] border-t border-[#1B1A55] flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2 shadow-sm text-white">
                <div className="flex items-center gap-3 min-w-0">
                  {attachment.previewUrl ? (
                    <img
                      src={attachment.previewUrl}
                      alt="Attachment preview"
                      className="w-12 h-12 object-cover rounded-lg border border-[#535C91]/50"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-[#1B1A55] border border-[#535C91]/50 flex items-center justify-center text-[#9290C3]">
                      <FileText className="w-6 h-6" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate max-w-xs font-heading">
                      {attachment.file.name}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {attachment.isUploading ? (
                        <span className="flex items-center gap-1 text-[#9290C3] font-medium">
                          <Loader2 className="w-3 h-3 animate-spin" /> Uploading (max 15MB)...
                        </span>
                      ) : (
                        `${(attachment.file.size / (1024 * 1024)).toFixed(1)} MB • Ready to send`
                      )}
                    </p>
                  </div>
                </div>

                <button
                  onClick={removeAttachment}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1B1A55] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Input Bar */}
            <div className="p-3 md:p-4 border-t border-[#1B1A55] bg-[#070F2B] shrink-0">
              <form onSubmit={handleSendMessage} className="flex items-center gap-2.5 max-w-5xl mx-auto">
                {/* File Attachment Button */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={Boolean(attachment) || isSending}
                  className="p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-[#1B1A55] transition-colors disabled:opacity-40 cursor-pointer"
                  title="Attach file, image, or video (up to 15MB)"
                >
                  <Paperclip className="w-5 h-5" />
                </button>

                {/* Text input */}
                <div className="flex-1 bg-[#030719] border border-[#1B1A55] focus-within:border-[#535C91] focus-within:ring-2 focus-within:ring-[#535C91]/20 focus-within:bg-[#030719] rounded-xl px-4 py-2.5 transition-all duration-200 flex items-center">
                  <textarea
                    rows={1}
                    placeholder="Type Message..."
                    value={inputText}
                    onChange={handleInputChange}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    className="w-full bg-transparent text-xs sm:text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none resize-none max-h-32 font-medium"
                  />
                </div>

                {/* Send button */}
                <button
                  type="submit"
                  disabled={
                    (!inputText.trim() && !attachment?.uploadedData) ||
                    isSending ||
                    Boolean(attachment?.isUploading)
                  }
                  className="p-2.5 sm:px-4 sm:py-2.5 rounded-xl bg-gradient-to-r from-[#1B1A55] to-[#535C91] hover:from-[#141344] hover:to-[#434b7a] text-white font-bold border border-[#535C91]/60 shadow-md shadow-[#1B1A55]/30 transition-all duration-200 disabled:opacity-40 flex items-center justify-center gap-1.5 shrink-0 cursor-pointer active:scale-95 font-heading"
                  title="Send message"
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline text-xs">Send</span>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#030617] text-slate-100">
            <div className="w-20 h-20 rounded-3xl bg-[#070F2B] border border-[#1B1A55] flex items-center justify-center text-[#9290C3] mb-4 shadow-inner">
              <MessageSquare className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-black text-white mb-2 font-heading">Select a Conversation</h3>
            <p className="text-sm text-slate-400 max-w-md leading-relaxed">
              Choose an existing chat from the sidebar or click "New" to start messaging team members or clients.
            </p>
          </div>
        )}
      </div>

      {/* Modals */}
      <NewDirectChatModal
        isOpen={showDirectModal}
        onClose={() => setShowDirectModal(false)}
        onSelectRoom={(room) => {
          setRooms((prev) => {
            const exists = prev.some(
              (r) => r.id === room.id || (r.type === 'DIRECT' && room.otherUserId && r.otherUserId === room.otherUserId)
            );
            if (exists) {
              return prev.map((r) =>
                r.id === room.id || (r.type === 'DIRECT' && room.otherUserId && r.otherUserId === room.otherUserId)
                  ? { ...r, ...room }
                  : r
              );
            }
            return [room, ...prev];
          });
          setActiveRoomId(room.id);
        }}
      />

      <NewGroupChatModal
        isOpen={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        onSelectRoom={(room) => {
          setRooms((prev) => [room, ...prev.filter((r) => r.id !== room.id)]);
          setActiveRoomId(room.id);
        }}
      />

      {activeRoom && activeRoom.type === 'GROUP' && (
        <GroupDetailsModal
          isOpen={showGroupDetailsModal}
          onClose={() => setShowGroupDetailsModal(false)}
          room={activeRoom}
          onParticipantRemoved={handleParticipantRemovedLocally}
          onParticipantsAdded={handleParticipantsAddedLocally}
        />
      )}

      {activeMeetingId && (
        <JitsiMeetingModal
          isOpen={Boolean(activeMeetingId)}
          meetingId={activeMeetingId}
          onClose={() => setActiveMeetingId(null)}
          onMeetingEnded={() => {
            if (activeRoomId) {
              fetchMessages(activeRoomId);
            }
          }}
        />
      )}
    </div>
  );
};
