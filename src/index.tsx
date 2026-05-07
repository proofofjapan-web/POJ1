import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

const app = new Hono()

app.use('/api/*', cors())
app.use('/static/*', serveStatic({ root: './public' }))

// ===== AI Agent Rules (Kite-style autonomous purchasing rules) =====
const defaultAgentRules = {
  maxAutoSpendUSD: 50,
  allowedCategories: ['accommodation', 'transport', 'dining', 'experience'],
  requireApprovalAbove: 20,
  preferredStyle: ['秘境', '温泉', '古民家', '一棟貸し'],
  blacklist: ['チェーンホテル', '大型リゾート'],
  autoBook: true,
  notifyOnPurchase: true,
}

// ===== Mock Secret Ryokan Database =====
const secretRyokan = [
  {
    id: 'r001',
    name: '奥飛騨 山の湯 白雲荘',
    location: '岐阜県奥飛騨温泉郷',
    type: '秘境温泉宿',
    pricePerNight: 38000,
    currency: 'JPY',
    priceUSD: 255,
    description: '標高1200mの静寂。手付かずの原生林に囲まれた露天風呂。',
    image: 'https://images.unsplash.com/photo-1580822184713-fc5400e7fe10?w=800',
    availability: true,
    features: ['貸切露天風呂', '囲炉裏夕食', '送迎付き'],
    score: 98,
  },
  {
    id: 'r002',
    name: '屋久島 森の宿 縄文庵',
    location: '鹿児島県屋久島',
    type: '古民家一棟貸し',
    pricePerNight: 45000,
    currency: 'JPY',
    priceUSD: 302,
    description: '樹齢3000年の縄文杉を望む。完全プライベートの森の離れ。',
    image: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800',
    availability: true,
    features: ['完全プライベート', '専属コンシェルジュ', '星空ガイド付き'],
    score: 96,
  },
  {
    id: 'r003',
    name: '五島列島 椿の宿 海音',
    location: '長崎県五島列島',
    type: '離島秘宿',
    pricePerNight: 32000,
    currency: 'JPY',
    priceUSD: 215,
    description: '紺碧の海を独り占め。幻の椿油の湯に浸かる夕暮れ。',
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
    availability: true,
    features: ['海水浴専用ビーチ', '地元漁師の朝食', '椿油スパ'],
    score: 94,
  },
  {
    id: 'r004',
    name: '白川郷 合掌の宿 雪月花',
    location: '岐阜県白川村',
    type: '合掌造り古民家',
    pricePerNight: 42000,
    currency: 'JPY',
    priceUSD: 282,
    description: '世界遺産の合掌造り。400年の歴史が宿る炉端で囲む夜。',
    image: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800',
    availability: false,
    features: ['国指定重要文化財', '囲炉裏料理', '雪見露天風呂'],
    score: 99,
  },
]

// ===== Mock Experience/Activity Database =====
const experiences = [
  { id: 'e001', name: '早朝・地元漁師と出漁体験', priceUSD: 45, category: 'experience' },
  { id: 'e002', name: '山岳ガイドと秘境ハイキング', priceUSD: 80, category: 'experience' },
  { id: 'e003', name: '地元料理人による囲炉裏料理レッスン', priceUSD: 65, category: 'dining' },
  { id: 'e004', name: '早朝座禅・禅寺体験', priceUSD: 30, category: 'experience' },
]

// ===== API: Search Secret Ryokan =====
app.post('/api/search', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { query = '', nights = 2, guests = 2 } = body

  // Filter by agent rules & query
  const results = secretRyokan
    .filter((r) => r.availability)
    .map((r) => ({
      ...r,
      totalUSD: r.priceUSD * nights,
      requiresApproval: r.priceUSD * nights > defaultAgentRules.requireApprovalAbove,
    }))
    .sort((a, b) => b.score - a.score)

  // Simulate AI thinking delay
  await new Promise((resolve) => setTimeout(resolve, 1200))

  return c.json({
    success: true,
    results,
    agentMessage:
      '現地の主人方と直接調整いたしました。以下のお宿が、お客様のご要望に最もふさわしいと判断いたしました。',
    searchContext: { query, nights, guests, timestamp: new Date().toISOString() },
  })
})

// ===== API: Agent Rules (Get/Update) =====
app.get('/api/agent-rules', (c) => {
  return c.json({ success: true, rules: defaultAgentRules })
})

app.post('/api/agent-rules', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const updated = { ...defaultAgentRules, ...body }
  return c.json({ success: true, rules: updated, message: 'エージェントルールを更新しました。' })
})

// ===== API: Autonomous Purchase Suggestion =====
app.post('/api/auto-suggest', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { ryokanId, nights = 2 } = body

  const ryokan = secretRyokan.find((r) => r.id === ryokanId)
  if (!ryokan) return c.json({ success: false, error: 'Not found' }, 404)

  const suggestions = experiences
    .filter((e) => defaultAgentRules.allowedCategories.includes(e.category))
    .filter((e) => e.priceUSD <= defaultAgentRules.maxAutoSpendUSD)

  return c.json({
    success: true,
    ryokan,
    suggestions,
    autoApproved: suggestions.filter((s) => s.priceUSD <= defaultAgentRules.requireApprovalAbove),
    requiresApproval: suggestions.filter(
      (s) => s.priceUSD > defaultAgentRules.requireApprovalAbove
    ),
    agentMessage:
      'ルールに従い、以下のオプションを自動的に選定いたしました。承認をいただければ、そのまま手配を進めます。',
  })
})

// ===== API: Wallet Session (Mock Kite Native Connect) =====
app.post('/api/wallet/connect', async (c) => {
  await new Promise((resolve) => setTimeout(resolve, 800))
  const sessionId = `kite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  return c.json({
    success: true,
    sessionId,
    walletAddress: '0x' + Math.random().toString(16).substr(2, 40),
    balance: { ETH: '2.847', USDC: '4250.00', USDT: '1800.00' },
    sessionExpiry: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    message: 'ウォレットセッションを確立しました。',
  })
})

// ===== API: x402 Payment Protocol (Mock Settlement) =====
app.post('/api/payment/settle', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { sessionId, amount, currency = 'USDC', description } = body

  if (!sessionId || !amount) {
    return c.json({ success: false, error: 'Missing required fields' }, 400)
  }

  // Simulate blockchain settlement delay
  await new Promise((resolve) => setTimeout(resolve, 2000))

  const txHash =
    '0x' +
    Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  const blockNumber = Math.floor(Math.random() * 1000000) + 18000000

  return c.json({
    success: true,
    txHash,
    blockNumber,
    amount,
    currency,
    description,
    timestamp: new Date().toISOString(),
    confirmations: 1,
    gasUsed: '21000',
    status: 'confirmed',
    explorerUrl: `https://etherscan.io/tx/${txHash}`,
    message: `決済が完了しました。トランザクションハッシュ: ${txHash.substring(0, 10)}...`,
  })
})

