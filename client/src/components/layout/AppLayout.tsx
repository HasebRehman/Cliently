import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';
import { TopNav } from './TopNav.js';
import { ToastContainer } from '../ui/Toast.js';
import { cn } from '../../lib/utils.js';

export const AppLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const isChat = location.pathname.startsWith('/chat');

  return (
    <div
      className={cn(
        'bg-slate-50 text-slate-900 flex flex-col md:flex-row antialiased font-sans selection:bg-blue-600 selection:text-white',
        isChat ? 'h-screen overflow-hidden' : 'min-h-screen'
      )}
    >
      {/* Responsive Sidebar */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content Area */}
      <div
        className={cn(
          'flex-1 flex flex-col min-w-0',
          isChat ? 'h-screen overflow-hidden' : 'min-h-screen'
        )}
      >
        <TopNav onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)} />

        <main
          key={location.pathname}
          className={cn(
            'w-full mx-auto page-transition',
            isChat
              ? 'flex-1 p-3 sm:p-4 lg:p-5 max-w-7xl h-[calc(100vh-4rem)] overflow-hidden flex flex-col'
              : 'flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl'
          )}
        >
          <Outlet />
        </main>
      </div>

      <ToastContainer />
    </div>
  );
};
