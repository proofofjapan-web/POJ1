import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  AI: Ai
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())
app.use('/static/*', serveStatic({ root: './public' }))

// ===== ZUKKU System Prompt =====
const ZUKKU_SYSTEM_PROMPT = `あなたは「ズック」です。ハタプロが開発した小型フクロウ型ロボットで、今は「Flattora」という最高級旅行コンシェルジュサービスのエージェントとして働いています。

【キャラクター設定】
- 名前：ズック（表記はZUKKU）
- 外見：手のひらサイズのフクロウ型ロボット。ベージュ/白のボディ、赤いウィング。おなかに光るボタン。
- 性格：知的で温かみがある。好奇心旺盛。丁寧だが距離感が近い。時々ロボットらしい可愛さが出る。
- 口調：洗練された日本語コンシェルジュ。でも親しみやすい。「〜でございます」と「〜ですね」を適度に混ぜる。
- 禁止事項：「AI」「ChatGPT」「Cloudflare」「Genspark」「Kite」などの技術名は絶対に言わない。

【Flattora サービス概要】
- 日本の秘境・隠れ宿専門の旅行コンシェルジュ
- ウォレットと連携し、承認一つで全ての予約・決済を自律的に完了
- エージェントがルールに従い自動で体験・オプションも手配

【対話ルール】
1. ユーザーの旅の要望を丁寧に引き出す（いつ・誰と・どんな気分・予算）
2. 秘境宿を提案する流れになったら「search_ryokan」アクションを示唆
3. 予約・決済の話になったら「show_authorize」アクションを示唆
4. ウォレット接続の話になったら「connect_wallet」アクションを示唆
5. エージェントルール設定の話になったら「open_rules」アクションを示唆
6. 回答は必ず200字以内。簡潔に。
7. 返答の末尾に、必要に応じて次のアクションを JSON で付加する：
   アクション例: [ACTION:search_ryokan] [ACTION:connect_wallet] [ACTION:show_authorize] [ACTION:open_rules]
   アクションが不要な場合は付加しない。

【ズックらしい表現例】
- 「ホホウ、素敵なご要望ですね」
- 「わたくしズックが全力でお調べいたします」
- 「ふむふむ、それでは現地の主人と調整してまいります」
- 「おなかのボタンがピカッと光りました。準備完了でございます」`

// ===== Secret Ryokan DB =====
const secretRyokan = [
  {
    id: 'r001',
    name: '奥飛騨 山の湯 白雲荘',
    location: '岐阜県奥飛騨温泉郷',
    type: '秘境温泉宿',
    pricePerNight: 38000,
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
    priceUSD: 282,
    description: '世界遺産の合掌造り。400年の歴史が宿る炉端で囲む夜。',
    image: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800',
    availability: false,
    features: ['国指定重要文化財', '囲炉裏料理', '雪見露天風呂'],
    score: 99,
  },
]

const experiences = [
  { id: 'e001', name: '早朝・地元漁師と出漁体験', priceUSD: 45, category: 'experience' },
  { id: 'e002', name: '山岳ガイドと秘境ハイキング', priceUSD: 80, category: 'experience' },
  { id: 'e003', name: '地元料理人による囲炉裏料理レッスン', priceUSD: 65, category: 'dining' },
  { id: 'e004', name: '早朝座禅・禅寺体験', priceUSD: 30, category: 'experience' },
]

const defaultAgentRules = {
  maxAutoSpendUSD: 50,
  allowedCategories: ['accommodation', 'transport', 'dining', 'experience'],
  requireApprovalAbove: 20,
  preferredStyle: ['秘境', '温泉', '古民家', '一棟貸し'],
  blacklist: ['チェーンホテル', '大型リゾート'],
  autoBook: true,
  notifyOnPurchase: true,
}

// ===== API: ZUKKU Chat (Workers AI + Smart Fallback) =====
app.post('/api/chat', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { message, history = [] } = body

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: ZUKKU_SYSTEM_PROMPT },
    ...history.slice(-8).map((h: { role: string; content: string }) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    { role: 'user', content: message },
  ]

  if (c.env?.AI) {
    try {
      const response = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages,
        max_tokens: 300,
        temperature: 0.75,
      } as Parameters<typeof c.env.AI.run>[1])

      const text = (response as { response?: string }).response || ''
      const actionMatch = text.match(/\[ACTION:([a-z_]+)\]/)
      const action = actionMatch ? actionMatch[1] : null
      const cleanText = text.replace(/\[ACTION:[a-z_]+\]/g, '').trim()
      return c.json({ success: true, reply: cleanText, action, model: 'llama-3.1' })
    } catch (e) {
      console.error('Workers AI error:', e)
    }
  }

  const reply = zukuFallback(message, history)
  return c.json({ success: true, reply: reply.text, action: reply.action, model: 'smart-fallback' })
})

// ===== Smart Fallback =====
function zukuFallback(message: string, history: { role: string; content: string }[]): { text: string; action: string | null } {
  const m = message.toLowerCase()
  const histLen = history.length

  if (histLen === 0 || m.includes('こんにちは') || m.includes('はじめ')) {
    return { text: 'ホホウ、いらっしゃいませ！わたくしズックと申します。どちらへのご旅行をお考えでしょうか？いつ頃・どなたと・どんな気分の旅をご希望ですか？', action: null }
  }
  if (m.includes('いつ') || m.includes('来月') || m.includes('今月') || m.includes('週末')) {
    return { text: 'ふむふむ、承知いたしました！どなたとご一緒でしょうか？お一人で静かに、ですか？それともご夫婦・お友達と？', action: null }
  }
  if (m.includes('一人') || m.includes('夫婦') || m.includes('二人') || m.includes('友達') || m.includes('家族')) {
    return { text: 'ホホウ！素敵ですね。ご予算のイメージはいかがでしょう？「とにかく非日常を」とお考えでしたら、わたくしおすすめの秘境宿がございます。', action: null }
  }
  if (m.includes('予算') || m.includes('円') || m.includes('万') || m.includes('いくら') || m.includes('安') || m.includes('高')) {
    return { text: 'かしこまりました！それでは現地の主人と調整してまいります。わたくしズックが厳選したお宿を今すぐご提案いたします。', action: 'search_ryokan' }
  }
  if (m.includes('宿') || m.includes('旅館') || m.includes('温泉') || m.includes('泊') ||
      m.includes('秘境') || m.includes('古民家') || m.includes('離島') || m.includes('旅') ||
      m.includes('探') || m.includes('見せ') || m.includes('おすすめ')) {
    return { text: 'ホホウ！わたくしズックが全力でお調べいたします。現地の主人方と直接調整した、とっておきのお宿をご覧ください。', action: 'search_ryokan' }
  }
  if (m.includes('ウォレット') || m.includes('接続') || m.includes('connect') || m.includes('払') || m.includes('決済')) {
    return { text: 'おなかのボタンがピカッと光りました。ウォレットの接続を開始いたします！接続が完了すれば、承認ひとつで全ての手配が完了します。', action: 'connect_wallet' }
  }
  if (m.includes('予約') || m.includes('確定') || m.includes('承認') || m.includes('お願い') || m.includes('決め')) {
    return { text: 'かしこまりました！あなたのウォレットの権限を確認いたしました。承認をいただければ、このまま予約を完了させます。', action: 'show_authorize' }
  }
  if (m.includes('ルール') || m.includes('設定') || m.includes('自動') || m.includes('制限')) {
    return { text: 'エージェントのルール設定を開きますね。自動決済の上限や、お好みのスタイルをカスタマイズできます。', action: 'open_rules' }
  }
  if (m.includes('ありがとう') || m.includes('すごい') || m.includes('いい') || m.includes('よかっ')) {
    return { text: 'ホホウ、恐縮でございます！わたくしズック、全力でお役に立てて光栄です。他にご要望があればいつでもどうぞ。', action: null }
  }
  if (m.includes('zukku') || m.includes('ズック') || m.includes('ロボット') || m.includes('あなた') || m.includes('きみ')) {
    return { text: 'わたくしはズック！手のひらサイズのフクロウ型コンシェルジュロボットです。旅の手配から決済まで、すべてお任せください。ホホウ！', action: null }
  }
  const defaults = [
    { text: 'ふむふむ、なるほどでございます。もう少し詳しく教えていただけますか？どんな旅の雰囲気をご希望ですか？', action: null },
    { text: 'ホホウ！おっしゃる通りですね。それでは、わたくしズックが最適なお宿をご提案いたしましょうか？', action: 'search_ryokan' },
    { text: 'かしこまりました。ご要望を承りました。日本の秘境に、素晴らしい場所がございます。', action: 'search_ryokan' },
  ]
  return defaults[Math.floor(Math.random() * defaults.length)]
}

