import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from '../modules/auth/auth.routes.js';
import organizationRoutes from '../modules/organization/org.routes.js';
import memberRoutes from '../modules/members/member.routes.js';
import inviteRoutes from '../modules/invites/invite.routes.js';
import clientRoutes from '../modules/clients/client.routes.js';
import projectRoutes from '../modules/projects/project.routes.js';
import invoiceRoutes from '../modules/invoices/invoice.routes.js';
import chatRoutes from '../modules/chat/chat.routes.js';
import meetingRoutes from '../modules/meetings/meeting.routes.js';
import taskRoutes from '../modules/tasks/task.routes.js';

const apiRouter = Router();

// 1. Health Endpoints
apiRouter.use('/health', healthRoutes);

// 2. Authentication & Session Endpoints
apiRouter.use('/auth', authRoutes);

// 3. Organization Endpoints
apiRouter.use('/organizations', organizationRoutes);

// 4. Organization Members Endpoints (mounted under /organizations/current/members & /members)
apiRouter.use('/organizations/current/members', memberRoutes);
apiRouter.use('/members', memberRoutes);

// 5. Invites Endpoints
apiRouter.use('/invites', inviteRoutes);

// 6. Clients Endpoints
apiRouter.use('/clients', clientRoutes);

// 7. Projects Endpoints
apiRouter.use('/projects', projectRoutes);

// 8. Invoices Endpoints
apiRouter.use('/invoices', invoiceRoutes);

// 9. Chat Endpoints
apiRouter.use('/chat', chatRoutes);

// 10. Meetings Endpoints
apiRouter.use('/meetings', meetingRoutes);

// 11. Tasks Endpoints
apiRouter.use('/tasks', taskRoutes);

// Root API welcome endpoint
apiRouter.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'Welcome to the Cliently Multi-Tenant API',
    version: '1.0.0',
    docs: '/api/v1/health',
  });
});

export default apiRouter;
