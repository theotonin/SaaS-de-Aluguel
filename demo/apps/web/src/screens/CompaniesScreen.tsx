import { Plus, ExternalLink } from "lucide-react";
import { isDemo, demo } from "../api";
import { Heading, Empty } from "../components";
import { CompanyForm } from "../forms";
import type { User, Company } from "../types";

export function CompaniesScreen({
  setForm,
  setEditingCompany,
  form,
  editingCompany,
  saved,
  companies,
  signedIn,
}: {
  setForm: (value: boolean) => void;
  setEditingCompany: (company: Company | null) => void;
  form: boolean;
  editingCompany: Company | null;
  saved: (message: string) => void;
  companies: Company[];
  signedIn: (user: User) => void;
}) {
  return (
    <>
      <Heading
        title="Empresas"
        description="Gerencie contas, identidade visual, planos e acesso à plataforma."
      >
        <button
          className="primary"
          onClick={() => {
            setEditingCompany(null);
            setForm(true);
          }}
        >
          <Plus size={18} />
          Nova empresa
        </button>
      </Heading>
      {form && (
        <CompanyForm
          key={editingCompany?.id ?? "new"}
          company={editingCompany}
          close={() => setForm(false)}
          done={() => saved("Empresa salva.")}
        />
      )}
      <section className="panel">
        {companies.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Plano</th>
                  <th>Limites</th>
                  <th>Acesso</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="strong company-name">
                        <span
                          className="company-dot"
                          style={{ backgroundColor: c.accent }}
                        />
                        {c.name}
                      </span>
                      <small className="cell-note">{c.slug}</small>
                    </td>
                    <td>{c.plan}</td>
                    <td>
                      {c.user_limit} usuários · {c.item_limit} materiais
                    </td>
                    <td>
                      <span
                        className={
                          "badge " +
                          (c.status === "active" ? "confirmed" : "canceled")
                        }
                      >
                        {c.status === "active" ? "Ativo" : "Suspenso"}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="text-button"
                          onClick={() => {
                            setEditingCompany(c);
                            setForm(true);
                          }}
                        >
                          Configurar
                          <span className="sr-only"> {c.name}</span>
                        </button>
                        {isDemo && (
                          <button
                            className="text-button"
                            aria-label={"Explorar " + c.name}
                            onClick={() => {
                              demo!.selectCompany(c.id);
                              signedIn(demo!.session());
                            }}
                          >
                            Explorar
                            <ExternalLink size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Cadastre a primeira locadora"
            action={() => setForm(true)}
          >
            Crie uma empresa e o acesso inicial do administrador.
          </Empty>
        )}
      </section>
      <p className="footnote">
        Os planos definem limites de acesso. A cobrança da assinatura será
        administrada manualmente no piloto.
      </p>
    </>
  );
}
