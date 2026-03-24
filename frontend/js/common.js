/* =============================================
   PMS + VF Analytics - 공통 유틸리티 함수
   v2.1 — 2026-03-24
   ============================================= */

// ── VF 백엔드 API 기본 URL ──
// HTTPS 환경에서 HTTP API 호출 차단(Mixed Content) 방지:
// 서버 배포 후 실제 도메인이 HTTP이면 정상 동작
// Genspark 미리보기(HTTPS) 환경에서는 VF 데이터 로드 실패하나 PMS 기능은 정상
const VF_BASE = (()=>{
  const loc = window.location.hostname;
  // 로컬 또는 실제 서버 환경 (bonohouse 도메인)
  if (loc === 'localhost' || loc === '127.0.0.1' || loc.includes('bonohouse')) {
    return 'http://bonohouse.p-e.kr:5174';
  }
  // 미리보기 환경에서도 시도 (CORS 프록시가 있으면 동작)
  return 'http://bonohouse.p-e.kr:5174';
})();

// ── VF API 유틸리티 ──
const VF_API = {
  async get(path, params = {}) {
    const q = new URLSearchParams(params);
    const url = `${VF_BASE}${path}${Object.keys(params).length ? '?' + q : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`VF API GET ${path} failed: ${res.status}`);
    return res.json();
  },
  // Mixed Content 환경(HTTPS 미리보기 등)에서 안전하게 폴백
  async safeGet(path, params = {}, fallback = null) {
    try {
      return await this.get(path, params);
    } catch (e) {
      console.warn(`VF API 실패 (${path}):`, e.message);
      return fallback;
    }
  },
  // 출고 통계
  async outboundStats(days = 30, groupBy = 'day') {
    return this.get('/api/outbound/stats', { days, groupBy });
  },
  // 출고 목록
  async outboundList(params = {}) {
    return this.get('/api/outbound', params);
  },
  // 상위 상품
  async topProducts(days = 30, limit = 10) {
    return this.get('/api/outbound/top-products', { days, limit });
  },
  // 재고 목록
  async inventory(params = {}) {
    return this.get('/api/inventory/unified', params);
  },
  // 생산 데이터
  async production(params = {}) {
    return this.get('/api/production', params);
  },
  // 입고 최신
  async inboundLatest() {
    return this.get('/api/inventory/inbound/latest');
  },
  // 입고 정책
  async inboundPolicy() {
    return this.get('/api/inventory/inbound/policy');
  }
};

// ── PMS 테이블 API 유틸리티 ──
const API = {
  async get(table, params = {}) {
    const q = new URLSearchParams({ page: 1, limit: 200, ...params });
    const res = await fetch(`tables/${table}?${q}`);
    if (!res.ok) throw new Error(`GET ${table} failed`);
    return res.json();
  },
  async getOne(table, id) {
    const res = await fetch(`tables/${table}/${id}`);
    if (!res.ok) throw new Error(`GET ${table}/${id} failed`);
    return res.json();
  },
  async post(table, data) {
    const res = await fetch(`tables/${table}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`POST ${table} failed`);
    return res.json();
  },
  async put(table, id, data) {
    const res = await fetch(`tables/${table}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`PUT ${table}/${id} failed`);
    return res.json();
  },
  async patch(table, id, data) {
    const res = await fetch(`tables/${table}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`PATCH ${table}/${id} failed`);
    return res.json();
  },
  async delete(table, id) {
    const res = await fetch(`tables/${table}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`DELETE ${table}/${id} failed`);
    return true;
  }
};

// ── 토스트 알림 ──
const Toast = {
  container: null,
  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  },
  show(msg, type = 'info', duration = 3000) {
    this.init();
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
    this.container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      el.style.transition = 'all .3s';
      setTimeout(() => el.remove(), 300);
    }, duration);
  },
  success(msg) { this.show(msg, 'success'); },
  error(msg)   { this.show(msg, 'error', 4000); },
  warning(msg) { this.show(msg, 'warning'); },
  info(msg)    { this.show(msg, 'info'); }
};

// ── 날짜 유틸 ──
const DateUtil = {
  fmt(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  },
  fmtShort(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  },
  fmtDateTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  },
  today() {
    return new Date().toISOString().split('T')[0];
  },
  addDays(dateStr, n) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  },
  nDaysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
  }
};

// ── 숫자 포맷 ──
const NumUtil = {
  fmt(n) {
    if (n == null || n === '') return '-';
    return Number(n).toLocaleString('ko-KR');
  },
  fmtKRW(n) {
    if (n == null || n === '') return '-';
    const num = Number(n);
    if (num >= 100000000) return (num / 100000000).toFixed(1) + '억원';
    if (num >= 10000) return Math.floor(num / 10000).toLocaleString('ko-KR') + '만원';
    return num.toLocaleString('ko-KR') + '원';
  },
  fmtKRWFull(n) {
    if (n == null || n === '') return '-';
    return Number(n).toLocaleString('ko-KR') + '원';
  },
  pct(val, total) {
    if (!total) return 0;
    return Math.round((val / total) * 100);
  }
};

// ── 상태 표시 ──
const StatusUtil = {
  labels: {
    planned:     '계획',
    in_progress: '진행중',
    completed:   '완료',
    active:      '가동중',
    inactive:    '비가동',
    maintenance: '정비중',
    '완료': '완료',
    'normal': '정상',
    'low': '부족',
    'out': '재고없음',
    'excess': '과잉'
  },
  badge(status) {
    const label = this.labels[status] || status;
    const cls   = `badge-${status}`;
    return `<span class="badge ${cls}">${label}</span>`;
  },
  stockBadge(status) {
    const map = {
      normal:  { cls: 'badge-green',  label: '정상' },
      low:     { cls: 'badge-amber',  label: '부족' },
      out:     { cls: 'badge-red',    label: '소진' },
      excess:  { cls: 'badge-blue',   label: '과잉' }
    };
    const s = map[status] || { cls: 'badge-gray', label: status };
    return `<span class="badge ${s.cls}">${s.label}</span>`;
  }
};

// ── 모달 컨트롤 ──
const Modal = {
  open(id)  { document.getElementById(id)?.classList.add('open'); },
  close(id) { document.getElementById(id)?.classList.remove('open'); },
  toggle(id){ document.getElementById(id)?.classList.toggle('open'); }
};

// ── 사이드바 활성 메뉴 자동 표시 ──
function setActiveNav() {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-item[href]').forEach(el => {
    const href = el.getAttribute('href');
    if (href === page || (page === '' && href === 'index.html')) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });
}

// ── 사이드바 모바일 토글 ──
function initMobileMenu() {
  const sidebar  = document.querySelector('.sidebar');
  const toggle   = document.querySelector('.menu-toggle');
  const backdrop = document.createElement('div');
  backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:99;display:none;';
  document.body.appendChild(backdrop);
  toggle?.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    backdrop.style.display = sidebar.classList.contains('open') ? 'block' : 'none';
  });
  backdrop.addEventListener('click', () => {
    sidebar.classList.remove('open');
    backdrop.style.display = 'none';
  });

  // 사이드바 섹션 접기/펼치기
  document.querySelectorAll('.nav-section-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.closest('.nav-section');
      section?.classList.toggle('collapsed');
    });
  });
}

// ── 공통 사이드바 HTML 생성 ──
function renderSidebar(activePage) {
  const page = activePage || (location.pathname.split('/').pop().replace('.html','') || 'dashboard');
  return `
    <div class="sidebar-logo">
      <div class="logo-icon">🏠</div>
      <h1>BONO PMS</h1>
      <p>통합 운영 관리 시스템</p>
    </div>
    <nav class="sidebar-nav">

      <div class="nav-section-title">메인</div>
      <a href="index.html" class="nav-item ${page==='dashboard'||page==='index'?'active':''}">
        <span class="nav-icon"><i class="fas fa-chart-pie"></i></span> 통합 대시보드
      </a>

      <div class="nav-section-title">📦 영업·출고</div>
      <a href="outbound.html" class="nav-item ${page==='outbound'?'active':''}">
        <span class="nav-icon"><i class="fas fa-chart-bar"></i></span> 출고 분석
      </a>
      <a href="delivery.html" class="nav-item ${page==='delivery'?'active':''}">
        <span class="nav-icon"><i class="fas fa-truck"></i></span> 배송 관리
      </a>

      <div class="nav-section-title">🏪 재고·입고</div>
      <a href="inventory.html" class="nav-item ${page==='inventory'?'active':''}">
        <span class="nav-icon"><i class="fas fa-warehouse"></i></span> 재고 현황
      </a>

      <div class="nav-section-title">🏭 생산 관리</div>
      <a href="production.html" class="nav-item ${page==='production'?'active':''}">
        <span class="nav-icon"><i class="fas fa-clipboard-list"></i></span> 일별 생산계획
      </a>
      <a href="history.html" class="nav-item ${page==='history'?'active':''}">
        <span class="nav-icon"><i class="fas fa-history"></i></span> 생산 이력
      </a>

      <div class="nav-section-title">⚙️ 마스터 관리</div>
      <a href="molds.html" class="nav-item ${page==='molds'?'active':''}">
        <span class="nav-icon"><i class="fas fa-tools"></i></span> 금형 관리
      </a>
      <a href="colors.html" class="nav-item ${page==='colors'?'active':''}">
        <span class="nav-icon"><i class="fas fa-palette"></i></span> 색상/단위
      </a>
      <a href="machines.html" class="nav-item ${page==='machines'?'active':''}">
        <span class="nav-icon"><i class="fas fa-cog"></i></span> 기계 관리
      </a>
    </nav>
    <div class="sidebar-footer">
      BONO PMS v2.0 &nbsp;|&nbsp; 2026
    </div>
  `;
}

// ── 로딩 스켈레톤 ──
function showLoading(el, rows = 3) {
  if (!el) return;
  el.innerHTML = Array(rows).fill(`
    <tr><td colspan="20">
      <div style="height:18px;background:linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%);
           background-size:200% 100%;animation:shimmer 1.4s infinite;border-radius:4px;"></div>
    </td></tr>
  `).join('');
}

// ── 빈 상태 ──
function emptyRow(colspan, msg = '데이터가 없습니다') {
  return `<tr><td colspan="${colspan}" style="text-align:center;padding:40px;color:#94a3b8;">${msg}</td></tr>`;
}

// ── CSV 다운로드 ──
function downloadCSV(rows, filename) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ── VF 출고 레코드 필드명 정규화 ──
// API가 camelCase / snake_case 혼용 반환하는 문제 해결
function normalizeOutbound(r) {
  if (!r || typeof r !== 'object') return {};
  const salesRaw = r.salesAmount ?? r.sales_amount ?? r.supplyAmount ?? r.supply_amount;
  const sales    = salesRaw != null && salesRaw !== '' ? Number(salesRaw) : null;
  return {
    ...r,
    productName:  r.productName  || r.product_name  || '',
    outboundDate:(r.outboundDate || r.outbound_date  || r.inboundDate || r.inbound_date || '').substring(0, 10),
    salesAmount:  (sales !== null && !isNaN(sales)) ? sales : null,
    boxQuantity:  r.boxQuantity  != null ? Number(r.boxQuantity)  : (r.box_quantity  != null ? Number(r.box_quantity)  : null),
    unitCount:    r.unitCount    != null ? Number(r.unitCount)    : (r.unit_count    != null ? Number(r.unit_count)    : null),
    category:     r.category     || r.productCategory || '',
    barcode:      r.barcode      || r.sku             || '',
    status:       r.status       || '',
    logisticsCenter: r.logisticsCenter || r.logistics_center || '',
  };
}

// ── 차트 인스턴스 관리 (전역 싱글톤) ──
const ChartManager = (() => {
  const _store = {};
  return {
    destroy(id) {
      if (_store[id]) { _store[id].destroy(); delete _store[id]; }
    },
    set(id, instance) { _store[id] = instance; },
    get(id)           { return _store[id]; },
    destroyAll()      { Object.keys(_store).forEach(id => this.destroy(id)); }
  };
})();

// ── 공통 페이지네이션 렌더러 ──
// @param elId       - 페이지네이션 컨테이너 요소 id
// @param totalPages - 전체 페이지 수
// @param current    - 현재 페이지 (1-based)
// @param fnName     - window[fnName](page) 형태로 호출될 전역 함수명(문자열)
function renderPaginationEl(elId, totalPages, current, fnName) {
  const pg = document.getElementById(elId);
  if (!pg) return;
  if (totalPages <= 1) { pg.innerHTML = ''; return; }

  const call = (p) => `${fnName}(${p})`;
  let html = `<button class="page-btn" onclick="${call(current - 1)}" ${current === 1 ? 'disabled' : ''}>‹</button>`;
  const start = Math.max(1, current - 2);
  const end   = Math.min(totalPages, current + 2);
  if (start > 1) {
    html += `<button class="page-btn" onclick="${call(1)}">1</button>`;
    if (start > 2) html += `<span style="padding:0 4px">…</span>`;
  }
  for (let i = start; i <= end; i++) {
    html += `<button class="page-btn ${i === current ? 'active' : ''}" onclick="${call(i)}">${i}</button>`;
  }
  if (end < totalPages) {
    if (end < totalPages - 1) html += `<span style="padding:0 4px">…</span>`;
    html += `<button class="page-btn" onclick="${call(totalPages)}">${totalPages}</button>`;
  }
  html += `<button class="page-btn" onclick="${call(current + 1)}" ${current === totalPages ? 'disabled' : ''}>›</button>`;
  pg.innerHTML = html;
}

// ── shimmer 애니메이션 스타일 삽입 ──
(function injectShimmer() {
  if (document.getElementById('shimmer-style')) return;
  const style = document.createElement('style');
  style.id = 'shimmer-style';
  style.textContent = `@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`;
  document.head.appendChild(style);
})();

document.addEventListener('DOMContentLoaded', () => {
  // 사이드바 렌더링
  const sidebarEl = document.getElementById('sidebar');
  if (sidebarEl && !sidebarEl.dataset.rendered) {
    const page = sidebarEl.dataset.page || '';
    sidebarEl.innerHTML = renderSidebar(page);
    sidebarEl.dataset.rendered = '1';
  }
  setActiveNav();
  initMobileMenu();

  // 오늘 날짜 표시
  const todayEl = document.getElementById('today-date');
  if (todayEl) {
    todayEl.textContent = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
    });
  }
});
