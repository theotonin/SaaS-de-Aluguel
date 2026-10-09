import { useState, type FormEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import { request, setCsrf } from "../api";
import { TextField } from "../components";

import type { User } from "../types";
import { Brand } from "./Brand";

export function Login({ onLogin }: { onLogin: (user: User) => void | Promise<void> }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const u = await request<User>("/auth/login", "POST", {
        email: f.get("email"),
        password: f.get("password"),
      });
      setCsrf(u.csrf);
      await onLogin(u);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-screen">
      <div className="login-brand">
        <Brand />
        <p>
          Da primeira proposta
          <br />
          ao último material devolvido.
        </p>
        <span>Gestão de locações para quem faz a festa acontecer.</span>
      </div>
      <section className="login-panel">
        <h1>Entre na sua conta</h1>
        <p>Use o acesso fornecido pela sua empresa.</p>
        <form onSubmit={submit}>
          <TextField
            label="E-mail"
            name="email"
            type="email"
            required
            autoComplete="username"
          />
          <TextField
            label="Senha"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            maxLength={128}
          />
          <button className="primary" disabled={busy}>
            {busy ? "Entrando…" : "Entrar no Tonin Loca"}
            <ArrowUpRight size={18} />
          </button>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </form>
        <small>
          Precisa de acesso? Fale com o administrador da sua empresa.
        </small>
      </section>
    </div>
  );
}
