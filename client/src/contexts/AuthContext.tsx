import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authApi, User, Company, WorkType, CrmTerms } from '../api/auth';
import { ApiError } from '../api/client';

const DEFAULT_THEME = { gold: '#ffcc00', teal: '#0d0d0d', background: '#020605', surface: '#0d1117', text: '#e6e6e6' };

interface AuthState {
  user: User | null;
  token: string | null;
  companies: Company[];
  activeCompany: Company | null;
  crmTerms: CrmTerms;
  workTypes: WorkType[];
  loading: boolean;
  sessionExpired: boolean;
  dismissSessionExpired: () => void;
  authBootError: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: { name: string; email: string; password: string; orgName: string }) => Promise<void>;
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
  const [sessionExpired, setSessionExpired] = useState(false);
  const [authBootError, setAuthBootError] = useState(false);

  const dismissSessionExpired = useCallback(() => setSessionExpired(false), []);

  // Any 401 from the shared fetch wrapper reconciles the expired session here.
  // We do NOT logout/unmount immediately so mounted pages keep unsaved drafts;
  // the app shell shows a session-expired prompt and the user chooses to re-login.
  useEffect(() => {
    const onExpired = () => setSessionExpired(true);
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const applyTheme = useCallback((theme?: User['organization']['theme']) => {
    const root = document.documentElement;

    // A locally saved preset wins over the organization theme, matching the
    // EJS head bootstrap precedence (local preset > org theme > default).
    // index.html already applied the preset synchronously, so just keep it.
    let savedPreset: unknown = null;
    try {
      savedPreset = localStorage.getItem('theme-preset');
    } catch {
      savedPreset = null;
    }
    if (savedPreset) {
      root.classList.toggle('dark-theme', root.getAttribute('data-theme') === 'dark');
      return;
    }

    // No org theme: keep whatever the index.html head bootstrap already applied
    // from localStorage (theme-preset / ui-density). Never clobber the saved
    // preset during logout or on the public auth pages.
    if (!theme) {
      root.setAttribute('data-theme', root.dataset.theme || 'dark');
      root.classList.toggle('dark-theme', root.getAttribute('data-theme') === 'dark');
      return;
    }

    const t = {
      gold: theme?.gold || DEFAULT_THEME.gold,
      teal: theme?.teal || DEFAULT_THEME.teal,
      background: theme?.background || DEFAULT_THEME.background,
      surface: theme?.surface || DEFAULT_THEME.surface,
      text: theme?.text || DEFAULT_THEME.text,
    };
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

  // White-label the browser tab title per tenant.
  useEffect(() => {
    document.title = user?.organization?.name ? `${user.organization.name} CRM` : 'CRM';
  }, [user]);

  const loadUser = useCallback(async () => {
    setAuthBootError(false);
    try {
      const res = await authApi.me();
      setUser(res.user);
      setCompanies(res.companies);
      setActiveCompany(res.activeCompany);
      setCrmTerms(res.crmTerms);
      setWorkTypes(res.workTypes);
    } catch (err) {
      // Only an explicit 401 means the token is gone. Transient 500/network
      // failures must NOT log the user out (offline startup, hiccups mid-use).
      if (err instanceof ApiError && err.status === 401) {
        logout();
      } else {
        setAuthBootError(true);
      }
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
    setSessionExpired(false);
    setToken(res.token);
    setUser(res.user);
    setActiveCompany(res.activeCompany);
    // Reload full context
    await loadUser();
  }

  async function signup(data: { name: string; email: string; password: string; orgName: string }) {
    const res = await authApi.signup(data);
    localStorage.setItem('crm_token', res.token);
    setSessionExpired(false);
    setToken(res.token);
    setUser(res.user);
    setActiveCompany(res.activeCompany);
    await loadUser();
  }

  function logout() {
    localStorage.removeItem('crm_token');
    setToken(null);
    setUser(null);
    setCompanies([]);
    setActiveCompany(null);
    setSessionExpired(false);
  }

  async function switchCompany(companyId: string) {
    const res = await authApi.switchCompany(companyId);
    localStorage.setItem('crm_token', res.token);
    setToken(res.token);
    setActiveCompany(res.activeCompany);
    await loadUser();
  }

  return (
    <AuthContext.Provider value={{ user, token, companies, activeCompany, crmTerms, workTypes, loading, sessionExpired, dismissSessionExpired, authBootError, login, signup, logout, switchCompany, refreshUser: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
