# VF Production Plan Mobile UI - Visual Mockups

## 📱 Mobile Screen Breakdown

---

### 1. **Mobile Header** (Top Bar)

```
┌─────────────────────────────────┐
│ ☰   생산 계획      [2건 선택]  │  ← Sticky header, backdrop blur
└─────────────────────────────────┘
```

**Features**:
- ☰ Hamburger menu opens Filter Drawer
- Shows "생산 계획" (Production Plan) title
- Badge shows selected items count
- Fixed position at top
- Backdrop blur effect

---

### 2. **KPI Cards Grid** (2x2 Layout)

```
┌─────────────────────────────────┐
│  ┌──────────────┐ ┌──────────────┐ │
│  │  📦         │  │  📊         │ │
│  │총 수량      │  │총 단위수량  │ │
│  │  1,234      │  │    567      │ │
│  │전체 생산 수량│  │누적 단위 생산│ │
│  └──────────────┘ └──────────────┘ │
│  ┌──────────────┐ ┌──────────────┐ │
│  │  📄         │  │  📈         │ │
│  │총 레코드    │  │총 생산량    │ │
│  │     45      │  │  6,789      │ │
│  │생산 계획 수 │  │전체 생산 완료│ │
│  └──────────────┘ └──────────────┘ │
└─────────────────────────────────┘
```

**Visual Design**:
- 2x2 grid on mobile, responsive to larger screens
- Gradient backgrounds (Blue, Emerald, Gray, Amber)
- Icons with circular backgrounds
- Bold numbers with Korean formatting
- Priority visual hierarchy (most prominent first)

---

### 3. **Tab Navigation**

```
┌─────────────────────────────────┐
│ [진행 중 (12)] [완료 (8)] [재고 확인] │
└─────────────────────────────────┘
```

**Features**:
- Button-style tabs with count indicators
- Active tab highlighted (default/outline variant)
- Smooth switching between tabs
- Conditional rendering based on active tab

---

### 4. **Mobile Production Cards**

```
┌─────────────────────────────────┐
│ ⋮ ☐ 기계: 2   2026-04-16  [시작]│ ← Header with drag handle, checkbox, machine badge, date, status
├─────────────────────────────────┤
│                                 │
│  러블리 옷걸이             1,000│ ← Product name and total
│  Lovely Hanger(ไม้แขวนเสื้อน่ารัก)  총계   │
│                                 │
│  금형: 38   색상: Pink(P2)/PINK 7416PQ │ ← Grid layout for details
│                                 │
├─────────────────────────────────┤
│  [▶ 시작]  [✏️ 수정]  [🗑️]    │ ← Action buttons (touch-optimized)
└─────────────────────────────────┘
```

**Card Features**:
- Color-coded left border (machine-specific)
- Drag handle for reordering
- Checkbox for selection
- Product name (Korean + English)
- Quantity display with formatting
- Mold number and color info
- Status badge (시작/종료/중지/대기)
- Action buttons with proper touch targets
- Touch action optimization

---

### 5. **Mobile Filter Drawer** (Slide-in from Right)

```
┌─────────────────────────────────┐
│           ✕                   │  ← Close button
│    필터 및 검색                │  ← Title
├─────────────────────────────────┤
│  선택 2건               [선택 해제] │ ← Selection info
├─────────────────────────────────┤
│  날짜 선택                    │
│  [최신 (2026-04-16) ▼]        │
├─────────────────────────────────┤
│  기계번호                      │
│  [전체 ▼]                     │
├─────────────────────────────────┤
│  검색                          │
│  [품목명, 색상명 등__________] │
├─────────────────────────────────┤
│  정렬                          │
│  [최근순 ▼]                   │
├─────────────────────────────────┤
│  [🔄 초기화]  [적용]          │  ← Footer buttons
└─────────────────────────────────┘
```

**Drawer Features**:
- Full-screen width on mobile
- Smooth slide-in animation
- All filter options available
- Local search state management
- Reset and Apply buttons
- Selection management

---

### 6. **Bottom Navigation Bar** (Fixed)

```
┌─────────────────────────────────┐
│  [필터]   [+ 신규]   [🗑️ 삭제] │
├─────────────────────────────────┤
│  [대기 ▼]   [선택 상태 변경]   │
└─────────────────────────────────┘
```

**Bottom Bar Features**:
- Fixed position at bottom
- Backdrop blur effect
- Filter toggle button
- Add new record button
- Delete button (disabled when no selection)
- Bulk status change functionality
- Proper touch target sizes

---

### 7. **Drag and Drop Experience**

```
Active Drag State:
┌─────────────────────────────────┐
│ ⋮ ☐ 기계: 2   2026-04-16  [시작]│
├─────────────────────────────────┤
│  (Shadow & Scale Effect)        │
│  러블리 옷걸이             1,000│
│  (Card appears lifted)          │
└─────────────────────────────────┘

    ↓
    (Dragging)
    ↓

Target Position:
┌─────────────────────────────────┐
│ ⋮ ☐ 기계: 2   2026-04-16  [시작]│
├─────────────────────────────────┤
│  모던플러스 서랍              125│  ← Space created for drop
│                                 │
│  (Drop indicator shown)         │
└─────────────────────────────────┘
```