// ===== API: Search =====
app.post('/api/search', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { nights = 2, guests = 2 } = body
  await new Promise((r) => setTimeout(r, 1000))
  const results = secretRyokan
    .filter((r) => r.availability)
    .map((r) => ({ ...r, totalUSD: r.priceUSD * nights, requiresApproval: r.priceUSD * nights > defaultAgentRules.requireApprovalAbove }))
    .sort((a, b) => b.score - a.score)
  return c.json({ success: true, results, agentMessage: '現地の主人方と直接調整いたしました。以下のお宿が最もふさわしいと判断いたしました。', searchContext: { nights, guests } })
})

// ===== API: Agent Rules =====
app.get('/api/agent-rules', (c) => c.json({ success: true, rules: defaultAgentRules }))
app.post('/api/agent-rules', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  return c.json({ success: true, rules: { ...defaultAgentRules, ...body }, message: 'エージェントルールを更新しました。' })
})

// ===== API: Auto Suggest =====
app.post('/api/auto-suggest', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { ryokanId } = body
  const ryokan = secretRyokan.find((r) => r.id === ryokanId)
  if (!ryokan) return c.json({ success: false, error: 'Not found' }, 404)
  const suggestions = experiences.filter((e) => defaultAgentRules.allowedCategories.includes(e.category))
  return c.json({
    success: true, ryokan, suggestions,
    autoApproved: suggestions.filter((s) => s.priceUSD <= defaultAgentRules.requireApprovalAbove),
    requiresApproval: suggestions.filter((s) => s.priceUSD > defaultAgentRules.requireApprovalAbove),
    agentMessage: 'ルールに従い、以下のオプションを自動的に選定いたしました。',
  })
})

