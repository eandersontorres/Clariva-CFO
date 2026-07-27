// ─── favo-sso.js — cole este arquivo em CADA app destino ────────────────────
//
// Consome o handoff de sessao vindo do My Favo Team (app.favo.team).
// Sem dependencia: e um modulo ES puro, ~60 linhas, zero import.
//
// INSTALACAO (apps que usam o padrao fetch-direto: CEO, Admin, Kitchen, ...)
//
//   1. copie este arquivo pra src/lib/favoSso.js
//   2. em src/main.jsx, ANTES do createRoot:
//
//        import { consumeFavoHandoff } from "./lib/favoSso.js";
//        consumeFavoHandoff("clariva_ceo_session");   // a SESSION_KEY do app
//
//   Pronto. Se o usuario veio do Hub, o app ja acorda logado; se veio direto,
//   a funcao devolve null e nada muda.
//
// APPS QUE USAM @supabase/supabase-js
//   A chave de storage e a `storageKey` do createClient (default
//   `sb-<project-ref>-auth-token`) e o valor e o mesmo objeto de sessao.
//
//   ATENCAO A ORDEM: createClient no topo do modulo le o storage na
//   construcao, e ESM avalia TODOS os imports antes do corpo do main. Chamar
//   daqui do corpo do main seria tarde demais. Nesses apps use um modulo
//   dedicado que executa no top-level e e o PRIMEIRO import do main:
//
//        // src/ssoBootstrap.js
//        import { consumeFavoHandoff } from "./lib/favoSso.js";
//        consumeFavoHandoff("sb-huurnewugpwerkeusolt-auth-token");
//
//        // src/main.jsx — antes de qualquer outro import
//        import "./ssoBootstrap.js";
//
// APPS COM STORAGE FORA DO PADRAO (Kitchen/Staff guardam 4 chaves soltas)
//   Passe uma FUNCAO no lugar da chave e grave do seu jeito:
//
//        consumeFavoHandoff((session, payload) => {
//          localStorage.setItem("r7_manager_token", session.access_token);
//          ...
//        });
//
// SEGURANCA
//   O token chega no FRAGMENTO da URL (nunca vai ao servidor). A funcao limpa
//   o fragmento com history.replaceState antes de qualquer render, entao ele
//   nao sobra no historico nem na barra de endereco.

const PARAM = "favo";

function b64urlDecode(s) {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// Remocao TEXTUAL do parametro — nao use URLSearchParams aqui: o round-trip
// re-encoda o resto do fragmento e destroi a rota de apps com hash router
// (`#/inventario&favo=…` viraria `#%2Finventario=`).
function splitHash(raw) {
  const parts = raw.split("&");
  const hit = parts.find((p) => p.startsWith(`${PARAM}=`));
  return { token: hit ? hit.slice(PARAM.length + 1) : null, rest: parts.filter((p) => p !== hit) };
}

function stripHash(rest) {
  const cleaned = rest.join("&");
  const url = window.location.pathname + window.location.search + (cleaned ? `#${cleaned}` : "");
  window.history.replaceState(null, "", url);
}

/**
 * @param {string|function} target chave de localStorage onde este app guarda a
 *        sessao, OU uma funcao (session, payload) => void que grava do jeito
 *        do app (ver Kitchen/Staff no cabecalho)
 * @returns {{tenant: object|null, app: string|null}|null} contexto, ou null se
 *          nao houve handoff (usuario entrou direto no app)
 */
export function consumeFavoHandoff(target) {
  if (typeof window === "undefined") return null;

  const raw = window.location.hash.replace(/^#/, "");
  if (!raw || raw.indexOf(PARAM) === -1) return null;

  const { token, rest } = splitHash(raw);
  if (!token) return null;

  // Consome de uma vez so: mesmo que o payload esteja corrompido, o fragmento
  // sai da URL — nao adianta tentar de novo num reload.
  stripHash(rest);

  let payload;
  try { payload = JSON.parse(b64urlDecode(token)); } catch { return null; }

  if (payload?.v !== 1 || payload.iss !== "favo-hub") return null;
  if (!payload.at || !payload.rt) return null;
  // Token ja vencido (aba ficou aberta, relogio torto): ignora e deixa o app
  // seguir pro proprio login em vez de gravar lixo no storage.
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;

  const session = {
    access_token: payload.at,
    refresh_token: payload.rt,
    expires_at: payload.exp,
    expires_in: payload.exp ? Math.max(0, payload.exp - Math.floor(Date.now() / 1000)) : 3600,
    token_type: "bearer",
    user: payload.user || null,
  };

  try {
    if (typeof target === "function") target(session, payload);
    else localStorage.setItem(target, JSON.stringify(session));
    if (payload.tenant) {
      localStorage.setItem("favo_hub_ctx", JSON.stringify(payload.tenant));
    }
  } catch {
    return null; // storage bloqueado — app cai no proprio login
  }

  return { tenant: payload.tenant || null, app: payload.app || null };
}

/** Contexto de tenant/papel deixado pelo Hub na ultima entrada. */
export function getFavoContext() {
  try { return JSON.parse(localStorage.getItem("favo_hub_ctx") || "null"); }
  catch { return null; }
}
