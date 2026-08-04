import { useEffect, useRef } from "react";

// cache-bust: 출차카드 수 = 차량 정보 수 (2→2, 4→4, 3고정 아님)
const DASHBOARD_URL = `/departure/api/departure-page?_v=plt-ship-depart-time-20260729`;

export default function DepartureDashboard() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 새로고침/직접접근 시 SPA shell 없이 로드된 경우 → 홈으로 리다이렉트
    if (!document.querySelector("[data-sidebar]")) {
      window.location.replace("/");
      return;
    }

    let cancelled = false;

    // Django departure HTML을 fetch 후, SPA 레이아웃 안에 fragment만 삽입
    // (전역 body/* CSS가 다른 페이지 폭·패딩을 망가뜨리지 않도록 스코프된 루트만 사용)
    const injected: HTMLScriptElement[] = [];
    fetch(DASHBOARD_URL, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.text();
      })
      .then((html) => {
        if (cancelled || !containerRef.current) return;
        const el = containerRef.current;

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const styles = Array.from(doc.querySelectorAll("style"))
          .map((s) => s.outerHTML)
          .join("");

        // HTML 구조: script 제거한 root 만 삽입 (스크립트는 아래에서 1회 실행)
        const root = doc.querySelector(".departure-root");
        let structureHtml = "";
        if (root) {
          const clone = root.cloneNode(true) as HTMLElement;
          clone.querySelectorAll("script").forEach((s) => s.remove());
          structureHtml = clone.outerHTML;
        } else {
          structureHtml = doc.body?.innerHTML || "";
        }
        el.innerHTML = styles + structureHtml;

        // 문서 전체 인라인 스크립트 1회 실행 (차량 순서 파서 등)
        // 재진입 시 중복 setInterval/핸들러 방지: 이전에 주입한 스크립트 태그 제거
        document
          .querySelectorAll("script[data-departure-inline]")
          .forEach((s) => s.remove());
        const inlineScripts = Array.from(doc.querySelectorAll("script")).filter(
          (s) => !s.src && (s.textContent || "").trim()
        );
        inlineScripts.forEach((srcScript) => {
          const newScript = document.createElement("script");
          newScript.dataset.departureInline = "1";
          newScript.textContent = srcScript.textContent;
          document.body.appendChild(newScript);
          injected.push(newScript);
        });
      })
      .catch(() => {
        if (!cancelled) window.location.replace("/");
      });

    return () => {
      cancelled = true;
      injected.forEach((s) => {
        try {
          s.remove();
        } catch {
          /* ignore */
        }
      });
      document
        .querySelectorAll("script[data-departure-inline]")
        .forEach((s) => s.remove());
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full max-w-full min-w-0"
      /* 상위 dashboard 의 p-6 과 동일 폭 — 추가 패딩/높이 보정 없음 */
    />
  );
}
