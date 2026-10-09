import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { useChatSocket } from '../../hooks/useChatSocket.js';
import { api } from '../../lib/apiClient.js';
import { ChatMessage, ChatRoom } from '../../types/chat.js';
import { ChatMessageBubble } from '../chat/ChatMessageBubble.js';
import { TypingIndicator } from '../chat/TypingIndicator.js';
import { JitsiMeetingModal } from '../meetings/JitsiMeetingModal.js';
import { Button } from '../ui/Button.js';
import {
  Send,
  MessageSquare,
  Loader2,
  Sparkles,
} from 'lucide-react';

interface ProjectChatSectionProps {
  projectId: string;
  projectName: string;
}

export const ProjectChatSection: React.FC<ProjectChatSectionProps> = ({
  projectId,
  projectName,
}) => {
  const { user } = useAuth();
  const { error: toastError } = useToast();

  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);

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

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef<boolean>(false);

  const roomId = room?.id || null;

  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  };

  // WebSocket message handlers
  const handleNewMessage = useCallback(
    (msg: ChatMessage) => {
      if (msg.roomId === roomId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, { ...msg, isSender: msg.senderId === user?.id }];
        });
        setTimeout(() => scrollToBottom(true), 50);
      }
    },
    [roomId, user?.id]
  );

  const handleMessagesRead = useCallback(
    (payload: { roomId: string; userId: string; messageIds: string[] }) => {
      if (payload.roomId === roomId) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.isSender || msg.senderId === user?.id) {
              return { ...msg, isRead: true };
            }
            return msg;
          })
        );
      }
    },
    [roomId, user?.id]
  );

  const handleMessageDeleted = useCallback(
    (payload: { roomId: string; messageId: string }) => {
      if (payload.roomId === roomId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === payload.messageId
              ? { ...m, isDeleted: true, content: null, attachmentUrl: null }
              : m
          )
        );
      }
    },
    [roomId]
  );

  // Hook into realtime chat WebSocket
  const { isConnected, typingUsers, sendTyping } = useChatSocket({
    activeRoomId: roomId,
    onNewMessage: handleNewMessage,
    onMessagesRead: handleMessagesRead,
    onMessageDeleted: handleMessageDeleted,
  });

  // Find or load Project Room & Messages
  const loadProjectChat = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Fetch rooms to locate project room
      const roomsRes = await api.get<ChatRoom[]>('/chat/rooms');
      const allRooms = Array.isArray(roomsRes) ? roomsRes : (roomsRes as any)?.data || [];
      const projectRoom = allRooms.find(
        (r: any) => r.projectId === projectId || r.name?.includes(projectName)
      );

      if (projectRoom) {
        setRoom(projectRoom);
        const msgRes = await api.get<{ messages: ChatMessage[] }>(
          `/chat/rooms/${projectRoom.id}/messages?limit=50`
        );
        const msgs = (msgRes.messages || []).map((m) => ({
          ...m,
          isSender: m.senderId === user?.id,
        }));
        setMessages(msgs);
        setTimeout(() => scrollToBottom(false), 100);
      } else {
        // If room doesn't exist yet, it will be automatically created when first message or meeting is started
        setRoom(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to load project chat:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, projectName, user?.id]);

  useEffect(() => {
    loadProjectChat();
  }, [loadProjectChat]);

  // Handle Input Typing Indicator
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);

    if (!roomId) return;

    if (!isTypingRef.current && val.trim().length > 0) {
      isTypingRef.current = true;
      sendTyping(roomId, true);
    }

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);

    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      sendTyping(roomId, false);
    }, 2000);
  };

  // Handle Send Text Message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!inputText.trim() && !attachment?.uploadedData) || isSending) return;

    setIsSending(true);

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (roomId && isTypingRef.current) {
      isTypingRef.current = false;
      sendTyping(roomId, false);
    }

    try {
      let targetRoomId = roomId;

      // If room does not exist yet, start an instant message or group room
      if (!targetRoomId) {
        const createGroupRes = await api.post<ChatRoom>('/chat/rooms/group', {
          name: `${projectName} Chat`,
          description: `Project discussions for ${projectName}`,
          participantUserIds: [],
        });
        targetRoomId = createGroupRes.id;
        setRoom(createGroupRes);
      }

      const body: any = {
        content: inputText.trim() || undefined,
        attachmentUrl: attachment?.uploadedData?.url,
        attachmentName: attachment?.uploadedData?.name,
        attachmentType: attachment?.uploadedData?.type,
        attachmentSize: attachment?.uploadedData?.size,
      };

      const sent = await api.post<ChatMessage>(`/chat/rooms/${targetRoomId}/messages`, body);

      setMessages((prev) => {
        if (prev.some((m) => m.id === sent.id)) return prev;
        return [...prev, { ...sent, isSender: true }];
      });

      setInputText('');
      setAttachment(null);
      setTimeout(() => scrollToBottom(true), 50);
    } catch (err: any) {
      toastError(err.message || 'Failed to send message.');
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!roomId) return;
    try {
      await api.delete(`/chat/rooms/${roomId}/messages/${messageId}`);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, isDeleted: true, content: null, attachmentUrl: null }
            : m
        )
      );
    } catch (err: any) {
      toastError(err.message || 'Failed to delete message.');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-slate-50/70 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Project Chat
              </h2>
              {isConnected && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" title="Connected to real-time chat" />
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Collaborate in real-time with team members and client stakeholders.
            </p>
          </div>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="p-4 sm:p-6 space-y-4 min-h-[320px] max-h-[480px] overflow-y-auto bg-slate-50/40">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-xs font-medium text-slate-500">Loading project conversation...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">No messages in this project yet</h4>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              Send a message below to start collaborating with team members and clients.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessageBubble
              key={msg.id}
              message={msg}
              isGroup={true}
              onDelete={handleDeleteMessage}
              onJoinMeeting={(meetingId) => setActiveMeetingId(meetingId)}
            />
          ))
        )}

        <TypingIndicator typingUsers={typingUsers} />
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form
        onSubmit={handleSendMessage}
        className="p-3.5 bg-white border-t border-slate-200 flex items-center gap-2"
      >
        <div className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:bg-white transition-all flex items-center">
          <textarea
            rows={1}
            placeholder="Type a message to project team & client... (Enter to send)"
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            className="w-full bg-transparent text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none resize-none max-h-24"
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={!inputText.trim() || isSending}
          isLoading={isSending}
          leftIcon={<Send className="w-3.5 h-3.5" />}
        >
          Send
        </Button>
      </form>

      {/* Jitsi / JaaS Meeting Modal */}
      {activeMeetingId && (
        <JitsiMeetingModal
          isOpen={Boolean(activeMeetingId)}
          meetingId={activeMeetingId}
          onClose={() => setActiveMeetingId(null)}
          onMeetingEnded={() => {
            loadProjectChat();
          }}
        />
      )}
    </div>
  );
};
