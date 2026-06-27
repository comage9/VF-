import { useEffect, useRef } from "react";

const DASHBOARD_URL = "/departure/api/departure-page";

export default function DepartureDashboard() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 새로고침/직접접근 시 SPA shell 없이 로드된 경우 → 홈으로 리다이렉트
    // data-sidebar 속성으로 검증 (sidebar.tsx에 추가됨)
    if (!document.querySelector('[data-sidebar]')) {
      window.location.replace('/');
      return;
    }

    // Django departure fragment HTML을 fetch해서 DOM에 직접 삽입
    fetch(DASHBOARD_URL)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load');
        return res.text();
      })
      .then((html) => {
        container.innerHTML = html;

        // script 태그 다시 실행 (fetch로 가져온 HTML의 script는 자동 실행 안 됨)
        const scripts = container.querySelectorAll("script");
        scripts.forEach((oldScript) => {
          const newScript = document.createElement("script");
          if (oldScript.src) {
            newScript.src = oldScript.src;
          } else {
            newScript.textContent = oldScript.textContent;
          }
          oldScript.parentNode?.replaceChild(newScript, oldScript);
        });
      })
      .catch(() => {
        window.location.replace('/');
      });
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ minHeight: "calc(100vh - 160px)" }}
    />
  );
}