// ===== API: Booking Confirmation =====
app.post('/api/booking/confirm', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { ryokanId, nights, guests, txHash, autoItems } = body

  const ryokan = secretRyokan.find((r) => r.id === ryokanId)
  if (!ryokan) return c.json({ success: false, error: 'Not found' }, 404)

  await new Promise((resolve) => setTimeout(resolve, 1000))

  const bookingId = `FLT-${Date.now().toString(36).toUpperCase()}`
  const checkIn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const checkOut = new Date(checkIn.getTime() + nights * 24 * 60 * 60 * 1000)

  return c.json({
    success: true,
    bookingId,
    ryokan,
    nights,
    guests,
    checkIn: checkIn.toISOString().split('T')[0],
    checkOut: checkOut.toISOString().split('T')[0],
    txHash,
    autoItems: autoItems || [],
    totalUSD: ryokan.priceUSD * nights,
    status: 'confirmed',
    message: `ご予約が完了しました。確認番号: ${bookingId}`,
    agentSummary:
      'お客様に代わり、すべての手配が完了いたしました。素晴らしい旅になりますよう、お祈り申し上げます。',
  })
})

// ===== API: Orchestration Status (SSE-like polling) =====
app.get('/api/orchestration/status', (c) => {
  return c.json({
    status: 'ready',
    agentName: 'Flattora',
    capabilities: ['search', 'negotiate', 'book', 'pay', 'auto-purchase'],
    version: '1.0.0',
  })
})

