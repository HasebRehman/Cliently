import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { RoleGuard } from '../../components/layout/RoleGuard.js';
import { OrgSettings, OrgMember, PendingInvite } from '../../types/member.js';
import { Role } from '../../types/auth.js';
import { Button } from '../../components/ui/Button.js';
import { Input } from '../../components/ui/Input.js';
import { Select } from '../../components/ui/Select.js';
import { Modal } from '../../components/ui/Modal.js';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.js';
import { RoleBadge } from '../../components/ui/Badge.js';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table.js';
import { TableSkeleton, CardSkeleton } from '../../components/ui/Skeleton.js';
import { ErrorState } from '../../components/ui/ErrorState.js';
import { Pagination } from '../../components/ui/Pagination.js';
import { cn, formatDate, getFriendlyErrorMessage } from '../../lib/utils.js';
import {
  Building2,
  Users,
  Mail,
  Trash2,
  Shield,
  Save,
  Calendar,
  Check,
} from 'lucide-react';

const orgSettingsSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).trim(),
  currency: z.enum(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'NZD']),
  defaultTaxRate: z.coerce.number().min(0).max(100),
  invoicePrefix: z
    .string()
    .min(1, 'Invoice prefix required')
    .max(10)
    .regex(/^[A-Za-z0-9\-_]+$/, 'Only letters, numbers, hyphens, and underscores'),
  logoUrl: z.string().url('Must be a valid URL').refine((u) => u.startsWith('https://'), 'Must use HTTPS').optional().or(z.literal('')),
});

type OrgSettingsFormData = z.infer<typeof orgSettingsSchema>;

const inviteSchema = z.object({
  email: z.string().email('Valid email is required').toLowerCase().trim(),
  role: z.enum(['MEMBER', 'CLIENT']),
});

type InviteFormData = z.infer<typeof inviteSchema>;

