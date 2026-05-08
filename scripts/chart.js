// Design Ref: §2.3 — Chart.js 4 라인/캔들 래퍼, chart.js/auto + chartjs-chart-financial 조합
import { Chart } from 'chart.js/auto'
import 'chartjs-adapter-date-fns'
import { CandlestickController, CandlestickElement } from 'chartjs-chart-financial'

Chart.register(CandlestickController, CandlestickElement)

let currentChart = null

// OHLCV rows → 라인 차트용 {x, y} 포인트
function toLineDataset(rows) {
  return {
    datasets: [{
      label: '종가',
      data: rows.map(r => ({ x: r.date, y: r.close })),
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59,130,246,0.08)',
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.1,
      fill: true
    }]
  }
}

// OHLCV rows → 캔들 차트용 {x, o, h, l, c} 포인트
function toCandleDataset(rows) {
  return {
    datasets: [{
      label: 'OHLCV',
      data: rows.map(r => ({
        x: r.date,
        o: r.open,
        h: r.high,
        l: r.low,
        c: r.close
      }))
    }]
  }
}

function buildOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { mode: 'index', intersect: false }
    },
    scales: {
      x: {
        type: 'time',
        time: { tooltipFormat: 'yyyy-MM-dd' },
        grid: { display: false },
        ticks: { maxTicksLimit: 8 }
      },
      y: {
        position: 'right',
        grid: { color: '#f0f0f0' }
      }
    }
  }
}

export function renderLineChart(canvasId, rows) {
  if (currentChart) {
    currentChart.destroy()
    currentChart = null
  }
  const ctx = document.getElementById(canvasId).getContext('2d')
  currentChart = new Chart(ctx, {
    type: 'line',
    data: toLineDataset(rows),
    options: buildOptions()
  })
}

export function renderCandleChart(canvasId, rows) {
  if (currentChart) {
    currentChart.destroy()
    currentChart = null
  }
  const ctx = document.getElementById(canvasId).getContext('2d')
  currentChart = new Chart(ctx, {
    type: 'candlestick',
    data: toCandleDataset(rows),
    options: buildOptions()
  })
}