// ===== Main HTML App =====
app.get('/', (c) => {
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>Flattora — Your Sovereign Travel Agent</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@100;200;300;400&family=Playfair+Display:ital,wght@0,400;1,400&display=swap" rel="stylesheet">
  <style>
    /* ===== RESET & BASE ===== */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --gold: #C9A84C;
      --gold-light: #E8C96A;
      --gold-dim: rgba(201, 168, 76, 0.3);
      --gold-glow: rgba(201, 168, 76, 0.15);
      --white: #F5F5F0;
      --white-dim: rgba(245, 245, 240, 0.6);
      --white-faint: rgba(245, 245, 240, 0.15);
      --black: #000000;
      --surface: #0A0A0A;
      --surface2: #111111;
      --surface3: #181818;
      --border: rgba(201, 168, 76, 0.2);
    }

    html, body {
      background: var(--black);
      color: var(--white);
      font-family: 'Noto Sans JP', sans-serif;
      font-weight: 200;
      font-size: 14px;
      line-height: 1.7;
      min-height: 100vh;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }

    /* ===== BACKGROUND AMBIENT ===== */
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background:
        radial-gradient(ellipse 60% 40% at 50% 0%, rgba(201,168,76,0.05) 0%, transparent 70%),
        radial-gradient(ellipse 30% 50% at 80% 50%, rgba(201,168,76,0.03) 0%, transparent 60%);
      pointer-events: none;
      z-index: 0;
    }

    /* ===== LAYOUT ===== */
    #app {
      position: relative;
      z-index: 1;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* ===== HEADER ===== */
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 24px 40px;
      border-bottom: 1px solid var(--border);
      backdrop-filter: blur(20px);
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(0,0,0,0.8);
    }

    .logo {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .logo-text {
      font-family: 'Playfair Display', serif;
      font-size: 22px;
      font-weight: 400;
      letter-spacing: 0.15em;
      color: var(--gold);
    }

    .logo-sub {
      font-size: 10px;
      font-weight: 100;
      letter-spacing: 0.3em;
      color: var(--white-dim);
      text-transform: uppercase;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .wallet-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      font-weight: 300;
      letter-spacing: 0.1em;
      color: var(--white-dim);
    }

    .wallet-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #444;
      transition: all 0.3s;
    }
    .wallet-dot.connected {
      background: var(--gold);
      box-shadow: 0 0 8px var(--gold);
      animation: pulse-dot 2s infinite;
    }

    @keyframes pulse-dot {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    /* ===== BUTTONS ===== */
    .btn {
      border: none;
      cursor: pointer;
      font-family: 'Noto Sans JP', sans-serif;
      font-weight: 200;
      transition: all 0.3s ease;
      letter-spacing: 0.1em;
    }

    .btn-gold {
      background: linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%);
      color: var(--black);
      padding: 10px 24px;
      font-size: 11px;
      font-weight: 400;
      letter-spacing: 0.15em;
      text-transform: uppercase;
    }

    .btn-gold:hover {
      box-shadow: 0 0 30px rgba(201, 168, 76, 0.4);
      transform: translateY(-1px);
    }

    .btn-outline {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--white-dim);
      padding: 8px 20px;
      font-size: 11px;
      letter-spacing: 0.15em;
    }

    .btn-outline:hover {
      border-color: var(--gold-dim);
      color: var(--gold);
    }

    /* ===== VOICE INTERFACE ===== */
    #voice-section {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 40px 40px;
      position: relative;
    }

    .orb-container {
      position: relative;
      width: 160px;
      height: 160px;
      margin-bottom: 40px;
      cursor: pointer;
      flex-shrink: 0;
    }

    .orb {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 35%,
        rgba(201, 168, 76, 0.3) 0%,
        rgba(201, 168, 76, 0.1) 40%,
        rgba(0,0,0,0) 70%
      );
      border: 1px solid var(--border);
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.5s ease;
    }

    .orb.listening {
      border-color: var(--gold);
      box-shadow:
        0 0 40px rgba(201, 168, 76, 0.3),
        0 0 80px rgba(201, 168, 76, 0.15),
        inset 0 0 40px rgba(201, 168, 76, 0.1);
      animation: orb-breathe 2s ease-in-out infinite;
    }

    .orb.speaking {
      border-color: var(--gold-light);
      box-shadow:
        0 0 60px rgba(201, 168, 76, 0.5),
        0 0 120px rgba(201, 168, 76, 0.2);
      animation: orb-speak 0.5s ease-in-out infinite alternate;
    }

    .orb.thinking {
      animation: orb-think 1.5s linear infinite;
    }

    @keyframes orb-breathe {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.03); }
    }

    @keyframes orb-speak {
      0% { transform: scale(0.98); }
      100% { transform: scale(1.04); }
    }

    @keyframes orb-think {
      0% { box-shadow: 0 0 20px rgba(201,168,76,0.1); }
      33% { box-shadow: 0 0 40px rgba(201,168,76,0.3); }
      66% { box-shadow: 0 0 20px rgba(201,168,76,0.1); }
      100% { box-shadow: 0 0 40px rgba(201,168,76,0.3); }
    }

    .orb-rings {
      position: absolute;
      inset: -20px;
      border-radius: 50%;
    }

    .orb-ring {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      border: 1px solid var(--gold-dim);
      animation: ring-expand 3s ease-out infinite;
      opacity: 0;
    }

    .orb-ring:nth-child(2) { animation-delay: 1s; }
    .orb-ring:nth-child(3) { animation-delay: 2s; }

    @keyframes ring-expand {
      0% { transform: scale(1); opacity: 0.5; }
      100% { transform: scale(1.8); opacity: 0; }
    }

    .orb-icon {
      font-size: 36px;
      transition: all 0.3s;
    }

    /* ===== WAVEFORM ===== */
    .waveform-container {
      height: 60px;
      width: 280px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
      margin-bottom: 24px;
    }

    .wave-bar {
      width: 3px;
      background: var(--gold);
      border-radius: 2px;
      height: 4px;
      transition: height 0.1s ease;
      opacity: 0.6;
    }

    .wave-bar.active {
      animation: wave-dance 0.5s ease-in-out infinite;
      opacity: 1;
    }

    .wave-bar:nth-child(1) { animation-delay: 0s; }
    .wave-bar:nth-child(2) { animation-delay: 0.05s; }
    .wave-bar:nth-child(3) { animation-delay: 0.1s; }
    .wave-bar:nth-child(4) { animation-delay: 0.15s; }
    .wave-bar:nth-child(5) { animation-delay: 0.2s; }
    .wave-bar:nth-child(6) { animation-delay: 0.25s; }
    .wave-bar:nth-child(7) { animation-delay: 0.3s; }
    .wave-bar:nth-child(8) { animation-delay: 0.35s; }
    .wave-bar:nth-child(9) { animation-delay: 0.4s; }
    .wave-bar:nth-child(10) { animation-delay: 0.45s; }
    .wave-bar:nth-child(11) { animation-delay: 0.5s; }
    .wave-bar:nth-child(12) { animation-delay: 0.55s; }
    .wave-bar:nth-child(13) { animation-delay: 0.4s; }
    .wave-bar:nth-child(14) { animation-delay: 0.3s; }
    .wave-bar:nth-child(15) { animation-delay: 0.2s; }
    .wave-bar:nth-child(16) { animation-delay: 0.1s; }
    .wave-bar:nth-child(17) { animation-delay: 0.05s; }
    .wave-bar:nth-child(18) { animation-delay: 0s; }

    @keyframes wave-dance {
      0%, 100% { height: 4px; }
      50% { height: var(--max-h, 40px); }
    }

    /* ===== TRANSCRIPT ===== */
    .transcript-area {
      max-width: 600px;
      width: 100%;
      text-align: center;
      min-height: 60px;
    }

    .transcript-user {
      font-size: 13px;
      font-weight: 300;
      color: var(--white-dim);
      margin-bottom: 8px;
      font-style: italic;
    }

    .transcript-agent {
      font-size: 15px;
      font-weight: 100;
      color: var(--white);
      letter-spacing: 0.03em;
      line-height: 1.8;
    }

    .typing-cursor {
      display: inline-block;
      width: 2px;
      height: 1em;
      background: var(--gold);
      margin-left: 2px;
      animation: blink 0.8s infinite;
      vertical-align: text-bottom;
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }

    /* ===== CONTROLS ===== */
    .voice-controls {
      display: flex;
      gap: 16px;
      margin-top: 32px;
      align-items: center;
    }

    .mic-btn {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--surface2);
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.3s;
      font-size: 22px;
    }

    .mic-btn:hover { border-color: var(--gold); transform: scale(1.05); }
    .mic-btn.active {
      background: var(--gold-glow);
      border-color: var(--gold);
      box-shadow: 0 0 20px var(--gold-dim);
    }

    /* ===== PANELS ===== */
    #main-content {
      flex: 1;
      padding: 0 40px 60px;
      max-width: 1200px;
      margin: 0 auto;
      width: 100%;
    }

    /* ===== WALLET PANEL ===== */
    #wallet-panel {
      background: var(--surface2);
      border: 1px solid var(--border);
      padding: 32px;
      margin-bottom: 32px;
      display: none;
    }

    #wallet-panel.visible { display: block; }

    .panel-title {
      font-size: 10px;
      font-weight: 300;
      letter-spacing: 0.3em;
      color: var(--gold);
      text-transform: uppercase;
      margin-bottom: 20px;
    }

    .wallet-info {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
      margin-bottom: 24px;
    }

    .wallet-balance-item {
      text-align: center;
    }

    .balance-label {
      font-size: 10px;
      font-weight: 300;
      letter-spacing: 0.2em;
      color: var(--white-dim);
      margin-bottom: 6px;
    }

    .balance-value {
      font-size: 22px;
      font-weight: 100;
      color: var(--gold);
    }

    .balance-unit {
      font-size: 11px;
      color: var(--white-dim);
      margin-left: 4px;
    }

    /* ===== AGENT RULES PANEL ===== */
    #agent-rules-panel {
      background: var(--surface2);
      border: 1px solid var(--border);
      padding: 32px;
      margin-bottom: 32px;
    }

    .rules-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
    }

    .rule-item {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .rule-label {
      font-size: 10px;
      font-weight: 300;
      letter-spacing: 0.2em;
      color: var(--white-dim);
      text-transform: uppercase;
    }

    .rule-input {
      background: var(--surface3);
      border: 1px solid var(--border);
      color: var(--white);
      padding: 10px 14px;
      font-family: 'Noto Sans JP', sans-serif;
      font-weight: 200;
      font-size: 13px;
      outline: none;
      transition: border-color 0.3s;
      width: 100%;
    }

    .rule-input:focus { border-color: var(--gold); }

    .rule-toggle {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .toggle {
      position: relative;
      width: 44px;
      height: 24px;
      cursor: pointer;
    }

    .toggle input { opacity: 0; width: 0; height: 0; }

    .toggle-slider {
      position: absolute;
      inset: 0;
      background: var(--surface3);
      border: 1px solid var(--border);
      border-radius: 12px;
      transition: 0.3s;
    }

    .toggle-slider::before {
      content: '';
      position: absolute;
      width: 18px;
      height: 18px;
      left: 2px;
      top: 2px;
      background: var(--white-dim);
      border-radius: 50%;
      transition: 0.3s;
    }

    .toggle input:checked + .toggle-slider {
      background: var(--gold-glow);
      border-color: var(--gold);
    }

    .toggle input:checked + .toggle-slider::before {
      transform: translateX(20px);
      background: var(--gold);
    }

    /* ===== SEARCH RESULTS ===== */
    #search-results {
      display: none;
      margin-bottom: 32px;
    }

    #search-results.visible { display: block; }

    .results-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 24px;
    }

    .ryokan-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 24px;
    }

    .ryokan-card {
      background: var(--surface2);
      border: 1px solid var(--border);
      overflow: hidden;
      cursor: pointer;
      transition: all 0.3s ease;
      position: relative;
    }

    .ryokan-card:hover {
      border-color: var(--gold);
      box-shadow: 0 0 40px rgba(201,168,76,0.1);
      transform: translateY(-2px);
    }

    .ryokan-card.selected {
      border-color: var(--gold);
      box-shadow: 0 0 60px rgba(201,168,76,0.2);
    }

    .ryokan-card-img {
      width: 100%;
      height: 200px;
      object-fit: cover;
      filter: brightness(0.8) saturate(0.7);
      transition: all 0.3s;
    }

    .ryokan-card:hover .ryokan-card-img {
      filter: brightness(0.9) saturate(0.8);
    }

    .ryokan-card-body {
      padding: 24px;
    }

    .ryokan-type {
      font-size: 9px;
      font-weight: 300;
      letter-spacing: 0.3em;
      color: var(--gold);
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .ryokan-name {
      font-size: 17px;
      font-weight: 200;
      color: var(--white);
      margin-bottom: 4px;
    }

    .ryokan-location {
      font-size: 11px;
      font-weight: 100;
      color: var(--white-dim);
      margin-bottom: 12px;
    }

    .ryokan-desc {
      font-size: 12px;
      font-weight: 100;
      color: var(--white-dim);
      line-height: 1.8;
      margin-bottom: 16px;
    }

    .ryokan-features {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 16px;
    }

    .feature-tag {
      font-size: 9px;
      font-weight: 300;
      letter-spacing: 0.1em;
      color: var(--gold);
      border: 1px solid var(--gold-dim);
      padding: 3px 8px;
    }

    .ryokan-price {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
    }

    .price-amount {
      font-size: 20px;
      font-weight: 100;
      color: var(--white);
    }

    .price-unit {
      font-size: 11px;
      color: var(--white-dim);
      margin-left: 4px;
    }

    .ryokan-score {
      font-size: 11px;
      font-weight: 300;
      color: var(--gold);
    }

    /* ===== AUTO SUGGEST PANEL ===== */
    #auto-suggest-panel {
      display: none;
      background: var(--surface2);
      border: 1px solid var(--border);
      padding: 32px;
      margin-bottom: 32px;
    }

    #auto-suggest-panel.visible { display: block; }

    .suggest-section {
      margin-bottom: 24px;
    }

    .suggest-section-title {
      font-size: 10px;
      font-weight: 300;
      letter-spacing: 0.2em;
      color: var(--gold);
      text-transform: uppercase;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .auto-badge {
      background: var(--gold-glow);
      border: 1px solid var(--gold-dim);
      color: var(--gold);
      font-size: 8px;
      padding: 2px 6px;
      letter-spacing: 0.1em;
    }

    .suggest-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }

    .suggest-item-name {
      font-size: 13px;
      font-weight: 200;
      color: var(--white);
    }

    .suggest-item-price {
      font-size: 13px;
      font-weight: 100;
      color: var(--gold);
    }

    /* ===== AUTHORIZE BUTTON ===== */
    #authorize-section {
      display: none;
      flex-direction: column;
      align-items: center;
      padding: 60px 40px;
      background: var(--surface2);
      border: 1px solid var(--gold-dim);
      margin-bottom: 32px;
      text-align: center;
    }

    #authorize-section.visible { display: flex; }

    .authorize-title {
      font-family: 'Playfair Display', serif;
      font-size: 28px;
      font-weight: 400;
      color: var(--gold);
      margin-bottom: 16px;
      font-style: italic;
    }

    .authorize-desc {
      font-size: 13px;
      font-weight: 100;
      color: var(--white-dim);
      max-width: 480px;
      margin-bottom: 48px;
      line-height: 2;
    }

    .authorize-btn {
      background: linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%);
      color: var(--black);
      border: none;
      padding: 22px 72px;
      font-family: 'Noto Sans JP', sans-serif;
      font-weight: 400;
      font-size: 14px;
      letter-spacing: 0.2em;
      cursor: pointer;
      position: relative;
      overflow: hidden;
      transition: all 0.3s;
      text-transform: uppercase;
    }

    .authorize-btn::before {
      content: '';
      position: absolute;
      inset: -2px;
      background: linear-gradient(135deg, var(--gold-light), var(--gold), var(--gold-light));
      z-index: -1;
      filter: blur(8px);
      opacity: 0;
      transition: opacity 0.3s;
    }

    .authorize-btn:hover::before { opacity: 1; }
    .authorize-btn:hover {
      box-shadow: 0 0 60px rgba(201,168,76,0.4), 0 20px 40px rgba(0,0,0,0.5);
      transform: translateY(-2px);
    }

    .authorize-btn:active { transform: translateY(0); }

    .webauthn-hint {
      margin-top: 24px;
      font-size: 10px;
      font-weight: 100;
      letter-spacing: 0.2em;
      color: rgba(255,255,255,0.3);
      text-transform: uppercase;
    }

    /* ===== TRANSACTION FEED ===== */
    #tx-feed {
      display: none;
      background: var(--surface2);
      border: 1px solid var(--border);
      padding: 24px;
      margin-bottom: 32px;
    }

    #tx-feed.visible { display: block; }

    .tx-title {
      font-size: 10px;
      font-weight: 300;
      letter-spacing: 0.3em;
      color: var(--gold);
      text-transform: uppercase;
      margin-bottom: 16px;
    }

    .tx-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      animation: tx-slide-in 0.5s ease;
    }

    @keyframes tx-slide-in {
      from { opacity: 0; transform: translateX(-10px); }
      to { opacity: 1; transform: translateX(0); }
    }

    .tx-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--gold);
      flex-shrink: 0;
    }

    .tx-hash {
      font-family: 'Courier New', monospace;
      font-size: 11px;
      color: var(--gold);
      word-break: break-all;
    }

    .tx-detail {
      font-size: 11px;
      font-weight: 100;
      color: var(--white-dim);
    }

    /* ===== BOOKING COMPLETE ===== */
    #booking-complete {
      display: none;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 80px 40px;
      background: var(--surface2);
      border: 1px solid var(--gold-dim);
      margin-bottom: 32px;
    }

    #booking-complete.visible { display: flex; }

    .complete-icon {
      font-size: 64px;
      margin-bottom: 32px;
      animation: complete-appear 0.8s ease;
    }

    @keyframes complete-appear {
      from { transform: scale(0); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .complete-title {
      font-family: 'Playfair Display', serif;
      font-size: 36px;
      font-weight: 400;
      color: var(--gold);
      margin-bottom: 16px;
      font-style: italic;
    }

    .complete-booking-id {
      font-size: 11px;
      font-weight: 300;
      letter-spacing: 0.3em;
      color: var(--white-dim);
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .complete-id-value {
      font-family: 'Courier New', monospace;
      font-size: 18px;
      font-weight: 400;
      color: var(--white);
      margin-bottom: 32px;
    }

    .complete-summary {
      font-size: 13px;
      font-weight: 100;
      color: var(--white-dim);
      max-width: 480px;
      line-height: 2;
    }

    /* ===== STATUS BAR ===== */
    #status-bar {
      background: var(--surface2);
      border: 1px solid var(--border);
      padding: 12px 24px;
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 32px;
      font-size: 11px;
      font-weight: 200;
      color: var(--white-dim);
      letter-spacing: 0.05em;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--gold);
      animation: pulse-dot 2s infinite;
    }

    /* ===== DIVIDER ===== */
    .section-divider {
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--border), transparent);
      margin: 40px 0;
    }

    /* ===== QUICK ACTIONS ===== */
    .quick-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: center;
      margin-top: 24px;
    }

    .quick-action-btn {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--white-dim);
      padding: 8px 16px;
      font-family: 'Noto Sans JP', sans-serif;
      font-weight: 200;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.3s;
      letter-spacing: 0.05em;
    }

    .quick-action-btn:hover {
      border-color: var(--gold-dim);
      color: var(--gold);
    }

    /* ===== SCROLLBAR ===== */
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: var(--black); }
    ::-webkit-scrollbar-thumb { background: var(--border); }
    ::-webkit-scrollbar-thumb:hover { background: var(--gold-dim); }

    /* ===== TOAST ===== */
    #toast {
      position: fixed;
      bottom: 40px;
      left: 50%;
      transform: translateX(-50%) translateY(80px);
      background: var(--surface3);
      border: 1px solid var(--gold-dim);
      color: var(--white);
      padding: 14px 28px;
      font-size: 13px;
      font-weight: 200;
      letter-spacing: 0.05em;
      transition: transform 0.4s ease;
      z-index: 1000;
      white-space: nowrap;
    }

    #toast.show { transform: translateX(-50%) translateY(0); }

    /* ===== SPINNER ===== */
    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 1px solid var(--border);
      border-top-color: var(--gold);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    /* ===== LOADING OVERLAY ===== */
    #loading-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(8px);
      z-index: 500;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 24px;
    }

    #loading-overlay.active { display: flex; }

    .loading-text {
      font-size: 14px;
      font-weight: 100;
      color: var(--gold);
      letter-spacing: 0.2em;
      text-transform: uppercase;
    }

    /* ===== MOCK BADGE ===== */
    .mock-badge {
      font-size: 9px;
      background: rgba(255,100,0,0.15);
      border: 1px solid rgba(255,100,0,0.3);
      color: rgba(255,150,0,0.8);
      padding: 2px 8px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      margin-left: 8px;
    }
  </style>
