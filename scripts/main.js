// Design Ref: §9.1 — Presentation + Application 레이어 전담 (Option A)
import { renderLineChart, renderCandleChart } from './chart.js'

// 앱 상태
let currentSymbol = null  // 현재 선택된 종목 심볼
let currentName = ''      // 종목명 (차트 타이틀)
let currentRows = []      // 마지막 OHLCV 데이터 (토글 시 재사용)
let currentType = 'line'  // 현재 차트 타입 ('line' | 'candlestick')
let debounceTimer = null

// DOM 참조
const searchInput = document.getElementById('search-input')
const searchBtn = document.getElementById('search-btn')
const dropdown = document.getElementById('dropdown')
const fromDate = document.getElementById('from-date')
const toDate = document.getElementById('to-date')
const applyDate = document.getElementById('apply-date')
const chartTitle = document.getElementById('chart-title')
const chartCanvas = document.getElementById('chart-canvas')

// 기간 프리셋 → [from, to] YYYY-MM-DD
function getPresetRange(preset) {
  const to = new Date()
  const from = new Date()
  const days = { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '5Y': 1825 }
  from.setDate(from.getDate() - (days[preset] ?? 90))
  return [
    from.toISOString().slice(0, 10),
    to.toISOString().slice(0, 10)
  ]
}

// API 실패 시 차트 영역에 메시지 표시 (Design §6.2)
function showChartError(message) {
  chartTitle.textContent = message
  chartCanvas.style.display = 'none'
}

function clearChartError() {
  chartCanvas.style.display = 'block'
}

// XSS 방지 — 드롭다운 innerHTML 렌더링 시 사용
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// 자동완성 드롭다운 닫기
function closeDropdown() {
  dropdown.innerHTML = ''
  dropdown.style.display = 'none'
}

// 자동완성 드롭다운 렌더링
function renderDropdown(results) {
  if (!results || !results.length) {
    closeDropdown()
    return
  }
  dropdown.innerHTML = results.map(r => `
    <li
      data-symbol="${escapeHtml(r.symbol)}"
      data-name="${escapeHtml(r.name)}"
      data-market="${escapeHtml(r.market)}"
    >
      <span class="dropdown-name">${escapeHtml(r.name)}</span>
      <span class="dropdown-symbol">${escapeHtml(r.symbol)}</span>
      <span class="dropdown-market ${escapeHtml(r.market)}">${escapeHtml(r.market)}</span>
    </li>
  `).join('')
  dropdown.style.display = 'block'
}

// 프리셋 버튼 active 상태 업데이트
function setActivePreset(preset) {
  document.querySelectorAll('[data-preset]').forEach(btn => btn.classList.remove('active'))
  if (preset) {
    document.querySelector(`[data-preset="${preset}"]`)?.classList.add('active')
  }
}

// 차트 타입 버튼 active 상태 업데이트
function setActiveType(type) {
  document.querySelectorAll('[data-type]').forEach(btn => btn.classList.remove('active'))
  document.querySelector(`[data-type="${type}"]`)?.classList.add('active')
  currentType = type
}

// OHLCV 데이터 fetch + Chart.js 렌더링
async function loadChart(symbol, name, from, to) {
  if (!symbol) return

  chartTitle.textContent = `${name || symbol} 로딩 중...`

  try {
    const res = await fetch(
      `/api/stock?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}`
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      showChartError(err.error || '데이터를 불러올 수 없습니다')
      return
    }

    const json = await res.json()
    currentRows = json.data || []

    if (!currentRows.length) {
      showChartError('해당 기간의 데이터가 없습니다')
      return
    }

    clearChartError()
    chartTitle.textContent = name ? `${name} (${symbol})` : symbol

    if (currentType === 'candlestick') {
      renderCandleChart('chart-canvas', currentRows)
    } else {
      renderLineChart('chart-canvas', currentRows)
    }
  } catch (err) {
    console.error('차트 로드 오류:', err)
    showChartError('데이터를 불러올 수 없습니다')
  }
}

// Yahoo Finance 검색 API 호출
async function fetchSearch(query) {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
    if (!res.ok) return
    const json = await res.json()
    renderDropdown(json.results || [])
  } catch (err) {
    console.error('자동완성 오류:', err)
  }
}

// 입력값 정규화 — 6자리 숫자 → .KS 변환 (Design §2.0)
function normalizeSymbol(input) {
  const trimmed = input.trim()
  if (/^\d{6}$/.test(trimmed)) {
    return trimmed + '.KS'
  }
  return trimmed
}

// 검색 버튼 / Enter 처리
function handleSearchSubmit() {
  const raw = searchInput.value.trim()
  if (!raw) return

  // 한글 포함 시 종목명 검색 → 자동완성 드롭다운으로 유도 (심볼로 사용 불가)
  if (/[가-힣]/.test(raw)) {
    fetchSearch(raw)
    return
  }

  const symbol = normalizeSymbol(raw)
  closeDropdown()

  currentSymbol = symbol
  currentName = symbol

  setActivePreset('3M')
  fromDate.value = ''
  toDate.value = ''

  const [from, to] = getPresetRange('3M')
  loadChart(currentSymbol, currentName, from, to)
}

// ── 이벤트 바인딩 ──

// 검색 입력 — 300ms 디바운스 자동완성
searchInput.addEventListener('input', () => {
  const val = searchInput.value.trim()
  clearTimeout(debounceTimer)

  if (!val) {
    closeDropdown()
    return
  }
  // 6자리 숫자는 자동완성 불필요 (직접 .KS 변환)
  if (/^\d{6}$/.test(val)) {
    closeDropdown()
    return
  }

  debounceTimer = setTimeout(() => fetchSearch(val), 300)
})

// 검색 Enter 키
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleSearchSubmit()
})

// 검색 버튼
searchBtn.addEventListener('click', handleSearchSubmit)

// 자동완성 드롭다운 항목 선택
dropdown.addEventListener('click', e => {
  const li = e.target.closest('li')
  if (!li) return

  currentSymbol = li.dataset.symbol
  currentName = li.dataset.name
  searchInput.value = li.dataset.name
  closeDropdown()

  // 기본 3M 프리셋
  setActivePreset('3M')
  fromDate.value = ''
  toDate.value = ''

  const [from, to] = getPresetRange('3M')
  loadChart(currentSymbol, currentName, from, to)
})

// 드롭다운 외부 클릭 시 닫기
document.addEventListener('click', e => {
  if (!e.target.closest('.search-area')) {
    closeDropdown()
  }
})

// 프리셋 기간 버튼
document.querySelectorAll('[data-preset]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!currentSymbol) return

    setActivePreset(btn.dataset.preset)
    fromDate.value = ''
    toDate.value = ''

    const [from, to] = getPresetRange(btn.dataset.preset)
    loadChart(currentSymbol, currentName, from, to)
  })
})

// 커스텀 날짜 [적용] 버튼
applyDate.addEventListener('click', () => {
  if (!currentSymbol || !fromDate.value || !toDate.value) return

  setActivePreset(null)
  loadChart(currentSymbol, currentName, fromDate.value, toDate.value)
})

// 차트 타입 토글 — API 재호출 없이 currentRows로 재렌더링 (Plan FR-09)
document.querySelectorAll('[data-type]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!currentRows.length) return

    setActiveType(btn.dataset.type)

    if (currentType === 'candlestick') {
      renderCandleChart('chart-canvas', currentRows)
    } else {
      renderLineChart('chart-canvas', currentRows)
    }
  })
})
