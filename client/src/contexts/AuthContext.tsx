import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authApi, User, Company, WorkType, CrmTerms } from '../api/auth';

const DEFAULT_THEME = { gold: '#ffcc00', teal: '#0d0d0d', background: '#020605', surface: '#0d1117', text: '#e6e6e6' };

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

  const applyTheme = useCallback((theme?: User['organization']['theme']) => {
    const t = {
      gold: theme?.gold || DEFAULT_THEME.gold,
      teal: theme?.teal || DEFAULT_THEME.teal,
      background: theme?.background || DEFAULT_THEME.background,
      surface: theme?.surface || DEFAULT_THEME.surface,
      text: theme?.text || DEFAULT_THEME.text,
    };
    const root = document.documentElement;
    const rgb = String(t.background).match(/[a-f\d]{2}/gi);
    const isLight = !!rgb && rgb.length >= 3 &&
      rgb.slice(0, 3).reduce((sum: number, v: string) => sum + parseInt(v, 16), 0) > 382;
    root.setAttribute('data-theme', isLight ? 'light' : 'dark');
    root.classList.toggle('dark-theme', !isLight);
    const st = root.style;
    st.setProperty('--gold', t.gold);
    st.setProperty('--gold-hover', t.gold);
    st.setProperty('--teal', t.teal);
    st.setProperty('--bg', t.background);
    st.setProperty('--panel', t.surface);
    st.setProperty('--panel-2', t.surface);
    st.setProperty('--text', t.text);
    st.setProperty('--bg-soft', `color-mix(in srgb, ${t.background} 92%, ${t.text})`);
    st.setProperty('--panel-muted', `color-mix(in srgb, ${t.surface} 95%, ${t.text})`);
    st.setProperty('--input', `color-mix(in srgb, ${t.surface} 96%, ${t.text})`);
    st.setProperty('--border', `color-mix(in srgb, ${t.surface} 88%, ${t.text})`);
    st.setProperty('--border-strong', `color-mix(in srgb, ${t.surface} 80%, ${t.text})`);
    st.setProperty('--muted', `color-mix(in srgb, ${t.surface} 45%, ${t.text})`);
    st.setProperty('--sub', `color-mix(in srgb, ${t.surface} 30%, ${t.text})`);
    st.setProperty('--hover', `color-mix(in srgb, ${t.surface} 94%, ${t.text})`);
    st.setProperty('--accent-text', '#fff6d6');
  }, []);

  useEffect(() => {
    if (user?.organization?.theme) {
      applyTheme(user.organization.theme);
    } else {
      applyTheme(undefined);
    }
  }, [user, applyTheme]);

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
