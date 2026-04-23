/**
 * Diagnostic & debugging helpers for Supabase queries
 * Logs errors clearly, checks RLS, validates data
 */

export function logSupabaseQuery(
  label: string,
  data: any,
  error?: any,
  options?: { verbose?: boolean }
) {
  const group = `🔍 [${label}]`;

  if (error) {
    console.error(
      group,
      "❌ ERROR:",
      error.message || error,
      {
        code: error.code,
        details: error.details,
        hint: error.hint,
        full: error,
      }
    );
    return false;
  }

  if (!data) {
    console.warn(group, "⚠️  No data returned (null/undefined)");
    return false;
  }

  if (Array.isArray(data)) {
    console.log(group, `✅ Got ${data.length} rows`, options?.verbose ? data : "...");
  } else {
    console.log(group, "✅ Got data:", options?.verbose ? data : "...");
  }

  return true;
}

export function diagnoseRLSIssue() {
  console.warn(
    `
⚠️  RLS CHECK: If you see 404/403 errors on table queries:
1. Go to Supabase dashboard → SQL Editor
2. Run: SELECT tablename FROM pg_tables WHERE schemaname = 'public';
3. For each table, enable RLS and add policy:
   ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "open_all" ON table_name FOR ALL USING (true) WITH CHECK (true);
4. Or make sure migrations have run (supabase db push)
  `.trim()
  );
}

export function logQueryWithRelations(label: string, table: string, relations: Record<string, any>) {
  const rel_str = Object.entries(relations)
    .map(([k, v]) => `${k}: ${v ? (Array.isArray(v) ? v.length + " rows" : "1 obj") : "null"}`)
    .join(", ");

  console.log(`📊 [${label}] table=${table} {${rel_str}}`);
}
