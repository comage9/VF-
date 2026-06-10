import { useEffect, useRef } from "react";

const DASHBOARD_URL = "http://bonohouse.p-e.kr:5177/";

export default function DepartureDashboard() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.style.height = "calc(100vh - 160px)";
    }
  }, []);

  return (
    <div className="w-full h-full" style={{ minHeight: "calc(100vh - 160px)" }}>
      <iframe
        ref={iframeRef}
        src={DASHBOARD_URL}
        className="w-full border-0 rounded-lg shadow-sm"
        style={{ height: "calc(100vh - 160px)", minHeight: "800px" }}
        title="VF 출차 관리"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
      />
    </div>
  );
}
