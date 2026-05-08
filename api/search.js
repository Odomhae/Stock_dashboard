// Design Ref: §4.2 — Yahoo Finance 검색 프록시, CORS 우회용 서버사이드 핸들러
export default async function handler(req, res) {
  const { q } = req.query

  if (!q) {
    return res.status(400).json({ error: '검색어가 필요합니다' })
  }

  try {
    // lang/region 파라미터 추가 — Yahoo Finance 400 방지
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&lang=en-US&region=US&quotesCount=10&newsCount=0&listsCount=0`
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
      throw new Error(`Yahoo Finance 응답 오류: ${response.status}`)
    }

    const data = await response.json()
    const quotes = data.quotes || []

    // KSE/KOE/KOC → KR, 그 외 → US (Design §4.2)
    const results = quotes
      .filter(item => item.quoteType === 'EQUITY' || item.quoteType === 'ETF')
      .map(item => ({
        symbol: item.symbol,
        name: item.longname || item.shortname || item.symbol,
        market: ['KSE', 'KOE', 'KOC'].includes(item.exchDisp) ? 'KR' : 'US'
      }))

    return res.status(200).json({ results })
  } catch (err) {
    console.error('검색 오류:', err)
    return res.status(500).json({ error: '검색 중 오류가 발생했습니다' })
  }
}
