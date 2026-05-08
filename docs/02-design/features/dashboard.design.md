# 주식 공부 대시보드 Design Document

> **Summary**: Yahoo Finance 프록시 + Supabase 캐시로 한/미 주식 OHLCV 차트를 제공하는 학습용 대시보드
>
> **Project**: stock-dashboard
> **Version**: 0.1.0
> **Author**: 이름
> **Date**: 2026-05-08
> **Status**: Draft
> **Planning Doc**: [dashboard.plan.md](../../01-plan/features/dashboard.plan.md)

---

## Context Anchor

> Plan 문서에서 복사. Design → Do 세션 간 컨텍스트 연속성 보장.

| Key | Value |
|-----|-------|
| **WHY** | 한/미 주식 학습 시 OHLCV 차트를 종목명으로 빠르게 조회하는 도구 부재 |
| **WHO** | 개인 학습자, 데스크탑·모바일 환경 모두 사용 |
| **RISK** | Yahoo Finance 비공식 API — IP 차단·구조 변경 시 데이터 수신 불가 |
| **SUCCESS** | 종목 검색 → 차트 3초 이내 로드, 재조회 시 캐시 히트 확인 |
| **SCOPE** | Phase 1: 검색+차트+기간필터 / Phase 2 (선택): 관심종목 |

---

## 1. Overview

### 1.1 Design Goals

- Vanilla JS ES Modules만 사용, 번들 외부 의존성 최소화
- Vercel Serverless로 Yahoo Finance CORS 문제 해결
- Supabase `(symbol, date)` PRIMARY KEY로 중복 없는 캐시 upsert
- 단일 페이지, 단일 `main.js`로 빠른 구현

### 1.2 Design Principles

- **YAGNI**: 현재 요구사항만 구현, 관심종목·포트폴리오는 제외
- **최소 파일 수**: `main.js`에 모든 앱 로직 집중, `chart.js`만 분리
- **에러 그레이스풀**: Yahoo Finance 실패 시 앱 크래시 없이 차트 영역 메시지 표시

---

## 2. Architecture

### 2.0 Architecture Comparison

| 기준 | Option A: 최소 구조 ✅ | Option B: 클린 레이어 | Option C: 균형 설계 |
|------|:-:|:-:|:-:|
| **신규 파일** | 6 | 16 | 13 |
| **테스트** | 없음 (수동) | 8개 Vitest | 5개 Vitest |
| **복잡도** | 낮음 | 높음 | 중간 |
| **유지보수** | 중간 | 높음 | 높음 |
| **구현 노력** | 낮음 | 높음 | 중간 |