export const SettingsPage: React.FC = () => {
  const { activeOrgId, refreshUserData } = useAuth();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'general' | 'members' | 'invites' | 'integrations'>('general');

  // Modals
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [memberToChangeRole, setMemberToChangeRole] = useState<OrgMember | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<OrgMember | null>(null);
  const [inviteToRevoke, setInviteToRevoke] = useState<PendingInvite | null>(null);
  const [newSelectedRole, setNewSelectedRole] = useState<Role>('MEMBER');

  // Fetch current org settings
  const {
    data: orgSettings,
    isLoading: isLoadingOrg,
    error: orgError,
    refetch: refetchOrg,
  } = useQuery({
    queryKey: ['organization', 'current'],
    queryFn: () => api.get<OrgSettings>('/organizations/current'),
  });

  // Fetch organization members (always prefetched for smooth instant tab switching)
  const {
    data: members,
    isLoading: isLoadingMembers,
  } = useQuery({
    queryKey: ['organization', 'members', activeOrgId],
    queryFn: () => api.get<OrgMember[]>('/members'),
    enabled: Boolean(activeOrgId),
  });

  // Fetch pending invites (always prefetched for smooth instant tab switching)
  const {
    data: pendingInvites,
    isLoading: isLoadingInvites,
  } = useQuery({
    queryKey: ['organization', 'invites', activeOrgId],
    queryFn: () => api.get<PendingInvite[]>('/invites'),
    enabled: Boolean(activeOrgId),
  });

  const [membersPage, setMembersPage] = useState(1);
  const [invitesPage, setInvitesPage] = useState(1);
  const pageSize = 10;

  const rawMembers: OrgMember[] = Array.isArray(members) ? members : [];
  const totalMembersPages = Math.ceil(rawMembers.length / pageSize) || 1;
  const paginatedMembers = rawMembers.slice((membersPage - 1) * pageSize, membersPage * pageSize);

  const rawPendingInvites: PendingInvite[] = Array.isArray(pendingInvites) ? pendingInvites : [];
  const totalInvitesPages = Math.ceil(rawPendingInvites.length / pageSize) || 1;
  const paginatedInvites = rawPendingInvites.slice((invitesPage - 1) * pageSize, invitesPage * pageSize);

  // Google Calendar Integration Query
  const {
    data: googleStatus,
  } = useQuery({
    queryKey: ['googleCalendarStatus', activeOrgId],
    queryFn: () => api.get<{ isConnected: boolean; email?: string }>('/meetings/google/status'),
  });

  const disconnectGoogleMutation = useMutation({
    mutationFn: () => api.post('/meetings/google/disconnect', {}),
    onSuccess: () => {
      success('Google Calendar disconnected successfully.');
      queryClient.invalidateQueries({ queryKey: ['googleCalendarStatus'] });
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  // Handle Google OAuth callback on settings page
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      const redirectUri = `${window.location.origin}/settings`;
      api.post('/meetings/google/callback', { code, redirectUri })
        .then(() => {
          success('Google Calendar connected successfully!');
          setActiveTab('integrations');
          queryClient.invalidateQueries({ queryKey: ['googleCalendarStatus'] });
        })
        .catch((err: any) => {
          error(err?.message || 'Failed to complete Google Calendar authorization.');
        })
        .finally(() => {
          window.history.replaceState({}, document.title, window.location.pathname);
        });
    }
  }, [success, error, queryClient]);

  const {
    register: registerOrg,
    handleSubmit: handleSubmitOrg,
    reset: resetOrg,
    formState: { errors: orgErrors, isSubmitting: isSubmittingOrg },
  } = useForm<OrgSettingsFormData>({
    resolver: zodResolver(orgSettingsSchema),
  });

  const {
    register: registerInvite,
    handleSubmit: handleSubmitInvite,
    reset: resetInvite,
    formState: { errors: inviteErrors, isSubmitting: isSubmittingInvite },
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      role: 'MEMBER',
    },
  });

  useEffect(() => {
    if (orgSettings) {
      resetOrg({
        name: orgSettings.name,
        currency: orgSettings.currency as any,
        defaultTaxRate: orgSettings.defaultTaxRate,
        invoicePrefix: orgSettings.invoicePrefix,
        logoUrl: orgSettings.logoUrl || '',
      });
    }
  }, [orgSettings, resetOrg]);

  // Mutations
  const updateOrgMutation = useMutation({
    mutationFn: (data: OrgSettingsFormData) =>
      api.patch('/organizations/current', {
        name: data.name,
        currency: data.currency,
        defaultTaxRate: data.defaultTaxRate,
        invoicePrefix: data.invoicePrefix,
        logoUrl: data.logoUrl || null,
      }),
    onSuccess: async () => {
      success('Organization settings updated');
      await refreshUserData();
      queryClient.invalidateQueries({ queryKey: ['organization', 'current'] });
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  const createInviteMutation = useMutation({
    mutationFn: (data: InviteFormData) => api.post('/invites', data),
    onSuccess: () => {
      success('Invitation email sent!');
      setIsInviteModalOpen(false);
      resetInvite();
      queryClient.invalidateQueries({ queryKey: ['organization', 'invites'] });
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  const updateMemberRoleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: Role }) =>
      api.patch(`/members/${memberId}/role`, { role }),
    onSuccess: () => {
      success('Member role updated successfully');
      setMemberToChangeRole(null);
      queryClient.invalidateQueries({ queryKey: ['organization', 'members'] });
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => api.delete(`/members/${memberId}`),
    onSuccess: () => {
      success('Member removed from organization');
      setMemberToRemove(null);
      queryClient.invalidateQueries({ queryKey: ['organization', 'members'] });
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (inviteId: string) => api.delete(`/invites/${inviteId}`),
    onSuccess: () => {
      success('Invitation revoked successfully');
      setInviteToRevoke(null);
      queryClient.invalidateQueries({ queryKey: ['organization', 'invites'] });
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  return (
    <RoleGuard allowedRoles={['OWNER']}>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Organization Settings</h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Manage organization details, currency defaults, team members, integrations, and pending invitations
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 gap-8 text-sm overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={cn(
              'pb-3.5 flex items-center gap-2 border-b-2 text-sm font-semibold transition cursor-pointer font-heading',
              activeTab === 'general'
                ? 'border-[#535C91] text-[#1B1A55]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            <Building2 className="w-4 h-4" />
            General Profile
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('members')}
            className={cn(
              'pb-3.5 flex items-center gap-2 border-b-2 text-sm font-semibold transition cursor-pointer font-heading',
              activeTab === 'members'
                ? 'border-[#535C91] text-[#1B1A55]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            <Users className="w-4 h-4" />
            Team Members
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('invites')}
            className={cn(
              'pb-3.5 flex items-center gap-2 border-b-2 text-sm font-semibold transition cursor-pointer font-heading',
              activeTab === 'invites'
                ? 'border-[#535C91] text-[#1B1A55]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            <Mail className="w-4 h-4" />
            Pending Invites
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('integrations')}
            className={cn(
              'pb-3.5 flex items-center gap-2 border-b-2 text-sm font-semibold transition cursor-pointer font-heading',
              activeTab === 'integrations'
                ? 'border-[#535C91] text-[#1B1A55]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            <Calendar className="w-4 h-4" />
            Integrations
          </button>
        </div>

        {/* Tab 1: General Organization Profile */}
        {activeTab === 'general' && (
          <div key="general" className="tab-transition bg-white border border-slate-200/90 rounded-2xl p-8 sm:p-9 shadow-xs">
            {isLoadingOrg ? (
              <CardSkeleton />
            ) : orgError ? (
              <ErrorState error={orgError} onRetry={refetchOrg} />
            ) : (
              <form onSubmit={handleSubmitOrg((data) => updateOrgMutation.mutate(data))} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Input
                    label="Organization Name"
                    required
                    error={orgErrors.name?.message}
                    {...registerOrg('name')}
                  />

                  <Select
                    label="Billing Currency"
                    required
                    error={orgErrors.currency?.message}
                    options={[
                      { value: 'USD', label: 'USD ($) - US Dollar' },
                      { value: 'EUR', label: 'EUR (€) - Euro' },
                      { value: 'GBP', label: 'GBP (£) - British Pound' },
                      { value: 'CAD', label: 'CAD (CA$) - Canadian Dollar' },
                      { value: 'AUD', label: 'AUD (AU$) - Australian Dollar' },
                      { value: 'JPY', label: 'JPY (¥) - Japanese Yen' },
                      { value: 'CHF', label: 'CHF - Swiss Franc' },
                      { value: 'NZD', label: 'NZD (NZ$) - New Zealand Dollar' },
                    ]}
                    {...registerOrg('currency')}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    label="Default Tax Rate (%)"
                    required
                    error={orgErrors.defaultTaxRate?.message}
                    {...registerOrg('defaultTaxRate')}
                  />

                  <Input
                    label="Invoice Number Prefix"
                    required
                    placeholder="INV"
                    helperText="e.g. 'INV' produces 'INV-0001'"
                    error={orgErrors.invoicePrefix?.message}
                    {...registerOrg('invoicePrefix')}
                  />
                </div>

                <Input
                  label="Organization Logo URL (HTTPS only)"
                  placeholder="https://example.com/logo.png"
                  error={orgErrors.logoUrl?.message}
                  {...registerOrg('logoUrl')}
                />

                <div className="pt-2 flex justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    isLoading={isSubmittingOrg || updateOrgMutation.isPending}
                    leftIcon={<Save className="w-4 h-4" />}
                    className="px-6 py-2.5 rounded-xl font-semibold shadow-xs cursor-pointer"
                  >
                    Save Settings
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Tab 2: Team Members */}
        {activeTab === 'members' && (
          <div key="members" className="tab-transition bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6 min-h-[380px]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Active Members</h2>
                <p className="text-xs text-slate-500 font-medium">Users with access to this organization</p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsInviteModalOpen(true)}
                leftIcon={<Mail className="w-4 h-4" />}
                className="cursor-pointer font-semibold rounded-xl"
              >
                Invite Member
              </Button>
            </div>

            {isLoadingMembers ? (
              <TableSkeleton rows={3} columns={5} />
            ) : !members || members.length === 0 ? (
              <div className="py-12 text-center bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-xs text-slate-500 font-medium">No members found.</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[28%]">User</TableHead>
                      <TableHead className="w-[30%]">Email</TableHead>
                      <TableHead className="w-[16%]">Role</TableHead>
                      <TableHead className="w-[16%]">Joined</TableHead>
                      <TableHead className="w-[10%] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedMembers.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-bold text-slate-900">
                          {member.user.firstName} {member.user.lastName}
                        </TableCell>
                        <TableCell className="text-slate-600 font-medium">{member.user.email}</TableCell>
                        <TableCell>
                          <RoleBadge role={member.role} />
                        </TableCell>
                        <TableCell className="text-slate-500">{formatDate(member.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Change Role"
                              onClick={() => {
                                setMemberToChangeRole(member);
                                setNewSelectedRole(member.role);
                              }}
                              className="p-1.5 text-slate-500 hover:text-blue-600 cursor-pointer"
                            >
                              <Shield className="w-4 h-4" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              title="Remove Member"
                              onClick={() => setMemberToRemove(member)}
                              className="p-1.5 text-rose-500 hover:text-rose-700 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {rawMembers.length > 0 && (
                  <div className="border-t border-slate-100 pt-2">
                    <Pagination
                      currentPage={membersPage}
                      totalPages={totalMembersPages}
                      totalItems={rawMembers.length}
                      onPageChange={setMembersPage}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab 3: Pending Invites */}
        {activeTab === 'invites' && (
          <div key="invites" className="tab-transition bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6 min-h-[380px]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Pending Invitations</h2>
                <p className="text-xs text-slate-500 font-medium">Invited members who haven't accepted yet</p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsInviteModalOpen(true)}
                leftIcon={<Mail className="w-4 h-4" />}
                className="cursor-pointer font-semibold rounded-xl"
              >
                Send New Invite
              </Button>
            </div>

            {isLoadingInvites ? (
              <TableSkeleton rows={2} columns={4} />
            ) : !pendingInvites || pendingInvites.length === 0 ? (
              <div className="py-12 text-center bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-xs text-slate-500 font-medium">No pending invitations.</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">Email</TableHead>
                      <TableHead className="w-[25%]">Role</TableHead>
                      <TableHead className="w-[25%]">Expires</TableHead>
                      <TableHead className="w-[10%] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedInvites.map((invite) => (
                      <TableRow key={invite.id}>
                        <TableCell className="font-bold text-slate-900">{invite.email}</TableCell>
                        <TableCell>
                          <RoleBadge role={invite.role} />
                        </TableCell>
                        <TableCell className="text-slate-500">{formatDate(invite.expiresAt)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Revoke Invite"
                            onClick={() => setInviteToRevoke(invite)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {rawPendingInvites.length > 0 && (
                  <div className="border-t border-slate-100 pt-2">
                    <Pagination
                      currentPage={invitesPage}
                      totalPages={totalInvitesPages}
                      totalItems={rawPendingInvites.length}
                      onPageChange={setInvitesPage}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab 4: Integrations */}
        {activeTab === 'integrations' && (
          <div key="integrations" className="tab-transition bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Third-Party Integrations</h2>
              <p className="text-xs text-slate-500 mt-1">
                Connect external services to automate calendar syncing, video calls, and attendee notifications.
              </p>
            </div>

            {/* Google Calendar Integration Card */}
            <div className="border border-slate-200 rounded-2xl p-6 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-orange-500 shadow-sm shrink-0">
                  <Calendar className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-sm font-bold text-slate-900">Google Calendar</h3>
                    {googleStatus?.isConnected ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        Connected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-700">
                        Not Connected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 max-w-md">
                    Automatically synchronize scheduled meetings with Google Calendar and dispatch real-time native invitations to all clients and team members.
                  </p>
                  {googleStatus?.isConnected && googleStatus?.email && (
                    <p className="text-[11px] text-slate-500 font-medium">
                      Connected account: <strong className="text-slate-800">{googleStatus.email}</strong>
                    </p>
                  )}
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-3">
                {googleStatus?.isConnected ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-rose-200 text-rose-600 hover:bg-rose-50"
                    isLoading={disconnectGoogleMutation.isPending}
                    onClick={() => {
                      if (window.confirm('Are you sure you want to disconnect Google Calendar?')) {
                        disconnectGoogleMutation.mutate();
                      }
                    }}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-600/25"
                    onClick={async () => {
                      try {
                        const redirectUri = `${window.location.origin}/settings`;
                        const res = await api.get<{ authUrl: string }>(
                          `/meetings/google/auth-url?redirectUri=${encodeURIComponent(redirectUri)}`
                        );
                        const data = (res as any)?.data || res;
                        if (data?.authUrl) {
                          window.location.href = data.authUrl;
                        }
                      } catch (err: any) {
                        error(err?.message || 'Failed to initiate Google Calendar connection.');
                      }
                    }}
                  >
                    Connect Google Calendar
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Send Invite Modal */}
        <Modal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          title="Invite Team Member"
          description="Send an invitation email to join your organization."
          size="sm"
        >
          <form onSubmit={handleSubmitInvite((data) => createInviteMutation.mutate(data))} className="space-y-4">
            <Input
              type="email"
              label="Member Email"
              required
              placeholder="colleague@agency.com"
              error={inviteErrors.email?.message}
              {...registerInvite('email')}
            />

            <Select
              label="Assigned Role"
              required
              error={inviteErrors.role?.message}
              options={[
                { value: 'MEMBER', label: 'Member (Manage clients, projects, invoices)' },
                { value: 'CLIENT', label: 'Client (View assigned projects/invoices)' },
              ]}
              {...registerInvite('role')}
            />

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={() => setIsInviteModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={isSubmittingInvite || createInviteMutation.isPending}
              >
                Send Invite
              </Button>
            </div>
          </form>
        </Modal>

        {/* Change Role Modal */}
        <Modal
          isOpen={Boolean(memberToChangeRole)}
          onClose={() => setMemberToChangeRole(null)}
          title="Update Member Role"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-600 font-medium">
              Change role for{' '}
              <strong className="text-slate-900 font-bold">
                {memberToChangeRole?.user.firstName} {memberToChangeRole?.user.lastName}
              </strong>
            </p>

            <Select
              label="Select Role"
              value={newSelectedRole}
              onChange={(e) => setNewSelectedRole(e.target.value as Role)}
              options={[
                { value: 'OWNER', label: 'OWNER - Full admin access' },
                { value: 'MEMBER', label: 'MEMBER - Client & invoice manager' },
                { value: 'CLIENT', label: 'CLIENT - Client portal only' },
              ]}
            />

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button variant="secondary" onClick={() => setMemberToChangeRole(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                isLoading={updateMemberRoleMutation.isPending}
                onClick={() =>
                  memberToChangeRole &&
                  updateMemberRoleMutation.mutate({
                    memberId: memberToChangeRole.id,
                    role: newSelectedRole,
                  })
                }
              >
                Update Role
              </Button>
            </div>
          </div>
        </Modal>

        {/* Remove Member Confirm Dialog */}
        <ConfirmDialog
          isOpen={Boolean(memberToRemove)}
          onClose={() => setMemberToRemove(null)}
          onConfirm={() => memberToRemove && removeMemberMutation.mutate(memberToRemove.id)}
          title="Remove Member?"
          message={`Are you sure you want to revoke access for ${memberToRemove?.user.firstName} ${memberToRemove?.user.lastName}?`}
          confirmLabel="Remove Member"
          isDestructive={true}
          isLoading={removeMemberMutation.isPending}
        />

        {/* Revoke Invite Confirm Dialog */}
        <ConfirmDialog
          isOpen={Boolean(inviteToRevoke)}
          onClose={() => setInviteToRevoke(null)}
          onConfirm={() => inviteToRevoke && revokeInviteMutation.mutate(inviteToRevoke.id)}
          title="Revoke Invitation?"
          message={`Are you sure you want to revoke the pending invitation for ${inviteToRevoke?.email}?`}
          confirmLabel="Revoke Invite"
          isDestructive={true}
          isLoading={revokeInviteMutation.isPending}
        />
      </div>
    </RoleGuard>
  );
};
