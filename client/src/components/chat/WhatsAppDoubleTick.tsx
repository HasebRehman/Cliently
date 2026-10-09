import React from 'react';
import { CheckCheck, Check } from 'lucide-react';
import { cn } from '../../lib/utils.js';

interface WhatsAppDoubleTickProps {
  isRead?: boolean;
  className?: string;
  single?: boolean;
}

export const WhatsAppDoubleTick: React.FC<WhatsAppDoubleTickProps> = ({
  isRead = false,
  className,
  single = false,
}) => {
  if (single) {
    return <Check className={cn('w-3.5 h-3.5 text-slate-400 inline-block', className)} />;
  }

  return (
    <span
      className="inline-flex items-center"
      title={isRead ? 'Read (Double Blue Tick)' : 'Sent (Double Grey Tick)'}
    >
      <CheckCheck
        className={cn(
          'w-3.5 h-3.5 inline-block transition-colors duration-300',
          isRead ? 'text-sky-400' : 'text-slate-400',
          className
        )}
      />
    </span>
  );
};
