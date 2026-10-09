import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '../../lib/apiClient.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { OrgMember, PendingInvite } from '../../types/member.js';
import { Project } from '../../types/project.js';
import { Button } from '../../components/ui/Button.js';
import { Input } from '../../components/ui/Input.js';
import { Modal } from '../../components/ui/Modal.js';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.js';
import { RoleBadge, PortalStatusBadge } from '../../components/ui/Badge.js';
import { ErrorState } from '../../components/ui/ErrorState.js';
import { Pagination } from '../../components/ui/Pagination.js';
import { formatDate, getFriendlyErrorMessage, cn } from '../../lib/utils.js';
import {
  Users,
  Search,
  Trash2,
  MailPlus,
  Plus,
  Pencil,
  FolderKanban,
  ChevronDown,
  Check,
} from 'lucide-react';

const teamMemberFormSchema = z.object({
  name: z.string().min(1, 'Member name is required').max(150, 'Name too long').trim(),
  email: z.string().min(1, 'Email is required').email('Valid email is required').toLowerCase().trim(),
  phone: z.string().max(50, 'Phone too long').trim().optional().or(z.literal('')),
  projectId: z.string().optional().or(z.literal('')),
});

type TeamMemberFormData = z.infer<typeof teamMemberFormSchema>;

const editMemberFormSchema = z.object({
  phone: z.string().max(50, 'Phone too long').trim().optional().or(z.literal('')),
  projectId: z.string().optional().or(z.literal('')),
});

type EditMemberFormData = z.infer<typeof editMemberFormSchema>;

