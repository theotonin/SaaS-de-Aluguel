import {mutationRecovery,type PendingMutation} from './mutation-recovery';
import { matchesSearch } from "./search";
import type { Screen } from "./types";
import { accessibleAccent } from "./branding";
import { OverviewScreen } from "./screens/OverviewScreen";
import { TodayScreen } from './screens/TodayScreen';
import { FinanceReportScreen } from './screens/FinanceReportScreen';
import { AgendaScreen } from "./screens/AgendaScreen";
import { ReservationsScreen } from "./screens/ReservationsScreen";
import { CustomersScreen } from "./screens/CustomersScreen";
import { MaterialsScreen } from "./screens/MaterialsScreen";
import { TeamScreen } from "./screens/TeamScreen";
import { CompaniesScreen } from "./screens/CompaniesScreen";
import { AuditScreen } from "./screens/AuditScreen";
import { Login } from "./screens/Login";
import { Brand } from "./screens/Brand";
import { RentalDetail } from "./screens/RentalDetail";
import { useEffect, useState, type CSSProperties } from "react";
import {
  LayoutDashboard,
  Clock3,
  WalletCards,
  CalendarDays,
  ClipboardList,
  Package,
  Users,
  UserRoundCog,
  Building2,
  ShieldCheck,
  ArrowLeft,
  LogOut,
  RotateCcw,
  Check,
  X,
} from "lucide-react";
import { request, isDemo, demo, setCsrf } from "./api";
import { Empty, labels } from "./components";
import { RentalForm } from "./forms";
import type {
  User,
  Customer,
  Item,
  Rental,
  Company,
  Member,
  Audit,
  PageInfo,
  PageResponse,
  TodaySummary,
  OverviewSummary,
} from "./types";

const nav = [
  { id: "overview", name: "Visão geral", icon: LayoutDashboard },
  { id: 'today', name: 'Hoje', icon: Clock3 },
  { id: 'finance', name: 'Financeiro', icon: WalletCards },
  { id: "agenda", name: "Agenda", icon: CalendarDays },
  { id: "rentals", name: "Reservas", icon: ClipboardList },
  { id: "items", name: "Materiais", icon: Package },
  { id: "customers", name: "Clientes", icon: Users },
  { id: "team", name: "Equipe", icon: UserRoundCog },
] as const;
const adminNav = [
  { id: "companies", name: "Empresas", icon: Building2 },
  { id: "audit", name: "Auditoria", icon: ShieldCheck },
] as const;

