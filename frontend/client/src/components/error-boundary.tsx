import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode; label?: string };
type State = { error: Error | null };

/**
 * 렌더 오류 시 흰 화면 대신 메시지 표시.
 * 모바일 PWA 캐시로 깨진 번들이 남을 때 복구 버튼 제공.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", this.props.label || "app", error, info);
  }

  private async hardReset() {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      try {
        sessionStorage.clear();
      } catch {
        /* ignore */
      }
    } catch (e) {
      console.warn("[ErrorBoundary] reset failed", e);
    }
    const u = new URL(window.location.href);
    u.searchParams.set("_r", String(Date.now()));
    window.location.replace(u.toString());
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-[40vh] flex flex-col items-center justify-center gap-4 p-8 text-center">
        <h2 className="text-lg font-bold text-foreground">
          화면을 표시하는 중 오류가 발생했습니다
        </h2>
        <p className="text-sm text-muted-foreground max-w-md break-words">
          {this.state.error.message || String(this.state.error)}
        </p>
        <p className="text-xs text-muted-foreground">
          스마트폰에서 자주 발생하면 캐시된 이전 화면일 수 있습니다. 아래 버튼으로
          캐시를 지우고 다시 불러오세요.
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          <Button type="button" onClick={() => this.hardReset()}>
            캐시 삭제 후 새로고침
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            일반 새로고침
          </Button>
        </div>
      </div>
    );
  }
}
