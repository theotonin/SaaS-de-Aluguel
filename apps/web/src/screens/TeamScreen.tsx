import { Plus } from "lucide-react";

import { Heading, labels } from "../components";
import { MemberForm } from "../forms";
import type { Member } from "../types";

export function TeamScreen({
  setForm,
  form,
  saved,
  members,
}: {
  setForm: (value: boolean) => void;
  form: boolean;
  saved: (message: string) => void;
  members: Member[];
}) {
  return (
    <>
      <Heading
        title="Equipe"
        description="Acessos e responsabilidades dentro da sua locadora."
      >
        <button className="primary" onClick={() => setForm(true)}>
          <Plus size={18} />
          Novo integrante
        </button>
      </Heading>
      {form && (
        <MemberForm
          close={() => setForm(false)}
          done={() => saved("Acesso criado.")}
        />
      )}
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Permissão</th>
                <th>Acesso</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="strong">{m.name}</td>
                  <td>{m.email}</td>
                  <td>{labels[m.role] ?? m.role}</td>
                  <td>{m.active ? "Ativo" : "Inativo"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="footnote">
        Atendentes cuidam dos clientes e orçamentos. Operadores organizam
        separação e entrega. Administradores gerenciam a operação e os acessos.
      </p>
    </>
  );
}
