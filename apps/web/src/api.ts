import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url || '';
    const isLoginRequest = requestUrl.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (location.pathname !== '/login') location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export type Role = 'ADMIN' | 'EMPLOYEE' | 'MANAGER' | 'FINANCE' | 'CC';
export type User = { id: number; email?: string; name: string; role: Role; managerId?: number; isActive?: boolean };
export type AppStatus = 'DRAFT' | 'PENDING_MANAGER' | 'MANAGER_REJECTED' | 'PENDING_FINANCE' | 'FINANCE_REJECTED' | 'APPROVED' | 'WITHDRAWN';
export type Application = {
  id: number;
  applicantId: number;
  influencerName?: string;
  contact?: string;
  amount?: string;
  currency?: string;
  paymentMethod?: string;
  homepage?: string;
  remark?: string;
  status: AppStatus;
  approvalRound: number;
  createdAt: string;
  updatedAt: string;
  applicant: User;
  files: FileItem[];
  tasks: ApprovalTask[];
  actions: ApprovalAction[];
  approvalFlow?: ApprovalFlow;
};
export type FileItem = { id: number; category: string; originalName: string; mimeType: string; size: number; createdAt?: string };
export type ApprovalTask = { id: number; approverId: number; node: string; status: string; comment?: string; createdAt?: string; decidedAt?: string; approver: User };
export type ApprovalAction = { id: number; action: string; node?: string; comment?: string; createdAt: string; actor: User };
export type ApprovalFlow = {
  manager: { node: 'MANAGER'; approvers: Array<Pick<User, 'id' | 'name'>>; tasks: ApprovalTask[] };
  finance: { node: 'FINANCE'; approvers: Array<Pick<User, 'id' | 'name'>>; tasks: ApprovalTask[] };
  cc: { approvers: Array<Pick<User, 'id' | 'name'>> };
};

export function currentUser(): User | null {
  const raw = localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}
