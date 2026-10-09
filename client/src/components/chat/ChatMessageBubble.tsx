import React, { useState } from 'react';
import { ChatMessage } from '../../types/chat.js';
import { WhatsAppDoubleTick } from './WhatsAppDoubleTick.js';
import { MeetingMessageCard } from './MeetingMessageCard.js';
import { FileText, Download, ExternalLink, X, Trash2, CircleSlash, User } from 'lucide-react';
import { cn } from '../../lib/utils.js';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  isGroup?: boolean;
  onDelete?: (messageId: string) => void;
  onJoinMeeting?: (meetingId: string) => void;
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageAttachment(type?: string | null, name?: string | null): boolean {
  if (type && type.startsWith('image/')) return true;
  if (name && /\.(jpeg|jpg|png|gif|webp|svg)$/i.test(name)) return true;
  return false;
}

function isVideoAttachment(type?: string | null, name?: string | null): boolean {
  if (type && type.startsWith('video/')) return true;
  if (name && /\.(mp4|webm|mov|ogg)$/i.test(name)) return true;
  return false;
}

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({
  message,
  isGroup = false,
  onDelete,
  onJoinMeeting,
}) => {
  const [showImageModal, setShowImageModal] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const isSender = Boolean(message.isSender);

  const formattedTime = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const isMeeting = message.type === 'meeting' || Boolean(message.meetingId);
  const isImage = isImageAttachment(message.attachmentType, message.attachmentName);
  const isVideo = isVideoAttachment(message.attachmentType, message.attachmentName);
  const isGenericFile = Boolean(message.attachmentUrl && !isImage && !isVideo);

  const handleDelete = () => {
    if (onDelete) {
      onDelete(message.id);
    }
  };

  // If message was deleted (WhatsApp style)
  if (message.isDeleted) {
    return (
      <div
        className={cn(
          'flex gap-2.5 max-w-[85%] sm:max-w-[75%] md:max-w-[65%] animate-in fade-in slide-in-from-bottom-1 duration-150 relative',
          isSender ? 'ml-auto flex-row-reverse' : 'mr-auto flex-row'
        )}
      >
        {!isSender && (
          <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex-shrink-0 flex items-center justify-center text-slate-300 mt-1 overflow-hidden shadow-sm">
            {message.senderAvatar ? (
              <img src={message.senderAvatar} alt={message.senderName} className="w-full h-full object-cover" />
            ) : (
              <User className="w-4 h-4 text-slate-300" />
            )}
          </div>
        )}

        <div className="flex flex-col">
          {!isSender && isGroup && (
            <span className="text-[11px] font-bold text-slate-400 mb-1 ml-1">
              {message.senderName}
            </span>
          )}

          <div
            className={cn(
              'rounded-2xl px-3.5 py-2 shadow-sm relative text-xs flex items-center gap-2 italic select-none',
              isSender
                ? 'bg-blue-950/60 border border-blue-800/80 text-blue-300 rounded-br-xs'
                : 'bg-slate-900 border border-slate-800 text-slate-400 rounded-bl-xs'
            )}
          >
            <CircleSlash className="w-3.5 h-3.5 flex-shrink-0 text-slate-500" />
            <span>{isSender ? 'You deleted this message' : 'This message was deleted'}</span>
            <span className="text-[10px] text-slate-500 not-italic ml-1">
              {formattedTime}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          'flex gap-2.5 max-w-[85%] sm:max-w-[75%] md:max-w-[65%] animate-in fade-in slide-in-from-bottom-1 duration-150 group relative',
          isSender ? 'ml-auto flex-row-reverse' : 'mr-auto flex-row'
        )}
      >
        {/* Avatar for incoming messages */}
        {!isSender && (
          <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex-shrink-0 flex items-center justify-center text-slate-300 mt-1 overflow-hidden shadow-sm">
            {message.senderAvatar ? (
              <img src={message.senderAvatar} alt={message.senderName} className="w-full h-full object-cover" />
            ) : (
              <User className="w-4 h-4 text-slate-300" />
            )}
          </div>
        )}

        {/* Delete action button for sender messages */}
        {isSender && onDelete && (
          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
            {isConfirmingDelete ? (
              <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1 shadow-md animate-in fade-in">
                <button
                  type="button"
                  onClick={handleDelete}
                  className="px-2 py-0.5 text-[10px] font-bold bg-rose-600 hover:bg-rose-500 text-white rounded transition-colors"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(false)}
                  className="px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-slate-200 rounded"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(true)}
                className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Delete message"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col">
          {/* Sender Name for group chats */}
          {!isSender && isGroup && (
            <span className="text-[11px] font-bold text-blue-400 mb-1 ml-1">
              {message.senderName}
            </span>
          )}

          {isMeeting ? (
            <div className="flex flex-col gap-1">
              <MeetingMessageCard message={message} onJoinMeeting={onJoinMeeting} />
              <div
                className={cn(
                  'flex items-center gap-1.5 px-1 text-[10px]',
                  isSender ? 'justify-end text-slate-400' : 'justify-start text-slate-500'
                )}
              >
                <span>{formattedTime}</span>
                {isSender && (
                  <WhatsAppDoubleTick
                    isRead={message.isRead}
                    className={cn(
                      'w-3.5 h-3.5 ml-0.5',
                      message.isRead ? 'text-blue-400' : 'text-slate-500'
                    )}
                  />
                )}
              </div>
            </div>
          ) : (
            <div
              className={cn(
                'rounded-2xl px-4 py-2.5 shadow-md relative break-words text-sm',
                isSender
                  ? 'bg-blue-600 text-white rounded-br-xs'
                  : 'bg-slate-900 text-slate-100 border border-slate-800 rounded-bl-xs'
              )}
            >
            {/* Image Attachment */}
            {isImage && message.attachmentUrl && (
              <div className="mb-2 -mx-2 -mt-1 overflow-hidden rounded-xl bg-slate-950 relative group cursor-pointer border border-slate-800" onClick={() => setShowImageModal(true)}>
                <img
                  src={message.attachmentUrl}
                  alt={message.attachmentName || 'Attachment image'}
                  className="w-full max-h-72 object-cover rounded-xl transition-transform duration-200 group-hover:scale-[1.02]"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="p-2 rounded-full bg-slate-900/90 text-white border border-slate-700 backdrop-blur-sm shadow-md">
                    <ExternalLink className="w-4 h-4" />
                  </div>
                </div>
              </div>
            )}

            {/* Video Attachment */}
            {isVideo && message.attachmentUrl && (
              <div className="mb-2 -mx-2 -mt-1 overflow-hidden rounded-xl bg-black border border-slate-800">
                <video
                  src={message.attachmentUrl}
                  controls
                  className="w-full max-h-72 rounded-xl"
                  preload="metadata"
                />
              </div>
            )}

            {/* Generic File Attachment */}
            {isGenericFile && message.attachmentUrl && (
              <a
                href={message.attachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={message.attachmentName || 'attachment'}
                className={cn(
                  'flex items-center gap-3 p-2.5 mb-2 rounded-xl border transition-colors group',
                  isSender
                    ? 'bg-blue-700/80 border-blue-400/40 hover:bg-blue-700 text-white'
                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 text-slate-200'
                )}
              >
                <div className={cn('p-2 rounded-lg', isSender ? 'bg-white/20 text-white' : 'bg-slate-800 text-blue-400 border border-slate-700')}>
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0 pr-2">
                  <p className={cn('text-xs font-semibold truncate', isSender ? 'text-white' : 'text-slate-200')}>
                    {message.attachmentName || 'Download File'}
                  </p>
                  <p className={cn('text-[10px]', isSender ? 'text-blue-100' : 'text-slate-400')}>
                    {formatFileSize(message.attachmentSize)}
                  </p>
                </div>
                <div className={cn('p-1.5 rounded-md transition-colors', isSender ? 'text-white' : 'text-slate-400 group-hover:text-white')}>
                  <Download className="w-4 h-4" />
                </div>
              </a>
            )}

            {/* Message Text Content */}
            {message.content && (
              <p className="whitespace-pre-wrap leading-relaxed select-text text-sm">
                {message.content}
              </p>
            )}

            {/* Timestamp & WhatsApp Double Ticks */}
            <div
              className={cn(
                'flex items-center gap-1.5 justify-end mt-1 text-[10px]',
                isSender ? 'text-blue-100' : 'text-slate-400'
              )}
            >
              <span>{formattedTime}</span>
              {isSender && (
                <WhatsAppDoubleTick
                  isRead={message.isRead}
                  className={cn(
                    'w-3.5 h-3.5 ml-0.5',
                    message.isRead ? 'text-sky-200' : 'text-blue-200'
                  )}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>

      {/* Fullscreen Image Preview Modal */}
      {showImageModal && message.attachmentUrl && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setShowImageModal(false)}
        >
          <button
            type="button"
            onClick={() => setShowImageModal(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 text-slate-200 hover:text-white hover:bg-slate-700 transition-colors z-10"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="max-w-4xl max-h-[90vh] flex flex-col items-center">
            <img
              src={message.attachmentUrl}
              alt={message.attachmentName || 'Full preview'}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            {message.attachmentName && (
              <div className="mt-2 text-xs text-slate-400 font-medium truncate max-w-md">
                {message.attachmentName}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
