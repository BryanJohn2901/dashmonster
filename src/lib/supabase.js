import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) são obrigatórias.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const supabaseAdmin =
  supabaseServiceRoleKey && supabaseUrl
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

export async function testarConexaoCategorias() {
  const { data, error } = await supabase.from("categoria").select("*").limit(20);

  if (error) {
    console.error("Erro ao buscar categorias no Supabase:", error.message);
    return null;
  }

  console.log("Categorias carregadas com sucesso:", data);
  return data;
}
