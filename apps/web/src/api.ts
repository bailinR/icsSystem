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
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      location.href = '/login';
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
  applicant: User;
  files: FileItem[];
  tasks: ApprovalTask[];
  actions: ApprovalAction[];
};
export type FileItem = { id: number; category: string; originalName: string; mimeType: string; size: number };
export type ApprovalTask = { id: number; approverId: number; node: string; status: string; comment?: string; decidedAt?: string; approver: User };
export type ApprovalAction = { id: number; action: string; node?: string; comment?: string; createdAt: string; actor: User };

export function currentUser(): User | null {
  const raw = localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}
