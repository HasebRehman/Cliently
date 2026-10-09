import React from 'react';
import { TypingUser } from '../../types/chat.js';
import { User } from 'lucide-react';

interface TypingIndicatorProps {
  typingUsers: TypingUser[];
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ typingUsers }) => {
  if (typingUsers.length === 0) return null;

  const namesText =
    typingUsers.length === 1
      ? `${typingUsers[0].userName} is typing`
      : typingUsers.length === 2
      ? `${typingUsers[0].userName} and ${typingUsers[1].userName} are typing`
      : `${typingUsers[0].userName} and ${typingUsers.length - 1} others are typing`;

  return (
    <div className="flex items-end gap-2.5 px-4 py-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
      {/* Avatars of all typing users */}
      <div className="flex -space-x-2 overflow-hidden items-center pb-0.5">
        {typingUsers.map((user) => (
          <div
            key={user.userId}
            className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shadow-sm overflow-hidden"
            title={user.userName}
          >
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.userName} className="w-full h-full object-cover" />
            ) : (
              <User className="w-3.5 h-3.5 text-slate-300" />
            )}
          </div>
        ))}
      </div>

      {/* WhatsApp-style 3-dot bubble */}
      <div className="bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-2xl rounded-bl-sm px-3.5 py-2 flex items-center gap-2 shadow-md">
        <span className="text-xs text-slate-300 font-medium">{namesText}</span>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.3s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.15s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" />
        </div>
      </div>
    </div>
  );
};
