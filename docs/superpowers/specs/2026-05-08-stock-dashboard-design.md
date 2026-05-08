# 주식 공부 대시보드 — 설계 문서

**날짜:** 2026-05-08  
**스택:** HTML5 / CSS3 / Vanilla JS (ES Modules) · Vite 5 · Supabase JS · Chart.js 4 · Vercel

---

## 1. 개요

한국 및 미국 주식(개별 종목 + ETF)의 OHLCV 데이터를 조회하고 차트로 시각화하는 학습용 대시보드.  
종목 검색(자동완성), 기간 필터, 라인/캔들스틱 차트 전환을 핵심 기능으로 한다.

---

## 2. 전체 구조 & 데이터 흐름

### 자동완성 흐름
```
사용자 타이핑 (디바운스 300ms)
    │
GET /api/search?q={query}
    │
Yahoo Finance /v1/finance/search 호출
    │
[{ symbol, name, market }] 반환 → 드롭다운 표시
    │
종목 선택 → stocks 테이블 upsert → 차트 로드
```

### 차트 데이터 흐름
```
기간 선택 (프리셋 or 커스텀)
    │
GET /api/stock?symbol=...&from=...&to=...
    │
Supabase ohlcv_daily 조회
    ├─ HIT  → 캐시 데이터 반환
    └─ MISS → Yahoo Finance OHLCV 호출
                    │
              Supabase ohlcv_daily upsert
                    │
              프론트엔드에 JSON 반환
    │
Chart.js 렌더링 (라인 or 캔들)
```

### 심볼 처리 규칙
- 숫자 6자리 입력 시 자동으로 `.KS` 접미사 추가 (예: `005930` → `005930.KS`)
- 영문 심볼 그대로 사용 (예: `AAPL`, `SPY`)
- 자동완성 결과에는 심볼 · 종목명 · 시장(KR/US) 표시
- `market` 값은 Yahoo Finance 검색 응답의 `exchDisp` 필드에서 도출: `KSE`·`KOSDAQ` → `KR`, 그 외 → `US`

### 캐싱 정책
- `(symbol, date)` 기준으로 이미 저장된 날짜는 Yahoo Finance 재호출 없음
- 오늘 날짜 데이터는 장 마감 이후 1회 갱신 (한국 15:30 KST, 미국 04:00 KST 기준)

---

## 3. Supabase DB 스키마

```sql
-- 종목 메타 정보
CREATE TABLE stocks (
  symbol     TEXT PRIMARY KEY,        -- '005930.KS', 'AAPL'
  name       TEXT NOT NULL,           -- '삼성전자', 'Apple Inc.'
  market     TEXT NOT NULL,           -- 'KR', 'US'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- OHLCV 일봉 데이터 캐시
CREATE TABLE ohlcv_daily (
  symbol     TEXT NOT NULL REFERENCES stocks(symbol),
  date       DATE NOT NULL,
  open       NUMERIC NOT NULL,
  high       NUMERIC NOT NULL,
  low        NUMERIC NOT NULL,
  close      NUMERIC NOT NULL,
  volume     BIGINT,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (symbol, date)
);
```

---

## 4. 파일 구조

```
dashboard-project/
├── index.html
├── vite.config.js          # /api/* → Vercel dev 서버 프록시
├── vercel.json             # Vercel 빌드/라우팅 설정
├── .env                    # Git 제외 (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
├── .gitignore
│
├── styles/
│   └── main.css
│
├── scripts/
│   ├── app.js              # 진입점 — 모듈 조합, 이벤트 바인딩
│   ├── supabase.js         # Supabase 클라이언트 초기화
│   ├── db.js               # Supabase 쿼리 전담 (캐시 읽기/쓰기)
│   ├── api.js              # /api/search, /api/stock fetch 래퍼
│   ├── chart.js            # Chart.js 래퍼 (라인/캔들 전환)
│   └── ui.js               # DOM 조작, 자동완성 드롭다운
│
└── api/                    # Vercel Serverless Functions
    ├── search.js           # Yahoo Finance 검색 프록시
    └── stock.js            # OHLCV 조회 + Supabase 캐시 처리
```

### 파일별 책임

| 파일 | 책임 |
|------|------|
| `app.js` | 이벤트 연결, 전체 흐름 조율 |
| `supabase.js` | 클라이언트 인스턴스 생성 (환경변수 참조) |
| `db.js` | `ohlcv_daily`, `stocks` 테이블 쿼리 전담 |
| `api.js` | Vercel API 라우트 fetch 래퍼 |
| `chart.js` | 라인/캔들 차트 생성 및 데이터 업데이트 |
| `ui.js` | 자동완성 드롭다운, 기간 필터 UI 렌더링 |
| `api/search.js` | Yahoo Finance 검색 API 프록시 |
| `api/stock.js` | OHLCV fetch + 캐시 히트/미스 처리 |

---

## 5. UI 레이아웃

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  ┌─────────────────────────────────┐  ┌─────────┐  │
│  │  🔍  종목명 또는 심볼 입력...    │  │  검색   │  │
│  └─────────────────────────────────┘  └─────────┘  │
│    ┌──────────────────────────────┐                 │
│    │  삼성전자  005930.KS   KR    │  ← 자동완성     │
│    │  삼성SDI   006400.KS   KR    │    드롭다운     │
│    │  Samsung   SSUN    US        │                 │
│    └──────────────────────────────┘                 │
│                                                     │
│  [ 1W ][ 1M ][ 3M ][ 6M ][ 1Y ][ 5Y ]             │
│  시작일 [2024-01-01]  종료일 [2025-01-01]  [적용]   │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  삼성전자 (005930.KS)          [ 라인 | 캔들 ]      │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │                                               │  │
│  │                  차트 영역                    │  │
│  │                                               │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 인터랙션 흐름
1. 검색창 타이핑 → 300ms 디바운스 → 자동완성 드롭다운 표시
2. 드롭다운에서 종목 클릭 → 기본 기간(3M)으로 차트 즉시 로드
3. 프리셋 버튼 클릭 → 해당 기간으로 차트 갱신
4. 커스텀 날짜 입력 후 [적용] → 해당 기간으로 차트 갱신
5. [라인 | 캔들] 토글 → 동일 데이터로 차트 형식만 전환 (API 재호출 없음)

---

## 6. 환경변수

| 변수명 | 용도 |
|--------|------|
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase 익명 키 |

Vercel 배포 시 대시보드에서 동일 변수명으로 등록 필요.

---

## 7. 개발 환경 실행

```bash
npm run dev      # Vite 개발 서버 (프론트엔드)
vercel dev       # Vercel dev 서버 (API 라우트 포함, 포트 3000)
```

로컬 개발 시 `vite.config.js`에서 `/api/*` 요청을 `localhost:3000`으로 프록시하여 Vercel API 라우트를 동일하게 테스트한다.
