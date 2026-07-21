"use client";

import { useCallback, useEffect, useState } from "react";
import { ProductData } from "@/types/product";
import { isSupabaseConfigured } from "@/lib/supabase";
import { fetchProducts, upsertProduct, deleteProductRemote } from "@/utils/supabaseProducts";
import { useCompany } from "@/hooks/useCompany";
import { loadScoped, persistScoped } from "@/lib/companyScopedStorage";

// ─── Local cache (isolado por empresa) ─────────────────────────────────────────

const STORAGE_PREFIX = "gsah_products_v1";
// empresa cujo cache local está ativo — persist grava sempre nela.
let activeCid: string | null = null;

function loadLocal(): ProductData[] {
  return loadScoped<ProductData[]>(STORAGE_PREFIX, activeCid, []);
}

function saveLocal(products: ProductData[]): void {
  persistScoped(STORAGE_PREFIX, activeCid, products);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export type ProductSyncStatus = "local" | "loading" | "synced" | "error";

export function useProductStore() {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const [products, setProductsRaw] = useState<ProductData[]>(loadLocal);
  const [syncStatus, setSyncStatus] = useState<ProductSyncStatus>(
    isSupabaseConfigured ? "loading" : "local",
  );

  // keep local state + localStorage in sync
  const setProducts = useCallback((next: ProductData[]) => {
    setProductsRaw(next);
    saveLocal(next);
  }, []);

  // ── Carrega (e recarrega na troca de empresa) da empresa ativa ──
  useEffect(() => {
    activeCid = companyId;
    if (!isSupabaseConfigured) { setProductsRaw(loadLocal()); return; }
    setSyncStatus("loading");
    fetchProducts()
      .then((remote) => { setProducts(remote); setSyncStatus("synced"); })
      .catch(() => setSyncStatus("error"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const addProduct = useCallback(async (p: ProductData) => {
    // optimistic update using latest local state
    const current = loadLocal();
    setProducts([p, ...current]);
    if (isSupabaseConfigured) {
      try { await upsertProduct(p); setSyncStatus("synced"); }
      catch { setSyncStatus("error"); }
    }
  }, [setProducts]);

  const updateProduct = useCallback(async (p: ProductData) => {
    const current = loadLocal();
    setProducts(current.map((x) => (x.id === p.id ? p : x)));
    if (isSupabaseConfigured) {
      try { await upsertProduct(p); setSyncStatus("synced"); }
      catch { setSyncStatus("error"); }
    }
  }, [setProducts]);

  const deleteProduct = useCallback(async (id: string) => {
    const current = loadLocal();
    setProducts(current.filter((x) => x.id !== id));
    if (isSupabaseConfigured) {
      try { await deleteProductRemote(id); setSyncStatus("synced"); }
      catch { setSyncStatus("error"); }
    }
  }, [setProducts]);

  return { products, addProduct, updateProduct, deleteProduct, syncStatus };
}
