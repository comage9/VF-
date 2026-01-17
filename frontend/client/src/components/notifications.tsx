import { useEffect, useState, createContext, useContext, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { Bell, AlertTriangle, Info, CheckCircle, X } from 'lucide-react';

interface NotificationData {
  event: string;
  data: any;
  timestamp: string;
}

interface Notification extends NotificationData {
  id: string;
  read: boolean;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  isConnected: boolean;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Socket.IO 연결
    const socketConnection = io(window.location.origin, {
      transports: ['websocket', 'polling']
    });

    socketConnection.on('connect', () => {
      console.log('🔌 실시간 알림 서버에 연결됨');
      setIsConnected(true);
    });

    socketConnection.on('disconnect', () => {
      console.log('🔌 실시간 알림 서버 연결 해제됨');
      setIsConnected(false);
    });

    // 다양한 알림 이벤트 리스너
    const eventHandlers = {
      lowStock: (data: NotificationData) => addNotification('lowStock', data),
      inventoryUpdate: (data: NotificationData) => addNotification('inventoryUpdate', data),
      productionUpdate: (data: NotificationData) => addNotification('productionUpdate', data),
      systemStatus: (data: NotificationData) => addNotification('systemStatus', data)
    };

    Object.entries(eventHandlers).forEach(([event, handler]) => {
      socketConnection.on(event, handler);
    });

    setSocket(socketConnection);

    return () => {
      socketConnection.disconnect();
    };
  }, []);

  const addNotification = (event: string, data: NotificationData) => {
    const notification: Notification = {
      id: `${Date.now()}-${Math.random()}`,
      event,
      data: data.data,
      timestamp: data.timestamp,
      read: false
    };

    setNotifications(prev => [notification, ...prev.slice(0, 49)]); // 최대 50개 유지
    
    // 중요한 알림은 브라우저 알림으로도 표시
    if (event === 'lowStock' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('재고 부족 알림', {
        body: data.data.message,
        icon: '/favicon.ico'
      });
    }
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => 
      prev.map(notif => notif.id === id ? { ...notif, read: true } : notif)
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(notif => ({ ...notif, read: true })));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const value = {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotifications,
    isConnected
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

// 알림 UI 컴포넌트
export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearNotifications, isConnected } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  // 브라우저 알림 권한 요청
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const getNotificationIcon = (event: string) => {
    switch (event) {
      case 'lowStock': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'inventoryUpdate': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'productionUpdate': return <Info className="w-4 h-4 text-blue-500" />;
      default: return <Info className="w-4 h-4 text-gray-500" />;
    }
  };

  const getEventLabel = (event: string) => {
    switch (event) {
      case 'lowStock': return '재고 부족';
      case 'inventoryUpdate': return '재고 업데이트';
      case 'productionUpdate': return '생산 계획';
      case 'systemStatus': return '시스템 상태';
      default: return '알림';
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-lg transition-colors ${
          isConnected ? 'hover:bg-gray-100' : 'opacity-50 cursor-not-allowed'
        }`}
        disabled={!isConnected}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full px-1 min-w-[16px] h-4 flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        {!isConnected && (
          <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="p-3 border-b border-gray-200 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">실시간 알림</h3>
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            </div>
            <div className="flex gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-blue-600 hover:underline"
                >
                  모두 읽음
                </button>
              )}
              <button
                onClick={clearNotifications}
                className="text-xs text-gray-500 hover:underline ml-2"
              >
                전체 삭제
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                알림이 없습니다
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                    !notification.read ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex items-start gap-2">
                    {getNotificationIcon(notification.event)}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-medium text-gray-700">
                          {getEventLabel(notification.event)}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(notification.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {notification.data.message}
                      </p>
                      {notification.event === 'lowStock' && notification.data.count && (
                        <p className="text-xs text-yellow-600 mt-1">
                          {notification.data.count}개 품목 확인 필요
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 클릭 외부 영역 감지 */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

// 토스트 스타일 알림 컴포넌트
export function NotificationToast() {
  const { notifications } = useNotifications();
  const [visibleToasts, setVisibleToasts] = useState<string[]>([]);

  useEffect(() => {
    // 새로운 중요 알림만 토스트로 표시
    const importantEvents = ['lowStock', 'systemStatus'];
    const newImportantNotifications = notifications
      .filter(n => !n.read && importantEvents.includes(n.event))
      .slice(0, 3); // 최대 3개만

    const newToastIds = newImportantNotifications.map(n => n.id);
    setVisibleToasts(prev => {
      const uniqueIds = new Set([...prev, ...newToastIds]);
      return Array.from(uniqueIds);
    });

    // 5초 후 자동 제거
    newToastIds.forEach(id => {
      setTimeout(() => {
        setVisibleToasts(prev => prev.filter(toastId => toastId !== id));
      }, 5000);
    });
  }, [notifications]);

  const hideToast = (id: string) => {
    setVisibleToasts(prev => prev.filter(toastId => toastId !== id));
  };

  const visibleNotifications = notifications.filter(n => visibleToasts.includes(n.id));

  if (visibleNotifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {visibleNotifications.map((notification) => (
        <div
          key={notification.id}
          className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 max-w-sm animate-fade-in"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-2">
              {getNotificationIcon(notification.event)}
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {getEventLabel(notification.event)}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  {notification.data.message}
                </p>
              </div>
            </div>
            <button
              onClick={() => hideToast(notification.id)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  function getNotificationIcon(event: string) {
    switch (event) {
      case 'lowStock': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'inventoryUpdate': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'productionUpdate': return <Info className="w-4 h-4 text-blue-500" />;
      default: return <Info className="w-4 h-4 text-gray-500" />;
    }
  }

  function getEventLabel(event: string) {
    switch (event) {
      case 'lowStock': return '재고 부족';
      case 'inventoryUpdate': return '재고 업데이트';
      case 'productionUpdate': return '생산 계획';
      case 'systemStatus': return '시스템 상태';
      default: return '알림';
    }
  }
}