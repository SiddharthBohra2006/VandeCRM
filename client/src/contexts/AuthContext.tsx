import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authApi, User, Company, WorkType, CrmTerms } from '../api/auth';

interface AuthState {
  user: User | null;
  token: string | null;
  companies: Company[];
  activeCompany: Company | null;
  crmTerms: CrmTerms;
  workTypes: WorkType[];
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  switchCompany: (companyId: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('crm_token'));
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [crmTerms, setCrmTerms] = useState<CrmTerms>({
    leadSingular: 'Lead', leadPlural: 'Leads',
    recordSingular: 'Client', recordPlural: 'Clients',
    pipelineName: 'Sales pipeline',
  });
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    try {
      const res = await authApi.me();
      setUser(res.user);
      setCompanies(res.companies);
      setActiveCompany(res.activeCompany);
      setCrmTerms(res.crmTerms);
      setWorkTypes(res.workTypes);
    } catch {
      logout();
    }
  }, []);

  useEffect(() => {
    if (token) {
      loadUser().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  async function login(email: string, password: string) {
    const res = await authApi.login(email, password);
    localStorage.setItem('crm_token', res.token);
    setToken(res.token);
    setUser(res.user);
    setActiveCompany(res.activeCompany);
    // Reload full context
    await loadUser();
  }

  function logout() {
    localStorage.removeItem('crm_token');
    setToken(null);
    setUser(null);
    setCompanies([]);
    setActiveCompany(null);
  }

  async function switchCompany(companyId: string) {
    const res = await authApi.switchCompany(companyId);
    localStorage.setItem('crm_token', res.token);
    setToken(res.token);
    setActiveCompany(res.activeCompany);
    await loadUser();
  }

  return (
    <AuthContext.Provider value={{ user, token, companies, activeCompany, crmTerms, workTypes, loading, login, logout, switchCompany, refreshUser: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