**Drag and Drop Features**:
- Visual feedback during drag (opacity 0.5, shadow, scale)
- Touch-optimized drag handles
- Smooth animations
- Validation (same machine, same date only)
- Optimistic UI updates

---

### 8. **Status Badges & Actions**

**Pending Status (대기)**:
```
┌─────────────────────────────────┐
│  [대기]                        │  ← Gray outline badge
│  [▶ 시작] (Blue button)        │  ← Only start button shown
└─────────────────────────────────┘
```

**Started Status (시작)**:
```
┌─────────────────────────────────┐
│  [시작]                        │  ← Blue filled badge
│  [✅ 완료] (Green)            │
│  [⏸️ 중지] (Red)               │  ← Multiple actions available
│  [🔄 초기화] (Orange)          │
└─────────────────────────────────┘
```

**Completed Status (종료)**:
```
┌─────────────────────────────────┐
│  [종료]                        │  ← Green filled badge
│  [🔄 초기화] (Orange)          │  ← Only reset button shown
│  [✏️ 수정]                    │
│  [🗑️]                         │
└─────────────────────────────────┘
```

---

### 9. **Inventory Tab** (재고 확인)

```
┌─────────────────────────────────┐
│  📦 현재 재고 수량    [수정 가능] │
├─────────────────────────────────┤
│  러블리 옷걸이                │
│  최소: 10 | 기준: 20      [500] │  ← Editable stock
│                                 │
│  모던플러스 서랍                │
│  최소: 5 | 기준: 15       [120] │  ← Editable stock
│                                 │
│  ... (scrollable list)          │
└─────────────────────────────────┘
```

**Inventory Features**:
- Product list with stock levels
- Minimum and reorder point display
- Editable stock numbers
- Real-time updates
- Confirmation for changes

---

### 10. **AI Recommendations**

```
┌─────────────────────────────────┐
│  ⭐ AI 생산 추천 결과      [닫기] │
├─────────────────────────────────┤
│  [최우선] 러블리 옷걸이   50개  │  ← Priority badges
│  이유: 수요 증가 예상          │
│  기계: 2                       │
├─────────────────────────────────┤
│  [우선] 모던플러스 서랍 30개    │
│  이유: 재고 부족                │
│  기계: 4                       │
├─────────────────────────────────┤
│  ... (scrollable grid)          │
└─────────────────────────────────┘
```

**AI Features**:
- Gradient background (Purple to Indigo)
- Priority badges (최우선/우선/일반)
- Product recommendations
- Quantity suggestions
- Reason explanations
- Machine assignments

---

## 🎨 Color Scheme

### Machine Colors:
- **Machine 1**: Blue (border-l-blue-500)
- **Machine 2**: Emerald (border-l-emerald-500)
- **Machine 3**: Amber (border-l-amber-500)
- **Machine 4**: Purple (border-l-purple-500)
- **Machine 5**: Rose (border-l-rose-500)
- **Machine 6**: Cyan (border-l-cyan-500)

### Status Colors:
- **Pending**: Gray outline
- **Started**: Blue filled (bg-blue-500)
- **Completed**: Green filled (bg-green-500)
- **Stopped**: Red filled (bg-red-500)

### KPI Card Gradients:
- **Total Quantity**: Blue (from-blue-50 to-blue-100)
- **Total Unit**: Emerald (from-emerald-50 to-emerald-100)
- **Total Records**: Gray (bg-gray-50)
- **Total Output**: Gray (bg-gray-50)

---

## 📐 Layout Specifications

### Mobile Breakpoints:
- **Small Mobile**: < 640px (Cards, 2x2 grid)
- **Medium Mobile**: 640px - 767px (Same)
- **Tablet**: ≥ 768px (Table view, 3-column filters)

### Touch Targets:
- **Buttons**: Minimum 120px width, 36px height
- **Icons**: 32x32 pixels with padding
- **Cards**: Full width with 8px margins
- **Spacing**: 4px gaps in grid, 2px between buttons

---

## ✨ User Experience Highlights

1. **One-Hand Operation**: Bottom navigation bar accessible
2. **Quick Actions**: Status changes directly on cards
3. **Smooth Animations**: Drag and drop feedback
4. **Visual Hierarchy**: Important info prominently displayed
5. **Touch Optimization**: No accidental zoom/scroll
6. **Progressive Enhancement**: Mobile-first, enhanced on desktop

---

## 🎯 Mobile-First Design Principles Applied

✅ Touch-optimized interactions
✅ Simplified information architecture
✅ Progressive disclosure (filters in drawer)
✅ Fixed navigation for easy access
✅ Visual feedback for all actions
✅ Proper spacing and sizing
✅ Consistent visual language
✅ Korean localization support

---

*This mockup demonstrates the comprehensive mobile UI improvements implemented in the VF production planning system.*