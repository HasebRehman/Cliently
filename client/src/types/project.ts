export type ProjectStatus = 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
export type ProjectBillingType = 'ONE_TIME' | 'MILESTONE_BASED';
export type MilestoneStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type MilestoneApprovalStatus = 'PENDING' | 'APPROVED' | 'REVISION_REQUESTED';

export interface Milestone {
  id: string;
  projectId: string;
  organizationId?: string;
  title: string;
  description?: string | null;
  budget?: number | null;
  deadline?: string | null;
  status: MilestoneStatus;
  approvalStatus?: MilestoneApprovalStatus;
  revisionNotes?: string | null;
  revisionCount?: number;
  approvedAt?: string | null;
  order?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  organizationId?: string;
  fileName: string;
  fileUrl: string;
  fileType: 'pdf' | 'word';
  fileSize: number;
  createdAt: string;
  updatedAt?: string;
}

export interface ProjectTeamMember {
  id: string;
  role: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
    avatarUrl?: string | null;
  };
}

export interface ProjectMeetingItem {
  id: string;
  title: string;
  type: string;
  startTime: string;
  endTime?: string | null;
  status: string;
  meetLink?: string | null;
  hostName?: string;
}

export interface Project {
  id: string;
  organizationId: string;
  clientId: string;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  billingType?: ProjectBillingType;
  budget?: number | string | null;
  deadline?: string | null;
  client?: {
    id: string;
    name: string;
    email: string;
    company?: string | null;
    phone?: string | null;
  };
  invoices?: Array<{
    id: string;
    number: string;
    total: number;
    status: string;
    issueDate: string;
    dueDate: string;
  }>;
  summary?: {
    totalBilled: number;
    totalPaid: number;
    totalPending: number;
  };
  files?: ProjectFile[];
  milestones?: Milestone[];
  teamMembers?: ProjectTeamMember[];
  meetings?: ProjectMeetingItem[];
  _count?: {
    invoices: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFileInputPayload {
  fileName: string;
  fileUrl: string;
  fileType: 'pdf' | 'word';
  fileSize: number;
}

export interface MilestoneInputPayload {
  id?: string;
  title: string;
  description?: string | null;
  budget?: number | null;
  deadline?: string | null;
  status?: MilestoneStatus;
}

export interface ProjectInput {
  name: string;
  clientId: string;
  description?: string | null;
  status?: ProjectStatus;
  billingType?: ProjectBillingType;
  budget?: number | string | null;
  deadline?: string | null;
  files?: ProjectFileInputPayload[];
  milestones?: MilestoneInputPayload[];
}