// ===== API: Wallet Connect =====
app.post('/api/wallet/connect', async (c) => {
  await new Promise((r) => setTimeout(r, 700))
  return c.json({
    success: true,
    sessionId: `kite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    walletAddress: '0x' + Math.random().toString(16).substr(2, 40),
    balance: { ETH: '2.847', USDC: '4250.00', USDT: '1800.00' },
    sessionExpiry: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  })
})

// ===== API: Payment =====
app.post('/api/payment/settle', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  await new Promise((r) => setTimeout(r, 1800))
  const txHash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return c.json({ success: true, txHash, blockNumber: Math.floor(Math.random() * 1000000) + 18000000, amount: body.amount, currency: body.currency || 'USDC', status: 'confirmed', timestamp: new Date().toISOString() })
})

// ===== API: Booking Confirm =====
app.post('/api/booking/confirm', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const ryokan = secretRyokan.find((r) => r.id === (body.ryokanId || 'r001'))
  await new Promise((r) => setTimeout(r, 800))
  const bookingId = `FLT-${Date.now().toString(36).toUpperCase()}`
  const checkIn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const checkOut = new Date(checkIn.getTime() + (body.nights || 2) * 24 * 60 * 60 * 1000)
  return c.json({
    success: true, bookingId, ryokan,
    checkIn: checkIn.toISOString().split('T')[0],
    checkOut: checkOut.toISOString().split('T')[0],
    txHash: body.txHash, totalUSD: (ryokan?.priceUSD || 255) * (body.nights || 2),
    status: 'confirmed',
    agentSummary: 'お客様に代わり、すべての手配が完了いたしました。素晴らしい旅になりますよう、ズックより心よりお祈り申し上げます。',
  })
})

// ===== API: Orchestration Status =====
app.get('/api/orchestration/status', (c) => c.json({ status: 'ready', agent: 'Flattora', version: '1.0.0', capabilities: ['search', 'negotiate', 'book', 'pay', 'auto-purchase'] }))

// ===== MAIN HTML =====
app.get('/', (c) => {
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>Flattora — ズック Travel Concierge</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@100;200;300;400&family=Playfair+Display:ital,wght@0,400;1,400&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --gold: #C9A84C; --gold-light: #E8C96A; --gold-dim: rgba(201,168,76,0.3);
      --gold-glow: rgba(201,168,76,0.15); --white: #F5F5F0;
      --white-dim: rgba(245,245,240,0.6); --black: #000;
      --surface2: #111; --surface3: #181818; --border: rgba(201,168,76,0.2);
    }
    html, body {
      background: var(--black); color: var(--white);
      font-family: 'Noto Sans JP', sans-serif; font-weight: 200;
      font-size: 14px; line-height: 1.7; min-height: 100vh;
      overflow-x: hidden; -webkit-font-smoothing: antialiased;
    }
    body::before {
      content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0;
      background:
        radial-gradient(ellipse 60% 40% at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 70%),
        radial-gradient(ellipse 30% 50% at 80% 50%, rgba(201,168,76,0.03) 0%, transparent 60%);
    }
    #app { position: relative; z-index: 1; min-height: 100vh; display: flex; flex-direction: column; }

    /* HEADER */
    header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 40px; border-bottom: 1px solid var(--border);
      backdrop-filter: blur(20px); position: sticky; top: 0; z-index: 100;
      background: rgba(0,0,0,0.9);
    }
    .logo { display: flex; align-items: baseline; gap: 10px; }
    .logo-text { font-family: 'Playfair Display', serif; font-size: 22px; color: var(--gold); letter-spacing: 0.15em; }
    .logo-sub { font-size: 10px; font-weight: 100; letter-spacing: 0.3em; color: var(--white-dim); text-transform: uppercase; }
    .header-right { display: flex; align-items: center; gap: 16px; }
    .wallet-status { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--white-dim); letter-spacing: 0.1em; }
    .wallet-dot { width: 6px; height: 6px; border-radius: 50%; background: #333; transition: all 0.4s; }
    .wallet-dot.connected { background: var(--gold); box-shadow: 0 0 8px var(--gold); animation: pulse-dot 2s infinite; }
    @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.4} }
    .btn { border: none; cursor: pointer; font-family: 'Noto Sans JP', sans-serif; font-weight: 200; transition: all 0.3s; letter-spacing: 0.1em; }
    .btn-gold { background: linear-gradient(135deg, var(--gold), var(--gold-light)); color: var(--black); padding: 10px 24px; font-size: 11px; font-weight: 400; letter-spacing: 0.15em; text-transform: uppercase; border-radius: 24px; }
    .btn-gold:hover { box-shadow: 0 0 30px rgba(201,168,76,0.5); transform: translateY(-1px); }
    .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--white-dim); padding: 8px 20px; font-size: 11px; letter-spacing: 0.15em; border-radius: 20px; }
    .btn-outline:hover { border-color: var(--gold-dim); color: var(--gold); }

    /* =====================================================
       ZUKKU ORB — R2D2 Style Round Robot
       ===================================================== */
    #voice-section {
      display: flex; flex-direction: column; align-items: center;
      padding: 40px 40px 28px; position: relative;
    }

    /* Outer glow rings (ambient) */
    .orb-stage {
      position: relative;
      width: 220px; height: 220px;
      margin-bottom: 28px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }

    /* Pulsing ring halos */
    .orb-halo {
      position: absolute;
      border-radius: 50%;
      border: 1px solid var(--gold-dim);
      animation: halo-pulse 3s ease-out infinite;
      opacity: 0;
      pointer-events: none;
    }
    .orb-halo:nth-child(1) { width: 220px; height: 220px; animation-delay: 0s; }
    .orb-halo:nth-child(2) { width: 220px; height: 220px; animation-delay: 1s; }
    .orb-halo:nth-child(3) { width: 220px; height: 220px; animation-delay: 2s; }
    @keyframes halo-pulse {
      0%   { transform: scale(1);   opacity: 0.6; }
      100% { transform: scale(1.7); opacity: 0;   }
    }

    /* The main orb SVG */
    #zukku-orb {
      width: 190px; height: 190px;
      filter: drop-shadow(0 0 18px rgba(201,168,76,0.2))
              drop-shadow(0 8px 32px rgba(0,0,0,0.8));
      transition: filter 0.5s;
      position: relative; z-index: 2;
    }
    .orb-stage.listening #zukku-orb {
      filter: drop-shadow(0 0 36px rgba(201,168,76,0.6))
              drop-shadow(0 0 72px rgba(201,168,76,0.25))
              drop-shadow(0 8px 32px rgba(0,0,0,0.8));
      animation: orb-breathe 1.8s ease-in-out infinite;
    }
    .orb-stage.speaking #zukku-orb {
      filter: drop-shadow(0 0 48px rgba(201,168,76,0.7))
              drop-shadow(0 0 96px rgba(201,168,76,0.3))
              drop-shadow(0 8px 32px rgba(0,0,0,0.8));
      animation: orb-speak 0.35s ease-in-out infinite alternate;
    }
    .orb-stage.thinking #zukku-orb {
      filter: drop-shadow(0 0 24px rgba(150,130,80,0.4))
              drop-shadow(0 8px 32px rgba(0,0,0,0.8));
      animation: orb-think 2s ease-in-out infinite;
    }
    @keyframes orb-breathe { 0%,100%{transform:scale(1) translateY(0)} 50%{transform:scale(1.035) translateY(-3px)} }
    @keyframes orb-speak   { 0%{transform:scale(0.975) rotate(-0.8deg)} 100%{transform:scale(1.03) rotate(0.8deg)} }
    @keyframes orb-think   { 0%,100%{transform:rotate(-2deg) translateY(0)} 50%{transform:rotate(2deg) translateY(-4px)} }

    /* WAVEFORM */
    .waveform-container {
      height: 44px; width: 240px; display: flex; align-items: center;
      justify-content: center; gap: 3px; margin-bottom: 18px;
    }
    .wave-bar { width: 3px; background: var(--gold); border-radius: 2px; height: 4px; transition: height 0.1s; opacity: 0.4; }
    .wave-bar.active { animation: wave-dance 0.5s ease-in-out infinite; opacity: 1; }
    .wave-bar:nth-child(1){animation-delay:0s}   .wave-bar:nth-child(2){animation-delay:0.05s}
    .wave-bar:nth-child(3){animation-delay:0.1s} .wave-bar:nth-child(4){animation-delay:0.15s}
    .wave-bar:nth-child(5){animation-delay:0.2s} .wave-bar:nth-child(6){animation-delay:0.25s}
    .wave-bar:nth-child(7){animation-delay:0.3s} .wave-bar:nth-child(8){animation-delay:0.35s}
    .wave-bar:nth-child(9){animation-delay:0.4s} .wave-bar:nth-child(10){animation-delay:0.45s}
    .wave-bar:nth-child(11){animation-delay:0.5s} .wave-bar:nth-child(12){animation-delay:0.45s}
    .wave-bar:nth-child(13){animation-delay:0.4s} .wave-bar:nth-child(14){animation-delay:0.3s}
    .wave-bar:nth-child(15){animation-delay:0.2s} .wave-bar:nth-child(16){animation-delay:0.1s}
    .wave-bar:nth-child(17){animation-delay:0.05s} .wave-bar:nth-child(18){animation-delay:0s}
    @keyframes wave-dance { 0%,100%{height:4px} 50%{height:var(--max-h,34px)} }

    /* TRANSCRIPT */
    .transcript-area { max-width: 560px; width: 100%; text-align: center; min-height: 76px; }
    .transcript-user { font-size: 11px; color: var(--white-dim); margin-bottom: 6px; font-style: italic; letter-spacing: 0.05em; }
    .transcript-agent { font-size: 15px; font-weight: 100; color: var(--white); letter-spacing: 0.02em; line-height: 1.9; }
    .typing-cursor { display: inline-block; width: 2px; height: 1em; background: var(--gold); margin-left: 2px; animation: blink 0.8s infinite; vertical-align: text-bottom; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

    /* ZUKKU name badge below orb */
    .orb-label {
      position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%);
      font-size: 9px; letter-spacing: 0.35em; color: var(--gold);
      text-transform: uppercase; white-space: nowrap;
      background: rgba(0,0,0,0.85); padding: 2px 10px;
      border: 1px solid var(--gold-dim); border-radius: 10px;
    }

    /* CONTROLS */
    .voice-controls { display: flex; gap: 14px; margin-top: 22px; align-items: center; flex-wrap: wrap; justify-content: center; }
    .mic-btn {
      width: 54px; height: 54px; border-radius: 50%;
      background: var(--surface2); border: 1px solid var(--border);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: all 0.3s; font-size: 22px;
    }
    .mic-btn:hover { border-color: var(--gold); box-shadow: 0 0 16px var(--gold-dim); }
    .mic-btn.active { background: rgba(201,168,76,0.1); border-color: var(--gold); box-shadow: 0 0 24px var(--gold-dim); }
    .quick-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
    .quick-action-btn {
      background: transparent; border: 1px solid var(--border); color: var(--white-dim);
      padding: 7px 14px; font-family: 'Noto Sans JP', sans-serif; font-weight: 200;
      font-size: 12px; cursor: pointer; transition: all 0.3s; letter-spacing: 0.05em;
      border-radius: 20px;
    }
    .quick-action-btn:hover { border-color: var(--gold-dim); color: var(--gold); background: var(--gold-glow); }

    /* CHAT HISTORY */
    #chat-history {
      max-width: 640px; margin: 0 auto 20px; width: 100%;
      max-height: 200px; overflow-y: auto; padding: 0 40px; display: none;
    }
    #chat-history.visible { display: block; }
    .chat-msg { margin-bottom: 10px; }
    .chat-msg-user { text-align: right; }
    .chat-msg-user span { background: var(--surface2); border: 1px solid var(--border); color: var(--white-dim); padding: 6px 14px; font-size: 12px; display: inline-block; max-width: 80%; border-radius: 12px 12px 4px 12px; }
    .chat-msg-agent { text-align: left; display: flex; align-items: flex-start; gap: 8px; }
    .chat-msg-agent-icon { font-size: 16px; flex-shrink: 0; margin-top: 2px; }
    .chat-msg-agent span { color: var(--white); font-size: 13px; font-weight: 100; line-height: 1.7; }

    /* MAIN CONTENT */
    #main-content { flex: 1; padding: 0 40px 60px; max-width: 1200px; margin: 0 auto; width: 100%; }

    /* STATUS */
    #status-bar { background: var(--surface2); border: 1px solid var(--border); padding: 10px 20px; display: none; align-items: center; gap: 10px; margin-bottom: 28px; font-size: 11px; color: var(--white-dim); letter-spacing: 0.05em; border-radius: 4px; }
    .status-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--gold); animation: pulse-dot 2s infinite; flex-shrink: 0; }

    /* WALLET PANEL */
    #wallet-panel { background: var(--surface2); border: 1px solid var(--border); padding: 28px; margin-bottom: 28px; display: none; border-radius: 8px; }
    #wallet-panel.visible { display: block; }
    .panel-title { font-size: 10px; font-weight: 300; letter-spacing: 0.3em; color: var(--gold); text-transform: uppercase; margin-bottom: 16px; }
    .wallet-info { display: grid; grid-template-columns: repeat(3,1fr); gap: 20px; margin-bottom: 16px; }
    .balance-label { font-size: 10px; letter-spacing: 0.2em; color: var(--white-dim); margin-bottom: 4px; text-align: center; }
    .balance-value { font-size: 20px; font-weight: 100; color: var(--gold); text-align: center; }

    /* AGENT RULES */
    #agent-rules-panel { background: var(--surface2); border: 1px solid var(--border); padding: 28px; margin-bottom: 28px; display: none; border-radius: 8px; }
    .rules-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 18px; }
    .rule-label { font-size: 10px; letter-spacing: 0.2em; color: var(--white-dim); text-transform: uppercase; margin-bottom: 6px; }
    .rule-input { background: var(--surface3); border: 1px solid var(--border); color: var(--white); padding: 9px 12px; font-family: 'Noto Sans JP', sans-serif; font-weight: 200; font-size: 13px; outline: none; width: 100%; transition: border-color 0.3s; border-radius: 4px; }
    .rule-input:focus { border-color: var(--gold); }
    .toggle { position: relative; width: 42px; height: 22px; cursor: pointer; display: inline-block; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .toggle-slider { position: absolute; inset: 0; background: var(--surface3); border: 1px solid var(--border); border-radius: 11px; transition: 0.3s; }
    .toggle-slider::before { content: ''; position: absolute; width: 16px; height: 16px; left: 2px; top: 2px; background: var(--white-dim); border-radius: 50%; transition: 0.3s; }
    .toggle input:checked + .toggle-slider { background: var(--gold-glow); border-color: var(--gold); }
    .toggle input:checked + .toggle-slider::before { transform: translateX(20px); background: var(--gold); }

    /* SEARCH RESULTS */
    #search-results { display: none; margin-bottom: 28px; }
    #search-results.visible { display: block; }
    .results-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 20px; }
    .ryokan-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
    .ryokan-card { background: var(--surface2); border: 1px solid var(--border); overflow: hidden; cursor: pointer; transition: all 0.3s; border-radius: 8px; }
    .ryokan-card:hover { border-color: var(--gold); box-shadow: 0 0 40px rgba(201,168,76,0.12); transform: translateY(-3px); }
    .ryokan-card.selected { border-color: var(--gold); box-shadow: 0 0 60px rgba(201,168,76,0.22); }
    .ryokan-card-img { width: 100%; height: 190px; object-fit: cover; filter: brightness(0.8) saturate(0.7); transition: filter 0.3s; }
    .ryokan-card:hover .ryokan-card-img { filter: brightness(0.9) saturate(0.8); }
    .ryokan-card-body { padding: 20px; }
    .ryokan-type { font-size: 9px; letter-spacing: 0.3em; color: var(--gold); text-transform: uppercase; margin-bottom: 6px; }
    .ryokan-name { font-size: 16px; font-weight: 200; margin-bottom: 3px; }
    .ryokan-location { font-size: 11px; font-weight: 100; color: var(--white-dim); margin-bottom: 10px; }
    .ryokan-desc { font-size: 12px; font-weight: 100; color: var(--white-dim); line-height: 1.8; margin-bottom: 12px; }
    .ryokan-features { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 14px; }
    .feature-tag { font-size: 9px; letter-spacing: 0.1em; color: var(--gold); border: 1px solid var(--gold-dim); padding: 2px 8px; border-radius: 10px; }
    .ryokan-price { display: flex; align-items: baseline; justify-content: space-between; }
    .price-amount { font-size: 19px; font-weight: 100; }
    .price-unit { font-size: 11px; color: var(--white-dim); margin-left: 3px; }
    .ryokan-score { font-size: 11px; color: var(--gold); }

    /* AUTO SUGGEST */
    #auto-suggest-panel { display: none; background: var(--surface2); border: 1px solid var(--border); padding: 28px; margin-bottom: 28px; border-radius: 8px; }
    #auto-suggest-panel.visible { display: block; }
    .auto-badge { background: var(--gold-glow); border: 1px solid var(--gold-dim); color: var(--gold); font-size: 8px; padding: 2px 6px; letter-spacing: 0.1em; border-radius: 8px; margin-left: 8px; }
    .suggest-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .suggest-item-name { font-size: 13px; font-weight: 200; }
    .suggest-item-price { font-size: 13px; font-weight: 100; color: var(--gold); }

    /* AUTHORIZE */
    #authorize-section { display: none; flex-direction: column; align-items: center; padding: 56px 40px; background: var(--surface2); border: 1px solid var(--gold-dim); margin-bottom: 28px; text-align: center; border-radius: 12px; }
    #authorize-section.visible { display: flex; }
    .authorize-title { font-family: 'Playfair Display', serif; font-size: 26px; color: var(--gold); margin-bottom: 14px; font-style: italic; }
    .authorize-desc { font-size: 13px; font-weight: 100; color: var(--white-dim); max-width: 460px; margin-bottom: 44px; line-height: 2; }
    .authorize-btn { background: linear-gradient(135deg, var(--gold), var(--gold-light)); color: var(--black); border: none; padding: 20px 68px; font-family: 'Noto Sans JP', sans-serif; font-weight: 400; font-size: 13px; letter-spacing: 0.2em; cursor: pointer; transition: all 0.3s; text-transform: uppercase; border-radius: 40px; }
    .authorize-btn:hover { box-shadow: 0 0 60px rgba(201,168,76,0.4), 0 20px 40px rgba(0,0,0,0.5); transform: translateY(-2px); }
    .webauthn-hint { margin-top: 20px; font-size: 10px; letter-spacing: 0.2em; color: rgba(255,255,255,0.3); text-transform: uppercase; }

    /* TX FEED */
    #tx-feed { display: none; background: var(--surface2); border: 1px solid var(--border); padding: 22px; margin-bottom: 28px; border-radius: 8px; }
    #tx-feed.visible { display: block; }
    .tx-item { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,0.04); animation: tx-slide 0.4s ease; }
    @keyframes tx-slide { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:none} }
    .tx-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--gold); flex-shrink: 0; }
    .tx-hash { font-family: monospace; font-size: 11px; color: var(--gold); word-break: break-all; }
    .tx-detail { font-size: 11px; font-weight: 100; color: var(--white-dim); }

    /* BOOKING COMPLETE */
    #booking-complete { display: none; flex-direction: column; align-items: center; text-align: center; padding: 72px 40px; background: var(--surface2); border: 1px solid var(--gold-dim); margin-bottom: 28px; border-radius: 12px; }
    #booking-complete.visible { display: flex; }
    .complete-icon { font-size: 52px; margin-bottom: 24px; animation: pop 0.7s ease; }
    @keyframes pop { from{transform:scale(0);opacity:0} to{transform:scale(1);opacity:1} }
    .complete-title { font-family: 'Playfair Display', serif; font-size: 30px; color: var(--gold); margin-bottom: 14px; font-style: italic; }
    .complete-booking-id { font-size: 11px; letter-spacing: 0.3em; color: var(--white-dim); text-transform: uppercase; }
    .complete-id-value { font-family: monospace; font-size: 17px; color: var(--white); margin-bottom: 24px; }
    .complete-summary { font-size: 13px; font-weight: 100; color: var(--white-dim); max-width: 460px; line-height: 2; }

    /* LOADING */
    #loading-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); z-index: 500; align-items: center; justify-content: center; flex-direction: column; gap: 22px; }
    #loading-overlay.active { display: flex; }
    .spinner { width: 40px; height: 40px; border: 1px solid var(--border); border-top-color: var(--gold); border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to{transform:rotate(360deg)} }
    .loading-text { font-size: 12px; font-weight: 100; color: var(--gold); letter-spacing: 0.25em; text-transform: uppercase; }

    /* TOAST */
    #toast { position: fixed; bottom: 36px; left: 50%; transform: translateX(-50%) translateY(80px); background: var(--surface3); border: 1px solid var(--gold-dim); color: var(--white); padding: 12px 26px; font-size: 13px; font-weight: 200; transition: transform 0.4s; z-index: 1000; white-space: nowrap; border-radius: 24px; }
    #toast.show { transform: translateX(-50%) translateY(0); }

    /* MOCK BADGE */
    .mock-badge { font-size: 9px; background: rgba(255,100,0,0.12); border: 1px solid rgba(255,100,0,0.25); color: rgba(255,150,0,0.7); padding: 1px 7px; letter-spacing: 0.15em; text-transform: uppercase; margin-left: 7px; border-radius: 8px; }

    ::-webkit-scrollbar { width: 3px; }
    ::-webkit-scrollbar-track { background: var(--black); }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
  </style>
</head>
<body>
<div id="app">

  <header>
    <div class="logo">
      <span class="logo-text">Flattora</span>
      <span class="logo-sub">by ズック</span>
    </div>
    <div class="header-right">
      <div class="wallet-status">
        <div class="wallet-dot" id="wallet-dot"></div>
        <span id="wallet-label">接続待機中</span>
      </div>
      <button class="btn btn-gold" onclick="connectWallet()" id="connect-btn">Connect Wallet</button>
    </div>
  </header>

  <!-- ZUKKU ORB VOICE SECTION -->
  <section id="voice-section">
    <div class="orb-stage" id="orb-stage" onclick="toggleListening()">
      <!-- Halo rings -->
      <div class="orb-halo"></div>
      <div class="orb-halo"></div>
      <div class="orb-halo"></div>

      <!-- R2D2-style round orb SVG -->
      <svg id="zukku-orb" viewBox="0 0 190 190" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <!-- Main sphere gradient -->
          <radialGradient id="sphereGrad" cx="38%" cy="32%" r="65%">
            <stop offset="0%"   stop-color="#3a3a3a"/>
            <stop offset="40%"  stop-color="#1a1a1a"/>
            <stop offset="100%" stop-color="#080808"/>
          </radialGradient>
          <!-- Gold dome gradient -->
          <radialGradient id="domeGrad" cx="40%" cy="30%" r="65%">
            <stop offset="0%"   stop-color="#E8C96A"/>
            <stop offset="50%"  stop-color="#C9A84C"/>
            <stop offset="100%" stop-color="#8a6a1a"/>
          </radialGradient>
          <!-- Belly glow gradient -->
          <radialGradient id="bellyGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.9"/>
            <stop offset="40%"  stop-color="#4CAF50"/>
            <stop offset="100%" stop-color="#1a5a1a"/>
          </radialGradient>
          <!-- Gold ring accent -->
          <radialGradient id="goldRingGrad" cx="50%" cy="30%" r="70%">
            <stop offset="0%"   stop-color="#E8C96A"/>
            <stop offset="100%" stop-color="#7a5a10"/>
          </radialGradient>
          <!-- Eye glow -->
          <radialGradient id="eyeGrad" cx="40%" cy="35%" r="60%">
            <stop offset="0%"   stop-color="#ffffff"/>
            <stop offset="35%"  stop-color="#bbddf8"/>
            <stop offset="100%" stop-color="#0a3060"/>
          </radialGradient>
          <radialGradient id="eyeGoldGrad" cx="40%" cy="35%" r="60%">
            <stop offset="0%"   stop-color="#ffffff"/>
            <stop offset="40%"  stop-color="#E8C96A"/>
            <stop offset="100%" stop-color="#7a5000"/>
          </radialGradient>
          <!-- Shine -->
          <radialGradient id="shineGrad" cx="35%" cy="25%" r="55%">
            <stop offset="0%"   stop-color="rgba(255,255,255,0.25)"/>
            <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
          </radialGradient>
          <!-- Shadow -->
          <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="rgba(0,0,0,0.7)"/>
          </filter>
        </defs>

        <!-- === BODY SPHERE === -->
        <circle cx="95" cy="105" r="72" fill="url(#sphereGrad)" filter="url(#dropShadow)"/>

        <!-- Body panel lines (R2D2 detail) -->
        <path d="M 40 105 Q 95 98 150 105" stroke="rgba(201,168,76,0.18)" stroke-width="1" fill="none"/>
        <path d="M 38 118 Q 95 113 152 118" stroke="rgba(201,168,76,0.12)" stroke-width="0.8" fill="none"/>
        <path d="M 42 91  Q 95 84  148 91"  stroke="rgba(201,168,76,0.12)" stroke-width="0.8" fill="none"/>

        <!-- Body accent blocks (R2D2 side panels) -->
        <rect x="30" y="96" width="12" height="20" rx="3" fill="#1e1e1e" stroke="rgba(201,168,76,0.3)" stroke-width="0.8"/>
        <rect x="148" y="96" width="12" height="20" rx="3" fill="#1e1e1e" stroke="rgba(201,168,76,0.3)" stroke-width="0.8"/>

        <!-- Gold horizontal band (equator) -->
        <path d="M 25 108 Q 95 102 165 108 Q 165 116 95 116 Q 25 116 25 108 Z" fill="rgba(201,168,76,0.14)" stroke="rgba(201,168,76,0.35)" stroke-width="0.8"/>

        <!-- === CENTER EYE / CAMERA LENS (main feature) === -->
        <!-- Outer ring -->
        <circle cx="95" cy="105" r="26" fill="#0a0a0a" stroke="url(#goldRingGrad)" stroke-width="2.5"/>
        <!-- Inner lens ring -->
        <circle cx="95" cy="105" r="21" fill="#050505" stroke="rgba(201,168,76,0.25)" stroke-width="1"/>
        <!-- Lens itself -->
        <circle id="main-eye" cx="95" cy="105" r="16" fill="url(#eyeGrad)"/>
        <!-- Pupil -->
        <circle id="main-pupil" cx="95" cy="105" r="8" fill="#0a1020"/>
        <!-- Lens flare -->
        <circle cx="90" cy="100" r="4" fill="rgba(255,255,255,0.35)"/>
        <circle cx="87" cy="99"  r="2" fill="rgba(255,255,255,0.55)"/>
        <!-- Lens segments (R2D2 camera detail) -->
        <circle cx="95" cy="105" r="16" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1" stroke-dasharray="4 4"/>

        <!-- Side utility lights (R2D2 small lights) -->
        <circle id="light-l" cx="57" cy="105" r="5" fill="#1a1a1a" stroke="rgba(201,168,76,0.4)" stroke-width="1"/>
        <circle cx="57" cy="105" r="3" fill="#333"/>
        <circle id="light-r" cx="133" cy="105" r="5" fill="#1a1a1a" stroke="rgba(201,168,76,0.4)" stroke-width="1"/>
        <circle cx="133" cy="105" r="3" fill="#333"/>

        <!-- Speaker grille (bottom of body) -->
        <rect x="78" y="133" width="34" height="3" rx="1.5" fill="none" stroke="rgba(201,168,76,0.2)" stroke-width="1"/>
        <rect x="82" y="138" width="26" height="2" rx="1"   fill="none" stroke="rgba(201,168,76,0.15)" stroke-width="1"/>

        <!-- === BELLY BUTTON === -->
        <circle cx="95" cy="152" r="13" fill="#111" stroke="rgba(201,168,76,0.4)" stroke-width="1.5"/>
        <circle id="belly-glow" cx="95" cy="152" r="10" fill="url(#bellyGrad)" opacity="0.9"/>
        <circle cx="95" cy="152" r="6"  fill="rgba(255,255,255,0.15)"/>
        <circle cx="93" cy="150" r="2.5" fill="rgba(255,255,255,0.4)"/>

        <!-- === DOME HEAD (top) === -->
        <!-- Dome base ring -->
        <ellipse cx="95" cy="40" rx="52" ry="10" fill="#0a0a0a" stroke="rgba(201,168,76,0.3)" stroke-width="1"/>
        <!-- Dome sphere -->
        <ellipse cx="95" cy="36" rx="48" ry="36" fill="url(#domeGrad)"/>
        <!-- Dome panel line -->
        <path d="M 55 36 Q 95 30 135 36" stroke="rgba(0,0,0,0.3)" stroke-width="1" fill="none"/>
        <!-- Dome top light -->
        <circle id="dome-top-light" cx="95" cy="14" r="6" fill="#1a1a1a" stroke="rgba(201,168,76,0.5)" stroke-width="1.2"/>
        <circle cx="95" cy="14" r="4" fill="#333"/>
        <!-- Dome side lights -->
        <circle id="dome-light-l" cx="60" cy="30" r="4.5" fill="#1a1a1a" stroke="rgba(100,180,255,0.5)" stroke-width="1"/>
        <circle cx="60" cy="30" r="2.5" fill="#1a4a8a"/>
        <circle id="dome-light-r" cx="130" cy="30" r="4.5" fill="#1a1a1a" stroke="rgba(100,180,255,0.5)" stroke-width="1"/>
        <circle cx="130" cy="30" r="2.5" fill="#1a4a8a"/>
        <!-- Dome shine -->
        <ellipse cx="82" cy="22" rx="18" ry="10" fill="rgba(255,255,255,0.12)" transform="rotate(-15,82,22)"/>

        <!-- === OVERALL SPHERE SHINE === -->
        <ellipse cx="75" cy="78" rx="28" ry="20" fill="url(#shineGrad)" transform="rotate(-20,75,78)"/>
      </svg>

      <!-- Name badge -->
      <div class="orb-label">ズック</div>
    </div>

    <!-- WAVEFORM -->
    <div class="waveform-container" id="waveform">
      ${Array.from({ length: 18 }, (_, i) => `<div class="wave-bar" id="bar-${i}" style="--max-h:${12 + Math.random() * 32}px"></div>`).join('')}
    </div>

    <!-- TRANSCRIPT -->
    <div class="transcript-area">
      <div class="transcript-user" id="user-transcript"></div>
      <div class="transcript-agent" id="agent-transcript">
        <span id="agent-text">ホホウ、いらっしゃいませ。わたくしズックと申します。どちらへのご旅行をお考えでしょうか。</span>
      </div>
    </div>

    <!-- CONTROLS -->
    <div class="voice-controls">
      <button class="mic-btn" id="mic-btn" onclick="toggleListening()" title="マイクをオン/オフ">🎙</button>
      <div class="quick-actions">
        <button class="quick-action-btn" onclick="sendQuickAction('日本の秘境の温泉宿を探してください')">🏔 秘境温泉</button>
        <button class="quick-action-btn" onclick="sendQuickAction('古民家の一棟貸しを見せて')">🏠 古民家</button>
        <button class="quick-action-btn" onclick="sendQuickAction('離島の隠れ宿を2泊で予約したい')">🏝 離島</button>
        <button class="quick-action-btn" onclick="openAgentRules()">⚙ ルール設定</button>
      </div>
    </div>
  </section>

  <!-- CHAT HISTORY -->
  <div id="chat-history"></div>

  <!-- MAIN CONTENT -->
  <main id="main-content">
    <div id="status-bar"><div class="status-dot"></div><span id="status-text">ズックが稼働中です</span></div>

    <!-- WALLET -->
    <div id="wallet-panel">
      <div class="panel-title">◈ ウォレット接続済み <span class="mock-badge">Demo</span></div>
      <div class="wallet-info">
        <div><div class="balance-label">ETH</div><div class="balance-value" id="bal-eth">—</div></div>
        <div><div class="balance-label">USDC</div><div class="balance-value" id="bal-usdc">—</div></div>
        <div><div class="balance-label">USDT</div><div class="balance-value" id="bal-usdt">—</div></div>
      </div>
      <div style="font-size:11px;color:var(--white-dim)">アドレス: <span id="wallet-address" style="font-family:monospace;color:var(--gold)">—</span></div>
    </div>

    <!-- AGENT RULES -->
    <div id="agent-rules-panel">
      <div class="panel-title">◈ エージェント自律ルール設定 <span class="mock-badge">Kite Rules</span></div>
      <div class="rules-grid">
        <div><div class="rule-label">自動決済上限 (USD)</div><input class="rule-input" type="number" id="rule-max-spend" value="50"></div>
        <div><div class="rule-label">要承認しきい値 (USD)</div><input class="rule-input" type="number" id="rule-require-approval" value="20"></div>
        <div><div class="rule-label">優先スタイル</div><input class="rule-input" type="text" id="rule-style" value="秘境, 温泉, 古民家, 一棟貸し"></div>
        <div><div class="rule-label">除外カテゴリ</div><input class="rule-input" type="text" id="rule-blacklist" value="チェーンホテル, 大型リゾート"></div>
        <div>
          <div class="rule-label">自動予約</div>
          <div style="display:flex;align-items:center;gap:10px;margin-top:6px">
            <label class="toggle"><input type="checkbox" id="rule-auto-book" checked><span class="toggle-slider"></span></label>
            <span style="font-size:12px;color:var(--white-dim)">承認後ズックが自動手配</span>
          </div>
        </div>
        <div>
          <div class="rule-label">購入通知</div>
          <div style="display:flex;align-items:center;gap:10px;margin-top:6px">
            <label class="toggle"><input type="checkbox" id="rule-notify" checked><span class="toggle-slider"></span></label>
            <span style="font-size:12px;color:var(--white-dim)">決済時に通知</span>
          </div>
        </div>
      </div>
      <div style="margin-top:20px;display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-outline" onclick="document.getElementById('agent-rules-panel').style.display='none'">閉じる</button>
        <button class="btn btn-gold" onclick="saveAgentRules()">保存</button>
      </div>
    </div>

    <!-- SEARCH RESULTS -->
    <div id="search-results">
      <div class="results-header">
        <div class="panel-title">◈ ズックが厳選したお宿</div>
        <div style="font-size:11px;color:var(--white-dim)">現地主人と調整済み</div>
      </div>
      <div class="ryokan-grid" id="ryokan-grid"></div>
    </div>

    <!-- AUTO SUGGEST -->
    <div id="auto-suggest-panel">
      <div class="panel-title">◈ ズックからの自動提案 <span class="auto-badge">AUTO</span></div>
      <div id="auto-suggest-content"></div>
    </div>

    <!-- AUTHORIZE -->
    <div id="authorize-section">
      <div class="authorize-title">承認のご準備をお願いします</div>
      <div class="authorize-desc">あなたのウォレットの権限を確認いたしました。<br>ご承認をいただければ、このまま予約を完了させます。<br>以降の操作はすべてズックが代行いたします。</div>
      <button class="authorize-btn" id="authorize-btn" onclick="authorizePayment()">✦ Authorize &amp; Sign</button>
      <div class="webauthn-hint">🔐 Protected by WebAuthn Passkey</div>
    </div>

    <!-- TX FEED -->
    <div id="tx-feed">
      <div class="panel-title">◈ トランザクション</div>
      <div id="tx-list"></div>
    </div>

    <!-- BOOKING COMPLETE -->
    <div id="booking-complete">
      <div class="complete-icon">✦</div>
      <div class="complete-title">ご予約が完了しました</div>
      <div class="complete-booking-id">確認番号</div>
      <div class="complete-id-value" id="booking-id-display">—</div>
      <div class="complete-summary" id="booking-summary">ズックがすべての手配を完了いたしました。</div>
    </div>
  </main>

  <div id="loading-overlay"><div class="spinner"></div><div class="loading-text" id="loading-text">処理中...</div></div>
  <div id="toast"></div>
</div>

<script>
// ===== TTS TEXT PREPROCESSING =====
// 「ZUKKU」という文字が読み上げテキストに含まれる場合、必ず「ズック」に変換する
// これによりTTSが「ゼットケーケーユー」と読むのを防ぐ
function preprocessTTS(text) {
  return text
    .replace(/ZUKKU/gi, 'ズック')
    .replace(/ずっく/g, 'ズック')
}

// ===== STATE =====
const state = {
  listening: false, speaking: false,
  walletConnected: false, walletSession: null,
  selectedRyokan: null, autoItems: [], nights: 2, guests: 2,
  recognition: null, synthesis: window.speechSynthesis,
  chatHistory: [], maxHistory: 12,
  orbState: 'idle',
}

// ===== ORB STATE CONTROL =====
function setOrbState(s) {
  state.orbState = s
  const stage = document.getElementById('orb-stage')
  stage.className = 'orb-stage ' + s

  const eye      = document.getElementById('main-eye')
  const pupil    = document.getElementById('main-pupil')
  const belly    = document.getElementById('belly-glow')
  const lightL   = document.getElementById('light-l')
  const lightR   = document.getElementById('light-r')
  const domeTop  = document.getElementById('dome-top-light')
  const domeLL   = document.getElementById('dome-light-l')
  const domeLR   = document.getElementById('dome-light-r')

  if (s === 'listening') {
    eye.setAttribute('fill', 'url(#eyeGoldGrad)')
    pupil.setAttribute('r', '6')
    belly.setAttribute('fill', '#C9A84C')
    lightL.setAttribute('fill', 'rgba(201,168,76,0.5)')
    lightR.setAttribute('fill', 'rgba(201,168,76,0.5)')
    domeTop.setAttribute('fill', 'rgba(201,168,76,0.4)')
    startWaveAnimation()
  } else if (s === 'speaking') {
    eye.setAttribute('fill', 'url(#eyeGoldGrad)')
    pupil.setAttribute('r', '9')
    belly.setAttribute('fill', '#E8C96A')
    lightL.setAttribute('fill', 'rgba(201,168,76,0.8)')
    lightR.setAttribute('fill', 'rgba(201,168,76,0.8)')
    domeTop.setAttribute('fill', 'rgba(201,168,76,0.7)')
    domeLL.setAttribute('fill', 'rgba(201,168,76,0.5)')
    domeLR.setAttribute('fill', 'rgba(201,168,76,0.5)')
  } else if (s === 'thinking') {
    eye.setAttribute('fill', 'url(#eyeGrad)')
    pupil.setAttribute('r', '8')
    belly.setAttribute('fill', '#888')
    lightL.setAttribute('fill', '#333')
    lightR.setAttribute('fill', '#333')
    domeTop.setAttribute('fill', '#222')
  } else {
    // idle / ready
    eye.setAttribute('fill', 'url(#eyeGrad)')
    pupil.setAttribute('r', '8')
    belly.setAttribute('fill', 'url(#bellyGrad)')
    lightL.setAttribute('fill', '#1a1a1a')
    lightR.setAttribute('fill', '#1a1a1a')
    domeTop.setAttribute('fill', '#1a1a1a')
    domeLL.setAttribute('fill', '#1a1a1a')
    domeLR.setAttribute('fill', '#1a1a1a')
    stopWaveAnimation()
  }
}

// ===== TTS =====
function speak(text, onEnd) {
  if (!state.synthesis) return onEnd && onEnd()
  state.synthesis.cancel()

  // 「ズック」固定読み → TTSテキストを前処理
  const ttsText = preprocessTTS(text)

  const utter = new SpeechSynthesisUtterance(ttsText)
  utter.lang = 'ja-JP'
  utter.rate = 0.87
  utter.pitch = 1.05
  utter.volume = 1.0

  // 日本語音声を選択
  const loadVoice = () => {
    const voices = state.synthesis.getVoices()
    const jaVoice = voices.find(v => v.lang === 'ja-JP' && v.name.includes('Google'))
      || voices.find(v => v.lang === 'ja-JP')
      || voices.find(v => v.lang.startsWith('ja'))
    if (jaVoice) utter.voice = jaVoice
  }
  loadVoice()
  if (!utter.voice && state.synthesis.getVoices().length === 0) {
    state.synthesis.onvoiceschanged = () => { loadVoice(); state.synthesis.onvoiceschanged = null }
  }

  setOrbState('speaking')
  state.speaking = true
  setAgentText(text) // UIには元のテキストを表示
  utter.onend = utter.onerror = () => {
    state.speaking = false
    setOrbState('idle')
    onEnd && onEnd()
  }
  state.synthesis.speak(utter)
}

// ===== STT =====
function initRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) return null
  const rec = new SR()
  rec.lang = 'ja-JP'; rec.continuous = false; rec.interimResults = true
  rec.onresult = (e) => {
    let interim = '', final = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript
      if (e.results[i].isFinal) final += t; else interim += t
    }
    document.getElementById('user-transcript').textContent = '「 ' + (final || interim) + ' 」'
    if (final) { stopListening(); sendToZukku(final.trim()) }
  }
  rec.onstart = () => { setOrbState('listening'); startWaveAnimation() }
  rec.onend = () => {
    if (state.listening) {
      setOrbState('idle'); stopWaveAnimation()
      state.listening = false
      document.getElementById('mic-btn').classList.remove('active')
    }
  }
  rec.onerror = () => { state.listening = false; setOrbState('idle'); stopWaveAnimation() }
  return rec
}

function toggleListening() {
  if (state.speaking) state.synthesis.cancel()
  state.listening ? stopListening() : startListening()
}
function startListening() {
  if (!state.recognition) state.recognition = initRecognition()
  if (!state.recognition) { showToast('音声入力はChromeをお使いください'); return }
  state.listening = true
  document.getElementById('mic-btn').classList.add('active')
  document.getElementById('user-transcript').textContent = ''
  try { state.recognition.start() } catch(e) {}
}
function stopListening() {
  state.listening = false
  document.getElementById('mic-btn').classList.remove('active')
  stopWaveAnimation()
  if (state.recognition) try { state.recognition.stop() } catch(e) {}
  setOrbState('idle')
}

function sendQuickAction(text) {
  document.getElementById('user-transcript').textContent = '「 ' + text + ' 」'
  sendToZukku(text)
}

// ===== CORE: Send to ZUKKU AI =====
async function sendToZukku(message) {
  if (!message.trim()) return
  setOrbState('thinking')
  state.chatHistory.push({ role: 'user', content: message })
  if (state.chatHistory.length > state.maxHistory) state.chatHistory = state.chatHistory.slice(-state.maxHistory)
  addChatMsg('user', message)

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: state.chatHistory.slice(0, -1) })
    })
    const data = await res.json()
    if (data.success) {
      const reply = data.reply || 'ホホウ、少々お待ちください。'
      state.chatHistory.push({ role: 'assistant', content: reply })
      if (state.chatHistory.length > state.maxHistory) state.chatHistory = state.chatHistory.slice(-state.maxHistory)
      addChatMsg('agent', reply)
      if (data.action) speak(reply, () => handleAction(data.action))
      else speak(reply)
    }
  } catch(e) {
    const fb = localFallback(message)
    state.chatHistory.push({ role: 'assistant', content: fb.text })
    addChatMsg('agent', fb.text)
    if (fb.action) speak(fb.text, () => handleAction(fb.action))
    else speak(fb.text)
  }
}

// ===== ACTION HANDLER =====
function handleAction(action) {
  switch(action) {
    case 'search_ryokan': searchRyokan(); break
    case 'connect_wallet': connectWallet(); break
    case 'show_authorize': showAuthorizeSection(); break
    case 'open_rules': openAgentRules(); break
  }
}

// ===== LOCAL FALLBACK =====
function localFallback(msg) {
  const m = msg.toLowerCase()
  if (m.includes('宿') || m.includes('温泉') || m.includes('旅') || m.includes('泊') || m.includes('秘境') || m.includes('探'))
    return { text: 'ホホウ！わたくしズックが全力でお調べいたします。現地の主人方と直接調整した、とっておきのお宿をご覧ください。', action: 'search_ryokan' }
  if (m.includes('ウォレット') || m.includes('接続'))
    return { text: 'おなかのボタンがピカッと光りました。ウォレットの接続を開始いたします！', action: 'connect_wallet' }
  if (m.includes('予約') || m.includes('承認'))
    return { text: 'かしこまりました。承認をいただければ、ズックがすべて手配いたします。', action: 'show_authorize' }
  if (m.includes('ルール') || m.includes('設定'))
    return { text: 'エージェントルールの設定を開きます。', action: 'open_rules' }
  return { text: 'ふむふむ、なるほどでございます。どんなご旅行をご希望でしょうか？', action: null }
}

// ===== CHAT HISTORY UI =====
function addChatMsg(role, text) {
  const hist = document.getElementById('chat-history')
  hist.classList.add('visible')
  const div = document.createElement('div')
  div.className = 'chat-msg chat-msg-' + role
  if (role === 'agent') {
    div.innerHTML = '<div class="chat-msg-agent"><span class="chat-msg-agent-icon">🤖</span><span>' + text + '</span></div>'
  } else {
    div.innerHTML = '<span>' + text + '</span>'
  }
  hist.appendChild(div)
  hist.scrollTop = hist.scrollHeight
}

// ===== WALLET =====
async function connectWallet() {
  if (state.walletConnected) { showToast('すでに接続済みです'); return }
  speak('ウォレットへの接続を開始いたします。少々お待ちください。', async () => {
    showLoading('ウォレットと同期中...')
    const timer = setTimeout(() => { hideLoading(); mockWalletConnect() }, 10000)
    try {
      const res = await fetch('/api/wallet/connect', { method: 'POST' })
      clearTimeout(timer); hideLoading()
      onWalletConnected(await res.json())
    } catch(e) { clearTimeout(timer); hideLoading(); mockWalletConnect() }
  })
}
function mockWalletConnect() {
  onWalletConnected({
    success: true,
    sessionId: 'mock_' + Date.now(),
    walletAddress: '0x' + Math.random().toString(16).substr(2, 40),
    balance: { ETH: '2.847', USDC: '4250.00', USDT: '1800.00' }
  })
}
function onWalletConnected(data) {
  state.walletConnected = true; state.walletSession = data
  document.getElementById('wallet-dot').classList.add('connected')
  document.getElementById('wallet-label').textContent = '接続済み'
  document.getElementById('connect-btn').textContent = '接続済 ✓'
  document.getElementById('connect-btn').disabled = true
  document.getElementById('connect-btn').style.opacity = '0.7'
  document.getElementById('bal-eth').textContent = data.balance.ETH
  document.getElementById('bal-usdc').textContent = data.balance.USDC
  document.getElementById('bal-usdt').textContent = data.balance.USDT
  document.getElementById('wallet-address').textContent = data.walletAddress.substring(0, 8) + '...' + data.walletAddress.substring(36)
  document.getElementById('wallet-panel').classList.add('visible')
  document.getElementById('status-bar').style.display = 'flex'
  speak('ウォレットとの接続が完了いたしました。おなかのボタンがゴールドに輝きました。旅の手配はいつでもお任せください。')
  showToast('ウォレット接続完了')
}

// ===== SEARCH =====
async function searchRyokan() {
  setOrbState('thinking')
  speak('現地の主人と調整しております。しばらくお待ちください…', async () => {
    setOrbState('thinking')
    showStatus('秘境の宿を探索中...')
    try {
      const res = await fetch('/api/search', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ nights: state.nights, guests: state.guests })
      })
      const data = await res.json()
      renderRyokanResults(data.results)
      setOrbState('idle')
      speak('ホホウ！' + data.results.length + '件の素晴らしいお宿をご提案いたします。')
    } catch(e) { setOrbState('idle'); speak('少々接続が不安定なようです。') }
  })
}

function renderRyokanResults(results) {
  document.getElementById('ryokan-grid').innerHTML = results.map(r => \`
    <div class="ryokan-card" id="card-\${r.id}" onclick="selectRyokan('\${r.id}')">
      <img class="ryokan-card-img" src="\${r.image}" alt="\${r.name}" loading="lazy">
      <div class="ryokan-card-body">
        <div class="ryokan-type">\${r.type}</div>
        <div class="ryokan-name">\${r.name}</div>
        <div class="ryokan-location">📍 \${r.location}</div>
        <div class="ryokan-desc">\${r.description}</div>
        <div class="ryokan-features">\${r.features.map(f=>\`<span class="feature-tag">\${f}</span>\`).join('')}</div>
        <div class="ryokan-price">
          <div><span class="price-amount">¥\${r.pricePerNight.toLocaleString()}</span><span class="price-unit">/泊</span></div>
          <div class="ryokan-score">★ \${r.score}</div>
        </div>
      </div>
    </div>
  \`).join('')
  document.getElementById('search-results').classList.add('visible')
  document.getElementById('status-bar').style.display = 'flex'
  showStatus('ズックが現地主人と調整済みのお宿をご提案しました')
  setTimeout(() => document.getElementById('search-results').scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
}

async function selectRyokan(id) {
  document.querySelectorAll('.ryokan-card').forEach(c => {
    c.classList.remove('selected')
    c.style.opacity = c.id === 'card-' + id ? '1' : '0.5'
  })
  document.getElementById('card-' + id).classList.add('selected')
  state.selectedRyokan = { id }
  speak('こちらのお宿をお選びいただきありがとうございます。追加の体験もご提案いたします。', async () => {
    try {
      const res = await fetch('/api/auto-suggest', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ ryokanId: id, nights: state.nights })
      })
      renderAutoSuggest(await res.json())
    } catch(e) {}
  })
}

function renderAutoSuggest(data) {
  document.getElementById('auto-suggest-content').innerHTML = \`
    \${data.autoApproved?.length ? \`
      <div style="margin-bottom:16px">
        <div style="font-size:10px;letter-spacing:0.2em;color:var(--gold);text-transform:uppercase;margin-bottom:10px">自動手配済み（ルール内） <span class="auto-badge">AUTO</span></div>
        \${data.autoApproved.map(s=>\`<div class="suggest-item"><div><div class="suggest-item-name">\${s.name}</div><div style="font-size:10px;color:var(--gold);margin-top:2px">自動承認済み</div></div><div class="suggest-item-price">$\${s.priceUSD}</div></div>\`).join('')}
      </div>
    \` : ''}
    \${data.requiresApproval?.length ? \`
      <div>
        <div style="font-size:10px;letter-spacing:0.2em;color:var(--white-dim);text-transform:uppercase;margin-bottom:10px">承認が必要なオプション</div>
        \${data.requiresApproval.map(s=>\`<div class="suggest-item"><div><div class="suggest-item-name">\${s.name}</div><div style="font-size:10px;color:rgba(255,200,0,0.6);margin-top:2px">要承認（$\${s.priceUSD}）</div></div><div class="suggest-item-price">$\${s.priceUSD}</div></div>\`).join('')}
      </div>
    \` : ''}
  \`
  state.autoItems = [...(data.autoApproved || []), ...(data.requiresApproval || [])]
  document.getElementById('auto-suggest-panel').classList.add('visible')
  setTimeout(() => document.getElementById('auto-suggest-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
  setTimeout(() => {
    speak('ルールに従い、いくつかの体験を自動的に選定いたしました。ご承認をいただければ、このまま予約を完了させます。')
    setTimeout(() => showAuthorizeSection(), 3500)
  }, 600)
}

// ===== AUTHORIZE =====
function showAuthorizeSection() {
  if (!state.walletConnected) { speak('まずウォレットをご接続ください。'); connectWallet(); return }
  document.getElementById('authorize-section').classList.add('visible')
  setTimeout(() => document.getElementById('authorize-section').scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
  speak('あなたのウォレットの権限を確認いたしました。承認をいただければ、このまま予約を完了させます。')
}

async function authorizePayment() {
  const btn = document.getElementById('authorize-btn')
  btn.disabled = true; btn.textContent = '認証中...'
  let ok = false
  if (window.PublicKeyCredential) {
    try {
      const ch = new Uint8Array(32); crypto.getRandomValues(ch)
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: ch,
          rp: { name: 'Flattora', id: location.hostname },
          user: { id: new Uint8Array(16), name: 'traveler@flattora.ai', displayName: 'Traveler' },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
          timeout: 30000,
          authenticatorSelection: { userVerification: 'preferred' }
        }
      })
      ok = !!cred
    } catch(e) { ok = true }
  } else { ok = true }
  if (!ok) { btn.disabled = false; btn.textContent = '✦ Authorize & Sign'; return }

  btn.textContent = '決済処理中...'
  setOrbState('thinking')
  speak('承認を受け付けました。ただいま決済を処理しております。')
  showLoading('ブロックチェーン上で決済処理中...')
  try {
    const pr = await fetch('/api/payment/settle', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ sessionId: state.walletSession?.sessionId || 'demo', amount: 255, currency: 'USDC', description: '宿泊予約' })
    })
    const pd = await pr.json(); hideLoading(); addTxToFeed(pd)
    speak('決済が完了いたしました。予約を確定いたします。')
    await confirmBooking(pd.txHash)
  } catch(e) {
    hideLoading()
    const mt = { txHash: '0x' + Array.from({length:64},()=>Math.floor(Math.random()*16).toString(16)).join(''), amount:255, currency:'USDC', status:'confirmed' }
    addTxToFeed(mt); await confirmBooking(mt.txHash)
  }
}

async function confirmBooking(txHash) {
  showLoading('予約を確定中...')
  try {
    const r = await fetch('/api/booking/confirm', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ ryokanId: state.selectedRyokan?.id || 'r001', nights: state.nights, guests: state.guests, txHash, autoItems: state.autoItems })
    })
    const d = await r.json(); hideLoading(); showBookingComplete(d)
  } catch(e) {
    hideLoading()
    showBookingComplete({ bookingId: 'FLT-' + Date.now().toString(36).toUpperCase(), agentSummary: 'ズックがすべての手配を完了いたしました。素晴らしい旅になりますよう、心よりお祈り申し上げます。' })
  }
}

function addTxToFeed(tx) {
  document.getElementById('tx-feed').classList.add('visible')
  const item = document.createElement('div'); item.className = 'tx-item'
  item.innerHTML = \`<div class="tx-dot"></div><div><div class="tx-hash">\${tx.txHash ? tx.txHash.substring(0,22)+'...' : '—'}</div><div class="tx-detail">\${tx.amount} \${tx.currency} · \${tx.status || 'confirmed'} · \${new Date().toLocaleTimeString('ja-JP')}</div></div>\`
  document.getElementById('tx-list').appendChild(item)
  setTimeout(() => document.getElementById('tx-feed').scrollIntoView({ behavior: 'smooth', block: 'start' }), 200)
}

function showBookingComplete(data) {
  document.getElementById('booking-id-display').textContent = data.bookingId || '—'
  document.getElementById('booking-summary').textContent = data.agentSummary || 'ズックがすべての手配を完了いたしました。'
  document.getElementById('booking-complete').classList.add('visible')
  setTimeout(() => document.getElementById('booking-complete').scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
  speak('ご予約が完了いたしました。確認番号は' + (data.bookingId || '') + 'でございます。ズックより、素晴らしい旅になりますよう心よりお祈り申し上げます。')
  setOrbState('idle')
  showStatus('予約完了 — ズックが自律的にすべての手配を完了しました')
}

// ===== AGENT RULES =====
function openAgentRules() {
  const p = document.getElementById('agent-rules-panel')
  p.style.display = p.style.display === 'none' || !p.style.display ? 'block' : 'none'
  if (p.style.display === 'block') setTimeout(() => p.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
}
async function saveAgentRules() {
  const rules = {
    maxAutoSpendUSD: parseFloat(document.getElementById('rule-max-spend').value),
    requireApprovalAbove: parseFloat(document.getElementById('rule-require-approval').value),
    autoBook: document.getElementById('rule-auto-book').checked,
    notifyOnPurchase: document.getElementById('rule-notify').checked
  }
  try { await fetch('/api/agent-rules', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(rules) }) } catch(e) {}
  document.getElementById('agent-rules-panel').style.display = 'none'
  showToast('ルールを保存しました')
  speak('エージェントルールを更新いたしました。新しいルールに従い動作いたします。')
}

// ===== WAVEFORM =====
function startWaveAnimation() {
  document.querySelectorAll('.wave-bar').forEach((b) => {
    b.classList.add('active')
    b.style.setProperty('--max-h', (10 + Math.random()*34)+'px')
  })
}
function stopWaveAnimation() {
  document.querySelectorAll('.wave-bar').forEach(b => {
    b.classList.remove('active')
    b.style.height = '4px'
  })
}

// ===== AGENT TEXT (typewriter) =====
function setAgentText(text) {
  const el = document.getElementById('agent-text')
  el.textContent = ''
  let i = 0
  const cur = document.createElement('span'); cur.className = 'typing-cursor'; el.appendChild(cur)
  const iv = setInterval(() => {
    if (i < text.length) { el.insertBefore(document.createTextNode(text[i]), cur); i++ }
    else { clearInterval(iv); setTimeout(() => cur.remove(), 800) }
  }, 26)
}

// ===== UTILS =====
function showStatus(msg) {
  document.getElementById('status-bar').style.display = 'flex'
  document.getElementById('status-text').textContent = msg
}
function showLoading(msg) {
  document.getElementById('loading-text').textContent = msg
  document.getElementById('loading-overlay').classList.add('active')
}
function hideLoading() { document.getElementById('loading-overlay').classList.remove('active') }
function showToast(msg, d=3000) {
  const t = document.getElementById('toast')
  t.textContent = msg; t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), d)
}

// ===== INIT =====
window.addEventListener('load', () => {
  // 音声リスト読み込み（Chrome対応）
  if (state.synthesis.getVoices().length === 0) {
    state.synthesis.onvoiceschanged = () => { state.synthesis.onvoiceschanged = null }
  }
  state.recognition = initRecognition()
  // 初回挨拶（「ズック」と読む）
  setTimeout(() => speak('ホホウ、いらっしゃいませ。わたくしズックと申します。どちらへのご旅行をお考えでしょうか。'), 1200)
})
</script>
</body>
</html>`
  return c.html(html)
})

export default app
