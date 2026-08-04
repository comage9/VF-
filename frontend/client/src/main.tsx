import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ErrorBoundary } from "@/components/error-boundary";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary label="root">
    <App />
  </ErrorBoundary>
);

/**
 * PWA SW 가 깨진 번들/구버전 JS를 캐시하면 흰 화면·내용 없음이 됨.
 * - 개발: SW 등록 금지 + 기존 등록 전부 해제
 * - 운영: 1회 강제 정리(플래그) 후 SW 재등록 · URL ?nocache=1 시에도 정리
 */
const PWA_CLEAR_FLAG = "vf_pwa_cleared_20260724b";

async function clearStaleServiceWorkers(reason: string) {
  if (!("serviceWorker" in navigator)) return { regs: 0, caches: 0 };
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    let cacheCount = 0;
    if ("caches" in window) {
      const keys = await caches.keys();
      cacheCount = keys.length;
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    console.info("[pwa] unregistered SW + cleared caches", {
      reason,
      regs: regs.length,
      caches: cacheCount,
    });
    return { regs: regs.length, caches: cacheCount };
  } catch (e) {
    console.warn("[pwa] SW cleanup failed", e);
    return { regs: 0, caches: 0 };
  }
}

async function bootstrapPwa() {
  const params = new URLSearchParams(
    typeof location !== "undefined" ? location.search : ""
  );
  const forceNocache = params.has("nocache") || params.has("_r");

  if (import.meta.env.DEV) {
    await clearStaleServiceWorkers("dev");
    return;
  }

  // 운영: 깨진 캐시 복구 — 세션당 1회 또는 ?nocache=
  let shouldReload = false;
  try {
    if (forceNocache || !sessionStorage.getItem(PWA_CLEAR_FLAG)) {
      const cleared = await clearStaleServiceWorkers(
        forceNocache ? "nocache-param" : "once-per-session"
      );
      sessionStorage.setItem(PWA_CLEAR_FLAG, "1");
      // 실제로 캐시/SW가 있었을 때만 리로드 (무한 루프 방지: 플래그 먼저 저장)
      if (forceNocache || cleared.regs > 0 || cleared.caches > 0) {
        if (!sessionStorage.getItem(PWA_CLEAR_FLAG + "_reloaded")) {
          sessionStorage.setItem(PWA_CLEAR_FLAG + "_reloaded", "1");
          shouldReload = true;
        }
      }
    }
  } catch {
    /* ignore */
  }

  if (shouldReload) {
    const u = new URL(location.href);
    u.searchParams.delete("nocache");
    u.searchParams.delete("_r");
    location.replace(u.pathname + u.search + u.hash);
    return;
  }

  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch(() => {
      /* pwa module optional */
    });
}

void bootstrapPwa();