**Selected**: Option A — **Rationale**: 개인 학습 도구, 기능 범위 고정됨, 빠른 구현 우선

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│  Browser                                                │
│  ┌───────────────┐   ┌────────────┐                     │
│  │  main.js      │──▶│  chart.js  │                     │
│  │  (검색·UI·이벤트)│   │(Chart.js) │                     │
│  └───────┬───────┘   └────────────┘                     │
└──────────┼──────────────────────────────────────────────┘
           │ fetch /api/*
┌──────────▼──────────────────────────────────────────────┐
│  Vercel Serverless                                      │
│  ┌──────────────┐   ┌──────────────────────────────┐    │
│  │ api/search.js│   │       api/stock.js            │    │
│  │ (검색 프록시)  │   │ (OHLCV + Supabase 캐시)       │    │
│  └──────┬───────┘   └──────────┬───────────────────┘    │
└─────────┼─────────────────────┼────────────────────────┘
          │                     │
          ▼                     ▼
  Yahoo Finance          Yahoo Finance +
  /v1/finance/search     /v8/finance/chart
                               │
                               ▼
                         Supabase DB
                    (stocks, ohlcv_daily)
```

### 2.2 Data Flow

```
[검색 자동완성]
사용자 타이핑(300ms debounce)
  → fetch /api/search?q={query}
  → Yahoo Finance /v1/finance/search
  → [{symbol, name, market}] 드롭다운

[차트 로드]
종목 선택 or 기간 변경
  → fetch /api/stock?symbol=&from=&to=
  → Supabase ohlcv_daily 캐시 조회
    ├ HIT  → 캐시 데이터 반환
    └ MISS → Yahoo Finance /v8/finance/chart
             → Supabase upsert
             → 데이터 반환
  → Chart.js 렌더링 (라인 or 캔들)

[차트 타입 토글]
[라인|캔들] 버튼 클릭
  → API 재호출 없이 기존 rows 데이터로 재렌더링
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| `main.js` | `chart.js`, `/api/search`, `/api/stock` | 앱 로직 전체 |
| `chart.js` | `chart.js` npm, `chartjs-chart-financial`, `chartjs-adapter-date-fns` | 차트 렌더링 |
| `api/search.js` | Yahoo Finance (fetch), Node.js native fetch | 검색 프록시 |
| `api/stock.js` | Yahoo Finance (fetch), `@supabase/supabase-js` | OHLCV + 캐시 |

---

## 3. Data Model

### 3.1 Supabase DB Schema

```sql
-- 종목 메타 정보
CREATE TABLE stocks (
  symbol     TEXT PRIMARY KEY,        -- '005930.KS', 'AAPL'
  name       TEXT NOT NULL,           -- '삼성전자', 'Apple Inc.'
  market     TEXT NOT NULL CHECK (market IN ('KR', 'US')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- OHLCV 일봉 캐시
CREATE TABLE ohlcv_daily (
  symbol     TEXT NOT NULL REFERENCES stocks(symbol),
  date       DATE NOT NULL,
  open       NUMERIC NOT NULL,
  high       NUMERIC NOT NULL,
  low        NUMERIC NOT NULL,
  close      NUMERIC NOT NULL,
  volume     BIGINT,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (symbol, date)           -- 중복 없는 upsert 보장
);

ALTER TABLE stocks DISABLE ROW LEVEL SECURITY;
ALTER TABLE ohlcv_daily DISABLE ROW LEVEL SECURITY;
```

### 3.2 Entity Relationships

```
stocks (1) ──── (N) ohlcv_daily
  symbol PK          symbol FK + date PK
```

### 3.3 JavaScript Data Shape

```js
// 자동완성 결과 항목
{ symbol: '005930.KS', name: '삼성전자', market: 'KR' }

// OHLCV 행 (Supabase / Yahoo Finance 공통)
{ symbol: 'AAPL', date: '2024-01-02', open: 185.2, high: 188.0, low: 184.1, close: 187.5, volume: 55000000 }

// Chart.js 라인용
{ labels: ['2024-01-02', ...], data: [187.5, ...] }

// Chart.js 캔들용
{ x: '2024-01-02', o: 185.2, h: 188.0, l: 184.1, c: 187.5 }
```

---

## 4. API Specification

### 4.1 Endpoint List

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/search?q={query}` | 종목 자동완성 검색 | 없음 |
| GET | `/api/stock?symbol=&from=&to=` | OHLCV 일봉 조회 (캐시 포함) | 없음 |

### 4.2 `GET /api/search`

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| `q` | string | ✅ | 검색어 (종목명 or 심볼) |

**Response (200):**
```json
{
  "results": [
    { "symbol": "005930.KS", "name": "삼성전자", "market": "KR" },
    { "symbol": "AAPL", "name": "Apple Inc.", "market": "US" }
  ]
}
```

**Error (400):**
```json
{ "error": "검색어가 필요합니다" }
```

**내부 처리:**
- Yahoo Finance `exchDisp` 필드 기준: `KSE`·`KOE`·`KOC` → `KR`, 그 외 → `US`
- `quoteType` = `EQUITY` 또는 `ETF`만 포함

### 4.3 `GET /api/stock`

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| `symbol` | string | ✅ | 종목 심볼 (예: `005930.KS`, `AAPL`) |
| `from` | string | ✅ | 시작일 `YYYY-MM-DD` |
| `to` | string | ✅ | 종료일 `YYYY-MM-DD` |

**Response (200):**
```json
{
  "data": [
    { "symbol": "AAPL", "date": "2024-01-02", "open": 185.2, "high": 188.0, "low": 184.1, "close": 187.5, "volume": 55000000 }
  ],
  "source": "cache"
}
```
`source`: `"cache"` (Supabase 히트) | `"yahoo"` (Yahoo Finance 호출)

**Error (400):**
```json
{ "error": "symbol, from, to 파라미터가 필요합니다" }
```

**Error (404):**
```json
{ "error": "데이터를 찾을 수 없습니다" }
```

**캐시 로직:**
```
1. Supabase ohlcv_daily WHERE symbol=? AND date BETWEEN from AND to
2. 결과 있고 마지막 date >= to → 캐시 반환 (source: "cache")
3. 결과 없거나 불완전 → Yahoo Finance 호출
   a. stocks 테이블 upsert (symbol, name, market) — FK 위반 방지
   b. ohlcv_daily upsert (PRIMARY KEY 기준 중복 없음)
   c. 데이터 반환 (source: "yahoo")
```

---

## 5. UI/UX Design

### 5.1 Screen Layout

```
┌─────────────────────────────────────────────────────────┐
│  max-width: 1024px, padding: 32px 16px                  │
│                                                         │
│  [검색창──────────────────────────]  [검색 버튼]         │
│  ┌─ 자동완성 드롭다운 ─────────────┐                     │
│  │ 삼성전자   005930.KS   KR       │                     │
│  │ 삼성SDI    006400.KS   KR       │                     │
│  └────────────────────────────────┘                     │
│                                                         │
│  [1W][1M][3M][6M][1Y][5Y]  [날짜──] ~ [날짜──] [적용]   │
│                                                         │
│  ┌─── 차트 섹션 (background: white, border-radius) ───┐  │
│  │  종목명 (심볼)            [라인] [캔들]              │  │
│  │  ┌─────────────────────────────────────────────┐   │  │
│  │  │              Chart.js canvas                │   │  │
│  │  │              height: 420px                  │   │  │
│  │  └─────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

모바일 (< 640px):
- 검색창 + 버튼: 세로 스택
- 프리셋 버튼: 줄바꿈 허용 (flex-wrap)
- 날짜 범위: 세로 스택
- 차트 height: 280px
```

### 5.2 User Flow

```
[최초 접속]
  → 검색창 포커스 상태, 차트 영역 "종목을 검색하세요" 안내

[자동완성]
  타이핑 → 300ms debounce → /api/search → 드롭다운 표시
  드롭다운 밖 클릭 → 드롭다운 닫힘

[6자리 숫자 입력 + 검색 버튼]
  005930 입력 → .KS 자동 추가 → /api/stock 직접 호출

[종목 선택]
  드롭다운 클릭 → 기본 3M 기간 → 차트 로드

[기간 변경]
  프리셋 버튼 → 해당 기간 차트 갱신
  날짜 입력 + [적용] → 해당 기간 차트 갱신

[차트 타입 토글]
  [라인|캔들] 클릭 → API 재호출 없이 재렌더링
```

### 5.3 Component List

| Element | DOM ID / Class | Responsibility |
|---------|---------------|----------------|
| 검색 입력창 | `#search-input` | 사용자 입력, 디바운스 트리거 |
| 검색 버튼 | `#search-btn` | 수동 검색, 6자리 변환 처리 |
| 자동완성 목록 | `#dropdown` (`<ul>`) | 검색 결과 드롭다운 |
| 프리셋 버튼들 | `[data-preset]` | 기간 프리셋 선택 |
| 시작일 입력 | `#from-date` | 커스텀 날짜 범위 시작 |
| 종료일 입력 | `#to-date` | 커스텀 날짜 범위 종료 |
| 적용 버튼 | `#apply-date` | 커스텀 날짜 적용 |
| 차트 타입 버튼들 | `[data-type]` | 라인/캔들 토글 |
| 차트 캔버스 | `#chart-canvas` | Chart.js 렌더링 대상 |
| 차트 타이틀 | `#chart-title` | 선택된 종목명(심볼) 표시 |

### 5.4 Page UI Checklist

#### 메인 대시보드 (단일 페이지)

**검색 영역:**
- [ ] 입력창: placeholder "종목명 또는 심볼 입력 (예: 삼성전자, AAPL)", autocomplete off
- [ ] 검색 버튼: 클릭 시 검색 실행
- [ ] 자동완성 드롭다운: 종목명 + 심볼 + 시장(KR/US) 3열 표시
- [ ] 자동완성 드롭다운: 외부 클릭 시 닫힘
- [ ] 자동완성 드롭다운: 결과 없을 때 숨김 (`display: none`)

**기간 필터 영역:**
- [ ] 프리셋 버튼: 1W / 1M / 3M / 6M / 1Y / 5Y (6개)
- [ ] 프리셋 버튼: 활성 상태 시각적 구분 (`.active` 클래스, 파란 배경)
- [ ] 시작일 입력: `type="date"` input
- [ ] 종료일 입력: `type="date"` input
- [ ] 적용 버튼: 커스텀 날짜 범위 적용

**차트 영역:**
- [ ] 차트 타이틀: "종목명 (심볼)" 형식 표시
- [ ] 라인 버튼: `data-type="line"`, 활성 시 `.active`
- [ ] 캔들 버튼: `data-type="candlestick"`, 활성 시 `.active`
- [ ] Chart.js 캔버스: `#chart-canvas`
- [ ] 에러 메시지: API 실패 시 차트 영역에 텍스트 표시
- [ ] 초기 안내: 종목 미선택 시 "종목을 검색하세요" 표시

---

## 6. Error Handling

### 6.1 에러 시나리오 및 처리

| 시나리오 | 처리 방식 |
|---------|----------|
| `/api/search` 실패 | 드롭다운 미표시, `console.error` |
| `/api/stock` 실패 | 차트 영역에 "데이터를 불러올 수 없습니다" 표시 |
| Yahoo Finance 404 | `api/stock.js`에서 404 반환 → 프론트 에러 메시지 |
| 심볼 미입력 상태 프리셋 클릭 | 무시 (currentSymbol null 체크) |
| 날짜 미입력 상태 [적용] 클릭 | 무시 (from/to 값 체크) |

### 6.2 에러 표시 함수 (`main.js` 내)

```js
function showChartError(message) {
  const title = document.getElementById('chart-title')
  const canvas = document.getElementById('chart-canvas')
  title.textContent = message
  canvas.style.display = 'none'
}

function clearChartError() {
  const canvas = document.getElementById('chart-canvas')
  canvas.style.display = 'block'
}
```

---

## 7. Security Considerations

- [ ] 환경변수: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — `.env` Git 미포함
- [ ] XSS: `innerHTML` 사용 시 종목명 이스케이프 처리 (드롭다운 렌더링)
- [ ] Supabase RLS 비활성화 (개인 학습용, public 배포 시 재검토 필요)
- [ ] Yahoo Finance User-Agent 헤더 설정 (IP 차단 방지)
- [ ] Vercel 환경변수로 민감 정보 관리

---

## 8. Test Plan

> Option A 선택으로 자동화 테스트 없음. 수동 브라우저 테스트로 검증.

### 8.1 수동 테스트 시나리오

| # | 시나리오 | 테스트 방법 | 성공 기준 |
|---|---------|-----------|----------|
| T1 | 종목명 검색 자동완성 | "삼성" 입력 → 드롭다운 확인 | 삼성전자 등 결과 표시 |
| T2 | 심볼 검색 | "AAPL" 입력 → 드롭다운 확인 | Apple Inc. 표시 |
| T3 | 6자리 직접 입력 | "005930" + [검색] | .KS 변환 후 차트 로드 |
| T4 | 차트 첫 로드 | 종목 선택 | 3M 기간 라인 차트 표시 |
| T5 | 프리셋 기간 변경 | [1Y] 클릭 | 1년 데이터 차트 갱신 |
| T6 | 커스텀 날짜 | 날짜 입력 + [적용] | 해당 기간 차트 표시 |
| T7 | 캔들 전환 | [캔들] 클릭 | API 재호출 없이 캔들 차트 표시 |
| T8 | 라인 전환 | [라인] 클릭 | 라인 차트 복귀 |
| T9 | 캐시 재조회 | 동일 종목+기간 재선택 | Network 탭에서 source: "cache" 확인 |
| T10 | 에러 처리 | 잘못된 심볼 입력 | 에러 메시지 표시, 앱 크래시 없음 |
| T11 | 모바일 반응형 | DevTools 375px | 레이아웃 깨짐 없음 |

### 8.2 API 수동 테스트

```bash
# 검색 테스트
curl "http://localhost:3000/api/search?q=samsung"
# 기대: { results: [{symbol: '005930.KS', name: '삼성전자', market: 'KR'}, ...] }

# OHLCV 테스트
curl "http://localhost:3000/api/stock?symbol=AAPL&from=2024-01-01&to=2024-03-31"
# 기대: { data: [...], source: 'yahoo' } 첫 호출
# 재호출: source: 'cache'

# 파라미터 누락 테스트
curl "http://localhost:3000/api/stock?symbol=AAPL"
# 기대: 400 { error: 'symbol, from, to 파라미터가 필요합니다' }
```

---

## 9. Architecture

### 9.1 Layer Structure (Simplified — Vanilla JS Option A)

| Layer | Responsibility | Location |
|-------|---------------|----------|
| **Presentation + Application** | UI 렌더링, 이벤트, 비즈니스 로직 | `scripts/main.js` |
| **Chart Rendering** | Chart.js 래퍼, 데이터 변환 | `scripts/chart.js` |
| **Infrastructure (Server)** | Yahoo Finance 프록시, Supabase 캐시 | `api/search.js`, `api/stock.js` |
| **Data** | DB 스키마 | `supabase/migrations/` |

### 9.2 File Dependency

```
index.html
  └── scripts/main.js (type="module")
        └── scripts/chart.js

Browser fetch() ──▶ /api/search (Vercel)
                     └── Yahoo Finance
Browser fetch() ──▶ /api/stock (Vercel)
                     └── Yahoo Finance
                     └── Supabase DB
```

---

## 10. Coding Convention Reference

### 10.1 This Feature's Conventions (CLAUDE.md 기준)

| 항목 | 규칙 |
|------|------|
| 함수명 | camelCase: `loadChart`, `handleSearch`, `getPresetRange` |
| 파일명 | kebab-case: `main.js`, `chart.js` (단 현재 파일명은 단순) |
| 들여쓰기 | 스페이스 2칸 |
| 주석 | 한국어, WHY 중심 |
| 모듈 | `import/export` ES Modules, `require()` 금지 |
| 환경변수 | `VITE_` 접두사, `.env` Git 제외 |

### 10.2 Environment Variables

| Variable | Browser 접근 | Vercel Function 접근 |
|----------|------------|---------------------|
| `VITE_SUPABASE_URL` | `import.meta.env.VITE_SUPABASE_URL` | `process.env.VITE_SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | `import.meta.env.VITE_SUPABASE_ANON_KEY` | `process.env.VITE_SUPABASE_ANON_KEY` |

---

## 11. Implementation Guide

### 11.1 File Structure

```
dashboard-project/
├── index.html                          # HTML 셸
├── styles/
│   └── main.css                        # 반응형 스타일
├── scripts/
│   ├── main.js                         # 앱 로직 전체 (검색·필터·이벤트)
│   └── chart.js                        # Chart.js 라인/캔들 래퍼
├── api/
│   ├── search.js                       # Vercel: Yahoo Finance 검색 프록시
│   └── stock.js                        # Vercel: OHLCV + Supabase 캐시
├── supabase/
│   └── migrations/
│       └── 001_initial.sql             # DB 스키마
├── package.json
├── vite.config.js                      # /api 프록시 설정
└── vercel.json                         # Vercel 빌드 설정
```

### 11.2 Implementation Order

1. [ ] `package.json` + `vite.config.js` + `vercel.json` 생성 및 `npm install`
2. [ ] `supabase/migrations/001_initial.sql` 생성 → Supabase SQL Editor에서 실행
3. [ ] `api/search.js` 구현 → `curl` 수동 테스트
4. [ ] `api/stock.js` 구현 → `curl` 수동 테스트 (캐시 히트/미스 확인)
5. [ ] `scripts/chart.js` 구현 (renderLineChart, renderCandleChart, toLineDataset, toCandleDataset)
6. [ ] `index.html` + `styles/main.css` 구현
7. [ ] `scripts/main.js` 구현 (검색, 자동완성, 기간 필터, 차트 토글 전체)
8. [ ] `vercel dev`로 통합 동작 확인 (T1~T11 수동 테스트)
9. [ ] `npm run build` + Vercel 배포

### 11.3 Session Guide

> `/pdca do dashboard --scope module-N` 으로 단계별 구현 가능.

#### Module Map

| Module | Scope Key | Description | 예상 턴 수 |
|--------|-----------|-------------|:---------:|
| 프로젝트 설정 + DB | `module-1` | package.json, vite.config.js, vercel.json, SQL 스키마 | 15-20 |
| Vercel API 함수 | `module-2` | api/search.js + api/stock.js | 20-25 |
| Chart.js 래퍼 | `module-3` | scripts/chart.js (라인+캔들) | 15-20 |
| HTML + CSS | `module-4` | index.html + styles/main.css (반응형) | 15-20 |
| 앱 메인 로직 | `module-5` | scripts/main.js (검색·필터·이벤트 전체) | 30-40 |

#### Recommended Session Plan

| Session | Phase | Scope | 예상 턴 |
|---------|-------|-------|:-------:|
| Session 1 | Plan + Design | 전체 | 35-40 |
| Session 2 | Do | `--scope module-1,module-2` | 35-45 |
| Session 3 | Do | `--scope module-3,module-4,module-5` | 50-60 |
| Session 4 | Check + 수동 테스트 | 전체 | 20-30 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-08 | Initial draft (Option A 선택) | 이름 |