export const TeamPage: React.FC = () => {
  const { currentRole, activeOrgId } = useAuth();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'MEMBERS' | 'INVITED'>('MEMBERS');
  const [membersPage, setMembersPage] = useState(1);
  const [invitesPage, setInvitesPage] = useState(1);
  const pageSize = 10;

  // Modals
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState<OrgMember | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<OrgMember | null>(null);
  const [inviteToRevoke, setInviteToRevoke] = useState<PendingInvite | null>(null);

  // Fetch active team members
  const {
    data: members,
    isLoading: isLoadingMembers,
    isError: isErrorMembers,
    error: membersError,
    refetch: refetchMembers,
  } = useQuery({
    queryKey: ['organization', 'members', activeOrgId],
    queryFn: () => api.get<OrgMember[]>('/members'),
  });

  // Fetch pending invites
  const {
    data: pendingInvites,
    isLoading: isLoadingInvites,
  } = useQuery({
    queryKey: ['organization', 'invites', activeOrgId],
    queryFn: () => api.get<PendingInvite[]>('/invites'),
    enabled: currentRole === 'OWNER',
  });

  // Fetch all projects for the organization (for the project assignment dropdown)
  const { data: projectsData } = useQuery({
    queryKey: ['projects', { limit: 100 }],
    queryFn: () => api.get<{ data: Project[] }>('/projects?limit=100'),
    enabled: isInviteModalOpen || isEditModalOpen,
  });

  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  const [isEditProjectDropdownOpen, setIsEditProjectDropdownOpen] = useState(false);
  const editProjectDropdownRef = useRef<HTMLDivElement>(null);

  // Add Member Form
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TeamMemberFormData>({
    resolver: zodResolver(teamMemberFormSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      projectId: '',
    },
  });

  const selectedProjectId = watch('projectId');

  // Edit Member Form
  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    reset: resetEdit,
    setValue: setValueEdit,
    watch: watchEdit,
    formState: { errors: errorsEdit, isSubmitting: isSubmittingEdit },
  } = useForm<EditMemberFormData>({
    resolver: zodResolver(editMemberFormSchema),
    defaultValues: {
      phone: '',
      projectId: '',
    },
  });

  const editSelectedProjectId = watchEdit('projectId');

  // Open edit modal helper
  const handleOpenEditModal = (member: OrgMember) => {
    setMemberToEdit(member);
    resetEdit({
      phone: member.user?.phone || '',
      projectId: member.projectId || member.project?.id || '',
    });
    setIsEditProjectDropdownOpen(false);
    setIsEditModalOpen(true);
  };

  // Click outside listener for project dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setIsProjectDropdownOpen(false);
      }
      if (editProjectDropdownRef.current && !editProjectDropdownRef.current.contains(e.target as Node)) {
        setIsEditProjectDropdownOpen(false);
      }
    };
    if (isProjectDropdownOpen || isEditProjectDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProjectDropdownOpen, isEditProjectDropdownOpen]);

  // Mutations
  const createInviteMutation = useMutation({
    mutationFn: (data: TeamMemberFormData) =>
      api.post('/invites', {
        email: data.email,
        name: data.name || undefined,
        phone: data.phone || undefined,
        role: 'MEMBER',
        projectId: data.projectId || undefined,
      }),
    onSuccess: () => {
      success('Team member invitation sent successfully!');
      setIsInviteModalOpen(false);
      reset();
      queryClient.invalidateQueries({ queryKey: ['organization', 'invites'] });
      queryClient.invalidateQueries({ queryKey: ['organization', 'members'] });
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  const updateMemberMutation = useMutation({
    mutationFn: ({ memberId, data }: { memberId: string; data: EditMemberFormData }) =>
      api.patch(`/members/${memberId}`, {
        phone: data.phone !== undefined ? (data.phone.trim() || null) : null,
        projectId: data.projectId || null,
      }),
    onSuccess: () => {
      success('Team member updated successfully!');
      setIsEditModalOpen(false);
      setMemberToEdit(null);
      queryClient.invalidateQueries({ queryKey: ['organization', 'members'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) => {
      error(getFriendlyErrorMessage(err));
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => api.delete(`/members/${memberId}`),
    onSuccess: () => {
      success('Team member removed from organization');
      setMemberToRemove(null);
      queryClient.invalidateQueries({ queryKey: ['organization', 'members'] });
      queryClient.invalidateQueries({ queryKey: ['organization', 'current'] });
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

  const isOwner = currentRole === 'OWNER';

  // Filter team members (OWNER and MEMBER) — exclude CLIENT
  const rawMembers: OrgMember[] = Array.isArray(members) ? members : [];
  const teamMembers = rawMembers
    .filter((m) => m.role === 'OWNER' || m.role === 'MEMBER')
    .sort((a, b) => {
      if (a.role === 'OWNER') return -1;
      if (b.role === 'OWNER') return 1;
      return 0;
    });

  // Filter pending team member invites only
  const rawInvites: PendingInvite[] = Array.isArray(pendingInvites) ? pendingInvites : [];
  const teamInvites = rawInvites.filter((inv) => inv.role === 'MEMBER');

  const filteredMembers = teamMembers.filter((m) => {
    const fullName = `${m.user.firstName || ''} ${m.user.lastName || ''}`.toLowerCase();
    const email = (m.user.email || '').toLowerCase();
    const query = search.toLowerCase();
    return !search || fullName.includes(query) || email.includes(query);
  });

  const filteredInvites = teamInvites.filter((inv) => {
    const email = (inv.email || '').toLowerCase();
    const query = search.toLowerCase();
    return !search || email.includes(query);
  });

  const totalMembersPages = Math.ceil(filteredMembers.length / pageSize) || 1;
  const paginatedMembers = filteredMembers.slice((membersPage - 1) * pageSize, membersPage * pageSize);

  const totalInvitesPages = Math.ceil(filteredInvites.length / pageSize) || 1;
  const paginatedInvites = filteredInvites.slice((invitesPage - 1) * pageSize, invitesPage * pageSize);

  const projects = projectsData?.data || [];

  return (
    <div className="space-y-6 pb-10">
      {/* 1. Header Banner - Brand Theme */}
      <div className="rounded-2xl bg-[#070F2B] border border-[#1B1A55] p-6 sm:p-7 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
          <div className="space-y-1.5 max-w-xl">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-heading">
              Team Members
            </h1>
            <p className="text-xs sm:text-sm text-[#9290C3] leading-relaxed">
              Manage your workspace team members, invitations, and access permissions in one place.
            </p>
          </div>

          {isOwner && (
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  reset({ name: '', email: '', phone: '', projectId: '' });
                  setIsInviteModalOpen(true);
                }}
                leftIcon={<Plus className="w-4 h-4" />}
                className="bg-[#535C91] hover:bg-[#434b7a] text-white font-bold shadow-md shadow-[#070F2B]/60 px-5 py-2.5 rounded-xl cursor-pointer font-heading border border-[#535C91]/60"
              >
                Add Team Member
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Filter Toolbar - Pure White Surface */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white border border-slate-200/90 rounded-2xl shadow-md shadow-slate-200/80">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search team members by name or email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setMembersPage(1);
              setInvitesPage(1);
            }}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#535C91] focus:ring-2 focus:ring-[#535C91]/20 focus:bg-white transition-all font-medium"
          />
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200/80 w-full sm:w-auto overflow-x-auto no-scrollbar">
          {[
            { key: 'MEMBERS', label: `Team Members (${teamMembers.length})` },
            ...(isOwner ? [{ key: 'INVITED', label: `Pending Invites (${teamInvites.length})` }] : []),
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key as any);
                setMembersPage(1);
                setInvitesPage(1);
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer font-heading ${
                activeTab === tab.key
                  ? 'bg-[#070F2B] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table Content - Persistent Table Structure */}
      {isErrorMembers ? (
        <ErrorState error={membersError} onRetry={refetchMembers} />
      ) : activeTab === 'INVITED' ? (
        /* Pending Invites View */
        <div key="INVITED" className="tab-transition w-full rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-md shadow-slate-200/80 min-h-[380px] flex flex-col justify-between">
          <div className="w-full overflow-x-auto overflow-y-auto no-scrollbar max-h-[500px]">
            <table className="w-full min-w-[850px] table-fixed text-left border-collapse">
              <thead className="bg-[#070F2B] border-b border-[#1B1A55] sticky top-0 z-10 shadow-xs">
                <tr className="text-[11px] font-bold text-slate-100 uppercase tracking-wider font-heading">
                  <th className="w-[36%] px-5 py-4">Invitee Email</th>
                  <th className="w-[18%] px-4 py-4">Role</th>
                  <th className="w-[18%] px-4 py-4">Status</th>
                  <th className="w-[16%] px-4 py-4">Expires On</th>
                  <th className="w-[12%] px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {isLoadingInvites ? (
                  Array.from({ length: 3 }).map((_, idx) => (
                    <tr key={`invite-skel-${idx}`} className="animate-pulse">
                      <td className="px-5 py-4">
                        <div className="h-4 bg-slate-200 rounded w-44" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-5 bg-slate-100 rounded-full w-20" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-5 bg-slate-100 rounded-full w-20" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-3.5 bg-slate-200 rounded w-24" />
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="h-7 bg-slate-100 rounded-lg w-10 ml-auto" />
                      </td>
                    </tr>
                  ))
                ) : filteredInvites.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-20 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3 max-w-sm mx-auto">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                          <MailPlus className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-800">
                            No pending team invitations
                          </h3>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                            {search
                              ? `No pending invites matched "${search}".`
                              : "You don't have any outstanding team invitations."}
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedInvites.map((invite) => (
                    <tr key={invite.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-4 font-bold text-slate-900 truncate">
                        {invite.email}
                      </td>
                      <td className="px-4 py-4">
                        <RoleBadge role={invite.role} />
                      </td>
                      <td className="px-4 py-4">
                        <PortalStatusBadge status="INVITED" />
                      </td>
                      <td className="px-4 py-4 text-slate-600 text-xs">
                        {formatDate(invite.expiresAt)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Revoke Invitation"
                          title="Revoke Invitation"
                          onClick={() => setInviteToRevoke(invite)}
                          className="p-1.5 text-rose-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filteredInvites.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-2 bg-slate-50/50">
              <Pagination
                currentPage={invitesPage}
                totalPages={totalInvitesPages}
                totalItems={filteredInvites.length}
                onPageChange={setInvitesPage}
              />
            </div>
          )}
        </div>
      ) : (
        /* Team Members View */
        <div key="MEMBERS" className="tab-transition w-full rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-md shadow-slate-200/80 min-h-[380px] flex flex-col justify-between">
          <div className="w-full overflow-x-auto overflow-y-auto no-scrollbar max-h-[500px]">
            <table className="w-full min-w-[850px] table-fixed text-left border-collapse">
              <thead className="bg-[#070F2B] border-b border-[#1B1A55] sticky top-0 z-10 shadow-xs">
                <tr className="text-[11px] font-bold text-slate-100 uppercase tracking-wider font-heading">
                  {isOwner ? (
                    <>
                      <th className="w-[22%] px-5 py-4">User</th>
                      <th className="w-[24%] px-4 py-4">Email</th>
                      <th className="w-[14%] px-4 py-4">Role</th>
                      <th className="w-[13%] px-4 py-4">Status</th>
                      <th className="w-[13%] px-4 py-4">Joined Date</th>
                      <th className="w-[14%] px-5 py-4 text-right">Actions</th>
                    </>
                  ) : (
                    <>
                      <th className="w-[26%] px-5 py-4">User</th>
                      <th className="w-[28%] px-4 py-4">Email</th>
                      <th className="w-[16%] px-4 py-4">Role</th>
                      <th className="w-[15%] px-4 py-4">Status</th>
                      <th className="w-[15%] px-4 py-4">Joined Date</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {isLoadingMembers ? (
                  Array.from({ length: 4 }).map((_, idx) => (
                    <tr key={`member-skel-${idx}`} className="animate-pulse">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-200 shrink-0" />
                          <div className="h-4 bg-slate-200 rounded w-28" />
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-3.5 bg-slate-200 rounded w-36" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-5 bg-slate-100 rounded-full w-20" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-5 bg-slate-100 rounded-full w-20" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-3.5 bg-slate-200 rounded w-24" />
                      </td>
                      {isOwner && (
                        <td className="px-5 py-4 text-right">
                          <div className="h-7 bg-slate-100 rounded-lg w-8 ml-auto" />
                        </td>
                      )}
                    </tr>
                  ))
                ) : filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={isOwner ? 6 : 5} className="py-16 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3 max-w-sm mx-auto">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                          <Users className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-800">
                            No team members found
                          </h3>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                            {search
                              ? `No team members matched "${search}".`
                              : 'Add your team members to collaborate on projects, client management, and invoices.'}
                          </p>
                        </div>
                        {isOwner && !search && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setIsInviteModalOpen(true)}
                            leftIcon={<Plus className="w-4 h-4 text-blue-600" />}
                            className="mt-2 font-bold cursor-pointer"
                          >
                            Add Team Member
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedMembers.map((member) => {
                    const initials = `${member.user?.firstName?.[0] || ''}${member.user?.lastName?.[0] || ''}`.toUpperCase() || 'U';
                    const joinedDate = member.createdAt || (member as any).joinedAt || (member.user as any)?.createdAt;

                    return (
                      <tr key={member.id} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-sm">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 truncate">
                                {member.user?.firstName} {member.user?.lastName}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-slate-600 font-medium truncate">{member.user?.email}</td>
                        <td className="px-4 py-4">
                          <RoleBadge role={member.role} />
                        </td>
                        <td className="px-4 py-4">
                          <PortalStatusBadge status="ACTIVE" hasPortalAccess={true} />
                        </td>
                        <td className="px-4 py-4 text-slate-600">{formatDate(joinedDate)}</td>
                        {isOwner && (
                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {member.role !== 'OWNER' ? (
                                <>
                                  <button
                                    type="button"
                                    aria-label="Edit team member"
                                    title="Edit Team Member"
                                    onClick={() => handleOpenEditModal(member)}
                                    className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="Remove team member"
                                    title="Remove Team Member"
                                    onClick={() => setMemberToRemove(member)}
                                    className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4 text-rose-500" />
                                  </button>
                                </>
                              ) : (
                                <span className="text-xs text-slate-400 font-semibold italic pr-1">Workspace Owner</span>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {filteredMembers.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-2 bg-slate-50/50">
              <Pagination
                currentPage={membersPage}
                totalPages={totalMembersPages}
                totalItems={filteredMembers.length}
                onPageChange={setMembersPage}
              />
            </div>
          )}
        </div>
      )}

      {/* Add Team Member Modal */}
      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        title="Add Team Member"
        description="Enter team member information and optionally assign a project."
        size="lg"
      >
        <form onSubmit={handleSubmit((data) => createInviteMutation.mutate(data))} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Team Member Name"
              required
              placeholder="Sarah Connor / Alex Smith"
              error={errors.name?.message}
              {...register('name')}
            />
            <Input
              type="email"
              label="Email Address"
              required
              placeholder="colleague@example.com"
              error={errors.email?.message}
              {...register('email')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Phone Number (Optional)"
              placeholder="+1 (555) 000-0000"
              error={errors.phone?.message}
              {...register('phone')}
            />

            {/* Custom Project Assignment Dropdown */}
            <div className="space-y-1.5" ref={projectDropdownRef}>
              <label className="block text-xs font-semibold text-slate-700 tracking-wide uppercase">
                Assigned Project (Optional)
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
                  className={cn(
                    "w-full flex items-center justify-between px-3.5 py-2.5 bg-white border rounded-xl text-sm font-medium transition-all text-left cursor-pointer",
                    "focus:outline-none focus:ring-4 focus:ring-blue-500/15",
                    isProjectDropdownOpen
                      ? "border-blue-600 ring-4 ring-blue-500/15"
                      : "border-slate-300 hover:border-slate-400"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <div className="w-6 h-6 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                      <FolderKanban className="w-3.5 h-3.5 text-blue-600" />
                    </div>
                    <span className={cn("truncate text-sm", selectedProjectId ? "text-slate-900 font-semibold" : "text-slate-400")}>
                      {projects.find((p) => p.id === selectedProjectId)
                        ? `${projects.find((p) => p.id === selectedProjectId)?.name}${
                            projects.find((p) => p.id === selectedProjectId)?.client
                              ? ` (${projects.find((p) => p.id === selectedProjectId)?.client?.name})`
                              : ''
                          }`
                        : "Select a project (Optional)"}
                    </span>
                  </div>
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200",
                      isProjectDropdownOpen && "rotate-180 text-blue-600"
                    )}
                  />
                </button>

                {isProjectDropdownOpen && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden p-1.5 max-h-56 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
                    <button
                      type="button"
                      onClick={() => {
                        setValue('projectId', '', { shouldValidate: true });
                        setIsProjectDropdownOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer",
                        !selectedProjectId
                          ? "bg-blue-50 text-blue-700 font-semibold"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      )}
                    >
                      <span className="text-slate-500 italic">No project assigned</span>
                      {!selectedProjectId && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                    </button>

                    {projects.length > 0 && <div className="h-px bg-slate-100 my-1" />}

                    {projects.map((p) => {
                      const isSelected = selectedProjectId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setValue('projectId', p.id, { shouldValidate: true });
                            setIsProjectDropdownOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer",
                            isSelected
                              ? "bg-blue-50 text-blue-700 font-semibold"
                              : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <FolderKanban className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className="truncate">{p.name}</span>
                            {p.client && (
                              <span className="text-[11px] text-slate-400 font-normal shrink-0">
                                ({p.client.name})
                              </span>
                            )}
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
            Assigned Role: <strong className="text-slate-900 font-bold">MEMBER</strong> (Collaborator with access to clients, projects, and invoices).
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setIsInviteModalOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting || createInviteMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-600/25 cursor-pointer"
            >
              Add Team Member
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Team Member Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setMemberToEdit(null);
        }}
        title="Edit Team Member"
        description="Update team member phone number and assigned project."
        size="lg"
      >
        {memberToEdit && (
          <form
            onSubmit={handleSubmitEdit((data) =>
              updateMemberMutation.mutate({ memberId: memberToEdit.id, data })
            )}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Read-only Member Name */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 tracking-wide uppercase">
                  Team Member Name
                </label>
                <input
                  type="text"
                  disabled
                  value={`${memberToEdit.user?.firstName || ''} ${memberToEdit.user?.lastName || ''}`.trim() || 'Team Member'}
                  className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-semibold text-slate-500 cursor-not-allowed select-none"
                />
                <p className="text-[11px] text-slate-400 font-medium">Name cannot be changed directly.</p>
              </div>

              {/* Read-only Email */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 tracking-wide uppercase">
                  Email Address
                </label>
                <input
                  type="email"
                  disabled
                  value={memberToEdit.user?.email || ''}
                  className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-semibold text-slate-500 cursor-not-allowed select-none"
                />
                <p className="text-[11px] text-slate-400 font-medium">Email cannot be changed directly.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Phone Number"
                placeholder="+1 (555) 000-0000"
                error={errorsEdit.phone?.message}
                {...registerEdit('phone')}
              />

              {/* Custom Project Assignment Dropdown */}
              <div className="space-y-1.5" ref={editProjectDropdownRef}>
                <label className="block text-xs font-semibold text-slate-700 tracking-wide uppercase">
                  Assigned Project
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsEditProjectDropdownOpen(!isEditProjectDropdownOpen)}
                    className={cn(
                      "w-full flex items-center justify-between px-3.5 py-2.5 bg-white border rounded-xl text-sm font-medium transition-all text-left cursor-pointer",
                      "focus:outline-none focus:ring-4 focus:ring-blue-500/15",
                      isEditProjectDropdownOpen
                        ? "border-blue-600 ring-4 ring-blue-500/15"
                        : "border-slate-300 hover:border-slate-400"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div className="w-6 h-6 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                        <FolderKanban className="w-3.5 h-3.5 text-blue-600" />
                      </div>
                      <span className={cn("truncate text-sm", editSelectedProjectId ? "text-slate-900 font-semibold" : "text-slate-400")}>
                        {projects.find((p) => p.id === editSelectedProjectId)
                          ? `${projects.find((p) => p.id === editSelectedProjectId)?.name}${
                              projects.find((p) => p.id === editSelectedProjectId)?.client
                                ? ` (${projects.find((p) => p.id === editSelectedProjectId)?.client?.name})`
                                : ''
                            }`
                          : "No project assigned"}
                      </span>
                    </div>
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200",
                        isEditProjectDropdownOpen && "rotate-180 text-blue-600"
                      )}
                    />
                  </button>

                  {isEditProjectDropdownOpen && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden p-1.5 max-h-56 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
                      <button
                        type="button"
                        onClick={() => {
                          setValueEdit('projectId', '', { shouldValidate: true });
                          setIsEditProjectDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer",
                          !editSelectedProjectId
                            ? "bg-blue-50 text-blue-700 font-semibold"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        )}
                      >
                        <span className="text-slate-500 italic">No project assigned</span>
                        {!editSelectedProjectId && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                      </button>

                      {projects.length > 0 && <div className="h-px bg-slate-100 my-1" />}

                      {projects.map((p) => {
                        const isSelected = editSelectedProjectId === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setValueEdit('projectId', p.id, { shouldValidate: true });
                              setIsEditProjectDropdownOpen(false);
                            }}
                            className={cn(
                              "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer",
                              isSelected
                                ? "bg-blue-50 text-blue-700 font-semibold"
                                : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0 pr-2">
                              <FolderKanban className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span className="truncate">{p.name}</span>
                              {p.client && (
                                <span className="text-[11px] text-slate-400 font-normal shrink-0">
                                  ({p.client.name})
                                </span>
                              )}
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setMemberToEdit(null);
                }}
                disabled={isSubmittingEdit}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={isSubmittingEdit || updateMemberMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-600/25 cursor-pointer"
              >
                Save Changes
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Remove Member Dialog */}
      <ConfirmDialog
        isOpen={Boolean(memberToRemove)}
        onClose={() => setMemberToRemove(null)}
        onConfirm={() => memberToRemove && removeMemberMutation.mutate(memberToRemove.id)}
        title="Remove Team Member?"
        message={`Are you sure you want to revoke access for ${memberToRemove?.user?.firstName} ${memberToRemove?.user?.lastName} (${memberToRemove?.user?.email})?`}
        confirmLabel="Remove Member"
        isDestructive={true}
        isLoading={removeMemberMutation.isPending}
      />

      {/* Revoke Invite Dialog */}
      <ConfirmDialog
        isOpen={Boolean(inviteToRevoke)}
        onClose={() => setInviteToRevoke(null)}
        onConfirm={() => inviteToRevoke && revokeInviteMutation.mutate(inviteToRevoke.id)}
        title="Revoke Invitation?"
        message={`Are you sure you want to cancel the pending invitation for ${inviteToRevoke?.email}?`}
        confirmLabel="Revoke Invite"
        isDestructive={true}
        isLoading={revokeInviteMutation.isPending}
      />
    </div>
  );
};

export default TeamPage;
