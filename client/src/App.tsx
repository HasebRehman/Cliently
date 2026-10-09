import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient.js';
import { AuthProvider } from './contexts/AuthContext.js';
import { ToastProvider } from './contexts/ToastContext.js';
import { ChatProvider } from './contexts/ChatContext.js';
import { AppLayout } from './components/layout/AppLayout.js';
import { ProtectedRoute } from './components/layout/ProtectedRoute.js';

// Auth Pages
import { LoginPage } from './pages/auth/LoginPage.js';
import { RegisterPage } from './pages/auth/RegisterPage.js';
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage.js';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage.js';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage.js';
import { AcceptInvitePage } from './pages/auth/AcceptInvitePage.js';

// App Pages
import { DashboardPage } from './pages/dashboard/DashboardPage.js';
import { ClientListPage } from './pages/clients/ClientListPage.js';
import { ClientDetailPage } from './pages/clients/ClientDetailPage.js';
import { TeamPage } from './pages/team/TeamPage.js';
import { ProjectListPage } from './pages/projects/ProjectListPage.js';
import { ProjectDetailPage } from './pages/projects/ProjectDetailPage.js';
import { TasksPage } from './pages/tasks/TasksPage.js';
import { InvoiceListPage } from './pages/invoices/InvoiceListPage.js';
import { InvoiceDetailPage } from './pages/invoices/InvoiceDetailPage.js';
import { InvoiceFormPage } from './pages/invoices/InvoiceFormPage.js';
import { MeetingsPage } from './pages/meetings/MeetingsPage.js';
import { ChatPage } from './pages/chat/ChatPage.js';
import { SettingsPage } from './pages/settings/SettingsPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <ChatProvider>
            <BrowserRouter>
              <Routes>
              {/* Public Auth Routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/accept-invite" element={<AcceptInvitePage />} />
              <Route path="/invites/accept" element={<AcceptInvitePage />} />

              {/* Protected App Layout */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />

                {/* Clients */}
                <Route path="clients" element={<ClientListPage />} />
                <Route path="clients/:id" element={<ClientDetailPage />} />

                {/* Team */}
                <Route path="team" element={<TeamPage />} />

                {/* Projects */}
                <Route path="projects" element={<ProjectListPage />} />
                <Route path="projects/:id" element={<ProjectDetailPage />} />

                {/* Tasks */}
                <Route path="tasks" element={<TasksPage />} />

                {/* Invoices */}
                <Route path="invoices" element={<InvoiceListPage />} />
                <Route path="invoices/new" element={<InvoiceFormPage />} />
                <Route path="invoices/:id" element={<InvoiceDetailPage />} />
                <Route path="invoices/:id/edit" element={<InvoiceFormPage />} />

                {/* Meetings */}
                <Route path="meetings" element={<MeetingsPage />} />

                {/* Realtime Chat / Messages */}
                <Route path="chat" element={<ChatPage />} />

                {/* Organization Settings */}
                <Route path="settings" element={<SettingsPage />} />
              </Route>

              {/* Catch-all 404 */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </BrowserRouter>
          </ChatProvider>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
