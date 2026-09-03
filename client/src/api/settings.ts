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
  organization: any;
  terminology: Terminology;
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
};
