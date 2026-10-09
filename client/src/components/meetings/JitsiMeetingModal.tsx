import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { api } from '../../lib/apiClient.js';
import { Meeting } from '../../types/meeting.js';
import { Button } from '../ui/Button.js';
import {
  Video,
  X,
  Loader2,
  PhoneOff,
  AlertCircle,
  Maximize2,
  Minimize2,
  Radio,
} from 'lucide-react';

interface JitsiMeetingModalProps {
  meetingId: string;
  isOpen: boolean;
  onClose: () => void;
  onMeetingEnded?: () => void;
}

declare global {
  interface Window {
    JitsiMeetExternalAPI?: any;
  }
}

export const JitsiMeetingModal: React.FC<JitsiMeetingModalProps> = ({
  meetingId,
  isOpen,
  onClose,
  onMeetingEnded,
}) => {
  const { user } = useAuth();
  const { error: toastError, success: toastSuccess } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [meetingData, setMeetingData] = useState<Meeting | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isEnding, setIsEnding] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const jitsiContainerRef = useRef<HTMLDivElement | null>(null);
  const jitsiApiRef = useRef<any>(null);

  // Fetch meeting details & signed JaaS JWT
  useEffect(() => {
    if (!isOpen || !meetingId) return;

    let isMounted = true;
    setIsLoading(true);
    setErrorMessage(null);

    api.get<Meeting>(`/meetings/${meetingId}`)
      .then((data) => {
        if (!isMounted) return;
        if (data.status === 'ended') {
          setErrorMessage('This meeting has already ended.');
          setIsLoading(false);
          return;
        }
        setMeetingData(data);
      })
      .catch((err) => {
        if (!isMounted) return;
        const msg = err.message || 'Failed to load meeting details.';
        setErrorMessage(msg);
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, meetingId]);

  // Load JaaS external_api.js and initialize Jitsi instance
  useEffect(() => {
    if (!isOpen || !meetingData || !meetingData.roomName || !jitsiContainerRef.current) return;

    const appId = meetingData.appId || 'vpaas-magic-cookie-cliently';
    const scriptSrc = `https://8x8.vc/${appId}/external_api.js`;

    let scriptElement = document.querySelector(`script[src="${scriptSrc}"]`) as HTMLScriptElement | null;

    const initJitsi = () => {
      if (!window.JitsiMeetExternalAPI || !jitsiContainerRef.current) {
        setIsLoading(false);
        return;
      }

      // Dispose existing instance if present
      if (jitsiApiRef.current) {
        try {
          jitsiApiRef.current.dispose();
        } catch {}
        jitsiApiRef.current = null;
      }

      jitsiContainerRef.current.innerHTML = '';

      const domain = '8x8.vc';
      const formattedRoomName = appId ? `${appId}/${meetingData.roomName}` : meetingData.roomName!;
      const displayName = user ? `${user.firstName} ${user.lastName}`.trim() : 'Guest';

      try {
        const options: any = {
          roomName: formattedRoomName,
          parentNode: jitsiContainerRef.current,
          jwt: meetingData.jwt || undefined,
          userInfo: {
            displayName,
            email: user?.email,
          },
          configOverwrite: {
            prejoinPageEnabled: false,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            disableDeepLinking: true,
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false,
          },
          width: '100%',
          height: '100%',
        };

        const apiInstance = new window.JitsiMeetExternalAPI(domain, options);
        jitsiApiRef.current = apiInstance;

        // Auto close when participant hangs up or leaves
        apiInstance.addEventListener('videoConferenceLeft', () => {
          onClose();
        });

        apiInstance.addEventListener('readyToClose', () => {
          onClose();
        });

        setIsLoading(false);
      } catch (err: any) {
        console.error('Error initializing JaaS meeting:', err);
        setErrorMessage('Failed to initialize video conference frame.');
        setIsLoading(false);
      }
    };

    if (!window.JitsiMeetExternalAPI) {
      if (!scriptElement) {
        scriptElement = document.createElement('script');
        scriptElement.src = scriptSrc;
        scriptElement.async = true;
        scriptElement.onload = () => {
          initJitsi();
        };
        scriptElement.onerror = () => {
          // Fallback to standard 8x8.vc/external_api.js if custom path fails
          const fallbackScript = document.createElement('script');
          fallbackScript.src = 'https://8x8.vc/external_api.js';
          fallbackScript.async = true;
          fallbackScript.onload = () => initJitsi();
          fallbackScript.onerror = () => {
            setErrorMessage('Unable to load video conference script from JaaS (8x8.vc). Check network connection.');
            setIsLoading(false);
          };
          document.body.appendChild(fallbackScript);
        };
        document.body.appendChild(scriptElement);
      } else {
        scriptElement.addEventListener('load', initJitsi);
      }
    } else {
      initJitsi();
    }

    return () => {
      if (jitsiApiRef.current) {
        try {
          jitsiApiRef.current.dispose();
        } catch {}
        jitsiApiRef.current = null;
      }
    };
  }, [isOpen, meetingData, user, onClose]);

  // End meeting handler (for Host)
  const handleEndMeeting = async () => {
    if (!meetingData) return;
    setIsEnding(true);
    try {
      await api.post(`/meetings/${meetingData.id}/end`);
      toastSuccess('Meeting ended successfully');
      if (jitsiApiRef.current) {
        try {
          jitsiApiRef.current.dispose();
        } catch {}
      }
      if (onMeetingEnded) onMeetingEnded();
      onClose();
    } catch (err: any) {
      toastError(err.message || 'Failed to end meeting');
    } finally {
      setIsEnding(false);
    }
  };

  if (!isOpen) return null;

  const isHost = meetingData?.createdById === user?.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200">
      <div
        className={`bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
          isFullScreen
            ? 'w-full h-full rounded-none border-none'
            : 'w-full max-w-6xl h-[90vh]'
        }`}
      >
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50/90 border-b border-slate-200 select-none">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate max-w-xs sm:max-w-md">
                  {meetingData?.title || 'Instant Meeting'}
                </h3>
                {meetingData?.status === 'live' && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <Radio className="w-3 h-3 animate-pulse text-emerald-600" />
                    Live
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                {meetingData?.projectName ? `Project: ${meetingData.projectName}` : 'Secured with JaaS & RS256'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isHost && meetingData?.status === 'live' && (
              <Button
                variant="danger"
                size="sm"
                onClick={handleEndMeeting}
                isLoading={isEnding}
                leftIcon={<PhoneOff className="w-3.5 h-3.5" />}
              >
                End for Everyone
              </Button>
            )}

            <button
              type="button"
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors hidden sm:inline-flex"
              title={isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
            >
              {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="Close / Leave"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video Frame Body */}
        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/90 text-slate-300 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-xs font-medium tracking-wide">Connecting to encrypted video room...</p>
            </div>
          )}

          {errorMessage && (
            <div className="p-6 max-w-md text-center flex flex-col items-center gap-3">
              <div className="p-3 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-white">Cannot Join Meeting</h4>
              <p className="text-xs text-slate-400 leading-relaxed">{errorMessage}</p>
              <Button variant="secondary" size="sm" onClick={onClose} className="mt-2">
                Close Window
              </Button>
            </div>
          )}

          <div
            ref={jitsiContainerRef}
            className="w-full h-full flex-1"
            style={{ minHeight: '400px' }}
          />
        </div>
      </div>
    </div>
  );
};
