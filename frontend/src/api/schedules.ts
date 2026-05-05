import api from './client';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
}

export interface ShiftAssignment {
  id: string;
  user: User;
}

export interface Shift {
  id: string;
  date: string;
  shiftType: string;
  assignments: ShiftAssignment[];
}

export interface ScheduleDoctor {
  id: string;
  user: User;
  confirmedAt?: string | null;
}

export interface ShiftTypeConfig {
  id: string;
  name: string;
  days: string; // "0,1,2,3,4,5,6" — comma-separated getDay() values
  order: number;
}

export interface Schedule {
  id: string;
  title: string;
  month: number;
  year: number;
  status: 'DRAFT' | 'PUBLISHED';
  createdAt?: string;
  updatedAt?: string;
  doctors: ScheduleDoctor[];
  shifts: Shift[];
  shiftTypes: ShiftTypeConfig[];
}

export interface ShiftCount {
  user: User;
  total: number;
  [shiftType: string]: number | User;
}

export interface ActivityLog {
  id: string;
  scheduleId: string;
  actorId: string | null;
  action: string;
  detail: string;
  createdAt: string;
  actor: User | null;
}

// Helper: ส่ง actorId ผ่าน header
const actorHeaders = () => {
  const id = localStorage.getItem('shiftly:myUserId');
  return id ? { 'X-Actor-Id': id } : {};
};

export const schedulesApi = {
  getAll: (year?: number) =>
    api.get<Schedule[]>('/schedules', { params: year ? { year } : {} }),

  getOne: (id: string) =>
    api.get<Schedule>(`/schedules/${id}`),

  create: (month: number, year: number, doctorIds?: string[], shiftTypes?: { name: string; days: number[] }[]) =>
    api.post<Schedule>('/schedules', { month, year, doctorIds, shiftTypes }, { headers: actorHeaders() }),

  generate: (id: string) =>
    api.post<Schedule>(`/schedules/${id}/generate`, null, { headers: actorHeaders() }),

  publish: (id: string) =>
    api.put(`/schedules/${id}/publish`, null, { headers: actorHeaders() }),

  unpublish: (id: string) =>
    api.put(`/schedules/${id}/draft`, null, { headers: actorHeaders() }),

  remove: (id: string) =>
    api.delete(`/schedules/${id}`),

  assignDoctor: (scheduleId: string, shiftId: string, userId: string) =>
    api.post(`/schedules/${scheduleId}/shifts/${shiftId}/assign`, { userId }, { headers: actorHeaders() }),

  unassignDoctor: (scheduleId: string, shiftId: string, userId: string) =>
    api.delete(`/schedules/${scheduleId}/shifts/${shiftId}/assign/${userId}`, { headers: actorHeaders() }),

  getShiftCount: (id: string) =>
    api.get<ShiftCount[]>(`/schedules/${id}/shift-count`),

  toggleConfirm: (scheduleId: string, userId: string) =>
    api.post(`/schedules/${scheduleId}/doctors/${userId}/confirm`),

  getLogs: (id: string) =>
    api.get<ActivityLog[]>(`/schedules/${id}/logs`),
};

export const usersApi = {
  getDoctors: () => api.get<User[]>('/users/doctors'),
  create: (firstName: string, lastName: string) =>
    api.post<User>('/users', { firstName, lastName }),
  update: (id: string, firstName: string, lastName: string) =>
    api.put<User>(`/users/${id}`, { firstName, lastName }),
  remove: (id: string) => api.delete(`/users/${id}`),
};
