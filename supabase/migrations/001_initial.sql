-- 종목 메타 정보
CREATE TABLE stocks (
  symbol     TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  market     TEXT NOT NULL CHECK (market IN ('KR', 'US')),
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

ALTER TABLE stocks DISABLE ROW LEVEL SECURITY;
ALTER TABLE ohlcv_daily DISABLE ROW LEVEL SECURITY;
