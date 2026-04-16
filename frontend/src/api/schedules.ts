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
  shiftType: 'NIGHTSHIFT' | 'OPD' | 'ER' | 'SPECIAL_CLINIC';
  assignments: ShiftAssignment[];
}

export interface ScheduleDoctor {
  id: string;
  user: User;
}

export interface Schedule {
  id: string;
  title: string;
  month: number;
  year: number;
  status: 'DRAFT' | 'PUBLISHED';
  doctors: ScheduleDoctor[];
  shifts: Shift[];
}

export interface ShiftCount {
  user: User;
  NIGHTSHIFT: number;
  OPD: number;
  ER: number;
  SPECIAL_CLINIC: number;
  total: number;
}

export const schedulesApi = {
  getAll: (year?: number) =>
    api.get<Schedule[]>('/schedules', { params: year ? { year } : {} }),

  getOne: (id: string) =>
    api.get<Schedule>(`/schedules/${id}`),

  create: (month: number, year: number, doctorIds?: string[]) =>
    api.post<Schedule>('/schedules', { month, year, doctorIds }),

  generate: (id: string) =>
    api.post<Schedule>(`/schedules/${id}/generate`),

  publish: (id: string) =>
    api.put(`/schedules/${id}/publish`),

  unpublish: (id: string) =>
    api.put(`/schedules/${id}/draft`),

  remove: (id: string) =>
    api.delete(`/schedules/${id}`),

  assignDoctor: (scheduleId: string, shiftId: string, userId: string) =>
    api.post(`/schedules/${scheduleId}/shifts/${shiftId}/assign`, { userId }),

  unassignDoctor: (scheduleId: string, shiftId: string, userId: string) =>
    api.delete(`/schedules/${scheduleId}/shifts/${shiftId}/assign/${userId}`),

  getShiftCount: (id: string) =>
    api.get<ShiftCount[]>(`/schedules/${id}/shift-count`),
};

export const usersApi = {
  getDoctors: () => api.get<User[]>('/users/doctors'),
  create: (firstName: string, lastName: string) =>
    api.post<User>('/users', { firstName, lastName }),
  update: (id: string, firstName: string, lastName: string) =>
    api.put<User>(`/users/${id}`, { firstName, lastName }),
  remove: (id: string) => api.delete(`/users/${id}`),
};
