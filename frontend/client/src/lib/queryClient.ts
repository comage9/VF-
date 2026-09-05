import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const cacheKey = `rq-cache:${queryKey.join("/")}`;
    try {
      const res = await fetch(queryKey.join("/") as string, {
        credentials: "include",
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      const data = await res.json();

      // 네트워크 성공 시 로컬 스토리지에 캐시 백업
      try {
        localStorage.setItem(cacheKey, JSON.stringify(data));
      } catch (cacheSaveError) {
        console.warn("React Query LocalStorage Cache Save Failed:", cacheSaveError);
      }

      return data;
    } catch (error) {
      // 단선/서버 에러 시 로컬 스토리지 캐시 폴백 작동
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          console.warn(`[Offline Mode] Serving data from LocalStorage for API: ${queryKey.join("/")}`);
          return JSON.parse(cached) as any;
        }
      } catch (cacheLoadError) {
        console.error("React Query LocalStorage Cache Load Failed:", cacheLoadError);
      }
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
      structuralSharing: false,
    },
    mutations: {
      retry: false,
    },
  },
});
