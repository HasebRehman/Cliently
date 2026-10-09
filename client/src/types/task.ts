export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'REVIEW' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface TaskAssignee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl?: string | null;
}

export interface TaskProject {
  id: string;
  name: string;
  status: string;
  billingType?: string;
}

export interface TaskCreator {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface Task {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | null;
  estimatedHours?: number | null;
  order: number;
  aiGenerated: boolean;
  createdById?: string | null;
  assigneeId?: string | null;
  createdAt: string;
  updatedAt: string;
  project?: TaskProject;
  assignee?: TaskAssignee | null;
  createdBy?: TaskCreator | null;
}

export interface CreateTaskPayload {
  projectId: string;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  estimatedHours?: number | null;
  assigneeId?: string | null;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  estimatedHours?: number | null;
  assigneeId?: string | null;
  order?: number;
}

export interface SuggestedAiTask {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  estimatedHours: number;
  dueDate: string;
  status: TaskStatus;
  projectId: string;
  projectName: string;
  assigneeId?: string | null;
  selected?: boolean;
}

export interface GenerateAiTasksResponse {
  projectId: string;
  projectName: string;
  analyzedFilesCount: number;
  suggestedTasks: SuggestedAiTask[];
}