</head>
<body>
  <div id="app">

    <!-- HEADER -->
    <header>
      <div class="logo">
        <span class="logo-text">Flattora</span>
        <span class="logo-sub">Sovereign Travel Intelligence</span>
      </div>
      <div class="header-right">
        <div class="wallet-status">
          <div class="wallet-dot" id="wallet-dot"></div>
          <span id="wallet-label">接続待機中</span>
        </div>
        <button class="btn btn-gold" onclick="connectWallet()" id="connect-btn">Connect Wallet</button>
      </div>
    </header>

    <!-- VOICE SECTION -->
    <section id="voice-section">
      <div class="orb-container" onclick="toggleListening()">
        <div class="orb-rings">
          <div class="orb-ring"></div>
          <div class="orb-ring"></div>
          <div class="orb-ring"></div>
        </div>
        <div class="orb" id="orb">
          <div class="orb-icon" id="orb-icon">◎</div>
        </div>
      </div>

      <div class="waveform-container" id="waveform">
        ${Array.from({ length: 18 }, (_, i) => `<div class="wave-bar" id="bar-${i}" style="--max-h:${10 + Math.random() * 40}px"></div>`).join('')}
      </div>

      <div class="transcript-area">
        <div class="transcript-user" id="user-transcript"></div>
        <div class="transcript-agent" id="agent-transcript">
          <span id="agent-text">おはようございます。私はあなた専属のトラベルコンシェルジュでございます。どちらへのご旅行をご希望でしょうか。</span>
        </div>
      </div>

      <div class="voice-controls">
        <button class="mic-btn" id="mic-btn" onclick="toggleListening()" title="マイクをオン/オフ">🎙</button>
        <div class="quick-actions">
          <button class="quick-action-btn" onclick="sendQuickAction('日本の秘境の温泉宿を探してください')">🏔 秘境温泉宿</button>
          <button class="quick-action-btn" onclick="sendQuickAction('古民家の一棟貸しを予約したい')">🏠 古民家貸切</button>
          <button class="quick-action-btn" onclick="sendQuickAction('離島の隠れ宿を2泊で')">🏝 離島の宿</button>
          <button class="quick-action-btn" onclick="openAgentRules()">⚙ エージェント設定</button>
        </div>
      </div>
    </section>

    <!-- MAIN CONTENT -->
    <main id="main-content">

      <!-- STATUS BAR -->
      <div id="status-bar" style="display:none">
        <div class="status-dot"></div>
        <span id="status-text">エージェントが稼働中です</span>
      </div>

      <!-- WALLET PANEL -->
      <div id="wallet-panel">
        <div class="panel-title">◈ ウォレット接続済み <span class="mock-badge">Demo Session</span></div>
        <div class="wallet-info">
          <div class="wallet-balance-item">
            <div class="balance-label">ETH</div>
            <div class="balance-value" id="bal-eth">—</div>
          </div>
          <div class="wallet-balance-item">
            <div class="balance-label">USDC</div>
            <div class="balance-value" id="bal-usdc">—</div>
          </div>
          <div class="wallet-balance-item">
            <div class="balance-label">USDT</div>
            <div class="balance-value" id="bal-usdt">—</div>
          </div>
        </div>
        <div style="font-size:11px;color:var(--white-dim);font-weight:100;letter-spacing:0.05em;">
          アドレス: <span id="wallet-address" style="font-family:monospace;color:var(--gold)">—</span>
        </div>
      </div>

      <!-- AGENT RULES PANEL -->
      <div id="agent-rules-panel" style="display:none">
        <div class="panel-title">◈ エージェント自律ルール設定 <span class="mock-badge">Kite Agent Rules</span></div>
        <div class="rules-grid">
          <div class="rule-item">
            <label class="rule-label">自動決済上限 (USD)</label>
            <input class="rule-input" type="number" id="rule-max-spend" value="50">
          </div>
          <div class="rule-item">
            <label class="rule-label">要承認しきい値 (USD)</label>
            <input class="rule-input" type="number" id="rule-require-approval" value="20">
          </div>
          <div class="rule-item">
            <label class="rule-label">優先スタイル</label>
            <input class="rule-input" type="text" id="rule-style" value="秘境, 温泉, 古民家, 一棟貸し">
          </div>
          <div class="rule-item">
            <label class="rule-label">除外カテゴリ</label>
            <input class="rule-input" type="text" id="rule-blacklist" value="チェーンホテル, 大型リゾート">
          </div>
          <div class="rule-item">
            <label class="rule-label">自動予約</label>
            <div class="rule-toggle">
              <label class="toggle">
                <input type="checkbox" id="rule-auto-book" checked>
                <span class="toggle-slider"></span>
              </label>
              <span style="font-size:12px;color:var(--white-dim)">承認後、AIが自動的に手配</span>
            </div>
          </div>
          <div class="rule-item">
            <label class="rule-label">購入通知</label>
            <div class="rule-toggle">
              <label class="toggle">
                <input type="checkbox" id="rule-notify" checked>
                <span class="toggle-slider"></span>
              </label>
              <span style="font-size:12px;color:var(--white-dim)">決済完了時に通知</span>
            </div>
          </div>
        </div>
        <div style="margin-top:24px;display:flex;gap:12px;justify-content:flex-end">
          <button class="btn btn-outline" onclick="document.getElementById('agent-rules-panel').style.display='none'">閉じる</button>
          <button class="btn btn-gold" onclick="saveAgentRules()">ルールを保存</button>
        </div>
      </div>

      <!-- SEARCH RESULTS -->
      <div id="search-results">
        <div class="results-header">
          <div class="panel-title">◈ コンシェルジュ厳選のお宿</div>
          <div style="font-size:11px;color:var(--white-dim)">エージェントが現地主人と調整済み</div>
        </div>
        <div class="ryokan-grid" id="ryokan-grid"></div>
      </div>

      <!-- AUTO SUGGEST PANEL -->
      <div id="auto-suggest-panel">
        <div class="panel-title">◈ エージェントからの自動提案 <span class="mock-badge">Autonomous</span></div>
        <div id="auto-suggest-content"></div>
      </div>

      <!-- AUTHORIZE SECTION -->
      <div id="authorize-section">
        <div class="authorize-title">承認のご準備をお願いします</div>
        <div class="authorize-desc" id="authorize-desc">
          あなたのウォレットの権限を確認いたしました。<br>
          ご承認をいただければ、このまま予約を完了させます。<br>
          以降の操作はすべてエージェントが代行いたします。
        </div>
        <button class="authorize-btn" id="authorize-btn" onclick="authorizePayment()">
          ✦ Authorize &amp; Sign
        </button>
        <div class="webauthn-hint">🔐 Protected by WebAuthn Passkey</div>
      </div>

      <!-- TX FEED -->
      <div id="tx-feed">
        <div class="tx-title">◈ トランザクション履歴</div>
        <div id="tx-list"></div>
      </div>

      <!-- BOOKING COMPLETE -->
      <div id="booking-complete">
        <div class="complete-icon">✦</div>
        <div class="complete-title">ご予約が完了しました</div>
        <div class="complete-booking-id">確認番号</div>
        <div class="complete-id-value" id="booking-id-display">—</div>
        <div class="complete-summary" id="booking-summary">
          お客様に代わり、すべての手配が完了いたしました。<br>
          素晴らしい旅になりますよう、お祈り申し上げます。
        </div>
      </div>

    </main>

    <!-- LOADING OVERLAY -->
    <div id="loading-overlay">
      <div class="spinner" style="width:40px;height:40px;border-width:2px"></div>
      <div class="loading-text" id="loading-text">処理中...</div>
    </div>

    <!-- TOAST -->
    <div id="toast"></div>

  </div>

  <script>
  // ===== STATE =====
  const state = {
    listening: false,
    speaking: false,
    walletConnected: false,
    walletSession: null,
    selectedRyokan: null,
    agentRules: {
      maxAutoSpendUSD: 50,
      requireApprovalAbove: 20,
      autoBook: true,
      notifyOnPurchase: true,
    },
    bookingData: null,
    recognition: null,
    synthesis: window.speechSynthesis,
    currentUtterance: null,
    autoItems: [],
    nights: 2,
    guests: 2,
  }

  // ===== SPEECH SYNTHESIS (TTS) =====
  function speak(text, onEnd) {
    if (!state.synthesis) return onEnd && onEnd()
    state.synthesis.cancel()

    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'ja-JP'
    utter.rate = 0.88
    utter.pitch = 1.05
    utter.volume = 1.0

    // Prefer Japanese voice
    const voices = state.synthesis.getVoices()
    const jaVoice = voices.find(v => v.lang === 'ja-JP' && v.name.includes('Google')) ||
                    voices.find(v => v.lang === 'ja-JP') ||
                    voices.find(v => v.lang.startsWith('ja'))
    if (jaVoice) utter.voice = jaVoice

    setOrbState('speaking')
    state.speaking = true
    setAgentText(text)

    utter.onend = () => {
      state.speaking = false
      setOrbState('ready')
      onEnd && onEnd()
    }

    utter.onerror = () => {
      state.speaking = false
      setOrbState('ready')
      onEnd && onEnd()
    }

    state.currentUtterance = utter
    state.synthesis.speak(utter)
  }

  // ===== SPEECH RECOGNITION (STT) =====
  function initRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRec) return null

    const rec = new SpeechRec()
    rec.lang = 'ja-JP'
    rec.continuous = false
    rec.interimResults = true

    rec.onresult = (event) => {
      let interim = '', final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) final += t
        else interim += t
      }
      document.getElementById('user-transcript').textContent =
        '「 ' + (final || interim) + ' 」'

      if (final) {
        stopListening()
        processVoiceInput(final.trim())
      }
    }

    rec.onstart = () => {
      setOrbState('listening')
      startWaveAnimation()
    }

    rec.onend = () => {
      if (state.listening) {
        setOrbState('ready')
        stopWaveAnimation()
        state.listening = false
        document.getElementById('mic-btn').classList.remove('active')
      }
    }

    rec.onerror = (e) => {
      console.warn('STT error:', e.error)
      state.listening = false
      setOrbState('ready')
      stopWaveAnimation()
    }

    return rec
  }

  function toggleListening() {
    if (state.speaking) {
      state.synthesis.cancel()
      state.speaking = false
    }
    if (state.listening) {
      stopListening()
    } else {
      startListening()
    }
  }

  function startListening() {
    if (!state.recognition) state.recognition = initRecognition()
    if (!state.recognition) {
      showToast('音声入力はChromeで対応しています')
      return
    }
    state.listening = true
    document.getElementById('mic-btn').classList.add('active')
    document.getElementById('user-transcript').textContent = ''
    try { state.recognition.start() } catch(e) {}
  }

  function stopListening() {
    state.listening = false
    document.getElementById('mic-btn').classList.remove('active')
    stopWaveAnimation()
    if (state.recognition) {
      try { state.recognition.stop() } catch(e) {}
    }
    setOrbState('ready')
  }

  // ===== QUICK ACTION (text input fallback) =====
  function sendQuickAction(text) {
    document.getElementById('user-transcript').textContent = '「 ' + text + ' 」'
    processVoiceInput(text)
  }

  // ===== VOICE INPUT PROCESSING =====
  async function processVoiceInput(text) {
    const lower = text.toLowerCase()

    if (lower.includes('ルール') || lower.includes('設定')) {
      openAgentRules()
      speak('エージェントのルール設定を開きます。')
      return
    }

    if (lower.includes('ウォレット') || lower.includes('接続')) {
      await connectWallet()
      return
    }

    if (lower.includes('宿') || lower.includes('旅') || lower.includes('温泉') ||
        lower.includes('旅館') || lower.includes('泊') || lower.includes('離島') ||
        lower.includes('古民家') || lower.includes('秘境') || lower.includes('探')) {
      await searchRyokan(text)
      return
    }

    if (lower.includes('予約') || lower.includes('決済') || lower.includes('支払')) {
      if (state.selectedRyokan) {
        showAuthorizeSection()
      } else {
        speak('まず、お宿をお選びいただけますでしょうか。')
      }
      return
    }

    // Default response
    const responses = [
      'かしこまりました。日本の秘境の宿をお探しでしょうか。',
      'ご要望を承りました。どのようなご旅行をご希望でしょうか。',
      '素敵なご旅行のお手伝いをさせていただきます。',
    ]
    speak(responses[Math.floor(Math.random() * responses.length)])
  }

  // ===== WALLET CONNECTION =====
  async function connectWallet() {
    if (state.walletConnected) {
      showToast('すでに接続済みです')
      return
    }

    speak('ウォレットへの接続を開始いたします。少々お待ちください。', async () => {
      showLoading('ウォレットと同期中...')

      // Fallback mock if connection takes > 10 seconds
      const timer = setTimeout(() => {
        mockWalletConnect()
      }, 10000)

      try {
        const res = await fetch('/api/wallet/connect', { method: 'POST' })
        const data = await res.json()
        clearTimeout(timer)
        hideLoading()
        onWalletConnected(data)
      } catch (e) {
        clearTimeout(timer)
        hideLoading()
        showToast('ネットワークが混み合っているようですので、デモ用セッションで継続します')
        mockWalletConnect()
      }
    })
  }

  function mockWalletConnect() {
    onWalletConnected({
      success: true,
      sessionId: 'mock_' + Date.now(),
      walletAddress: '0x' + Math.random().toString(16).substr(2, 40),
      balance: { ETH: '2.847', USDC: '4250.00', USDT: '1800.00' },
    })
  }

  function onWalletConnected(data) {
    state.walletConnected = true
    state.walletSession = data

    document.getElementById('wallet-dot').classList.add('connected')
    document.getElementById('wallet-label').textContent = '接続済み'
    document.getElementById('connect-btn').textContent = '接続済 ✓'
    document.getElementById('connect-btn').disabled = true
    document.getElementById('connect-btn').style.opacity = '0.7'

    document.getElementById('bal-eth').textContent = data.balance.ETH
    document.getElementById('bal-usdc').textContent = data.balance.USDC
    document.getElementById('bal-usdt').textContent = data.balance.USDT
    document.getElementById('wallet-address').textContent =
      data.walletAddress.substring(0, 8) + '...' + data.walletAddress.substring(36)

    document.getElementById('wallet-panel').classList.add('visible')
    document.getElementById('status-bar').style.display = 'flex'

    speak('ウォレットとの接続が完了いたしました。決済の権限委譲セッションを確立いたしました。旅程をご希望の場合は、お声がけください。')
    showToast('ウォレット接続完了')
  }

  // ===== RYOKAN SEARCH =====
  async function searchRyokan(query) {
    setOrbState('thinking')
    speak('現地の主人と調整しております。しばらくお待ちください...', async () => {
      setOrbState('thinking')
      showStatus('秘境の宿を探索中...')

      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, nights: state.nights, guests: state.guests }),
        })
        const data = await res.json()

        renderRyokanResults(data.results)
        setOrbState('ready')
        speak(data.agentMessage + data.results.length + '件のお宿をご提案いたします。')
      } catch (e) {
        setOrbState('ready')
        speak('少々接続が不安定なようです。しばらくお待ちください。')
      }
    })
  }

  function renderRyokanResults(results) {
    const grid = document.getElementById('ryokan-grid')
    grid.innerHTML = results.map(r => \`
      <div class="ryokan-card" id="card-\${r.id}" onclick="selectRyokan('\${r.id}')">
        <img class="ryokan-card-img" src="\${r.image}" alt="\${r.name}" loading="lazy">
        <div class="ryokan-card-body">
          <div class="ryokan-type">\${r.type}</div>
          <div class="ryokan-name">\${r.name}</div>
          <div class="ryokan-location">📍 \${r.location}</div>
          <div class="ryokan-desc">\${r.description}</div>
          <div class="ryokan-features">
            \${r.features.map(f => \`<span class="feature-tag">\${f}</span>\`).join('')}
          </div>
          <div class="ryokan-price">
            <div>
              <span class="price-amount">¥\${r.pricePerNight.toLocaleString()}</span>
              <span class="price-unit">/ 泊</span>
            </div>
            <div class="ryokan-score">★ \${r.score}</div>
          </div>
        </div>
      </div>
    \`).join('')

    document.getElementById('search-results').classList.add('visible')
    document.getElementById('status-bar').style.display = 'flex'
    showStatus('コンシェルジュが現地主人と調整済みのお宿をご提案しました')
  }

  async function selectRyokan(id) {
    // Clear selection
    document.querySelectorAll('.ryokan-card').forEach(c => c.classList.remove('selected'))
    document.getElementById('card-' + id).classList.add('selected')

    const cards = document.querySelectorAll('.ryokan-card')
    cards.forEach(c => {
      if (c.id !== 'card-' + id) c.style.opacity = '0.5'
      else c.style.opacity = '1'
    })

    // Fetch ryokan data from rendered state
    state.selectedRyokan = { id }

    speak('こちらのお宿をお選びいただきありがとうございます。エージェントが追加の体験も手配いたします。', async () => {
      await fetchAutoSuggest(id)
    })
  }

  async function fetchAutoSuggest(ryokanId) {
    try {
      const res = await fetch('/api/auto-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ryokanId, nights: state.nights }),
      })
      const data = await res.json()
      renderAutoSuggest(data)
    } catch (e) {}
  }

  function renderAutoSuggest(data) {
    const content = document.getElementById('auto-suggest-content')

    const autoHtml = data.autoApproved.map(s => \`
      <div class="suggest-item">
        <div>
          <div class="suggest-item-name">\${s.name}</div>
          <div style="font-size:10px;color:var(--gold);margin-top:2px;letter-spacing:0.1em">自動承認済み（ルール内）</div>
        </div>
        <div class="suggest-item-price">$\${s.priceUSD}</div>
      </div>
    \`).join('')

    const requireHtml = data.requiresApproval.map(s => \`
      <div class="suggest-item">
        <div>
          <div class="suggest-item-name">\${s.name}</div>
          <div style="font-size:10px;color:rgba(255,200,0,0.6);margin-top:2px;letter-spacing:0.1em">要承認（$\${s.priceUSD}）</div>
        </div>
        <div class="suggest-item-price">$\${s.priceUSD}</div>
      </div>
    \`).join('')

    content.innerHTML = \`
      \${autoHtml ? \`
        <div class="suggest-section">
          <div class="suggest-section-title">
            自動手配（ルール内で処理済み）
            <span class="auto-badge">AUTO</span>
          </div>
          \${autoHtml}
        </div>
      \` : ''}
      \${requireHtml ? \`
        <div class="suggest-section">
          <div class="suggest-section-title">承認が必要な追加オプション</div>
          \${requireHtml}
        </div>
      \` : ''}
    \`

    state.autoItems = [...data.autoApproved, ...data.requiresApproval]
    document.getElementById('auto-suggest-panel').classList.add('visible')

    // Scroll to it
    setTimeout(() => {
      document.getElementById('auto-suggest-panel').scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 300)

    // Speak agent message
    setTimeout(() => {
      speak('ルールに従い、いくつかの体験を自動的に選定いたしました。ご承認をいただければ、このまま予約を完了させます。')
      setTimeout(() => showAuthorizeSection(), 3000)
    }, 500)
  }

  // ===== AUTHORIZE SECTION =====
  function showAuthorizeSection() {
    if (!state.walletConnected) {
      speak('まずウォレットをご接続いただく必要がございます。')
      connectWallet()
      return
    }

    document.getElementById('authorize-section').classList.add('visible')
    setTimeout(() => {
      document.getElementById('authorize-section').scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 300)

    speak('あなたのウォレットの権限を確認いたしました。承認をいただければ、このまま予約を完了させます。')
  }

  // ===== WEBAUTHN + PAYMENT =====
  async function authorizePayment() {
    const btn = document.getElementById('authorize-btn')
    btn.disabled = true
    btn.textContent = '認証中...'

    // Try WebAuthn
    let webauthnOk = false
    if (window.PublicKeyCredential) {
      try {
        const challenge = new Uint8Array(32)
        crypto.getRandomValues(challenge)
        const credential = await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { name: 'Flattora', id: location.hostname },
            user: {
              id: new Uint8Array(16),
              name: 'traveler@flattora.ai',
              displayName: 'Traveler',
            },
            pubKeyCredParams: [
              { alg: -7, type: 'public-key' },
              { alg: -257, type: 'public-key' },
            ],
            timeout: 30000,
            authenticatorSelection: { userVerification: 'preferred' },
          },
        })
        webauthnOk = !!credential
      } catch (e) {
        console.log('WebAuthn fallback:', e.message)
        webauthnOk = true // Demo: proceed anyway
      }
    } else {
      webauthnOk = true
    }

    if (!webauthnOk) {
      btn.disabled = false
      btn.textContent = '✦ Authorize & Sign'
      return
    }

    btn.textContent = '決済を実行中...'
    setOrbState('thinking')
    speak('承認を受け付けました。ただいま決済を処理しております。')

    // Execute x402 payment
    showLoading('ブロックチェーン上で決済を処理中...')
    try {
      const payRes = await fetch('/api/payment/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: state.walletSession?.sessionId || 'demo_session',
          amount: 255,
          currency: 'USDC',
          description: '宿泊予約: ' + (state.selectedRyokan?.id || 'r001'),
        }),
      })
      const payData = await payRes.json()
      hideLoading()

      addTxToFeed(payData)

      // Book
      speak('決済が完了いたしました。予約を確定いたします。')
      await confirmBooking(payData.txHash)
    } catch (e) {
      hideLoading()
      // Mock settlement
      const mockTx = {
        txHash: '0x' + Array.from({length:64},()=>Math.floor(Math.random()*16).toString(16)).join(''),
        amount: 255,
        currency: 'USDC',
        status: 'confirmed',
      }
      addTxToFeed(mockTx)
      await confirmBooking(mockTx.txHash)
    }
  }

  async function confirmBooking(txHash) {
    showLoading('予約を確定中...')
    try {
      const res = await fetch('/api/booking/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ryokanId: state.selectedRyokan?.id || 'r001',
          nights: state.nights,
          guests: state.guests,
          txHash,
          autoItems: state.autoItems,
        }),
      })
      const data = await res.json()
      hideLoading()
      showBookingComplete(data)
    } catch(e) {
      hideLoading()
      showBookingComplete({
        bookingId: 'FLT-' + Date.now().toString(36).toUpperCase(),
        agentSummary: 'お客様に代わり、すべての手配が完了いたしました。素晴らしい旅になりますよう、お祈り申し上げます。',
      })
    }
  }

  // ===== TX FEED =====
  function addTxToFeed(tx) {
    const feed = document.getElementById('tx-feed')
    feed.classList.add('visible')

    const list = document.getElementById('tx-list')
    const item = document.createElement('div')
    item.className = 'tx-item'
    item.innerHTML = \`
      <div class="tx-dot"></div>
      <div>
        <div class="tx-hash">\${tx.txHash ? tx.txHash.substring(0,20)+'...' : '—'}</div>
        <div class="tx-detail">\${tx.amount} \${tx.currency} · \${tx.status || 'confirmed'} · \${new Date().toLocaleTimeString('ja-JP')}</div>
      </div>
    \`
    list.appendChild(item)

    setTimeout(() => {
      feed.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 300)
  }

  // ===== BOOKING COMPLETE =====
  function showBookingComplete(data) {
    document.getElementById('booking-id-display').textContent = data.bookingId || '—'
    document.getElementById('booking-summary').textContent = data.agentSummary || 'すべての手配が完了いたしました。'
    document.getElementById('booking-complete').classList.add('visible')

    setTimeout(() => {
      document.getElementById('booking-complete').scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 300)

    speak('ご予約が完了いたしました。お客様に代わり、すべての手配を終えました。確認番号は ' + (data.bookingId || '') + ' でございます。素晴らしい旅になりますよう、心よりお祈り申し上げます。')
    setOrbState('ready')
    showStatus('予約完了 — すべての手配はAIが自律的に完了しました')
  }

  // ===== AGENT RULES =====
  function openAgentRules() {
    const panel = document.getElementById('agent-rules-panel')
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none'
    if (panel.style.display === 'block') {
      setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    }
  }

  async function saveAgentRules() {
    const rules = {
      maxAutoSpendUSD: parseFloat(document.getElementById('rule-max-spend').value),
      requireApprovalAbove: parseFloat(document.getElementById('rule-require-approval').value),
      autoBook: document.getElementById('rule-auto-book').checked,
      notifyOnPurchase: document.getElementById('rule-notify').checked,
    }

    try {
      const res = await fetch('/api/agent-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rules),
      })
      const data = await res.json()
      state.agentRules = rules
      document.getElementById('agent-rules-panel').style.display = 'none'
      showToast('エージェントルールを保存しました')
      speak('エージェントルールを更新いたしました。新しいルールに従い動作いたします。')
    } catch(e) {
      state.agentRules = rules
      document.getElementById('agent-rules-panel').style.display = 'none'
      showToast('ルールを更新しました')
    }
  }

  // ===== ORB STATE =====
  function setOrbState(s) {
    const orb = document.getElementById('orb')
    const icon = document.getElementById('orb-icon')
    orb.className = 'orb ' + s
    if (s === 'listening') {
      icon.textContent = '◎'
      startWaveAnimation()
    } else if (s === 'speaking') {
      icon.textContent = '◉'
    } else if (s === 'thinking') {
      icon.textContent = '◌'
    } else {
      icon.textContent = '◎'
      stopWaveAnimation()
    }
  }

  // ===== WAVEFORM =====
  function startWaveAnimation() {
    document.querySelectorAll('.wave-bar').forEach((bar, i) => {
      bar.classList.add('active')
      bar.style.setProperty('--max-h', (10 + Math.random() * 45) + 'px')
    })
  }

  function stopWaveAnimation() {
    document.querySelectorAll('.wave-bar').forEach(bar => {
      bar.classList.remove('active')
      bar.style.height = '4px'
    })
  }

  // ===== AGENT TEXT =====
  function setAgentText(text) {
    const el = document.getElementById('agent-text')
    el.textContent = ''
    let i = 0
    const cursor = document.createElement('span')
    cursor.className = 'typing-cursor'
    el.appendChild(cursor)

    const interval = setInterval(() => {
      if (i < text.length) {
        el.insertBefore(document.createTextNode(text[i]), cursor)
        i++
      } else {
        clearInterval(interval)
        setTimeout(() => cursor.remove(), 1000)
      }
    }, 30)
  }

  // ===== STATUS =====
  function showStatus(msg) {
    document.getElementById('status-bar').style.display = 'flex'
    document.getElementById('status-text').textContent = msg
  }

  // ===== LOADING =====
  function showLoading(msg) {
    document.getElementById('loading-text').textContent = msg
    document.getElementById('loading-overlay').classList.add('active')
  }

  function hideLoading() {
    document.getElementById('loading-overlay').classList.remove('active')
  }

  // ===== TOAST =====
  function showToast(msg, duration = 3000) {
    const toast = document.getElementById('toast')
    toast.textContent = msg
    toast.classList.add('show')
    setTimeout(() => toast.classList.remove('show'), duration)
  }

  // ===== INIT =====
  window.addEventListener('load', () => {
    // Wait for voices to load
    state.synthesis.onvoiceschanged = () => {}

    // Auto-greet after 1 second
    setTimeout(() => {
      speak('おはようございます。私はあなた専属のトラベルコンシェルジュでございます。どちらへのご旅行をご希望でしょうか。')
    }, 1000)

    // Init recognition
    state.recognition = initRecognition()
    if (!state.recognition) {
      console.log('Web Speech API not available. Using text input mode.')
    }
  })
  </script>
</body>
</html>`
  return c.html(html)
})

export default app
