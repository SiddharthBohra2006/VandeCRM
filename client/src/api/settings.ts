import { api } from './client';
import { Stage, Label, CustomField } from '../types';
import { WorkType } from './work';

export interface Terminology {
  leadSingular: string;
  leadPlural: string;
  recordSingular: string;
  recordPlural: string;
  pipelineName: string;
}

export interface ThemeColors {
  gold: string;
  teal: string;
  background: string;
  surface: string;
  text: string;
}

export interface SettingsResponse {
  ok: true;
  stages: Stage[];
  labels: Label[];
  fields: CustomField[];
  workTypes: WorkType[];
  automations: any[];
  users: { _id: string; name: string; role: string }[];
  organization: any;
  terminology: Terminology;
}

export interface AutomationRule {
  _id: string;
  entityType: 'lead' | 'module';
  workType?: { _id: string; name: string } | string | null;
  name: string;
  trigger: string;
  stage?: { _id: string; name: string } | string | null;
  status?: string;
  conditionField?: string;
  conditionValue?: string;
  action: string;
  targetId?: string | null;
  actionField?: string;
  actionValue?: string;
  runCount?: number;
  isActive?: boolean;
}

export const settingsApi = {
  get: () => api.get<SettingsResponse>('/settings'),

  createStage: (data: Partial<Stage>) => api.post<{ ok: true; data: Stage }>('/settings/stages', data),
  updateStage: (id: string, data: Partial<Stage>) =>
    api.put<{ ok: true; data: Stage }>(`/settings/stages/${id}`, data),
  deleteStage: (id: string) => api.delete<{ ok: true }>(`/settings/stages/${id}`),
  reorderStages: (stageIds: string[]) =>
    api.post<{ ok: true }>('/settings/stages/reorder', { stageIds }),

  createField: (data: Partial<CustomField>) =>
    api.post<{ ok: true; data: CustomField }>('/settings/fields', data),
  updateField: (id: string, data: Partial<CustomField>) =>
    api.put<{ ok: true; data: CustomField }>(`/settings/fields/${id}`, data),
  deleteField: (id: string) => api.delete<{ ok: true }>(`/settings/fields/${id}`),

  createLabel: (data: Partial<Label>) =>
    api.post<{ ok: true; data: Label }>('/settings/labels', data),
  deleteLabel: (id: string) => api.delete<{ ok: true }>(`/settings/labels/${id}`),

  updateTerminology: (data: Terminology) =>
    api.put<{ ok: true; data: Terminology }>('/settings/terminology', data),
  updateTheme: (data: Partial<ThemeColors>) =>
    api.put<{ ok: true; data: ThemeColors }>('/settings/theme', data),

  createWorkType: (data: Partial<WorkType> | Record<string, any>) =>
    api.post<{ ok: true; data: WorkType }>('/settings/work-types', data),
  updateWorkType: (id: string, data: Partial<WorkType> | Record<string, any>) =>
    api.post<{ ok: true; data: WorkType }>(`/settings/work-types/${id}`, data),
  deleteWorkType: (id: string) =>
    api.delete<{ ok: true }>(`/settings/work-types/${id}`),

  createAutomation: (data: Record<string, any>) =>
    api.post<{ ok: true; data: AutomationRule }>('/settings/automations', data),
  toggleAutomation: (id: string) =>
    api.post<{ ok: true; data: AutomationRule }>(`/settings/automations/${id}/toggle`),
  deleteAutomation: (id: string) =>
    api.post<{ ok: true }>(`/settings/automations/${id}/delete`),
};

export interface SetupStep {
  title: string;
  detail: string;
  href: string;
  done: boolean;
  action: string;
  optional?: boolean;
}

export interface SetupPreset {
  label: string;
  stages: { name: string; isWon?: boolean; isLost?: boolean }[];
  labels: string[];
  fields: [string, string?, string[]?][];
}

export interface SetupResponse {
  ok: true;
  title: string;
  company: { _id: string; name: string; website?: string; contactPerson?: string; email?: string; phone?: string } | null;
  steps: SetupStep[];
  completedSteps: number;
  requiredStepCount: number;
  isFirstCompany: boolean;
  leadCount: number;
  hasDemoData: boolean;
  presets: Record<string, SetupPreset>;
}

export const setupApi = {
  get: () => api.get<SetupResponse>('/settings/setup'),
  applyPreset: (preset: string) =>
    api.post<{ ok: true; message: string }>('/settings/setup/preset', { preset, confirm: 'replace' }),
  clearDemo: () => api.post<{ ok: true; message: string }>('/settings/setup/clear-demo'),
  loadDemo: () => api.post<{ ok: true; message: string }>('/settings/setup/load-demo'),
};
