import { Heading, Empty, date } from "../components";

import type { Audit } from "../types";

export function AuditScreen({ audit }: { audit: Audit[] }) {
  return (
    <>
      <Heading
        title="Auditoria administrativa"
        description="Histórico de criação e configuração das empresas."
      />
      <section className="panel">
        {audit.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Empresa</th>
                  <th>Ação</th>
                  <th>Responsável</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a, i) => (
                  <tr key={i}>
                    <td>{date(a.created_at)}</td>
                    <td>{a.company}</td>
                    <td>
                      {a.action === "company.created"
                        ? "Empresa criada"
                        : "Configuração alterada"}
                    </td>
                    <td>{a.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Nenhuma alteração registrada">
            As próximas criações e configurações de empresas aparecerão aqui.
          </Empty>
        )}
      </section>
    </>
  );
}
