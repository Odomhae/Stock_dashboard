// Design Ref: §4.3 — OHLCV 조회 + Supabase 캐시 히트/미스 처리
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  const { symbol, from, to } = req.query

  if (!symbol || !from || !to) {
    return res.status(400).json({ error: 'symbol, from, to 파라미터가 필요합니다' })
  }

  // 1. Supabase 캐시 조회
  const { data: cached, error: dbErr } = await supabase
    .from('ohlcv_daily')
    .select('symbol, date, open, high, low, close, volume')
    .eq('symbol', symbol)
    .gte('date', from)
    .lte('date', to)
    .order('date')

  if (!dbErr && cached && cached.length > 0) {
    const lastDate = cached[cached.length - 1].date
    // 마지막 캐시 날짜가 요청 종료일 이상이면 캐시 히트
    if (lastDate >= to) {
      return res.status(200).json({ data: cached, source: 'cache' })
    }
  }

  // 2. Yahoo Finance 호출 (캐시 미스)
  try {
    const fromTs = Math.floor(new Date(from).getTime() / 1000)
    // to 날짜의 다음날 자정까지 포함 (당일 데이터 수신 보장)
    const toTs = Math.floor(new Date(to).getTime() / 1000) + 86400
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${fromTs}&period2=${toTs}&interval=1d`

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com/',
        'Origin': 'https://finance.yahoo.com'
      }
    })

    if (!response.ok) {
      return res.status(404).json({ error: '데이터를 찾을 수 없습니다' })
    }

    const json = await response.json()
    const result = json.chart?.result?.[0]

    if (!result) {
      return res.status(404).json({ error: '데이터를 찾을 수 없습니다' })
    }

    const timestamps = result.timestamp || []
    const quote = result.indicators.quote[0]
    const meta = result.meta

    const rows = timestamps
      .map((ts, i) => ({
        symbol,
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        open: quote.open[i],
        high: quote.high[i],
        low: quote.low[i],
        close: quote.close[i],
        volume: quote.volume[i] ?? null
      }))
      // null 값 행 제거 (거래 없는 날)
      .filter(r => r.open != null && r.close != null)

    if (rows.length === 0) {
      return res.status(404).json({ error: '데이터를 찾을 수 없습니다' })
    }

    // stocks 테이블 upsert (ohlcv_daily FK 위반 방지)
    const exchDisp = meta.exchangeName || ''
    const market = ['KSE', 'KOE', 'KOC'].includes(exchDisp) ? 'KR' : 'US'

    await supabase.from('stocks').upsert(
      { symbol, name: meta.longName || meta.shortName || symbol, market },
      { onConflict: 'symbol' }
    )

    // ohlcv_daily upsert ((symbol, date) PRIMARY KEY로 중복 없음)
    await supabase.from('ohlcv_daily').upsert(rows, { onConflict: 'symbol,date' })

    return res.status(200).json({ data: rows, source: 'yahoo' })
  } catch (err) {
    console.error('OHLCV 조회 오류:', err)
    return res.status(500).json({ error: '데이터를 불러올 수 없습니다' })
  }
}
