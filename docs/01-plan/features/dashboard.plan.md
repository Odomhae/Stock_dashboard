# 주식 공부 대시보드 Planning Document

> **Summary**: Yahoo Finance 데이터를 Supabase에 캐싱하여 한/미 주식 OHLCV 차트를 학습용으로 시각화하는 대시보드
>
> **Project**: stock-dashboard
> **Version**: 0.1.0
> **Author**: 이름
> **Date**: 2026-05-08
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 한국·미국 주식을 공부할 때 종목별 OHLCV 차트를 빠르게 조회할 수 있는 도구가 없음 |
| **Solution** | Yahoo Finance API를 Vercel Serverless로 프록시하고 Supabase에 캐싱, Vanilla JS로 라인/캔들 차트 제공 |
| **Function/UX Effect** | 종목명·심볼 자동완성 검색 → 기간 필터 → 라인/캔들 전환까지 3-step UX, 재조회 시 캐시 히트로 즉시 렌더링 |
| **Core Value** | 별도 가입 없이 URL 하나로 한/미 주식 차트 학습 환경 즉시 이용 가능 |

---

## Context Anchor

> Executive Summary에서 자동 생성. Design/Do 문서로 전파되어 세션 간 컨텍스트 연속성을 보장.

| Key | Value |
|-----|-------|
| **WHY** | 한/미 주식 학습 시 OHLCV 차트를 종목명으로 빠르게 조회하는 도구 부재 |
| **WHO** | 개인 학습자 (개발자 본인), 데스크탑·모바일 환경 모두 사용 |
| **RISK** | Yahoo Finance 비공식 API — IP 차단·구조 변경 시 데이터 수신 불가 |
| **SUCCESS** | 종목 검색 → 차트 3초 이내 로드, 재조회 시 캐시 히트 확인 |
| **SCOPE** | Phase 1: 검색+차트+기간필터 / Phase 2 (선택): 관심종목·포트폴리오 |

---

## 1. Overview

### 1.1 Purpose

한국 및 미국 주식(개별 종목 + ETF)의 OHLCV 데이터를 조회하고 라인/캔들스틱 차트로 학습할 수 있는 경량 대시보드를 구축한다. 종목명 또는 심볼로 검색하고, 기간을 필터링하여 차트를 즉시 확인하는 것이 핵심 목적이다.

### 1.2 Background

주식 공부 시 여러 사이트를 오가지 않고 단일 URL에서 한/미 종목을 함께 조회할 수 있는 개인 학습 도구가 필요하다. Yahoo Finance API를 서버사이드에서 프록시하여 CORS 문제를 해결하고, Supabase에 캐싱하여 반복 조회 속도를 높인다.

### 1.3 Related Documents

- 설계 문서: `docs/superpowers/specs/2026-05-08-stock-dashboard-design.md`
- 기술 스택: CLAUDE.md

---

## 2. Scope

### 2.1 In Scope

- [x] 종목명·심볼 자동완성 검색 (Yahoo Finance /v1/finance/search 프록시)
- [x] 6자리 숫자 입력 시 `.KS` 자동 변환 (예: `005930` → `005930.KS`)
- [x] OHLCV 일봉 데이터 조회 (Yahoo Finance /v8/finance/chart 프록시)
- [x] Supabase 캐싱 (`stocks`, `ohlcv_daily` 테이블)
- [x] 기간 프리셋 필터: 1W / 1M / 3M / 6M / 1Y / 5Y
- [x] 커스텀 날짜 범위 입력 (시작일~종료일)
- [x] 라인 차트 (Chart.js 4)
- [x] 캔들스틱 차트 (chartjs-chart-financial)
- [x] 라인/캔들 토글 (동일 데이터, API 재호출 없음)
- [x] 데스크탑 + 모바일 반응형 레이아웃
- [x] API 오류 시 차트 영역 에러 메시지 표시
- [x] Vercel 배포

### 2.2 Out of Scope

