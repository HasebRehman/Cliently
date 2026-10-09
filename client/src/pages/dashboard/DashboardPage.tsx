import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { OrgSettings } from '../../types/member.js';
import { Invoice } from '../../types/invoice.js';
import { Project } from '../../types/project.js';
import { InvoiceStatusBadge, ProjectStatusBadge } from '../../components/ui/Badge.js';
import { Button } from '../../components/ui/Button.js';
import { CardSkeleton } from '../../components/ui/Skeleton.js';
import { ErrorState } from '../../components/ui/ErrorState.js';
import { formatMoney } from '../../lib/utils.js';
import {
  Users,
  FolderKanban,
  FileText,
  PlusCircle,
  Building,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const DashboardPage: React.FC = () => {
  const { user, activeOrg, currentRole } = useAuth();

  // Fetch current org stats & settings (OWNER / MEMBER only)
  const {
    data: orgData,
    isLoading: isLoadingOrg,
    error: orgError,
    refetch: refetchOrg,
  } = useQuery({
    queryKey: ['organization', 'current'],
    queryFn: () => api.get<OrgSettings>('/organizations/current'),
    enabled: currentRole !== 'CLIENT',
    retry: false,
  });

  // Fetch recent invoices
  const { data: invoicesData, isLoading: isLoadingInvoices } = useQuery({
    queryKey: ['invoices', { page: 1, limit: 5 }],
    queryFn: () => api.get<{ data: Invoice[]; pagination: any }>('/invoices?page=1&limit=5'),
    enabled: currentRole !== 'CLIENT',
    retry: false,
  });

  // Fetch recent projects
  const { data: projectsData, isLoading: isLoadingProjects } = useQuery({
    queryKey: ['projects', { page: 1, limit: 5 }],
    queryFn: () => api.get<{ data: Project[]; pagination: any }>('/projects?page=1&limit=5'),
    enabled: currentRole !== 'CLIENT',
    retry: false,
  });

  if (currentRole !== 'CLIENT' && orgError) {
    return <ErrorState error={orgError} onRetry={refetchOrg} />;
  }

  // Client Role dedicated Portal View
  if (currentRole === 'CLIENT') {
    return (
      <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in pb-12">
        {/* Client Welcome Banner */}
        <div className="p-8 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center font-bold text-blue-600 shadow-sm">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-bold mb-1">
                <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                <span>Verified Client Portal</span>
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Welcome, {user?.firstName} {user?.lastName}!
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Connected to <strong className="text-slate-800">{activeOrg?.name || 'Organization'}</strong>
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
            You are signed into <strong className="text-slate-900">{activeOrg?.name}</strong> with client access.
            Your account is linked and ready to receive invoices, approve deliverables, and review project updates.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
              <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">
                Connected Email
              </div>
              <div className="text-sm font-bold text-slate-900">{user?.email}</div>
              <div className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1 mt-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Verified Account
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
              <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">
                Organization Workspace
              </div>
              <div className="text-sm font-bold text-slate-900">{activeOrg?.name}</div>
              <div className="text-[11px] text-slate-500 mt-1">
                Billing Currency: <span className="text-blue-600 font-bold">{activeOrg?.currency || 'USD'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Informational Card */}
        <div className="p-6 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">Client Portal Services</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Invoices and project milestones sent by the organization manager will be accessible here.
            When an invoice is issued, you will receive an instant email notification containing a secure PDF invoice download and payment instructions.
          </p>
        </div>
      </div>
    );
  }

  const stats = orgData?.stats || { clients: 0, projects: 0, invoices: 0, memberships: 1 };
  const currency = orgData?.currency || activeOrg?.currency || 'USD';

  return (
    <div className="space-y-6 pb-12">
      {/* Welcome Header - Brand Theme */}
      <div className="rounded-2xl bg-[#070F2B] border border-[#1B1A55] p-6 sm:p-7 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#1B1A55] border border-[#535C91]/50 text-[#9290C3] text-xs font-bold mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#9290C3]" />
              <span className="font-heading">Workspace Overview</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-heading">
              Dashboard
            </h1>
            <p className="text-xs text-[#9290C3] mt-1">
              Active workspace: <strong className="text-white font-bold">{activeOrg?.name || 'Organization'}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {currentRole === 'OWNER' && (
              <Link to="/clients">
                <Button variant="secondary" size="sm" leftIcon={<Users className="w-4 h-4 text-[#535C91]" />} className="font-heading cursor-pointer bg-white/90 hover:bg-white text-[#070F2B]">
                  Add Client
                </Button>
              </Link>
            )}
            <Link to="/projects">
              <Button variant="secondary" size="sm" leftIcon={<FolderKanban className="w-4 h-4 text-[#535C91]" />} className="font-heading cursor-pointer bg-white/90 hover:bg-white text-[#070F2B]">
                Add Project
              </Button>
            </Link>
            <Link to="/invoices/new">
              <Button variant="primary" size="sm" leftIcon={<PlusCircle className="w-4 h-4" />} className="bg-[#535C91] hover:bg-[#434b7a] text-white font-bold shadow-md shadow-[#070F2B]/60 border border-[#535C91]/60 font-heading cursor-pointer">
                Create Invoice
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Metric Cards Grid - Clean White Surfaces with Blue & Orange Accents */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoadingOrg ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            {/* Total Clients */}
            <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-blue-300 transition group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Clients</span>
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="text-3xl font-black text-slate-900">{stats.clients}</div>
              <p className="text-[11px] text-slate-500 mt-1 font-medium">Managed client accounts</p>
              <div className="mt-3 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full w-full" />
              </div>
            </div>

            {/* Active Projects */}
            <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-blue-300 transition group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Projects</span>
                <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-100 text-sky-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <FolderKanban className="w-4 h-4" />
                </div>
              </div>
              <div className="text-3xl font-black text-slate-900">{stats.projects}</div>
              <p className="text-[11px] text-slate-500 mt-1 font-medium">Ongoing project milestones</p>
              <div className="mt-3 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-sky-500 rounded-full w-full" />
              </div>
            </div>

            {/* Invoices Issued */}
            <div className="p-5 bg-white border border-orange-200 rounded-2xl shadow-sm hover:border-orange-300 transition group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-orange-800 uppercase tracking-wider">Invoices Issued</span>
                <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <FileText className="w-4 h-4" />
                </div>
              </div>
              <div className="text-3xl font-black text-slate-900">{stats.invoices}</div>
              <p className="text-[11px] text-orange-600 mt-1 font-bold">Invoices in billing lifecycle</p>
              <div className="mt-3 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full w-full" />
              </div>
            </div>

            {/* Team Members */}
            <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-blue-300 transition group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Team Members</span>
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Building className="w-4 h-4" />
                </div>
              </div>
              <div className="text-3xl font-black text-slate-900">{stats.memberships}</div>
              <p className="text-[11px] text-slate-500 mt-1 font-medium">Organization collaborators</p>
              <div className="mt-3 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full w-full" />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Two-Column Recent Activity Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900">Recent Invoices</h2>
            </div>
            <Link
              to="/invoices"
              className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition"
            >
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {isLoadingInvoices ? (
              <div className="py-6 text-center text-xs text-slate-500">Loading invoices...</div>
            ) : (() => {
              const invoices: Invoice[] = Array.isArray(invoicesData) ? invoicesData : (invoicesData?.data || []);
              if (invoices.length === 0) {
                return (
                  <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-200/60 my-2">
                    No invoices created yet.
                  </div>
                );
              }
              return invoices.slice(0, 5).map((inv) => (
                <div key={inv.id} className="py-3.5 flex items-center justify-between">
                  <div>
                    <Link
                      to={`/invoices/${inv.id}`}
                      className="text-xs font-bold text-slate-900 hover:text-blue-600 transition"
                    >
                      {inv.number}
                    </Link>
                    <p className="text-[11px] text-slate-500 truncate max-w-[180px] font-medium">
                      {inv.client?.name || 'Client'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-900">
                      {formatMoney(inv.total, currency)}
                    </span>
                    <InvoiceStatusBadge status={inv.status} />
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>

        {/* Recent Projects Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-orange-600" />
              <h2 className="text-base font-bold text-slate-900">Recent Projects</h2>
            </div>
            <Link
              to="/projects"
              className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 transition"
            >
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {isLoadingProjects ? (
              <div className="py-6 text-center text-xs text-slate-500">Loading projects...</div>
            ) : (() => {
              const projects: Project[] = Array.isArray(projectsData) ? projectsData : (projectsData?.data || []);
              if (projects.length === 0) {
                return (
                  <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-200/60 my-2">
                    No projects created yet.
                  </div>
                );
              }
              return projects.slice(0, 5).map((proj) => (
                <div key={proj.id} className="py-3.5 flex items-center justify-between">
                  <div>
                    <Link
                      to={`/projects/${proj.id}`}
                      className="text-xs font-bold text-slate-900 hover:text-blue-600 transition"
                    >
                      {proj.name}
                    </Link>
                    <p className="text-[11px] text-slate-500 truncate max-w-[180px] font-medium">
                      {proj.client?.name || 'Client'}
                    </p>
                  </div>
                  <ProjectStatusBadge status={proj.status} />
                </div>
              ));
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};
