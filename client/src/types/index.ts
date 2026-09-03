export interface Customer {
  _id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  source: string;
  value: number;
  priority: 'low' | 'medium' | 'high';
  leadScore: number;
  stage: { _id: string; name: string; color: string; isWon?: boolean; isLost?: boolean };
  labels: { _id: string; name: string; color: string }[];
  assignedTo: { _id: string; name: string } | null;
  clientCompany: { _id: string; name: string } | null;
  campaign: { _id: string; name: string } | null;
  notes: string;
  customData: Record<string, any>;
  nextFollowUpAt: string | null;
  lastContactedAt: string | null;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
  createdAt: string;
  updatedAt: string;
}

export interface Stage {
  _id: string;
  name: string;
  key: string;
  color: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
  isDefault: boolean;
  isActive: boolean;
}

export interface Label {
  _id: string;
  name: string;
  color: string;
  isHighPotential: boolean;
  isActive: boolean;
}

export interface CustomField {
  _id: string;
  key: string;
  label: string;
  type: string;
  options: string[];
  required: boolean;
  order: number;
}

export interface PaginatedResponse<T> {
  ok: true;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalResults: number;
  };
}

export interface LeadStats {
  totalLeads: number;
  newLeads: number;
  qualifiedLeads: number;
  hotLeads: number;
  overdueLeads: number;
}

// Create/Update payload shape for customers.
// Relational fields are sent as IDs (strings), unlike the populated Customer view model.
export interface CustomerInput {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  source?: string;
  value?: number;
  priority?: 'low' | 'medium' | 'high';
  stage?: string;
  labels?: string[];
  assignedTo?: string;
  clientCompany?: string;
  campaign?: string;
  notes?: string;
  customData?: Record<string, any>;
}