- 사용자 인증 / 로그인
- 관심 종목 저장 (Watchlist)
- 포트폴리오 손익 계산
- 실시간 시세 (WebSocket)
- 뉴스 / 재무제표 연동
- 알림 기능

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 검색창에 종목명(한글/영문) 또는 심볼 입력 시 Yahoo Finance 검색 API 호출 | High | Pending |
| FR-02 | 300ms 디바운스 후 자동완성 드롭다운 표시 (symbol, name, market 포함) | High | Pending |
| FR-03 | 숫자 6자리 입력 시 `.KS` 접미사 자동 추가 후 직접 차트 로드 | High | Pending |
| FR-04 | 자동완성 선택 시 `stocks` 테이블에 upsert 후 기본 3M 기간으로 차트 로드 | High | Pending |
| FR-05 | 프리셋 버튼(1W/1M/3M/6M/1Y/5Y) 클릭 시 해당 기간 OHLCV 조회 | High | Pending |
| FR-06 | 커스텀 날짜 범위 입력 후 [적용] 클릭 시 해당 기간 OHLCV 조회 | High | Pending |
| FR-07 | `/api/stock` 호출 시 Supabase `ohlcv_daily` 캐시 조회 → 히트 시 Yahoo 재호출 없음 | High | Pending |
| FR-08 | 캐시 미스 시 Yahoo Finance 호출 → Supabase upsert → 반환 | High | Pending |
| FR-09 | [라인] / [캔들] 토글 버튼으로 차트 형식 전환 (API 재호출 없음) | Medium | Pending |
| FR-10 | `market` 값은 Yahoo Finance `exchDisp` 기준: KSE·KOE → KR, 그 외 → US | Medium | Pending |
| FR-11 | API 오류 시 차트 영역에 에러 메시지 표시 | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 캐시 히트 시 차트 렌더링 1초 이내 | 브라우저 Network 탭 확인 |
| Performance | 캐시 미스 시 Yahoo Finance 응답 3초 이내 | 브라우저 Network 탭 확인 |
| Responsiveness | 모바일(375px) ~ 데스크탑(1440px) 정상 표시 | 브라우저 DevTools 반응형 모드 |
| Stability | Yahoo Finance 오류 시 앱 크래시 없음 | 수동 테스트 (네트워크 차단) |
| Deployment | Vercel main 브랜치 푸시 시 자동 배포 | Vercel 대시보드 확인 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01 ~ FR-11 전체 구현 완료
- [ ] Vitest 단위 테스트 작성 및 통과 (search handler, stock handler, db, api-client, chart 변환)
- [ ] `npm run build` 성공
- [ ] `vercel dev`로 로컬 통합 동작 확인 (검색 → 차트 → 기간 변경 → 토글)
- [ ] Vercel 배포 후 프로덕션 URL에서 동작 확인

### 4.2 Quality Criteria

- [ ] Vitest 테스트 전체 통과
- [ ] ESLint 에러 없음 (Vite 기본 설정 기준)
- [ ] `.env` 파일 Git 미포함 확인
- [ ] VITE_ 접두사 환경변수 규칙 준수

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Yahoo Finance 비공식 API — IP 차단 또는 응답 구조 변경 | High | Medium | User-Agent 헤더 설정, 에러 핸들링으로 그레이스풀 실패 처리 |
| `chartjs-chart-financial` ↔ Chart.js 4 버전 호환 문제 | Medium | Low | npm install 후 즉시 렌더링 테스트, 불호환 시 floating bar 대체 |
| Supabase anon key 노출 (RLS 미설정 시) | Medium | Low | 개인 학습용 → RLS 비활성화, Vercel env에서만 관리 |
| Vercel 무료 티어 Serverless 실행 횟수 초과 | Low | Low | 캐싱으로 API 호출 최소화, 개인 사용량으로 한계 초과 비가능 |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `stocks` | DB Table (신규) | 종목 메타정보 저장 |
| `ohlcv_daily` | DB Table (신규) | OHLCV 일봉 캐시 저장 |
| `/api/search` | Vercel Function (신규) | Yahoo Finance 검색 프록시 |
| `/api/stock` | Vercel Function (신규) | OHLCV 조회 + 캐시 처리 |

