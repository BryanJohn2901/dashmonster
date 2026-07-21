// Gera supabase/bootstrap_all.sql a partir das migrations, tornando-o idempotente.
//
// As migrations foram escritas pra aplicação INCREMENTAL; concatenadas num banco
// zerado, algumas recriam a mesma POLICY/TRIGGER (ex.: 001 e 004) e o Postgres
// aborta com 42710 ("already exists"). Aqui injetamos um DROP ... IF EXISTS antes
// de cada CREATE POLICY / CREATE TRIGGER (ancorado em início de linha, então não
// pega comentário). DROP a mais é inofensivo (IF EXISTS).
//
// Uso: node supabase/build_bootstrap.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const MIG = join(ROOT, "migrations");
const OUT = join(ROOT, "bootstrap_all.sql");

// CREATE POLICY "nome" ON schema.tabela (nome/ON podem cruzar linha)
const POLICY = /^([ \t]*)(CREATE\s+POLICY\s+("[^"]+"|\w+)\s+ON\s+([\w.]+))/gm;
// CREATE TRIGGER nome <BEFORE|AFTER|INSTEAD OF ...> ON schema.tabela
const TRIGGER = /^([ \t]*)CREATE\s+TRIGGER\s+(\w+)(\s+(?:BEFORE|AFTER|INSTEAD\s+OF)\b[\s\S]*?\bON\s+([\w.]+))/gm;

const guard = (sql) =>
  sql
    .replace(POLICY, (_, i, full, name, tbl) => `${i}DROP POLICY IF EXISTS ${name} ON ${tbl};\n${i}${full}`)
    .replace(TRIGGER, (_, i, name, rest, tbl) => `${i}DROP TRIGGER IF EXISTS ${name} ON ${tbl};\n${i}CREATE TRIGGER ${name}${rest}`);

const out = [
  "-- ============================================================",
  "-- GSAStúdio Hub — bootstrap completo (migrations 001 → 082)",
  "-- Gerado por build_bootstrap.mjs. Idempotente num banco zerado.",
  "-- Rode reset_public.sql ANTES se o banco não estiver vazio.",
  "-- ============================================================",
  "",
];

const files = readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  const body = guard(readFileSync(join(MIG, f), "utf8"));
  out.push("", `-- ▼▼▼ ${f} ▼▼▼`, body, "", `-- ▲▲▲ ${f} ▲▲▲`);
}
writeFileSync(OUT, out.join("\n"), "utf8");
console.log(`OK -> bootstrap_all.sql (${files.length} migrations)`);