export function App() {
  const [pending,setPending]=useState<PendingMutation|null>(mutationRecovery.pending());
  const [detailLocked,setDetailLocked]=useState(false);
  const [checking,setChecking]=useState(false);
  const operationLocked=detailLocked||!!pending;
  useEffect(()=>mutationRecovery.subscribe(()=>setPending(mutationRecovery.pending())),[]);
  const [user, setUser] = useState<User | null>(demo?.session() ?? null),
    [authLoading, setAuthLoading] = useState(!isDemo);
  const [screen, setScreen] = useState<Screen>("overview"),
    [revision, setRevision] = useState(0);
  const [customers, setCustomers] = useState<Customer[]>([]),
    [items, setItems] = useState<Item[]>([]),
    [rentals, setRentals] = useState<Rental[]>([]);
  const [today, setToday] = useState<TodaySummary>({pickups:[],returns:[],overdue:[],maintenance:[]});
  const [overview, setOverview] = useState<OverviewSummary>({active_count:0,open_count:0,active_value:'0',materials:0,upcoming:[],latest:[]});
  const [listPages,setListPages]=useState<Record<'customers'|'items'|'rentals',PageInfo>>({customers:{page:1,limit:50,total:0,pages:1},items:{page:1,limit:50,total:0,pages:1},rentals:{page:1,limit:50,total:0,pages:1}});
  const [companies, setCompanies] = useState<Company[]>([]),
    [members, setMembers] = useState<Member[]>([]),
    [audit, setAudit] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [form, setForm] = useState(false),
    [editingItem, setEditingItem] = useState<Item | null>(null),
    [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [selected, setSelected] = useState<Rental | null>(null),
    [query, setQuery] = useState(""),
    [statusFilter, setStatusFilter] = useState("all");
  useEffect(()=>{mutationRecovery.setIdentity(user?.organization_id?{userId:user.id,organizationId:user.organization_id}:null);},[user]);
  useEffect(() => {
    if (!isDemo)
      request<User>("/auth/me")
        .then(async (u) => {
          setCsrf(u.csrf);
          if(u.organization_id&&!mutationRecovery.identityMatches({userId:u.id,organizationId:u.organization_id})){await request('/auth/logout','POST');setCsrf('');return;}
          setUser(u);mutationRecovery.setIdentity(u.organization_id?{userId:u.id,organizationId:u.organization_id}:null);
          const op=mutationRecovery.pending();if(op){setSelected(await request('/rentals/'+op.path.split('/')[2]));setScreen('detail');}
        })
        .catch(() => {})
        .finally(() => setAuthLoading(false));
    const expire = () => {
      if (!isDemo) {
        setUser(null);
        setCsrf("");
      }
    };
    window.addEventListener("session-expired", expire);
    return () => window.removeEventListener("session-expired", expire);
  }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setError("");
    const tasks =
      user.role === "superadmin"
        ? Promise.all([
            request<Company[]>("/admin/companies"),
            request<Audit[]>("/admin/audit"),
          ]).then(([c, a]) => {
            if (active) {
              setCompanies(c);
              setAudit(a);
            }
          })
        : Promise.all([
            request<PageResponse<Customer>>("/customers?page=1&limit=50"),
            request<PageResponse<Item>>("/items?page=1&limit=50"),
            request<PageResponse<Rental>>("/rentals?page=1&limit=50"),
            request<OverviewSummary>('/overview'),
            request<TodaySummary>('/today'),
            user.role === "admin"
              ? request<Member[]>("/team")
              : Promise.resolve([]),
          ]).then(([c, i, r, summary, daily, m]) => {
            if (active) {
              setCustomers(c.items);
              setItems(i.items);
              setRentals(r.items);
              setOverview(summary);
              setToday(daily);
              setListPages({customers:c,items:i,rentals:r});
              setMembers(m);
            }
          });
    tasks
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, revision]);
  useEffect(()=>{
    const resource=screen==='customers'?'customers':screen==='items'?'items':screen==='rentals'?'rentals':null;
    if(!user||!resource||user.role==='superadmin')return;
    let current=true;
    const timer=window.setTimeout(()=>{
      const params=new URLSearchParams({page:String(listPages[resource].page),limit:'50',search:query});
      if(resource==='rentals')params.set('status',statusFilter);
      request<PageResponse<Customer|Item|Rental>>(`/${resource}?${params}`).then(response=>{
        if(!current)return;
        setListPages(value=>({...value,[resource]:response}));
        if(resource==='customers')setCustomers(response.items as Customer[]);
        else if(resource==='items')setItems(response.items as Item[]);
        else setRentals(response.items as Rental[]);
      }).catch(e=>{if(current)setError((e as Error).message);});
    },250);
    return()=>{current=false;window.clearTimeout(timer);};
  },[user,screen,query,statusFilter,listPages.customers.page,listPages.items.page,listPages.rentals.page]);
  function setListPage(resource:'customers'|'items'|'rentals',page:number){setListPages(value=>({...value,[resource]:{...value[resource],page}}));}
  function setListSearch(value:string){setQuery(value);setListPages(pages=>({customers:{...pages.customers,page:1},items:{...pages.items,page:1},rentals:{...pages.rentals,page:1}}));}
  function go(next: Screen) {
    if(operationLocked)return;
    setScreen(next);
    setForm(false);
    setQuery("");
    setListPages(pages=>({customers:{...pages.customers,page:1},items:{...pages.items,page:1},rentals:{...pages.rentals,page:1}}));
    setNotice("");
    setEditingItem(null);
    setEditingCompany(null);
  }
  async function signedIn(u: User) {
    if(mutationRecovery.pending()&&(!u.organization_id||!mutationRecovery.identityMatches({userId:u.id,organizationId:u.organization_id}))){await request('/auth/logout','POST');setCsrf('');throw new Error('Entre com a mesma empresa e conta da operação pendente para conferir o resultado.');}
    mutationRecovery.setIdentity(u.organization_id?{userId:u.id,organizationId:u.organization_id}:null);setUser(u);
    const op=mutationRecovery.pending();if(op){setSelected(await request('/rentals/'+op.path.split('/')[2]));setScreen('detail');}else go(u.role==='superadmin'?'companies':'overview');
  }
  async function reconcile(replay:boolean){
    const op=mutationRecovery.pending();if(!op||op.inFlight||checking)return;setChecking(true);setError('');
    try{
      if(replay&&op.body!==undefined)await request(op.path,'POST',op.body,op.key);
      else{const result=await request<{found:boolean}>('/operations/'+op.key);mutationRecovery.confirmLookup(op.key,result);window.dispatchEvent(new CustomEvent('mutation-resolved',{detail:{key:op.key}}));}
      setSelected(await request('/rentals/'+op.path.split('/')[2]));setScreen('detail');setRevision(v=>v+1);setNotice('Conferência concluída. Consulte o histórico antes de registrar novos valores.');
    }catch(e){setError((e as Error).message);}finally{setChecking(false);}
  }
  function saved(message: string) {
    setForm(false);
    setEditingItem(null);
    setEditingCompany(null);
    setRevision((v) => v + 1);
    setNotice(message);
  }
  async function openRental(rental: Rental) {
    try {
      setSelected(await request("/rentals/" + rental.id));
      go("detail");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const admin = user?.role === "superadmin";
  const effectiveScreen =
    admin && !["companies", "audit"].includes(screen) ? "companies" : screen;
  const canQuote = user?.role === "admin" || user?.role === "attendant";
  if (authLoading)
    return (
      <div className="boot" role="status">
        Abrindo Tonin Loca…
      </div>
    );
  if (!user) return <Login onLogin={signedIn} />;
  const navigation = admin
    ? adminNav
    : nav.filter((n) => (n.id !== "team" || user.role === "admin") && (n.id !== 'finance' || ['admin','attendant'].includes(user.role)));
  const matches = (text: string) => matchesSearch(text, query);
  function setRentalStatusFilter(value:string){setStatusFilter(value);setListPages(pages=>({...pages,rentals:{...pages.rentals,page:1}}));}
  const activeRentals = rentals.filter(
    (r) =>
      !["draft", "sent", "canceled", "closed", "returned"].includes(r.status),
  );
  const upcoming = [...activeRentals].sort(
    (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at),
  );
  return (
    <div
      className="app-shell"
      style={
        user.organization
          ? ({
              "--accent": accessibleAccent(user.organization.accent),
            } as CSSProperties)
          : undefined
      }
    >
      <a className="skip-link" href="#main">
        Ir para o conteúdo
      </a>
        {isDemo && (
          <section className="demo-tools" aria-label="Controles da demonstração">
            <span>

              Demonstração · dados fictícios neste navegador
            </span>
            <details className="demo-options"><summary>Perfis e opções</summary><p>Login e perfis são simulados. Alterações ficam somente neste navegador.</p><div className="demo-actions">
              <label>
                Perfil simulado
                <select
                  aria-label="Perfil simulado"
                  disabled={operationLocked}
                  value={user.role}
                  onChange={(e) => {
                    demo!.selectRole(e.target.value as User["role"]);
                    signedIn(demo!.session());
                  }}
                >
                  <option value="admin">Locadora</option>
                  <option value="operator">Operador</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </label>
              <button
                className="secondary"
                disabled={operationLocked}
                onClick={() => {
                  if (
                    window.confirm(
                      "Restaurar os exemplos? As alterações feitas nesta demonstração serão apagadas neste navegador.",
                    )
                  ) {
                    demo!.reset();
                    signedIn(demo!.session());
                    setRevision((v) => v + 1);
                  }
                }}
              >
                <RotateCcw size={15} />
                Restaurar demonstração
              </button>
            </div></details>
          </section>
        )}
      <header className="app-header"><Brand /><span className="header-company">{admin ? "Administração Tonin" : user.organization?.name}</span><span className="header-profile">{user.name} · {labels[user.role]}</span>          {!isDemo && (
            <button
              className="secondary header-action"
              aria-label="Sair da conta"
              disabled={operationLocked}
              onClick={async () => {
                try {
                  await request("/auth/logout", "POST");
                  setUser(null);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <LogOut size={18} /> Sair
            </button>
          )}
</header>
      <aside className="sidebar">
        <div className="workspace">
          <span className="workspace-icon">
            {admin ? <ShieldCheck size={20} /> : <Building2 size={20} />}
          </span>
          <div>
            <strong>
              {admin ? "Administração Tonin" : user.organization?.name}
            </strong>
            <small>{admin ? "Gestão da plataforma" : "Sua locadora"}</small>
          </div>
        </div>
        <nav aria-label="Navegação principal">
          {navigation.map((n) => (
            <button
              key={n.id}
              className={
                effectiveScreen === n.id ? "nav-item selected" : "nav-item"
              }
              aria-current={effectiveScreen===n.id ? "page" : undefined}
              disabled={operationLocked}
              onClick={() => go(n.id as Screen)}
            >
              <n.icon size={19} />
              {n.name}
              {n.id === "rentals" && activeRentals.length > 0 && (
                <span className="nav-count">{activeRentals.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="avatar">{user.name[0]}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{labels[user.role]}</small>
          </div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <span>
            {navigation.find((n) => n.id === effectiveScreen)?.name ??
              "Reservas"}
          </span>
          <time>
            {new Intl.DateTimeFormat("pt-BR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
              timeZone: "America/Sao_Paulo",
            }).format(new Date())}
          </time>
        </header>
        <main id="main" tabIndex={-1}>
          {notice && (
            <div className="notice" role="status">
              <Check size={18} />
              {notice}
              <button
                className="icon-button"
                aria-label="Fechar aviso"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {error && (
            <div className="error-block" role="alert">
              <p>{error}</p>
              <button
                className="secondary"
                onClick={() => setRevision((v) => v + 1)}
              >
                Tentar novamente
              </button>
            </div>
          )}
          {pending&&<section className="panel operation-recovery" aria-label="Conferência de envio pendente"><h2>Confirme o envio anterior</h2><p>{pending.inFlight?'Aguardando a resposta do envio.':'O resultado precisa ser conferido antes de registrar outra operação. Se você recarregou a página, preencha abaixo exatamente os dados do envio anterior; a mesma chave será usada para evitar duplicidade.'}</p><small>Operação {pending.key}</small><div className="form-actions">{pending.body!==undefined&&<button className="primary" disabled={pending.inFlight||checking} onClick={()=>void reconcile(true)}>Confirmar mesmo envio</button>}<button className="secondary" disabled={pending.inFlight||checking} onClick={()=>void reconcile(false)}>Conferir operação no servidor</button></div></section>}
          {loading ? (
            <div className="loading" role="status">
              Carregando sua operação…
            </div>
          ) : error ? null : (
            <>
              {effectiveScreen === "overview" && (
                <OverviewScreen
                  canQuote={canQuote}
                  go={go}
                  summary={overview}
                  openRental={openRental}
                />
              )}
              {effectiveScreen === 'today' && <TodayScreen today={today} openRental={openRental}/>}
              {effectiveScreen === 'finance' && <FinanceReportScreen/>}
              {effectiveScreen === "agenda" && (
                <AgendaScreen
                  activeRentals={activeRentals}
                  openRental={openRental}
                />
              )}
              {effectiveScreen === "rentals" && (
                <ReservationsScreen
                  canQuote={canQuote}
                  go={go}
                  query={query}
                  setQuery={setListSearch}
                  statusFilter={statusFilter}
                  setStatusFilter={setRentalStatusFilter}
                  rentals={rentals}
                  matches={matches}
                  openRental={openRental}
                  pageInfo={listPages.rentals}
                  onPage={page=>setListPage('rentals',page)}
                />
              )}
              {effectiveScreen === "quote" && (
                <>
                  <button
                    className="text-button back"
                    onClick={() => go("rentals")}
                  >
                    <ArrowLeft size={17} />
                    Voltar às reservas
                  </button>
                  {!customers.length || !items.length ? (
                    <Empty title="Prepare seu primeiro orçamento">
                      Cadastre pelo menos um cliente e um material antes de
                      montar a proposta.
                      <div className="empty-actions">
                        <button
                          className="secondary"
                          onClick={() => go("customers")}
                        >
                          Cadastrar cliente
                        </button>
                        <button
                          className="secondary"
                          onClick={() => go("items")}
                        >
                          Cadastrar material
                        </button>
                      </div>
                    </Empty>
                  ) : (
                    <RentalForm
                      customers={customers}
                      items={items}
                      close={() => go("rentals")}
                      done={(r) => {
                        setSelected(r);
                        setRevision((v) => v + 1);
                        go("detail");
                        setNotice(
                          "Orçamento salvo. Confira os dados e confirme a reserva quando estiver tudo certo.",
                        );
                      }}
                    />
                  )}
                </>
              )}
              {effectiveScreen === "detail" && selected && (
                <RentalDetail
                  rental={selected}
                  user={user}
                  onOperationLock={setDetailLocked}
                  back={() => go("rentals")}
                  changed={(r) => {
                    setSelected(r);
                    setRevision((v) => v + 1);
                    setNotice(
                      r.status === "confirmed"
                        ? "Reserva confirmada."
                        : "Etapa atualizada.",
                    );
                  }}
                />
              )}
              {effectiveScreen === "customers" && (
                <CustomersScreen
                  canQuote={canQuote}
                  setForm={setForm}
                  form={form}
                  saved={saved}
                  customers={customers}
                  matches={matches}
                  query={query}
                  setQuery={setListSearch}
                  pageInfo={listPages.customers}
                  onPage={page=>setListPage('customers',page)}
                />
              )}
              {effectiveScreen === "items" && (
                <MaterialsScreen
                  user={user}
                  setEditingItem={setEditingItem}
                  setForm={setForm}
                  form={form}
                  editingItem={editingItem}
                  saved={saved}
                  items={items}
                  matches={matches}
                  query={query}
                  setQuery={setListSearch}
                  pageInfo={listPages.items}
                  onPage={page=>setListPage('items',page)}
                />
              )}
              {effectiveScreen === "team" && (
                <TeamScreen
                  setForm={setForm}
                  form={form}
                  saved={saved}
                  members={members}
                />
              )}
              {effectiveScreen === "companies" && (
                <CompaniesScreen
                  setForm={setForm}
                  setEditingCompany={setEditingCompany}
                  form={form}
                  editingCompany={editingCompany}
                  saved={saved}
                  companies={companies}
                  signedIn={signedIn}
                />
              )}
              {effectiveScreen === "audit" && <AuditScreen audit={audit} />}
            </>
          )}
          <footer className="page-footer">
            <span>Tonin Loca</span>
            <span>
              {isDemo
                ? "Alterações salvas somente neste navegador. Não use dados reais."
                : "Gestão de locações para festas e eventos."}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