### 6.2 Current Consumers

그린필드 프로젝트 — 기존 소비자 없음.

### 6.3 Verification

- [x] 기존 소비자 없음 (init 커밋 이후 소스 파일 미존재)
- [x] 환경변수 충돌 없음

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | Simple structure | Static sites, portfolios | ☐ |
| **Dynamic** | Feature-based modules, BaaS integration | Web apps with backend, SaaS MVPs | ☑ |
| **Enterprise** | Strict layer separation, microservices | High-traffic systems | ☐ |

**Dynamic 선택 이유**: Supabase BaaS + Vercel Serverless 조합의 풀스택 앱. 단, Vanilla JS 스택이므로 프레임워크 기반 Dynamic보다 단순한 구조 적용.

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| Frontend | React / Vue / Vanilla JS | Vanilla JS (ES Modules) | CLAUDE.md 스택 고정 |
| API Proxy | Vercel Functions / Supabase Edge / CORS Proxy | Vercel Serverless | 배포 플랫폼 일치, Node.js 생태계 |
| Caching | Supabase DB / localStorage / 없음 | Supabase DB | 서버사이드 캐시로 모든 디바이스 공유 |
| Chart Library | Chart.js / lightweight-charts / D3 | Chart.js 4 + chartjs-chart-financial | CLAUDE.md 스택 고정 |
| Testing | Jest / Vitest / 없음 | Vitest | Vite 생태계 통합, ESM 지원 |
| Styling | Tailwind / CSS Modules / Vanilla CSS | Vanilla CSS (main.css) | 의존성 최소화 |

### 7.3 Clean Architecture Approach

```
Dynamic Level (Simplified — Vanilla JS):

dashboard-project/
├── index.html
├── styles/main.css
├── scripts/           ← 브라우저 레이어
│   ├── app.js         # 진입점, 이벤트 바인딩
│   ├── supabase.js    # BaaS 클라이언트
│   ├── db.js          # DB 쿼리 (stocks upsert)
│   ├── api.js         # /api/* fetch 래퍼
│   ├── chart.js       # Chart.js 래퍼
│   └── ui.js          # DOM, 자동완성, 필터
└── api/               ← 서버 레이어 (Vercel)
    ├── search.js      # Yahoo Finance 검색 프록시
    └── stock.js       # OHLCV + Supabase 캐시
```

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

- [x] `CLAUDE.md` — 코딩 컨벤션 정의됨 (camelCase, kebab-case, 스페이스 2칸, 한국어 주석)
- [ ] `docs/01-plan/conventions.md` — 미존재 (Phase 2 생략 가능, CLAUDE.md로 충분)
- [ ] ESLint 설정 — 미존재 (Vite 기본 설정 사용)

### 8.2 Conventions to Define/Verify

| Category | Current State | Rule |
|----------|---------------|------|
| **Naming** | CLAUDE.md 정의됨 | 함수 camelCase, 파일 kebab-case |
| **Folder structure** | CLAUDE.md 정의됨 | scripts/, api/, styles/ |
| **Import order** | 미정의 | ES module import, require() 금지 |
| **Environment variables** | CLAUDE.md 정의됨 | VITE_ 접두사 필수 |
| **Error handling** | 미정의 | try/catch + 차트 영역 에러 메시지 |

### 8.3 Environment Variables Needed

| Variable | Purpose | Scope |
|----------|---------|-------|
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL | Browser + Vercel Function |
| `VITE_SUPABASE_ANON_KEY` | Supabase 익명 키 | Browser + Vercel Function |

> Vercel Function에서는 `process.env.VITE_SUPABASE_URL` 로 접근.
> `.env` 파일은 절대 Git 커밋 금지.

---

## 9. Next Steps

1. [ ] Design 문서 작성: `/pdca design dashboard`
2. [ ] 구현 계획 작성 (writing-plans 스킬 연계)
3. [ ] 구현 시작: `/pdca do dashboard`

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-08 | Initial draft | 이름 |
