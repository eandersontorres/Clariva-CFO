// Consome o handoff do My Favo Team (app.favo.team).
//
// Precisa ser o PRIMEIRO import do main.jsx: lib/supabase.js cria o client no
// topo do modulo e le o storage na construcao, e ESM avalia TODOS os imports
// antes do corpo do main — chamar la seria tarde demais.
import { consumeFavoHandoff } from "./lib/favoSso.js";

// supabase-js names its storage key after the first label of the project host.
const sbRef = new URL(import.meta.env.VITE_SUPABASE_URL || "https://huurnewugpwerkeusolt.supabase.co").hostname.split(".")[0];
consumeFavoHandoff(`sb-${sbRef}-auth-token`);
