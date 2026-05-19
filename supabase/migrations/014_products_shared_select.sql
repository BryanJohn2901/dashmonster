-- ─── 014: Products shared select ────────────────────────────────────────────
-- Allow all authenticated users to read all products (shared like historical).
-- Write operations (insert/update/delete) remain user-scoped.

DROP POLICY IF EXISTS "products_select" ON public.products;

CREATE POLICY "products_select" ON public.products
  FOR SELECT
  TO authenticated
  USING (true);
