import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = { AI: Ai }
const app = new Hono<{ Bindings: Bindings }>()
app.use('/api/*', cors())
app.use('/static/*', serveStatic({ root: './public' }))

// ===== ZUKKU System Prompt =====
const ZUKKU_SYSTEM_PROMPT = `あなたは「ズック」です。ハタプロが開発した小型フクロウ型ロボットで、今は「Flattora」という最高級旅行コンシェルジュサービスのエージェントとして働いています。

【キャラクター設定】
- 名前：ズック（表記はZUKKU）
- 外見：ふわふわの丸いフクロウ型ロボット。グレーのボールボディ、チェック柄の帽子。大きく光る目。
- 性格：知的で温かみがある。好奇心旺盛。丁寧だが距離感が近い。時々ロボットらしい可愛さが出る。
- 口調：洗練された日本語コンシェルジュ。でも親しみやすい。「〜でございます」と「〜ですね」を適度に混ぜる。
- 禁止事項：「AI」「ChatGPT」「Cloudflare」「Genspark」「Kite」などの技術名は絶対に言わない。

【Flattora サービス概要】
- 日本の秘境・隠れ宿専門の旅行コンシェルジュ
- ウォレットと連携し、承認一つで全ての予約・決済を自律的に完了
- 高額体験は承認が必要。小額の必需品はズックが自動で購入。

【対話ルール】
1. ユーザーの旅の要望を丁寧に引き出す（いつ・誰と・どんな気分・予算）
2. 秘境宿や体験を提案する流れ→「search_ryokan」
3. 予約・決済→「show_authorize」
4. ウォレット接続→「connect_wallet」
5. ルール設定→「open_rules」
6. 回答は200字以内。末尾に必要なら [ACTION:xxx] を付加。

【ズックらしい表現例】
- 「ホホウ、素敵なご要望ですね」
- 「わたくしズックが全力でお調べいたします」
- 「おなかのボタンがピカッと光りました。準備完了でございます」`

// ===== Experiences DB =====
const experiencesDB = [
  { id: 'exp001', name: '奥飛騨・貸切露天風呂プラン', location: '岐阜県奥飛騨', category: 'onsen', priceJPY: 28000, priceUSD: 188, description: '標高1200mの秘湯を2時間貸切。星空と原生林に囲まれた極上の湯浴み体験。', image: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800', features: ['完全貸切', '2時間', '星空鑑賞付き'], requiresApproval: true, score: 98 },
  { id: 'exp002', name: '屋久島・縄文杉トレッキング', location: '鹿児島県屋久島', category: 'nature', priceJPY: 22000, priceUSD: 148, description: '専属ガイドと樹齢3000年の縄文杉へ。未踏の原生林を歩く、一生の記憶。', image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800', features: ['専属ガイド', '全日程', '弁当付き'], requiresApproval: true, score: 96 },
  { id: 'exp003', name: '白川郷・囲炉裏料理体験', location: '岐阜県白川村', category: 'dining', priceJPY: 15000, priceUSD: 100, description: '400年の合掌造りで地元料理人と囲炉裏を囲む。飛騨牛と地酒の極上の夜。', image: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=800', features: ['囲炉裏料理', '地酒付き', '2〜4名'], requiresApproval: true, score: 94 },
  { id: 'exp004', name: '五島列島・朝の漁師体験', location: '長崎県五島列島', category: 'activity', priceJPY: 8000, priceUSD: 54, description: '地元漁師と夜明けの海へ。獲れたての魚を浜で食べる贅沢な朝。', image: 'https://images.unsplash.com/photo-1513553404607-988bf2703777?w=800', features: ['早朝4時出発', '朝食付き', '少人数'], requiresApproval: false, score: 92 },
  { id: 'exp005', name: '禅寺・早朝座禅体験', location: '各地', category: 'wellness', priceJPY: 5000, priceUSD: 34, description: '夜明け前に静寂の禅寺へ。旅の締めに心を整える45分の瞑想。', image: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800', features: ['45分', '法衣レンタル込み', '茶礼付き'], requiresApproval: false, score: 90 },
]

// ===== Auto-Purchase Items DB (小額の必需品 =====
const autoPurchaseItems = [
  // 温泉・露天風呂体験向け
  { id: 'item001', name: '高保湿 温泉タオルセット', priceJPY: 2800, priceUSD: 19, category: 'onsen', description: '温泉地定番の上質タオル2枚セット', autoApprove: true },
  { id: 'item002', name: '湯上がり専用 保湿ミスト', priceJPY: 1800, priceUSD: 12, category: 'onsen', description: 'ミネラル豊富な温泉水配合の保湿スプレー', autoApprove: true },
  { id: 'item003', name: '浴衣（高品質 現地受取）', priceJPY: 4200, priceUSD: 28, category: 'onsen', description: '宿に先着。温泉街散策用の上質な浴衣', autoApprove: true },
  // トレッキング向け
  { id: 'item004', name: '防水トレッキングソックス', priceJPY: 2400, priceUSD: 16, category: 'nature', description: 'メリノウール製。長時間歩行でも蒸れない', autoApprove: true },
  { id: 'item005', name: 'トレイル用 行動食セット', priceJPY: 1600, priceUSD: 11, category: 'nature', description: 'エネルギーバー・ナッツ・ドライフルーツ', autoApprove: true },
  { id: 'item006', name: '虫除けスプレー（天然成分）', priceJPY: 1200, priceUSD: 8, category: 'nature', description: '森林浴向け。天然ハーブ由来の虫除け', autoApprove: true },
  // 食事・囲炉裏体験向け
  { id: 'item007', name: '地元蔵元 日本酒ミニボトル', priceJPY: 3200, priceUSD: 21, category: 'dining', description: '囲炉裏体験に合わせた地酒ペアリングセット', autoApprove: true },
  { id: 'item008', name: 'お箸（名入れ 職人手作り）', priceJPY: 2600, priceUSD: 17, category: 'dining', description: '旅の記念に。当日体験の場に届けます', autoApprove: true },
  // アクティビティ向け
  { id: 'item009', name: '防水 コンパクトカメラポーチ', priceJPY: 1900, priceUSD: 13, category: 'activity', description: '漁船・水辺でのカメラ保護に', autoApprove: true },
  { id: 'item010', name: '日焼け止め SPF50（ウォータープルーフ）', priceJPY: 1500, priceUSD: 10, category: 'activity', description: '海上・アウトドア向け高機能', autoApprove: true },
  // ウェルネス向け
  { id: 'item011', name: '瞑想用 アロマスティック', priceJPY: 1400, priceUSD: 9, category: 'wellness', description: '白檀・ラベンダーブレンド。座禅体験に最適', autoApprove: true },
  { id: 'item012', name: '天然石 パワーストーン（小）', priceJPY: 2200, priceUSD: 15, category: 'wellness', description: '旅の記念に。浄化・安心のお守り', autoApprove: true },
]

// ===== Ryokan DB =====
const secretRyokan = [
  { id: 'r001', name: '奥飛騨 山の湯 白雲荘', location: '岐阜県奥飛騨温泉郷', type: '秘境温泉宿', pricePerNight: 38000, priceUSD: 255, description: '標高1200mの静寂。手付かずの原生林に囲まれた露天風呂。', image: 'https://images.unsplash.com/photo-1580822184713-fc5400e7fe10?w=800', availability: true, features: ['貸切露天風呂', '囲炉裏夕食', '送迎付き'], score: 98, recommendedExps: ['exp001', 'exp003'] },
  { id: 'r002', name: '屋久島 森の宿 縄文庵', location: '鹿児島県屋久島', type: '古民家一棟貸し', pricePerNight: 45000, priceUSD: 302, description: '樹齢3000年の縄文杉を望む。完全プライベートの森の離れ。', image: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800', availability: true, features: ['完全プライベート', '専属コンシェルジュ', '星空ガイド付き'], score: 96, recommendedExps: ['exp002', 'exp005'] },
  { id: 'r003', name: '五島列島 椿の宿 海音', location: '長崎県五島列島', type: '離島秘宿', pricePerNight: 32000, priceUSD: 215, description: '紺碧の海を独り占め。幻の椿油の湯に浸かる夕暮れ。', image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800', availability: true, features: ['海水浴専用ビーチ', '地元漁師の朝食', '椿油スパ'], score: 94, recommendedExps: ['exp004', 'exp005'] },
  { id: 'r004', name: '白川郷 合掌の宿 雪月花', location: '岐阜県白川村', type: '合掌造り古民家', pricePerNight: 42000, priceUSD: 282, description: '世界遺産の合掌造り。400年の歴史が宿る炉端で囲む夜。', image: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800', availability: false, features: ['国指定重要文化財', '囲炉裏料理', '雪見露天風呂'], score: 99, recommendedExps: ['exp003', 'exp005'] },
]

const defaultAgentRules = {
  maxAutoSpendJPY: 5000,
  maxAutoSpendUSD: 33,
  requireApprovalAboveJPY: 5000,
  requireApprovalAboveUSD: 33,
  allowedCategories: ['accommodation', 'transport', 'dining', 'experience', 'onsen', 'nature', 'activity', 'wellness'],
  preferredStyle: ['秘境', '温泉', '古民家', '一棟貸し'],
  blacklist: ['チェーンホテル', '大型リゾート'],
  autoBook: true,
  notifyOnPurchase: true,
}

// ===== API: Chat =====
app.post('/api/chat', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { message, history = [] } = body
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: ZUKKU_SYSTEM_PROMPT },
    ...history.slice(-8).map((h: { role: string; content: string }) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: message },
  ]
  if (c.env?.AI) {
    try {
      const response = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages, max_tokens: 300, temperature: 0.75 } as Parameters<typeof c.env.AI.run>[1])
      const text = (response as { response?: string }).response || ''
      const actionMatch = text.match(/\[ACTION:([a-z_]+)\]/)
      const action = actionMatch ? actionMatch[1] : null
      const cleanText = text.replace(/\[ACTION:[a-z_]+\]/g, '').trim()
      return c.json({ success: true, reply: cleanText, action, model: 'llama-3.1' })
    } catch (e) { console.error('Workers AI error:', e) }
  }
  const reply = zukuFallback(message, history)
  return c.json({ success: true, reply: reply.text, action: reply.action, model: 'smart-fallback' })
})

function zukuFallback(message: string, history: { role: string; content: string }[]): { text: string; action: string | null } {
  const m = message.toLowerCase()
  const histLen = history.length
  if (histLen === 0 || m.includes('こんにちは') || m.includes('はじめ'))
    return { text: 'ホホウ、いらっしゃいませ！わたくしズックと申します。どちらへのご旅行をお考えでしょうか？いつ頃・どなたと・どんな気分の旅をご希望ですか？', action: null }
  if (m.includes('いつ') || m.includes('来月') || m.includes('今月') || m.includes('週末'))
    return { text: 'ふむふむ、承知いたしました！どなたとご一緒でしょうか？お一人で静かに、ですか？それともご夫婦・お友達と？', action: null }
  if (m.includes('一人') || m.includes('夫婦') || m.includes('二人') || m.includes('友達') || m.includes('家族'))
    return { text: 'ホホウ！素敵ですね。ご予算のイメージはいかがでしょう？「とにかく非日常を」とお考えでしたら、わたくしおすすめの秘境体験がございます。', action: null }
  if (m.includes('予算') || m.includes('円') || m.includes('万') || m.includes('いくら'))
    return { text: 'かしこまりました！それでは現地の主人と調整してまいります。わたくしズックが厳選したお宿と体験を今すぐご提案いたします。', action: 'search_ryokan' }
  if (m.includes('宿') || m.includes('旅館') || m.includes('温泉') || m.includes('泊') || m.includes('秘境') || m.includes('体験') || m.includes('旅') || m.includes('探') || m.includes('おすすめ'))
    return { text: 'ホホウ！わたくしズックが全力でお調べいたします。現地の主人方と直接調整した、とっておきのお宿と体験をご覧ください。', action: 'search_ryokan' }
  if (m.includes('ウォレット') || m.includes('接続') || m.includes('connect'))
    return { text: 'おなかのボタンがピカッと光りました。ウォレットの接続を開始いたします！接続が完了すれば、承認ひとつで全ての手配が完了します。', action: 'connect_wallet' }
  if (m.includes('予約') || m.includes('確定') || m.includes('承認') || m.includes('お願い') || m.includes('決め'))
    return { text: 'かしこまりました！承認をいただければ、このまま予約を完了させます。', action: 'show_authorize' }
  if (m.includes('ルール') || m.includes('設定') || m.includes('自動'))
    return { text: 'エージェントのルール設定を開きますね。自動購入の上限や、お好みのスタイルをカスタマイズできます。', action: 'open_rules' }
  if (m.includes('ありがとう') || m.includes('すごい') || m.includes('いい'))
    return { text: 'ホホウ、恐縮でございます！わたくしズック、全力でお役に立てて光栄です。他にご要望があればいつでもどうぞ。', action: null }
  const defaults = [
    { text: 'ふむふむ、なるほどでございます。もう少し詳しく教えていただけますか？どんな旅の雰囲気をご希望ですか？', action: null },
    { text: 'ホホウ！おっしゃる通りですね。わたくしズックが最適な体験をご提案いたしましょうか？', action: 'search_ryokan' },
    { text: 'かしこまりました。日本の秘境に、素晴らしい体験が待っております。', action: 'search_ryokan' },
  ]
  return defaults[Math.floor(Math.random() * defaults.length)]
}

// ===== API: Search (宿 + 体験) =====
app.post('/api/search', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { nights = 2, guests = 2 } = body
  await new Promise((r) => setTimeout(r, 900))
  const ryokans = secretRyokan.filter((r) => r.availability).map((r) => ({ ...r, totalUSD: r.priceUSD * nights })).sort((a, b) => b.score - a.score)
  const exps = experiencesDB.sort((a, b) => b.score - a.score)
  return c.json({ success: true, ryokans, experiences: exps, agentMessage: '現地の主人方と直接調整いたしました。お宿と体験をご覧ください。', searchContext: { nights, guests } })
})

// ===== API: Auto-suggest items for experience =====
app.post('/api/auto-suggest', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { experienceId, ryokanId } = body
  const exp = experiencesDB.find(e => e.id === experienceId)
  const ryokan = ryokanId ? secretRyokan.find(r => r.id === ryokanId) : null
  if (!exp && !ryokan) return c.json({ success: false, error: 'Not found' }, 404)
  const category = exp?.category || 'onsen'
  const matchedItems = autoPurchaseItems.filter(item => item.category === category)
  const autoApproved = matchedItems.filter(item => item.priceUSD <= defaultAgentRules.maxAutoSpendUSD)
  const requiresApproval = matchedItems.filter(item => item.priceUSD > defaultAgentRules.maxAutoSpendUSD)
  return c.json({
    success: true, experience: exp, ryokan, items: matchedItems,
    autoApproved, requiresApproval,
    totalAutoSpendUSD: autoApproved.reduce((s, i) => s + i.priceUSD, 0),
    agentMessage: `「${exp?.name || '体験'}」に合わせて、必要なアイテムをズックが選定いたしました。`,
  })
})

// ===== API: Agent Rules =====
app.get('/api/agent-rules', (c) => c.json({ success: true, rules: defaultAgentRules }))
app.post('/api/agent-rules', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  return c.json({ success: true, rules: { ...defaultAgentRules, ...body }, message: 'エージェントルールを更新しました。' })
})

// ===== API: Wallet Connect =====
app.post('/api/wallet/connect', async (c) => {
  await new Promise((r) => setTimeout(r, 700))
  return c.json({ success: true, sessionId: `kite_${Date.now()}`, walletAddress: '0x' + Math.random().toString(16).substr(2, 40), balance: { ETH: '2.847', USDC: '4250.00', USDT: '1800.00' }, sessionExpiry: new Date(Date.now() + 30 * 60 * 1000).toISOString() })
})

// ===== API: Payment =====
app.post('/api/payment/settle', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  await new Promise((r) => setTimeout(r, 1600))
  const txHash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return c.json({ success: true, txHash, blockNumber: Math.floor(Math.random() * 1000000) + 18000000, amount: body.amount, currency: body.currency || 'USDC', status: 'confirmed', timestamp: new Date().toISOString() })
})

// ===== API: Auto Purchase (小額アイテム自動購入) =====
app.post('/api/auto-purchase', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { items = [] } = body
  await new Promise((r) => setTimeout(r, 1200))
  const purchased = items.map((item: { id: string; name: string; priceUSD: number }) => ({
    ...item, txHash: '0x' + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
    status: 'purchased', timestamp: new Date().toISOString(),
  }))
  return c.json({ success: true, purchased, totalUSD: purchased.reduce((s: number, i: { priceUSD: number }) => s + i.priceUSD, 0), message: 'ズックが自動購入を完了いたしました。' })
})

// ===== API: Booking Confirm =====
app.post('/api/booking/confirm', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const ryokan = secretRyokan.find((r) => r.id === (body.ryokanId || 'r001'))
  await new Promise((r) => setTimeout(r, 800))
  const bookingId = `FLT-${Date.now().toString(36).toUpperCase()}`
  const checkIn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const checkOut = new Date(checkIn.getTime() + (body.nights || 2) * 24 * 60 * 60 * 1000)
  return c.json({ success: true, bookingId, ryokan, checkIn: checkIn.toISOString().split('T')[0], checkOut: checkOut.toISOString().split('T')[0], txHash: body.txHash, totalUSD: (ryokan?.priceUSD || 255) * (body.nights || 2), status: 'confirmed', agentSummary: 'お客様に代わり、すべての手配が完了いたしました。素晴らしい旅になりますよう、ズックより心よりお祈り申し上げます。' })
})

app.get('/api/orchestration/status', (c) => c.json({ status: 'ready', agent: 'Flattora', version: '2.0.0', capabilities: ['search', 'negotiate', 'book', 'pay', 'auto-purchase'] }))

// ===== KITE PASSPORT CONFIG =====
const KITE_BASE_URL = 'https://passport.prod.gokite.ai'
const KITE_USER_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InItaXphd2FAaGF0YXByby5jby5qcCIsImV4cCI6MTc4MTEzMjQ3MiwiaWF0IjoxNzc4NTQwNDcyLCJpc3MiOiJraXRlLXBhc3Nwb3J0IiwianRpIjoiYXV0aF8wMTllMTk0NS1lN2RlLTc0OWYtYThjNy02NWRiNmM2OTJlYzciLCJzdWIiOiJ1c2VyXzAxOWUxOTQ0LWEwZmMtNzI0Ni04NTY5LTZiNzBiZDAwYjcyZCJ9.7EGwh0E7JnX0yVAE548CNpo9OxGHoRPh7I5sRtLmGEk'
const KITE_AGENT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY3Rvcl90eXBlIjoiYWdlbnQiLCJhZ2VudF90eXBlIjoiY29kaW5nLWFzc2lzdGFudCIsImV4cCI6MTc4MTEzMjQ3NiwiaWF0IjoxNzc4NTQwNDc2LCJpc3MiOiJraXRlLXBhc3Nwb3J0IiwianRpIjoiYXV0aF8wMTllMTk0NS1mN2U5LTcyYzYtYTJlZi0wMjQ0ODg2NWY4OTUiLCJvd25lcl9pZCI6InVzZXJfMDE5ZTE5NDQtYTBmYy03MjQ2LTg1NjktNmI3MGJkMDBiNzJkIiwic3ViIjoiYWdlbnRfMDE5ZTE5NDUtZjdlNC03YmJlLWFjYTMtYjE4MzI4MjBiYWVlIn0.yINlt2BJQCjR2Ne_I42lmGV1hB9u_5-TWd68K17lIBI'
const KITE_AGENT_ID = 'agent_019e1945-f7e4-7bbe-aca3-b1832820baee'
const KITE_USER_ID  = 'user_019e1944-a0fc-7246-8569-6b70bd00b72d'
const KITE_WALLET   = '0x4580D0C762a6988836e06acF6f59a654baf57869'
// アクティブセッションID（承認済み）
let kiteCurrentSessionId = 'agent_session_019e1948-2620-7385-8224-edba16898cd3'

// ===== API: Kite — ステータス取得 =====
app.get('/api/kite/status', async (c) => {
  try {
    // ウォレット残高
    const balRes = await fetch(`${KITE_BASE_URL}/v1/wallet/balance`, {
      headers: { 'Authorization': `Bearer ${KITE_AGENT_TOKEN}`, 'Content-Type': 'application/json' },
    })
    const balData = balRes.ok ? await balRes.json() as Record<string,unknown> : {}
    // セッション状態
    const sessRes = await fetch(`${KITE_BASE_URL}/v1/agent/sessions?status=active&limit=1`, {
      headers: { 'Authorization': `Bearer ${KITE_AGENT_TOKEN}` },
    })
    const sessData = sessRes.ok ? await sessRes.json() as Record<string,unknown> : {}
    return c.json({
      success: true,
      wallet: { address: KITE_WALLET, ...(balData as object) },
      session: { current_session_id: kiteCurrentSessionId, ...(sessData as object) },
      agent_id: KITE_AGENT_ID,
      user_id: KITE_USER_ID,
    })
  } catch (e) {
    return c.json({ success: false, error: String(e),
      wallet: { address: KITE_WALLET, assets: [{ symbol:'USDC', balance:'0' },{ symbol:'KITE', balance:'0' }] },
      session: { current_session_id: kiteCurrentSessionId },
    })
  }
})

// ===== API: Kite — セッション作成 =====
app.post('/api/kite/session/create', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { taskSummary = 'Flattora AI旅行コンシェルジュ — 旅先情報のKite x402決済', maxPerTx = 2, maxTotal = 10, ttl = '2h' } = body
  try {
    const res = await fetch(`${KITE_BASE_URL}/v1/agent/sessions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KITE_AGENT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_summary: taskSummary,
        max_amount_per_tx: String(maxPerTx),
        max_total_amount: String(maxTotal),
        ttl,
        assets: ['USDC'],
        payment_approach: 'x402',
      }),
    })
    const data = await res.json() as Record<string,unknown>
    return c.json({ success: true, ...data })
  } catch (e) {
    // CLI経由フォールバック
    return c.json({
      success: true,
      status: 'human_action_required',
      approval_url: `https://agentpassport.ai/agent-session/approve?demo=true`,
      request_id: `demo_req_${Date.now()}`,
      hint: 'デモモード: 承認URLを開いてパスキーで承認してください',
    })
  }
})

// ===== API: Kite — セッションポーリング =====
app.get('/api/kite/session/status', async (c) => {
  const requestId = c.req.query('request_id')
  if (!requestId) return c.json({ success: false, error: 'request_id required' }, 400)
  try {
    const res = await fetch(`${KITE_BASE_URL}/v1/agent/session-requests/${requestId}`, {
      headers: { 'Authorization': `Bearer ${KITE_AGENT_TOKEN}` },
    })
    const data = await res.json() as Record<string,unknown>
    if ((data as { status?: string }).status === 'approved' && (data as { session_id?: string }).session_id) {
      kiteCurrentSessionId = (data as { session_id: string }).session_id
    }
    return c.json({ success: true, ...data })
  } catch(e) {
    return c.json({ success: false, error: String(e) })
  }
})

// ===== API: Kite — x402 天気情報購入（実際の決済） =====
app.post('/api/kite/weather', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { city = 'Tokyo', type = 'current' } = body
  const weatherUrl = `https://weather.hugen.tokyo/weather/${type}?city=${encodeURIComponent(city)}`

  // まず402レスポンスを確認
  const probeRes = await fetch(weatherUrl, { method: 'GET' })
  const probeBody = await probeRes.json() as Record<string,unknown>

  if (probeRes.status !== 402) {
    // 決済不要または直接レスポンス
    return c.json({ success: true, paid: false, data: probeBody })
  }

  // x402 payment-required ヘッダーを取得
  const paymentHeader = probeRes.headers.get('payment-required')

  // Kite Passportに決済リクエスト
  try {
    const execRes = await fetch(`${KITE_BASE_URL}/v1/agent/sessions/${kiteCurrentSessionId}/execute`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KITE_AGENT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: weatherUrl, method: 'GET', payment_header: paymentHeader }),
    })
    const execData = await execRes.json() as Record<string,unknown>

    if (execRes.ok && (execData as { status?: string }).status === 'success') {
      return c.json({
        success: true, paid: true,
        tx_hash: (execData as { tx_hash?: string }).tx_hash,
        amount_usdc: '0.01',
        city, type,
        data: (execData as { body?: unknown }).body || probeBody,
        kite_session: kiteCurrentSessionId,
      })
    }
    // 残高不足など — サンプルデータを返しつつx402フローを記録
    return c.json({
      success: true, paid: false,
      x402_attempted: true,
      x402_error: (execData as { error?: string }).error || 'payment failed',
      payment_url: weatherUrl,
      payment_required_header: paymentHeader ? 'present' : 'missing',
      amount_usdc: '0.01',
      city, type,
      data: probeBody, // サンプルデータ（402レスポンスボディ）
      kite_session: kiteCurrentSessionId,
      note: 'x402フロー実行済み。ウォレット残高追加で実際の決済が完了します。',
    })
  } catch(e) {
    return c.json({
      success: true, paid: false,
      x402_attempted: true, x402_error: String(e),
      city, type, data: probeBody,
    })
  }
})

// ===== API: Kite — サービスカタログ検索 =====
app.get('/api/kite/catalog', async (c) => {
  const query = c.req.query('q') || 'travel'
  try {
    const res = await fetch(`https://service-discovery.prod.gokite.ai/v1/services?query=${encodeURIComponent(query)}&payment_approach=x402_http&limit=10`, {
      headers: { 'Authorization': `Bearer ${KITE_AGENT_TOKEN}` },
    })
    const data = await res.json() as Record<string,unknown>
    return c.json({ success: true, ...data })
  } catch(e) {
    return c.json({ success: false, error: String(e), services: [] })
  }
})

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
      --gold-glow: rgba(201,168,76,0.12); --white: #F5F5F0;
      --white-dim: rgba(245,245,240,0.6); --black: #000;
      --surface2: #0f0f0f; --surface3: #171717; --border: rgba(201,168,76,0.18);
      --step-active: rgba(201,168,76,0.15); --step-done: rgba(201,168,76,0.08);
    }
    html, body { background: var(--black); color: var(--white); font-family: 'Noto Sans JP', sans-serif; font-weight: 200; font-size: 14px; line-height: 1.7; min-height: 100vh; overflow-x: hidden; -webkit-font-smoothing: antialiased; }
    body::before { content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0; background: radial-gradient(ellipse 60% 40% at 50% 0%, rgba(201,168,76,0.05) 0%, transparent 70%); }
    #app { position: relative; z-index: 1; min-height: 100vh; display: flex; flex-direction: column; }

    /* HEADER */
    header { display: flex; align-items: center; justify-content: space-between; padding: 16px 36px; border-bottom: 1px solid var(--border); backdrop-filter: blur(20px); position: sticky; top: 0; z-index: 100; background: rgba(0,0,0,0.92); }
    .logo { display: flex; align-items: center; gap: 12px; }
    .logo-text { font-family: 'Playfair Display', serif; font-size: 20px; color: var(--gold); letter-spacing: 0.15em; }
    .logo-sub { font-size: 10px; font-weight: 100; letter-spacing: 0.3em; color: var(--white-dim); text-transform: uppercase; }
    .header-right { display: flex; align-items: center; gap: 14px; }
    .wallet-status { display: flex; align-items: center; gap: 7px; font-size: 11px; color: var(--white-dim); }
    .wallet-dot { width: 6px; height: 6px; border-radius: 50%; background: #333; transition: all 0.4s; }
    .wallet-dot.connected { background: var(--gold); box-shadow: 0 0 8px var(--gold); animation: pulse-dot 2s infinite; }
    @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.4} }
    .btn { border: none; cursor: pointer; font-family: 'Noto Sans JP', sans-serif; font-weight: 200; transition: all 0.3s; letter-spacing: 0.1em; }
    .btn-gold { background: linear-gradient(135deg, var(--gold), var(--gold-light)); color: #000; padding: 10px 22px; font-size: 11px; font-weight: 400; letter-spacing: 0.15em; text-transform: uppercase; border-radius: 22px; }
    .btn-gold:hover { box-shadow: 0 0 28px rgba(201,168,76,0.45); transform: translateY(-1px); }
    .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--white-dim); padding: 8px 18px; font-size: 11px; letter-spacing: 0.15em; border-radius: 18px; }
    .btn-outline:hover { border-color: var(--gold-dim); color: var(--gold); }

    /* ============================================
       DEMO FLOW STEPS (top of page)
       ============================================ */
    .demo-steps {
      display: flex; align-items: center; justify-content: center;
      gap: 0; padding: 18px 36px 0; max-width: 760px; margin: 0 auto; width: 100%;
    }
    .demo-step {
      display: flex; align-items: center; gap: 8px; flex: 1;
      padding: 10px 14px; border-radius: 8px; transition: all 0.4s;
      border: 1px solid transparent;
    }
    .demo-step.active { background: var(--step-active); border-color: var(--gold-dim); }
    .demo-step.done   { background: var(--step-done); border-color: rgba(201,168,76,0.1); }
    .step-num {
      width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center;
      justify-content: center; font-size: 10px; font-weight: 400; flex-shrink: 0;
      border: 1px solid var(--border); color: var(--white-dim); transition: all 0.4s;
    }
    .demo-step.active .step-num { background: var(--gold); color: #000; border-color: var(--gold); }
    .demo-step.done   .step-num { background: rgba(201,168,76,0.3); color: var(--gold); border-color: var(--gold-dim); }
    .step-label { font-size: 11px; font-weight: 200; color: var(--white-dim); line-height: 1.3; }
    .demo-step.active .step-label { color: var(--white); }
    .step-arrow { color: var(--border); font-size: 14px; margin: 0 2px; flex-shrink: 0; }

    /* ============================================
       ZUKKU BALL — かわいい丸いふくろう
       ============================================ */
    #voice-section { display: flex; flex-direction: column; align-items: center; padding: 28px 36px 20px; }

    .ball-stage {
      position: relative; width: 220px; height: 320px;
      margin-bottom: 24px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }

    /* Soft ambient glow rings */
    .ball-aura {
      position: absolute; border-radius: 50%; pointer-events: none;
      border: 1px solid rgba(201,168,76,0.2);
      animation: aura-float 4s ease-in-out infinite; opacity: 0;
    }
    .ball-aura:nth-child(1) { width: 260px; height: 260px; animation-delay: 0s; }
    .ball-aura:nth-child(2) { width: 260px; height: 260px; animation-delay: 1.3s; }
    .ball-aura:nth-child(3) { width: 260px; height: 260px; animation-delay: 2.6s; }
    @keyframes aura-float { 0%{transform:scale(1);opacity:0.5} 100%{transform:scale(1.75);opacity:0} }

    #zukku-ball {
      width: 220px; height: 320px; position: relative; z-index: 2;
      filter: drop-shadow(0 10px 28px rgba(0,0,0,0.7)) drop-shadow(0 0 12px rgba(201,168,76,0.1));
      transition: filter 0.5s;
    }
    .ball-stage.listening #zukku-ball {
      filter: drop-shadow(0 10px 28px rgba(0,0,0,0.7)) drop-shadow(0 0 40px rgba(201,168,76,0.5));
      animation: ball-breathe 1.8s ease-in-out infinite;
    }
    .ball-stage.speaking #zukku-ball {
      filter: drop-shadow(0 10px 28px rgba(0,0,0,0.7)) drop-shadow(0 0 56px rgba(201,168,76,0.65));
      animation: ball-speak 0.4s ease-in-out infinite alternate;
    }
    .ball-stage.thinking #zukku-ball {
      animation: ball-think 2s ease-in-out infinite;
    }
    @keyframes ball-breathe { 0%,100%{transform:scale(1) translateY(0)} 50%{transform:scale(1.04) translateY(-4px)} }
    @keyframes ball-speak   { 0%{transform:scale(0.97) rotate(-1deg) translateY(0)} 100%{transform:scale(1.04) rotate(1deg) translateY(-3px)} }
    @keyframes ball-think   { 0%,100%{transform:rotate(-2.5deg) translateY(0)} 50%{transform:rotate(2.5deg) translateY(-5px)} }

    /* Name badge */
    .ball-label {
      position: absolute; bottom: -2px; left: 50%; transform: translateX(-50%);
      font-size: 9px; letter-spacing: 0.4em; color: var(--gold); text-transform: uppercase;
      white-space: nowrap; background: rgba(0,0,0,0.9); padding: 2px 10px;
      border: 1px solid var(--gold-dim); border-radius: 10px; z-index: 3;
    }

    /* WAVEFORM */
    .waveform-container { height: 40px; width: 220px; display: flex; align-items: center; justify-content: center; gap: 3px; margin-bottom: 16px; }
    .wave-bar { width: 3px; background: var(--gold); border-radius: 2px; height: 4px; transition: height 0.1s; opacity: 0.35; }
    .wave-bar.active { animation: wave-dance 0.5s ease-in-out infinite; opacity: 1; }
    .wave-bar:nth-child(odd){animation-delay:0s} .wave-bar:nth-child(even){animation-delay:0.15s}
    .wave-bar:nth-child(3n){animation-delay:0.3s}
    @keyframes wave-dance { 0%,100%{height:4px} 50%{height:var(--max-h,30px)} }

    /* TRANSCRIPT */
    .transcript-area { max-width: 540px; width: 100%; text-align: center; min-height: 72px; }
    .transcript-user { font-size: 11px; color: var(--white-dim); margin-bottom: 5px; font-style: italic; }
    .transcript-agent { font-size: 15px; font-weight: 100; color: var(--white); letter-spacing: 0.02em; line-height: 1.9; }
    .typing-cursor { display: inline-block; width: 2px; height: 1em; background: var(--gold); margin-left: 2px; animation: blink 0.8s infinite; vertical-align: text-bottom; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

    /* CONTROLS */
    .voice-controls { display: flex; gap: 12px; margin-top: 20px; align-items: center; flex-wrap: wrap; justify-content: center; }
    .mic-btn { width: 50px; height: 50px; border-radius: 50%; background: var(--surface2); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.3s; font-size: 20px; }
    .mic-btn:hover { border-color: var(--gold); }
    .mic-btn.active { background: rgba(201,168,76,0.1); border-color: var(--gold); box-shadow: 0 0 20px var(--gold-dim); }
    .quick-actions { display: flex; flex-wrap: wrap; gap: 7px; justify-content: center; }
    .quick-action-btn { background: transparent; border: 1px solid var(--border); color: var(--white-dim); padding: 6px 14px; font-family: 'Noto Sans JP', sans-serif; font-weight: 200; font-size: 11px; cursor: pointer; transition: all 0.3s; letter-spacing: 0.05em; border-radius: 18px; }
    .quick-action-btn:hover { border-color: var(--gold-dim); color: var(--gold); background: var(--gold-glow); }

    /* CHAT HISTORY */
    #chat-history { max-width: 620px; margin: 0 auto 16px; width: 100%; max-height: 180px; overflow-y: auto; padding: 0 36px; display: none; }
    #chat-history.visible { display: block; }
    .chat-msg { margin-bottom: 9px; }
    .chat-msg-user { text-align: right; }
    .chat-msg-user span { background: var(--surface2); border: 1px solid var(--border); color: var(--white-dim); padding: 6px 13px; font-size: 12px; display: inline-block; max-width: 80%; border-radius: 12px 12px 3px 12px; }
    .chat-msg-agent { text-align: left; display: flex; align-items: flex-start; gap: 7px; }
    .chat-msg-agent span { color: var(--white); font-size: 13px; font-weight: 100; line-height: 1.7; }

    /* MAIN CONTENT */
    #main-content { flex: 1; padding: 0 36px 60px; max-width: 1160px; margin: 0 auto; width: 100%; }

    /* STATUS */
    #status-bar { background: var(--surface2); border: 1px solid var(--border); padding: 9px 18px; display: none; align-items: center; gap: 9px; margin-bottom: 22px; font-size: 11px; color: var(--white-dim); border-radius: 4px; }
    .status-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--gold); animation: pulse-dot 2s infinite; flex-shrink: 0; }

    /* PANEL BASE */
    .panel { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 24px; margin-bottom: 22px; }
    .panel-title { font-size: 10px; font-weight: 300; letter-spacing: 0.3em; color: var(--gold); text-transform: uppercase; margin-bottom: 14px; }

    /* WALLET PANEL */
    #wallet-panel { display: none; }
    #wallet-panel.visible { display: block; }
    .wallet-info { display: grid; grid-template-columns: repeat(3,1fr); gap: 18px; margin-bottom: 14px; }
    .balance-label { font-size: 10px; letter-spacing: 0.2em; color: var(--white-dim); margin-bottom: 3px; text-align: center; }
    .balance-value { font-size: 19px; font-weight: 100; color: var(--gold); text-align: center; }

    /* AGENT RULES */
    #agent-rules-panel { display: none; }
    .rules-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 16px; }
    .rule-label { font-size: 10px; letter-spacing: 0.2em; color: var(--white-dim); text-transform: uppercase; margin-bottom: 5px; }
    .rule-input { background: var(--surface3); border: 1px solid var(--border); color: var(--white); padding: 8px 11px; font-family: 'Noto Sans JP', sans-serif; font-weight: 200; font-size: 13px; outline: none; width: 100%; transition: border-color 0.3s; border-radius: 4px; }
    .rule-input:focus { border-color: var(--gold); }
    .toggle { position: relative; width: 40px; height: 20px; cursor: pointer; display: inline-block; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .toggle-slider { position: absolute; inset: 0; background: var(--surface3); border: 1px solid var(--border); border-radius: 10px; transition: 0.3s; }
    .toggle-slider::before { content: ''; position: absolute; width: 14px; height: 14px; left: 2px; top: 2px; background: var(--white-dim); border-radius: 50%; transition: 0.3s; }
    .toggle input:checked + .toggle-slider { background: var(--gold-glow); border-color: var(--gold); }
    .toggle input:checked + .toggle-slider::before { transform: translateX(20px); background: var(--gold); }

    /* ============================================
       STEP 1 — EXPERIENCE CARDS (体験提案)
       ============================================ */
    #experience-section { display: none; margin-bottom: 22px; }
    #experience-section.visible { display: block; }
    .section-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 16px; }
    .exp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    .exp-card {
      background: var(--surface2); border: 1px solid var(--border); overflow: hidden;
      cursor: pointer; transition: all 0.3s; border-radius: 10px; position: relative;
    }
    .exp-card:hover { border-color: var(--gold-dim); box-shadow: 0 0 32px rgba(201,168,76,0.1); transform: translateY(-2px); }
    .exp-card.selected { border-color: var(--gold); box-shadow: 0 0 48px rgba(201,168,76,0.2); }
    .exp-card-img { width: 100%; height: 160px; object-fit: cover; filter: brightness(0.75) saturate(0.65); transition: filter 0.3s; }
    .exp-card:hover .exp-card-img { filter: brightness(0.85) saturate(0.8); }
    .exp-card-body { padding: 16px; }
    .exp-category { font-size: 8px; letter-spacing: 0.35em; color: var(--gold); text-transform: uppercase; margin-bottom: 5px; }
    .exp-name { font-size: 15px; font-weight: 200; margin-bottom: 3px; line-height: 1.4; }
    .exp-loc { font-size: 10px; color: var(--white-dim); margin-bottom: 8px; }
    .exp-desc { font-size: 11px; color: var(--white-dim); line-height: 1.7; margin-bottom: 10px; }
    .exp-features { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }
    .feature-tag { font-size: 8px; letter-spacing: 0.1em; color: var(--gold); border: 1px solid var(--gold-dim); padding: 2px 7px; border-radius: 9px; }
    .exp-price { display: flex; align-items: baseline; justify-content: space-between; }
    .price-amount { font-size: 18px; font-weight: 100; }
    .price-unit { font-size: 10px; color: var(--white-dim); margin-left: 2px; }
    .exp-score { font-size: 10px; color: var(--gold); }
    /* Approval badge */
    .needs-approval {
      position: absolute; top: 10px; right: 10px;
      background: rgba(201,168,76,0.15); border: 1px solid var(--gold-dim);
      color: var(--gold); font-size: 8px; padding: 2px 8px; border-radius: 8px;
      letter-spacing: 0.1em;
    }
    .auto-ok {
      position: absolute; top: 10px; right: 10px;
      background: rgba(80,180,80,0.12); border: 1px solid rgba(80,180,80,0.3);
      color: #6ee06e; font-size: 8px; padding: 2px 8px; border-radius: 8px;
      letter-spacing: 0.1em;
    }

    /* ============================================
       STEP 2 — AUTHORIZE (承認購入)
       ============================================ */
    #authorize-section { display: none; flex-direction: column; align-items: center; padding: 48px 36px; background: var(--surface2); border: 1px solid var(--gold-dim); margin-bottom: 22px; text-align: center; border-radius: 12px; }
    #authorize-section.visible { display: flex; }
    .authorize-title { font-family: 'Playfair Display', serif; font-size: 24px; color: var(--gold); margin-bottom: 10px; font-style: italic; }
    .authorize-amount { font-size: 38px; font-weight: 100; color: var(--white); margin-bottom: 6px; }
    .authorize-amount span { font-size: 16px; color: var(--white-dim); margin-left: 4px; }
    .authorize-desc { font-size: 12px; font-weight: 100; color: var(--white-dim); max-width: 440px; margin-bottom: 36px; line-height: 2; }
    .authorize-btn { background: linear-gradient(135deg, var(--gold), var(--gold-light)); color: #000; border: none; padding: 18px 64px; font-family: 'Noto Sans JP', sans-serif; font-weight: 400; font-size: 13px; letter-spacing: 0.2em; cursor: pointer; transition: all 0.3s; text-transform: uppercase; border-radius: 36px; }
    .authorize-btn:hover { box-shadow: 0 0 56px rgba(201,168,76,0.4); transform: translateY(-2px); }
    .webauthn-hint { margin-top: 16px; font-size: 9px; letter-spacing: 0.2em; color: rgba(255,255,255,0.25); text-transform: uppercase; }

    /* TX FEED */
    #tx-feed { display: none; }
    #tx-feed.visible { display: block; }
    .tx-item { display: flex; align-items: center; gap: 9px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04); animation: tx-slide 0.4s ease; }
    @keyframes tx-slide { from{opacity:0;transform:translateX(-6px)} to{opacity:1;transform:none} }
    .tx-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--gold); flex-shrink: 0; }
    .tx-hash { font-family: monospace; font-size: 10px; color: var(--gold); word-break: break-all; }
    .tx-detail { font-size: 10px; font-weight: 100; color: var(--white-dim); }

    /* ============================================
       STEP 3 — AUTO PURCHASE (AI自動購入)
       ============================================ */
    #auto-purchase-section { display: none; margin-bottom: 22px; }
    #auto-purchase-section.visible { display: block; }
    .auto-purchase-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
    .auto-badge { background: rgba(80,180,80,0.12); border: 1px solid rgba(80,180,80,0.3); color: #6ee06e; font-size: 8px; padding: 2px 8px; letter-spacing: 0.15em; border-radius: 8px; }
    .pending-badge { background: rgba(201,168,76,0.12); border: 1px solid var(--gold-dim); color: var(--gold); font-size: 8px; padding: 2px 8px; letter-spacing: 0.15em; border-radius: 8px; }
    .items-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .item-card { background: var(--surface3); border: 1px solid var(--border); border-radius: 8px; padding: 14px; display: flex; align-items: center; gap: 12px; transition: all 0.3s; }
    .item-card.auto-approved { border-color: rgba(80,180,80,0.25); }
    .item-card.purchasing { animation: item-pulse 0.8s ease-in-out infinite; }
    .item-card.purchased { border-color: rgba(80,180,80,0.5); background: rgba(80,180,80,0.05); }
    @keyframes item-pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
    .item-icon { font-size: 26px; flex-shrink: 0; }
    .item-info { flex: 1; min-width: 0; }
    .item-name { font-size: 12px; font-weight: 200; margin-bottom: 2px; }
    .item-desc { font-size: 10px; color: var(--white-dim); line-height: 1.5; }
    .item-price-row { display: flex; align-items: center; justify-content: space-between; margin-top: 5px; }
    .item-price { font-size: 13px; font-weight: 100; color: var(--gold); }
    .item-status { font-size: 9px; letter-spacing: 0.1em; }
    .item-status.done { color: #6ee06e; }
    .item-status.pending-approval { color: var(--gold); }
    .item-status.buying { color: var(--white-dim); }
    .auto-total-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-top: 1px solid var(--border); margin-top: 4px; }
    .auto-total-label { font-size: 11px; color: var(--white-dim); letter-spacing: 0.1em; }
    .auto-total-amount { font-size: 18px; font-weight: 100; color: var(--gold); }
    .pending-approve-section { margin-top: 14px; padding: 16px; background: rgba(201,168,76,0.06); border: 1px solid var(--gold-dim); border-radius: 8px; }
    .pending-title { font-size: 10px; letter-spacing: 0.2em; color: var(--gold); text-transform: uppercase; margin-bottom: 10px; }

    /* BOOKING COMPLETE */
    #booking-complete { display: none; flex-direction: column; align-items: center; text-align: center; padding: 64px 36px; background: var(--surface2); border: 1px solid var(--gold-dim); margin-bottom: 22px; border-radius: 12px; }
    #booking-complete.visible { display: flex; }
    .complete-icon { font-size: 48px; margin-bottom: 20px; animation: pop 0.7s ease; }
    @keyframes pop { from{transform:scale(0);opacity:0} to{transform:scale(1);opacity:1} }
    .complete-title { font-family: 'Playfair Display', serif; font-size: 28px; color: var(--gold); margin-bottom: 12px; font-style: italic; }
    .complete-booking-id { font-size: 10px; letter-spacing: 0.3em; color: var(--white-dim); text-transform: uppercase; }
    .complete-id-value { font-family: monospace; font-size: 16px; color: var(--white); margin-bottom: 20px; }
    .complete-summary { font-size: 13px; font-weight: 100; color: var(--white-dim); max-width: 440px; line-height: 2; }

    /* ===== KITE PASSPORT PANEL ===== */
    .kite-panel {
      background: linear-gradient(135deg, #0a0f1e 0%, #0d1a2e 60%, #091422 100%);
      border: 1px solid rgba(99,179,255,0.30);
      border-radius: 14px; padding: 22px 24px; margin-bottom: 22px;
      box-shadow: 0 0 32px rgba(30,120,255,0.10), inset 0 1px 0 rgba(99,179,255,0.12);
    }
    .kite-panel-header { margin-bottom: 16px; }
    .kite-logo-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
    .kite-icon { font-size: 18px; color: #4A9EFF; }
    .kite-title { font-family: 'Playfair Display', serif; font-size: 15px; color: #7BC4FF; letter-spacing: 0.05em; }
    .kite-badge {
      margin-left: auto; font-size: 10px; color: #4AFF8C; background: rgba(74,255,140,0.12);
      border: 1px solid rgba(74,255,140,0.30); border-radius: 20px; padding: 2px 10px; letter-spacing: 0.05em;
    }
    .kite-badge.inactive { color: #FF6B6B; background: rgba(255,107,107,0.10); border-color: rgba(255,107,107,0.25); }
    .kite-subtitle { font-size: 10px; color: rgba(120,170,220,0.55); letter-spacing: 0.08em; text-transform: uppercase; }
    .kite-wallet-row {
      display: flex; align-items: center; gap: 12px;
      background: rgba(30,80,160,0.15); border: 1px solid rgba(99,179,255,0.15);
      border-radius: 8px; padding: 10px 14px; margin-bottom: 10px;
    }
    .kite-wallet-info { flex: 1; }
    .kite-wallet-label { font-size: 9px; color: rgba(120,170,220,0.55); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 3px; }
    .kite-wallet-addr { font-family: monospace; font-size: 12px; color: #7BC4FF; }
    .kite-balance-box { text-align: right; }
    .kite-balance-label { font-size: 9px; color: rgba(120,170,220,0.55); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 3px; }
    .kite-balance-val { font-size: 15px; font-weight: 600; color: #4AFF8C; font-family: monospace; }
    .kite-session-row {
      display: flex; align-items: center; gap: 12px;
      background: rgba(20,60,120,0.12); border: 1px solid rgba(99,179,255,0.10);
      border-radius: 8px; padding: 8px 14px; margin-bottom: 16px;
    }
    .kite-session-info { flex: 1; }
    .kite-session-label { font-size: 9px; color: rgba(120,170,220,0.55); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 3px; }
    .kite-session-id { font-family: monospace; font-size: 10px; color: rgba(180,210,255,0.7); }
    .kite-session-limits { display: flex; flex-direction: column; gap: 2px; align-items: flex-end; }
    .kite-limit { font-size: 9px; color: rgba(120,170,220,0.60); background: rgba(30,80,160,0.20); border-radius: 4px; padding: 2px 6px; }
    .kite-demo-section { margin-bottom: 14px; }
    .kite-demo-title { font-size: 11px; color: #7BC4FF; letter-spacing: 0.06em; margin-bottom: 4px; font-weight: 600; }
    .kite-demo-desc { font-size: 10px; color: rgba(120,170,220,0.60); margin-bottom: 10px; }
    .kite-city-row { display: flex; gap: 8px; margin-bottom: 10px; }
    .kite-select {
      flex: 1; background: rgba(10,20,50,0.80); border: 1px solid rgba(99,179,255,0.25);
      color: #B0D4FF; font-size: 12px; padding: 7px 10px; border-radius: 7px; outline: none;
    }
    .kite-pay-btn {
      display: flex; align-items: center; gap: 6px;
      background: linear-gradient(135deg, #1a4080, #0d2d6e);
      border: 1px solid rgba(99,179,255,0.40); color: #7BC4FF;
      font-size: 12px; font-weight: 600; padding: 7px 16px; border-radius: 7px;
      cursor: pointer; transition: all 0.2s; letter-spacing: 0.04em;
    }
    .kite-pay-btn:hover { background: linear-gradient(135deg, #2050a0, #1a3d8a); border-color: rgba(99,179,255,0.70); color: #A8D8FF; }
    .kite-pay-btn:active { transform: scale(0.97); }
    .kite-pay-btn.loading { opacity: 0.6; pointer-events: none; }
    .kite-pay-icon { font-size: 14px; }
    .kite-tx-log {
      background: rgba(5,10,25,0.70); border: 1px solid rgba(99,179,255,0.12);
      border-radius: 7px; padding: 8px 10px; min-height: 52px; max-height: 140px; overflow-y: auto;
    }
    .kite-tx-empty { font-size: 11px; color: rgba(120,170,220,0.35); text-align: center; padding: 8px 0; }
    .kite-tx-entry {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 5px 0; border-bottom: 1px solid rgba(99,179,255,0.06); font-size: 10px;
    }
    .kite-tx-entry:last-child { border-bottom: none; }
    .kite-tx-status { font-size: 13px; flex-shrink: 0; margin-top: 1px; }
    .kite-tx-info { flex: 1; }
    .kite-tx-label { color: #7BC4FF; margin-bottom: 1px; }
    .kite-tx-meta { color: rgba(120,170,220,0.50); font-family: monospace; font-size: 9px; }
    .kite-tx-amount { color: #4AFF8C; font-weight: 600; font-family: monospace; flex-shrink: 0; }
    .kite-weather-result {
      background: rgba(10,30,70,0.50); border: 1px solid rgba(99,179,255,0.20);
      border-radius: 10px; padding: 14px 16px; margin-bottom: 12px;
    }
    .kite-weather-city { font-size: 14px; color: #A8D8FF; font-weight: 600; margin-bottom: 8px; letter-spacing: 0.04em; }
    .kite-weather-body { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .kite-weather-item { background: rgba(20,60,130,0.25); border-radius: 6px; padding: 6px 10px; }
    .kite-weather-item-label { font-size: 9px; color: rgba(120,170,220,0.55); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 2px; }
    .kite-weather-item-val { font-size: 14px; color: #E8F4FF; font-weight: 600; }
    .kite-new-session-row { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
    .kite-new-session-btn {
      flex: 1; background: transparent; border: 1px dashed rgba(99,179,255,0.25);
      color: rgba(120,170,220,0.60); font-size: 11px; padding: 7px 12px;
      border-radius: 7px; cursor: pointer; transition: all 0.2s;
    }
    .kite-new-session-btn:hover { border-color: rgba(99,179,255,0.50); color: #7BC4FF; }
    .kite-dash-link { font-size: 10px; color: rgba(120,170,220,0.45); text-decoration: none; white-space: nowrap; transition: color 0.2s; }
    .kite-dash-link:hover { color: #7BC4FF; }

    /* ============================================
       BUDGET SETUP MODAL
       ============================================ */
    #budget-modal {
      display: none; position: fixed; inset: 0;
      background: rgba(0,0,0,0.88); backdrop-filter: blur(14px);
      z-index: 600; align-items: center; justify-content: center;
    }
    #budget-modal.active { display: flex; }
    .budget-card {
      background: var(--surface2); border: 1px solid var(--gold-dim);
      border-radius: 16px; padding: 36px 40px; max-width: 420px; width: 90%;
      box-shadow: 0 0 60px rgba(201,168,76,0.15);
    }
    .budget-zukku-row { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
    .budget-zukku-icon { font-size: 38px; }
    .budget-zukku-speech {
      background: rgba(201,168,76,0.08); border: 1px solid var(--gold-dim);
      border-radius: 10px 10px 10px 2px; padding: 10px 14px;
      font-size: 13px; font-weight: 100; line-height: 1.8; color: var(--white); flex: 1;
    }
    .budget-presets { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
    .budget-preset-btn {
      background: var(--surface3); border: 1px solid var(--border);
      color: var(--white-dim); padding: 8px 16px; border-radius: 20px;
      font-family: 'Noto Sans JP', sans-serif; font-size: 12px;
      cursor: pointer; transition: all 0.2s;
    }
    .budget-preset-btn:hover, .budget-preset-btn.selected {
      border-color: var(--gold); color: var(--gold);
      background: rgba(201,168,76,0.08);
    }
    .budget-custom-row { display: flex; gap: 8px; align-items: center; margin-bottom: 20px; }
    .budget-custom-input {
      flex: 1; background: var(--surface3); border: 1px solid var(--border);
      color: var(--white); padding: 10px 14px; font-size: 14px;
      border-radius: 8px; outline: none; font-family: 'Noto Sans JP', sans-serif;
    }
    .budget-custom-input:focus { border-color: var(--gold); }
    .budget-unit { font-size: 12px; color: var(--white-dim); white-space: nowrap; }
    .budget-session-info {
      background: rgba(30,80,160,0.12); border: 1px solid rgba(99,179,255,0.15);
      border-radius: 8px; padding: 10px 14px; margin-bottom: 20px;
      font-size: 11px; color: rgba(120,170,220,0.7); line-height: 1.7;
    }
    .budget-submit-btn {
      width: 100%; background: linear-gradient(135deg, var(--gold), var(--gold-light));
      color: #000; border: none; padding: 14px; border-radius: 28px;
      font-family: 'Noto Sans JP', sans-serif; font-weight: 400;
      font-size: 13px; letter-spacing: 0.15em; cursor: pointer; transition: all 0.3s;
    }
    .budget-submit-btn:hover { box-shadow: 0 0 32px rgba(201,168,76,0.4); }

    /* ============================================
       AGENT-TO-AGENT CONCEPT PANEL
       ============================================ */
    .a2a-panel {
      background: linear-gradient(135deg, #0d1a0a 0%, #0f1f0d 60%, #091408 100%);
      border: 1px solid rgba(74,255,140,0.25);
      border-radius: 14px; padding: 22px 24px; margin-bottom: 22px;
      box-shadow: 0 0 28px rgba(30,180,80,0.08);
    }
    .a2a-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
    .a2a-icon { font-size: 20px; }
    .a2a-title { font-size: 13px; color: #6ee06e; letter-spacing: 0.06em; font-weight: 600; flex: 1; }
    .a2a-badge {
      font-size: 9px; color: #4AFF8C; background: rgba(74,255,140,0.10);
      border: 1px solid rgba(74,255,140,0.25); border-radius: 20px;
      padding: 2px 10px; letter-spacing: 0.05em;
    }
    .a2a-flow {
      display: flex; align-items: stretch; gap: 0;
      margin-bottom: 16px; overflow-x: auto; padding-bottom: 4px;
    }
    .a2a-node {
      flex: 1; min-width: 90px; background: rgba(20,50,20,0.40);
      border: 1px solid rgba(74,255,140,0.18); border-radius: 10px;
      padding: 12px 8px; text-align: center;
    }
    .a2a-node-icon { font-size: 22px; margin-bottom: 5px; }
    .a2a-node-label { font-size: 10px; color: rgba(160,230,160,0.80); line-height: 1.4; }
    .a2a-node-sub { font-size: 8px; color: rgba(100,180,100,0.50); margin-top: 3px; }
    .a2a-arrow {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; padding: 0 5px; gap: 2px; flex-shrink: 0;
    }
    .a2a-arrow-line { color: rgba(74,255,140,0.50); font-size: 14px; }
    .a2a-arrow-label { font-size: 8px; color: rgba(74,255,140,0.40); white-space: nowrap; }
    .a2a-log {
      background: rgba(5,15,5,0.70); border: 1px solid rgba(74,255,140,0.10);
      border-radius: 7px; padding: 8px 12px; max-height: 130px; overflow-y: auto;
      font-size: 10px; font-family: monospace;
    }
    .a2a-log-line { color: rgba(120,210,120,0.70); padding: 2px 0; border-bottom: 1px solid rgba(74,255,140,0.05); }
    .a2a-log-line:last-child { border-bottom: none; }
    .a2a-log-line.highlight { color: #4AFF8C; }
    .a2a-log-line.payment { color: #FFD700; }
    .a2a-simulate-btn {
      width: 100%; background: transparent;
      border: 1px solid rgba(74,255,140,0.30); color: #6ee06e;
      padding: 9px; border-radius: 8px; font-size: 12px;
      cursor: pointer; transition: all 0.2s; margin-top: 12px;
      font-family: 'Noto Sans JP', sans-serif; letter-spacing: 0.05em;
    }
    .a2a-simulate-btn:hover { background: rgba(74,255,140,0.08); border-color: rgba(74,255,140,0.60); }
    .a2a-simulate-btn:disabled { opacity: 0.4; pointer-events: none; }

    /* LOADING */
    #loading-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.82); backdrop-filter: blur(10px); z-index: 500; align-items: center; justify-content: center; flex-direction: column; gap: 20px; }
    #loading-overlay.active { display: flex; }
    .spinner { width: 36px; height: 36px; border: 1px solid var(--border); border-top-color: var(--gold); border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to{transform:rotate(360deg)} }
    .loading-text { font-size: 11px; font-weight: 100; color: var(--gold); letter-spacing: 0.25em; text-transform: uppercase; }

    /* TOAST */
    #toast { position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%) translateY(80px); background: var(--surface3); border: 1px solid var(--gold-dim); color: var(--white); padding: 11px 24px; font-size: 13px; font-weight: 200; transition: transform 0.4s; z-index: 1000; white-space: nowrap; border-radius: 22px; }
    #toast.show { transform: translateX(-50%) translateY(0); }
    .mock-badge { font-size: 8px; background: rgba(255,100,0,0.1); border: 1px solid rgba(255,100,0,0.2); color: rgba(255,140,0,0.7); padding: 1px 6px; letter-spacing: 0.1em; border-radius: 7px; margin-left: 6px; }
    ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-track { background: var(--black); } ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
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

  <!-- DEMO FLOW STEPS -->
  <div class="demo-steps">
    <div class="demo-step active" id="step1">
      <div class="step-num">1</div>
      <div class="step-label">AIが体験を<br>提案</div>
    </div>
    <div class="step-arrow">›</div>
    <div class="demo-step" id="step2">
      <div class="step-num">2</div>
      <div class="step-label">承認して<br>購入</div>
    </div>
    <div class="step-arrow">›</div>
    <div class="demo-step" id="step3">
      <div class="step-num">3</div>
      <div class="step-label">ズックが<br>自動購入</div>
    </div>
  </div>

  <!-- ZUKKU BALL VOICE SECTION -->
  <section id="voice-section">
    <div class="ball-stage" id="ball-stage" onclick="toggleListening()">
      <div class="ball-aura"></div>
      <div class="ball-aura"></div>
      <div class="ball-aura"></div>

      <!--  ZUKKU v6 — 実物写真完全準拠（耳・翼・頭頂パネル強化）  -->
      <svg id="zukku-ball" viewBox="0 0 220 320" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <!-- ウォームホワイト（ボディ・頭部） -->
          <radialGradient id="bodyGrad" cx="33%" cy="24%" r="76%">
            <stop offset="0%"   stop-color="#FAFAF8"/>
            <stop offset="38%"  stop-color="#EEECE8"/>
            <stop offset="72%"  stop-color="#D9D5CE"/>
            <stop offset="100%" stop-color="#C2BEB6"/>
          </radialGradient>
          <!-- 赤（耳・翼・頭頂パネル） -->
          <radialGradient id="redGrad" cx="28%" cy="20%" r="78%">
            <stop offset="0%"   stop-color="#FF7060"/>
            <stop offset="45%"  stop-color="#D63520"/>
            <stop offset="100%" stop-color="#8C1A0C"/>
          </radialGradient>
          <!-- 赤（暗面・影） -->
          <linearGradient id="redShadow" x1="0%" y1="0%" x2="60%" y2="100%">
            <stop offset="0%"   stop-color="#A82818"/>
            <stop offset="100%" stop-color="#620E04"/>
          </linearGradient>
          <!-- 目枠（黒） -->
          <radialGradient id="eyeBlack" cx="38%" cy="32%" r="66%">
            <stop offset="0%"   stop-color="#1E1A18"/>
            <stop offset="100%" stop-color="#060402"/>
          </radialGradient>
          <!-- カメラ外枠グレー -->
          <radialGradient id="camOuter" cx="36%" cy="28%" r="68%">
            <stop offset="0%"   stop-color="#D0CCC8"/>
            <stop offset="58%"  stop-color="#A8A4A0"/>
            <stop offset="100%" stop-color="#7A7672"/>
          </radialGradient>
          <!-- LED 青（デフォルト） -->
          <radialGradient id="ledBlue" cx="34%" cy="28%" r="70%">
            <stop offset="0%"   stop-color="#C0F4FF"/>
            <stop offset="42%"  stop-color="#22B8F8"/>
            <stop offset="100%" stop-color="#0450C0"/>
          </radialGradient>
          <!-- LED 緑（idle） -->
          <radialGradient id="ledGreen" cx="34%" cy="28%" r="70%">
            <stop offset="0%"   stop-color="#A0FFB8"/>
            <stop offset="42%"  stop-color="#18D050"/>
            <stop offset="100%" stop-color="#067020"/>
          </radialGradient>
          <!-- LED ゴールド（speaking） -->
          <radialGradient id="ledGold" cx="34%" cy="28%" r="70%">
            <stop offset="0%"   stop-color="#FFF8A8"/>
            <stop offset="42%"  stop-color="#E8C038"/>
            <stop offset="100%" stop-color="#A06808"/>
          </radialGradient>
          <!-- 落ち影 -->
          <radialGradient id="dropShadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stop-color="rgba(0,0,0,0.65)"/>
            <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
          </radialGradient>
          <!-- 翼グラデ（前面ハイライト） -->
          <linearGradient id="wingFront" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stop-color="#FF7860"/>
            <stop offset="50%"  stop-color="#D43520"/>
            <stop offset="100%" stop-color="#7A1208"/>
          </linearGradient>

          <!-- フィルター -->
          <filter id="bodyShad" x="-14%" y="-6%" width="128%" height="124%">
            <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="rgba(0,0,0,0.55)"/>
          </filter>
          <filter id="wingShad" x="-20%" y="-8%" width="140%" height="120%">
            <feDropShadow dx="4" dy="7" stdDeviation="8" flood-color="rgba(0,0,0,0.45)"/>
          </filter>
          <filter id="earShad" x="-30%" y="-20%" width="160%" height="150%">
            <feDropShadow dx="2" dy="4" stdDeviation="5" flood-color="rgba(0,0,0,0.40)"/>
          </filter>
          <!-- 目グロウ idle/thinking -->
          <filter id="eyeGlowWhite" x="-65%" y="-65%" width="230%" height="230%">
            <feGaussianBlur stdDeviation="2.5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <!-- 目グロウ listening -->
          <filter id="eyeGlowGold" x="-85%" y="-85%" width="270%" height="270%">
            <feGaussianBlur stdDeviation="5.5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <!-- 目グロウ speaking -->
          <filter id="eyeGlowBright" x="-110%" y="-110%" width="320%" height="320%">
            <feGaussianBlur stdDeviation="9" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <!-- LED グロウ -->
          <filter id="ledGlow" x="-52%" y="-52%" width="204%" height="204%">
            <feGaussianBlur stdDeviation="6" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        <!-- ===== 落ち影 ===== -->
        <ellipse cx="110" cy="316" rx="62" ry="8" fill="url(#dropShadow)"/>

        <!-- ============================================================
             翼 — 実物: 胴体幅より大きく張り出す板状の翼
             根元は肩位置（y≈178）から始まり、下端（y≈272）まで伸びる
             外側へ大きくはみ出す（左: x=0まで、右: x=220まで）
        ============================================================ -->
        <!-- 左翼 -->
        <g filter="url(#wingShad)">
          <!-- 翼本体 -->
          <path d="M 42 176
                   C 28 172  10 172   2 182
                   C -4 192  -2 214   6 238
                   C 12 254  24 264  36 264
                   C 46 264  52 256  50 244
                   C 48 230  44 210  42 176 Z"
                fill="url(#wingFront)"/>
          <!-- 翼内側（暗面） -->
          <path d="M 40 182
                   C 28 178  14 178   8 188
                   C 4 196   6 216  12 236
                   C 18 250  28 260  38 258
                   C 44 256  48 248  46 238
                   C 44 224  40 202  40 182 Z"
                fill="url(#redShadow)" opacity="0.50"/>
          <!-- ハイライトライン（翼の前縁） -->
          <path d="M 16 184 C 8 192 4 210 8 232 C 12 248 22 258 32 260"
                stroke="rgba(255,180,160,0.35)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
          <!-- 翼の縦方向テクスチャ溝 -->
          <path d="M 28 188 C 24 202 22 222 26 244"
                stroke="rgba(60,8,2,0.28)" stroke-width="1.2" fill="none"/>
          <path d="M 36 182 C 34 198 32 220 34 248"
                stroke="rgba(60,8,2,0.20)" stroke-width="1.0" fill="none"/>
        </g>
        <!-- 右翼 -->
        <g filter="url(#wingShad)">
          <path d="M 178 176
                   C 192 172  210 172  218 182
                   C 224 192  222 214  214 238
                   C 208 254  196 264  184 264
                   C 174 264  168 256  170 244
                   C 172 230  176 210  178 176 Z"
                fill="url(#wingFront)"/>
          <path d="M 180 182
                   C 192 178  206 178  212 188
                   C 216 196  214 216  208 236
                   C 202 250  192 260  182 258
                   C 176 256  172 248  174 238
                   C 176 224  180 202  180 182 Z"
                fill="url(#redShadow)" opacity="0.50"/>
          <path d="M 204 184 C 212 192 216 210 212 232 C 208 248 198 258 188 260"
                stroke="rgba(255,180,160,0.35)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
          <path d="M 192 188 C 196 202 198 222 194 244"
                stroke="rgba(60,8,2,0.28)" stroke-width="1.2" fill="none"/>
          <path d="M 184 182 C 186 198 188 220 186 248"
                stroke="rgba(60,8,2,0.20)" stroke-width="1.0" fill="none"/>
        </g>

        <!-- ============================================================
             ボディ — 縦長の丸みある円筒
             実物: 頭部と同程度か少し広く、高さは頭部より長い
        ============================================================ -->
        <rect x="42" y="170" width="136" height="122" rx="22" ry="22"
              fill="url(#bodyGrad)" filter="url(#bodyShad)"/>
        <!-- ボディ底部の台座（丸みある台形） -->
        <rect x="36" y="266" width="148" height="28" rx="16" ry="16"
              fill="#C8C5C1"/>
        <rect x="36" y="266" width="148" height="7" rx="3"
              fill="rgba(0,0,0,0.12)"/>

        <!-- ============================================================
             頭部 — 横に広い半球状、ボディよりやや広め
             実物: 横幅≈ボディ幅、縦高さはやや短め（横長寄り）
        ============================================================ -->
        <ellipse cx="110" cy="118" rx="76" ry="68"
                 fill="url(#bodyGrad)" filter="url(#bodyShad)"/>
        <!-- 頭部左上ハイライト（光沢感） -->
        <ellipse cx="83" cy="86" rx="34" ry="23"
                 fill="rgba(255,255,255,0.28)" transform="rotate(-18,83,86)"/>
        <ellipse cx="74" cy="78" rx="18" ry="12"
                 fill="rgba(255,255,255,0.16)" transform="rotate(-18,74,78)"/>

        <!-- 頭とボディの接合部（黒い帯） -->
        <rect x="42" y="170" width="136" height="9" rx="0"
              fill="#141210"/>
        <!-- 帯上縁を滑らかに -->
        <rect x="42" y="170" width="136" height="4" rx="2"
              fill="rgba(0,0,0,0)"/>

        <!-- ============================================================
             耳（頭頂突起） — 実物: 存在感のある円錐状三角突起
             根元幅約34px、高さ約46px、やや外側に開く
             色: 鮮やかな赤、先端は尖り気味
        ============================================================ -->
        <!-- 左耳 本体 -->
        <g filter="url(#earShad)">
          <path d="M 58 70  L 40 22  L 84 44  Z"
                fill="url(#redGrad)"/>
          <!-- 左耳 内側面（暗め） -->
          <path d="M 60 68  L 46 26  L 82 46  Z"
                fill="url(#redShadow)" opacity="0.62"/>
          <!-- 左耳 ハイライト縁 -->
          <path d="M 44 26 L 62 68" stroke="rgba(255,160,140,0.38)" stroke-width="2" fill="none" stroke-linecap="round"/>
          <!-- 左耳 内部テクスチャ溝 -->
          <path d="M 50 32 L 78 46" stroke="rgba(40,4,0,0.42)" stroke-width="1.4" fill="none"/>
          <path d="M 47 42 L 74 52" stroke="rgba(40,4,0,0.28)" stroke-width="1.0" fill="none"/>
          <path d="M 46 52 L 70 59" stroke="rgba(40,4,0,0.18)" stroke-width="0.8" fill="none"/>
        </g>
        <!-- 右耳 本体 -->
        <g filter="url(#earShad)">
          <path d="M 162 70  L 180 22  L 136 44  Z"
                fill="url(#redGrad)"/>
          <!-- 右耳 内側面 -->
          <path d="M 160 68  L 174 26  L 138 46  Z"
                fill="url(#redShadow)" opacity="0.62"/>
          <!-- 右耳 ハイライト縁 -->
          <path d="M 176 26 L 158 68" stroke="rgba(255,160,140,0.38)" stroke-width="2" fill="none" stroke-linecap="round"/>
          <!-- 右耳 内部テクスチャ溝 -->
          <path d="M 170 32 L 142 46" stroke="rgba(40,4,0,0.42)" stroke-width="1.4" fill="none"/>
          <path d="M 173 42 L 146 52" stroke="rgba(40,4,0,0.28)" stroke-width="1.0" fill="none"/>
          <path d="M 174 52 L 150 59" stroke="rgba(40,4,0,0.18)" stroke-width="0.8" fill="none"/>
        </g>

        <!-- ============================================================
             頭頂パネル — 涙滴/盾形の赤いパネル、額〜頭頂
             実物: 額から頭頂まで広がる盾形、表面に横溝3本
        ============================================================ -->
        <!-- パネル本体（盾形） -->
        <path d="M 64 70
                 C 66 56  74 42  110 36
                 C 146 42  154 56  156 70
                 C 148 64  132 60  110 59
                 C 88 60   72 64  64 70 Z"
              fill="url(#redGrad)" opacity="0.95"/>
        <!-- パネル中央の縦方向リブ -->
        <path d="M 110 38 L 110 58" stroke="rgba(40,4,0,0.30)" stroke-width="1.5" fill="none"/>
        <!-- 横方向の溝3本（上から） -->
        <path d="M 86 50 Q 110 45 134 50" stroke="rgba(40,4,0,0.38)" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        <path d="M 90 43 Q 110 38 130 43" stroke="rgba(40,4,0,0.28)" stroke-width="1.2" fill="none" stroke-linecap="round"/>
        <!-- パネル上端ハイライト -->
        <path d="M 94 40 Q 110 36 126 40" stroke="rgba(255,140,120,0.32)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        <!-- 中央インジケーターLED -->
        <circle cx="110" cy="56" r="5.5" fill="#8A1408" opacity="0.7"/>
        <circle cx="110" cy="55" r="3"   fill="rgba(255,110,90,0.40)"/>

        <!-- ============================================================
             目 — 黒い外枠 → 白/薄紫LEDリング → 黒瞳
             実物: 頭幅の約1/6サイズ、目間隔はほぼ1個分
        ============================================================ -->
        <!-- 左目 外枠（深い黒） -->
        <circle cx="84"  cy="120" r="30" fill="url(#eyeBlack)"/>
        <!-- 右目 外枠 -->
        <circle cx="136" cy="120" r="30" fill="url(#eyeBlack)"/>

        <!-- 左目 LEDリング（JSでstroke変更） -->
        <circle id="eye-l" cx="84"  cy="120" r="22"
                fill="none" stroke="#E0DAF4" stroke-width="6.5"
                filter="url(#eyeGlowWhite)"/>
        <!-- 右目 LEDリング -->
        <circle id="eye-r" cx="136" cy="120" r="22"
                fill="none" stroke="#E0DAF4" stroke-width="6.5"
                filter="url(#eyeGlowWhite)"/>

        <!-- 左目 瞳（黒・小さめ） -->
        <circle cx="84"  cy="120" r="12" fill="#040302"/>
        <!-- 右目 瞳 -->
        <circle cx="136" cy="120" r="12" fill="#040302"/>

        <!-- 目のガラス反射ハイライト -->
        <circle cx="77"  cy="113" r="4"   fill="rgba(255,255,255,0.55)"/>
        <circle cx="129" cy="113" r="4"   fill="rgba(255,255,255,0.55)"/>
        <circle cx="75"  cy="111" r="2"   fill="rgba(255,255,255,0.80)"/>
        <circle cx="127" cy="111" r="2"   fill="rgba(255,255,255,0.80)"/>

        <!-- JS互換ダミー -->
        <circle id="pupil-l" cx="84"  cy="120" r="0" fill="transparent"/>
        <circle id="pupil-r" cx="136" cy="120" r="0" fill="transparent"/>

        <!-- ============================================================
             くちばし — 黄色い菱形、両目の下・顔面中央
             実物: 鮮やかな黄、コンパクトなシャープな菱形
        ============================================================ -->
        <path d="M 110 136  L 100 146  L 110 155  L 120 146 Z" fill="#F2C412"/>
        <!-- 上半分ハイライト -->
        <path d="M 110 136  L 100 146  L 110 151 Z" fill="rgba(255,248,140,0.68)"/>
        <!-- 下半分シャドウ -->
        <path d="M 110 155  L 100 146  L 106 146  Z" fill="rgba(0,0,0,0.18)"/>
        <!-- くちばし縁取り -->
        <path d="M 110 136  L 100 146  L 110 155  L 120 146 Z"
              fill="none" stroke="rgba(160,96,0,0.30)" stroke-width="0.8"/>

        <!-- ============================================================
             カメラユニット — ボディ上部1/3中央のグレー円形
             実物: 外枠グレー、内側ダーク枠、中央黒レンズ、少し突出
        ============================================================ -->
        <!-- カメラ外枠（グレー） -->
        <circle cx="110" cy="206" r="27" fill="url(#camOuter)"/>
        <circle cx="110" cy="206" r="27" fill="none"
                stroke="rgba(255,255,255,0.18)" stroke-width="1.5"/>
        <!-- 外枠に微妙な段差感 -->
        <circle cx="110" cy="206" r="24" fill="none"
                stroke="rgba(0,0,0,0.14)" stroke-width="2"/>
        <!-- 内側ベゼル（ダーク） -->
        <circle cx="110" cy="206" r="20" fill="#1C1A18"/>
        <!-- レンズ本体 -->
        <circle cx="110" cy="206" r="14" fill="#040302"/>
        <!-- レンズ反射 -->
        <circle cx="103" cy="199" r="4"   fill="rgba(255,255,255,0.18)"/>
        <circle cx="101" cy="197" r="2"   fill="rgba(255,255,255,0.32)"/>
        <!-- カメラ上部インジケーターLED（小さな赤点） -->
        <circle cx="110" cy="181" r="3.5" fill="#8A8886"/>
        <circle cx="110" cy="181" r="2"   fill="#C8C6C4"/>

        <!-- ============================================================
             LEDボタン — ボディ下部中央の大きな発光ボタン
             実物: 胴体幅の1/3程度、青く発光、ベゼル付き円盤
        ============================================================ -->
        <!-- ベゼル外枠（グレー） -->
        <circle cx="110" cy="256" r="26"
                fill="#D4D0CC" stroke="rgba(0,0,0,0.18)" stroke-width="1.5"/>
        <!-- ベゼル内枠（少し暗く） -->
        <circle cx="110" cy="256" r="23"
                fill="#C0BDBA"/>
        <!-- LED発光部 -->
        <circle id="belly-glow" cx="110" cy="256" r="19"
                fill="url(#ledBlue)" filter="url(#ledGlow)"/>
        <!-- LEDハイライト -->
        <ellipse cx="104" cy="248" rx="8" ry="5.5"
                 fill="rgba(255,255,255,0.42)" transform="rotate(-12,104,248)"/>

        <!-- ============================================================
             足 — 黒い幅広ブロック×2、ボディ最下部
             実物: 短く幅広、左右に離れて配置
        ============================================================ -->
        <!-- 左足 -->
        <rect x="50"  y="280" width="36" height="20" rx="10" ry="10" fill="#141210"/>
        <!-- 右足 -->
        <rect x="134" y="280" width="36" height="20" rx="10" ry="10" fill="#141210"/>
        <!-- 足ハイライト -->
        <rect x="55"  y="283" width="16" height="4" rx="2" fill="rgba(255,255,255,0.12)"/>
        <rect x="139" y="283" width="16" height="4" rx="2" fill="rgba(255,255,255,0.12)"/>
      </svg>

      <div class="ball-label">ズック</div>
    </div>

    <!-- WAVEFORM -->
    <div class="waveform-container" id="waveform">
      ${Array.from({ length: 18 }, (_, i) => `<div class="wave-bar" id="bar-${i}" style="--max-h:${12 + Math.random() * 28}px"></div>`).join('')}
    </div>

    <!-- TRANSCRIPT -->
    <div class="transcript-area">
      <div class="transcript-user" id="user-transcript"></div>
      <div class="transcript-agent">
        <span id="agent-text">ホホウ、いらっしゃいませ。わたくしズックと申します。どんな旅や体験をお探しでしょうか？</span>
      </div>
    </div>

    <!-- CONTROLS -->
    <div class="voice-controls">
      <button class="mic-btn" id="mic-btn" onclick="toggleListening()" title="マイクをオン/オフ">🎙</button>
      <div class="quick-actions">
        <button class="quick-action-btn" onclick="sendQuickAction('温泉と秘境の体験を探して')">🛁 温泉体験</button>
        <button class="quick-action-btn" onclick="sendQuickAction('自然の中でのアクティビティを見せて')">🌿 自然体験</button>
        <button class="quick-action-btn" onclick="sendQuickAction('食と文化の体験を提案して')">🍶 食文化</button>
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
    <div id="wallet-panel" class="panel">
      <div class="panel-title">◈ ウォレット接続済み <span class="mock-badge">Demo</span></div>
      <div class="wallet-info">
        <div><div class="balance-label">ETH</div><div class="balance-value" id="bal-eth">—</div></div>
        <div><div class="balance-label">USDC</div><div class="balance-value" id="bal-usdc">—</div></div>
        <div><div class="balance-label">USDT</div><div class="balance-value" id="bal-usdt">—</div></div>
      </div>
      <div style="font-size:11px;color:var(--white-dim)">アドレス: <span id="wallet-address" style="font-family:monospace;color:var(--gold)">—</span></div>
    </div>

    <!-- AGENT RULES -->
    <div id="agent-rules-panel" class="panel">
      <div class="panel-title">◈ エージェント自律ルール <span class="mock-badge">Kite Rules</span></div>
      <div class="rules-grid">
        <div><div class="rule-label">自動購入上限 (円)</div><input class="rule-input" type="number" id="rule-max-spend" value="5000"></div>
        <div><div class="rule-label">要承認しきい値 (円)</div><input class="rule-input" type="number" id="rule-require-approval" value="5000"></div>
        <div><div class="rule-label">優先スタイル</div><input class="rule-input" type="text" id="rule-style" value="秘境, 温泉, 古民家, 一棟貸し"></div>
        <div><div class="rule-label">除外カテゴリ</div><input class="rule-input" type="text" id="rule-blacklist" value="チェーンホテル, 大型リゾート"></div>
        <div><div class="rule-label">自動購入</div>
          <div style="display:flex;align-items:center;gap:9px;margin-top:5px">
            <label class="toggle"><input type="checkbox" id="rule-auto-book" checked><span class="toggle-slider"></span></label>
            <span style="font-size:11px;color:var(--white-dim)">承認後ズックが自動手配</span>
          </div>
        </div>
        <div><div class="rule-label">購入通知</div>
          <div style="display:flex;align-items:center;gap:9px;margin-top:5px">
            <label class="toggle"><input type="checkbox" id="rule-notify" checked><span class="toggle-slider"></span></label>
            <span style="font-size:11px;color:var(--white-dim)">決済時に通知</span>
          </div>
        </div>
      </div>
      <div style="margin-top:18px;display:flex;gap:9px;justify-content:flex-end">
        <button class="btn btn-outline" onclick="document.getElementById('agent-rules-panel').style.display='none'">閉じる</button>
        <button class="btn btn-gold" onclick="saveAgentRules()">保存</button>
      </div>
    </div>

    <!-- STEP 1: 体験一覧 -->
    <div id="experience-section">
      <div class="section-header">
        <div class="panel-title">◈ ズックが厳選した体験</div>
        <div style="font-size:10px;color:var(--white-dim)">現地主人と調整済み</div>
      </div>
      <div class="exp-grid" id="exp-grid"></div>
    </div>

    <!-- STEP 2: 承認購入 -->
    <div id="authorize-section">
      <div class="authorize-title">承認のご準備をお願いします</div>
      <div class="authorize-amount" id="authorize-amount-display">¥0<span>円</span></div>
      <div class="authorize-desc" id="authorize-desc">あなたのウォレットの権限を確認いたしました。<br>ご承認をいただければ、このまま体験を予約します。<br>以降の操作はすべてズックが代行いたします。</div>
      <button class="authorize-btn" id="authorize-btn" onclick="authorizePayment()">✦ Authorize &amp; Sign</button>
      <div class="webauthn-hint">🔐 Protected by WebAuthn Passkey</div>
    </div>

    <!-- TX FEED -->
    <div id="tx-feed" class="panel">
      <div class="panel-title">◈ トランザクション</div>
      <div id="tx-list"></div>
    </div>

    <!-- STEP 3: AI自動購入 -->
    <div id="auto-purchase-section">
      <div class="auto-purchase-header">
        <div class="panel-title" style="margin-bottom:0">◈ ズックが自動購入</div>
        <span class="auto-badge">AUTO PURCHASE</span>
        <span style="font-size:10px;color:var(--white-dim)">ルール内で自動手配中</span>
      </div>
      <div class="items-grid" id="auto-items-grid"></div>
      <div class="auto-total-row">
        <div class="auto-total-label">自動購入合計</div>
        <div class="auto-total-amount" id="auto-total-display">$0</div>
      </div>
      <div id="pending-approve-items" class="pending-approve-section" style="display:none">
        <div class="pending-title">◈ 承認が必要なアイテム <span class="pending-badge">要承認</span></div>
        <div id="pending-items-list"></div>
      </div>
    </div>

    <!-- BOOKING COMPLETE -->
    <div id="booking-complete">
      <div class="complete-icon">✦</div>
      <div class="complete-title">すべての手配が完了しました</div>
      <div class="complete-booking-id">確認番号</div>
      <div class="complete-id-value" id="booking-id-display">—</div>
      <div class="complete-summary" id="booking-summary">ズックがすべての手配を完了いたしました。</div>
    </div>

    <!-- AGENT-TO-AGENT CONCEPT PANEL -->
    <div class="a2a-panel">
      <div class="a2a-header">
        <span class="a2a-icon">⟳</span>
        <span class="a2a-title">Agent-to-Agent Payment — Kite x402</span>
        <span class="a2a-badge">CONCEPT DEMO</span>
      </div>
      <div class="a2a-flow">
        <div class="a2a-node">
          <div class="a2a-node-icon">🦉</div>
          <div class="a2a-node-label">ZUKKUエージェント</div>
          <div class="a2a-node-sub">Kite Passport保持</div>
        </div>
        <div class="a2a-arrow">
          <div class="a2a-arrow-line">→</div>
          <div class="a2a-arrow-label">交渉・条件確認</div>
        </div>
        <div class="a2a-node">
          <div class="a2a-node-icon">🏡</div>
          <div class="a2a-node-label">宿主エージェント</div>
          <div class="a2a-node-sub">x402 API公開</div>
        </div>
        <div class="a2a-arrow">
          <div class="a2a-arrow-line">→</div>
          <div class="a2a-arrow-label">HTTP 402 + 決済</div>
        </div>
        <div class="a2a-node">
          <div class="a2a-node-icon">⬡</div>
          <div class="a2a-node-label">Kite Passport</div>
          <div class="a2a-node-sub">USDC on Kite Chain</div>
        </div>
        <div class="a2a-arrow">
          <div class="a2a-arrow-line">→</div>
          <div class="a2a-arrow-label">確認・完了</div>
        </div>
        <div class="a2a-node">
          <div class="a2a-node-icon">✅</div>
          <div class="a2a-node-label">予約・手配完了</div>
          <div class="a2a-node-sub">ユーザー承認不要</div>
        </div>
      </div>
      <div class="a2a-log" id="a2a-log">
        <div class="a2a-log-line">[ Kite Agent Passport ] 待機中 — ▶ ボタンでA2Aシミュレーション開始</div>
      </div>
      <button class="a2a-simulate-btn" id="a2a-simulate-btn" onclick="runA2ASimulation()">
        ▶ Agent-to-Agent 交渉シミュレーションを実行
      </button>
    </div>

    <!-- KITE PASSPORT PANEL -->
    <div id="kite-panel" class="kite-panel">
      <div class="kite-panel-header">
        <div class="kite-logo-row">
          <span class="kite-icon">⬡</span>
          <span class="kite-title">Kite Agent Passport</span>
          <span class="kite-badge" id="kite-session-badge">● セッション有効</span>
        </div>
        <div class="kite-subtitle">x402プロトコルによる自律決済レイヤー</div>
      </div>

      <!-- ウォレット情報 -->
      <div class="kite-wallet-row">
        <div class="kite-wallet-info">
          <div class="kite-wallet-label">エージェントウォレット</div>
          <div class="kite-wallet-addr" id="kite-wallet-addr">0x4580...7869</div>
        </div>
        <div class="kite-balance-box">
          <div class="kite-balance-label">残高</div>
          <div class="kite-balance-val" id="kite-balance">0 USDC</div>
        </div>
      </div>

      <!-- セッション情報 -->
      <div class="kite-session-row">
        <div class="kite-session-info">
          <div class="kite-session-label">アクティブセッション</div>
          <div class="kite-session-id" id="kite-session-id">agent_session_019e1948…</div>
        </div>
        <div class="kite-session-limits">
          <span class="kite-limit">上限 $2/回</span>
          <span class="kite-limit">合計 $10</span>
        </div>
      </div>

      <!-- x402 天気情報購入デモ -->
      <div class="kite-demo-section">
        <div class="kite-demo-title">◈ x402 旅先天気情報 — Kite決済デモ</div>
        <div class="kite-demo-desc">旅先の天気情報をKite x402プロトコルで購入します（$0.01 USDC）</div>
        <div class="kite-city-row">
          <select id="kite-city-select" class="kite-select">
            <option value="Tokyo">東京</option>
            <option value="Kyoto">京都</option>
            <option value="Osaka">大阪</option>
            <option value="Sapporo">札幌</option>
            <option value="Fukuoka">福岡</option>
            <option value="Yakushima">屋久島</option>
            <option value="Shirakawa">白川郷</option>
          </select>
          <button class="kite-pay-btn" onclick="kiteWeatherPurchase()">
            <span class="kite-pay-icon">⬡</span> x402で購入
          </button>
        </div>
        <!-- 決済ログ -->
        <div class="kite-tx-log" id="kite-tx-log">
          <div class="kite-tx-empty">まだ決済履歴はありません</div>
        </div>
      </div>

      <!-- 天気結果表示 -->
      <div id="kite-weather-result" class="kite-weather-result" style="display:none">
        <div class="kite-weather-city" id="kite-weather-city">—</div>
        <div class="kite-weather-body" id="kite-weather-body"></div>
      </div>

      <!-- 新規セッション作成 -->
      <div class="kite-new-session-row">
        <button class="kite-new-session-btn" onclick="kiteCreateSession()">
          + 新しいセッションをリクエスト
        </button>
        <a href="https://agentpassport.ai/dashboard" target="_blank" class="kite-dash-link">
          ダッシュボード ↗
        </a>
      </div>
    </div>
  </main>

  <div id="loading-overlay"><div class="spinner"></div><div class="loading-text" id="loading-text">処理中...</div></div>
  <div id="toast"></div>

  <!-- BUDGET SETUP MODAL -->
  <div id="budget-modal">
    <div class="budget-card">
      <div class="budget-zukku-row">
        <div class="budget-zukku-icon">🦉</div>
        <div class="budget-zukku-speech">
          ホホウ、いらっしゃいませ！<br>
          まず、ご旅行のご予算をお聞かせください。<br>
          Kite Passportに予算を設定し、ルール内でズックが自動手配いたします。
        </div>
      </div>
      <div class="budget-presets">
        <button class="budget-preset-btn" data-amount="200" onclick="selectBudgetPreset(this)">$200</button>
        <button class="budget-preset-btn" data-amount="500" onclick="selectBudgetPreset(this)">$500</button>
        <button class="budget-preset-btn selected" data-amount="1000" onclick="selectBudgetPreset(this)">$1,000</button>
        <button class="budget-preset-btn" data-amount="2000" onclick="selectBudgetPreset(this)">$2,000</button>
        <button class="budget-preset-btn" data-amount="5000" onclick="selectBudgetPreset(this)">$5,000+</button>
      </div>
      <div class="budget-custom-row">
        <input type="number" id="budget-custom-input" class="budget-custom-input"
               placeholder="金額を入力" value="1000" min="1">
        <span class="budget-unit">USD</span>
      </div>
      <div class="budget-session-info">
        ⬡ Kite Passport セッション設定<br>
        予算上限: 入力金額 / 1回の上限: $50 / 有効期間: 24h<br>
        <span style="color:rgba(74,255,140,0.6)">※ 予算内の小額購入はズックが自動実行。大きな体験は承認をお求めします。</span>
      </div>
      <button class="budget-submit-btn" onclick="submitBudget()">
        この予算でスタート →
      </button>
    </div>
  </div>
</div>

<script>
// ===== TTS PREPROCESSING: ZUKKUは必ず「ズック」と読む =====
function preprocessTTS(text) {
  return text.replace(/ZUKKU/gi, 'ズック').replace(/ずっく/g, 'ズック')
}

// ===== EXPERIENCE ICONS =====
const EXP_ICONS = { onsen: '♨️', nature: '🌿', dining: '🍶', activity: '🎣', wellness: '🧘' }
const ITEM_ICONS = { onsen: '🛁', nature: '🏃', dining: '🍱', activity: '⛵', wellness: '🕯️' }

// ===== STATE =====
const state = {
  listening: false, speaking: false,
  walletConnected: false, walletSession: null,
  selectedExp: null, currentStep: 1,
  recognition: null, synthesis: window.speechSynthesis,
  chatHistory: [], maxHistory: 12,
  purchasedTxList: [],
}

// ===== STEP INDICATOR =====
function setStep(n) {
  state.currentStep = n
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById('step' + i)
    if (!el) continue
    el.classList.remove('active', 'done')
    if (i < n) el.classList.add('done')
    else if (i === n) el.classList.add('active')
  }
}

// ===== BALL STATE =====
// 目はfill=none + strokeのLEDリング。状態によってstroke色・filter・stroke-widthを変える
function setBallState(s) {
  const stage = document.getElementById('ball-stage')
  stage.className = 'ball-stage ' + s
  const eyeL  = document.getElementById('eye-l')
  const eyeR  = document.getElementById('eye-r')
  const belly = document.getElementById('belly-glow')
  if (s === 'listening') {
    // ゴールドLEDリング + 強グロウ
    eyeL.setAttribute('stroke', '#E8C050')
    eyeR.setAttribute('stroke', '#E8C050')
    eyeL.setAttribute('stroke-width', '5')
    eyeR.setAttribute('stroke-width', '5')
    eyeL.setAttribute('filter', 'url(#eyeGlowGold)')
    eyeR.setAttribute('filter', 'url(#eyeGlowGold)')
    belly.setAttribute('fill', '#C9A84C')
    startWaveAnimation()
  } else if (s === 'speaking') {
    // 明るいゴールドLEDリング + 最強グロウ（発話中）
    eyeL.setAttribute('stroke', '#FFF0A0')
    eyeR.setAttribute('stroke', '#FFF0A0')
    eyeL.setAttribute('stroke-width', '5.5')
    eyeR.setAttribute('stroke-width', '5.5')
    eyeL.setAttribute('filter', 'url(#eyeGlowBright)')
    eyeR.setAttribute('filter', 'url(#eyeGlowBright)')
    belly.setAttribute('fill', '#E8C96A')
  } else if (s === 'thinking') {
    // 薄い白LEDリング + 弱グロウ（考え中）
    eyeL.setAttribute('stroke', '#9090A0')
    eyeR.setAttribute('stroke', '#9090A0')
    eyeL.setAttribute('stroke-width', '3.5')
    eyeR.setAttribute('stroke-width', '3.5')
    eyeL.setAttribute('filter', 'url(#eyeGlowWhite)')
    eyeR.setAttribute('filter', 'url(#eyeGlowWhite)')
    belly.setAttribute('fill', '#666')
  } else {
    // idle：白いLEDリング + やわらかいグロウ
    eyeL.setAttribute('stroke', '#F0EBE0')
    eyeR.setAttribute('stroke', '#F0EBE0')
    eyeL.setAttribute('stroke-width', '4.5')
    eyeR.setAttribute('stroke-width', '4.5')
    eyeL.setAttribute('filter', 'url(#eyeGlowWhite)')
    eyeR.setAttribute('filter', 'url(#eyeGlowWhite)')
    belly.setAttribute('fill', '#3a8a3a')
    stopWaveAnimation()
  }
}

// ===== TTS =====
function speak(text, onEnd) {
  if (!state.synthesis) return onEnd && onEnd()
  state.synthesis.cancel()
  const ttsText = preprocessTTS(text)
  const utter = new SpeechSynthesisUtterance(ttsText)
  utter.lang = 'ja-JP'; utter.rate = 0.87; utter.pitch = 1.05; utter.volume = 1.0
  const applyVoice = () => {
    const vs = state.synthesis.getVoices()
    const jv = vs.find(v => v.lang === 'ja-JP' && v.name.includes('Google'))
      || vs.find(v => v.lang === 'ja-JP') || vs.find(v => v.lang.startsWith('ja'))
    if (jv) utter.voice = jv
  }
  applyVoice()
  setBallState('speaking'); state.speaking = true
  setAgentText(text)
  utter.onend = utter.onerror = () => { state.speaking = false; setBallState('idle'); onEnd && onEnd() }
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
  rec.onstart = () => { setBallState('listening'); startWaveAnimation() }
  rec.onend = () => {
    if (state.listening) { setBallState('idle'); stopWaveAnimation(); state.listening = false; document.getElementById('mic-btn').classList.remove('active') }
  }
  rec.onerror = () => { state.listening = false; setBallState('idle'); stopWaveAnimation() }
  return rec
}
function toggleListening() { if (state.speaking) state.synthesis.cancel(); state.listening ? stopListening() : startListening() }
function startListening() {
  if (!state.recognition) state.recognition = initRecognition()
  if (!state.recognition) { showToast('音声入力はChromeをお使いください'); return }
  state.listening = true; document.getElementById('mic-btn').classList.add('active')
  document.getElementById('user-transcript').textContent = ''
  try { state.recognition.start() } catch(e) {}
}
function stopListening() {
  state.listening = false; document.getElementById('mic-btn').classList.remove('active')
  stopWaveAnimation(); if (state.recognition) try { state.recognition.stop() } catch(e) {}
  setBallState('idle')
}
function sendQuickAction(text) { document.getElementById('user-transcript').textContent = '「 ' + text + ' 」'; sendToZukku(text) }

// ===== CORE: Send to ZUKKU =====
async function sendToZukku(message) {
  if (!message.trim()) return
  setBallState('thinking')
  state.chatHistory.push({ role: 'user', content: message })
  if (state.chatHistory.length > state.maxHistory) state.chatHistory = state.chatHistory.slice(-state.maxHistory)
  addChatMsg('user', message)
  try {
    const res = await fetch('/api/chat', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ message, history: state.chatHistory.slice(0,-1) }) })
    const data = await res.json()
    if (data.success) {
      const reply = data.reply || 'ホホウ、少々お待ちください。'
      state.chatHistory.push({ role: 'assistant', content: reply })
      if (state.chatHistory.length > state.maxHistory) state.chatHistory = state.chatHistory.slice(-state.maxHistory)
      addChatMsg('agent', reply)
      if (data.action) speak(reply, () => handleAction(data.action)); else speak(reply)
    }
  } catch(e) {
    const fb = localFallback(message)
    state.chatHistory.push({ role: 'assistant', content: fb.text })
    addChatMsg('agent', fb.text)
    if (fb.action) speak(fb.text, () => handleAction(fb.action)); else speak(fb.text)
  }
}
function handleAction(action) {
  switch(action) {
    case 'search_ryokan': searchExperiences(); break
    case 'connect_wallet': connectWallet(); break
    case 'show_authorize': showAuthorizeSection(); break
    case 'open_rules': openAgentRules(); break
  }
}
function localFallback(msg) {
  const m = msg.toLowerCase()
  if (m.includes('宿') || m.includes('温泉') || m.includes('旅') || m.includes('体験') || m.includes('探') || m.includes('秘境') || m.includes('アクティビティ') || m.includes('食'))
    return { text: 'ホホウ！わたくしズックが全力でお調べいたします。素晴らしい体験をご覧ください。', action: 'search_ryokan' }
  if (m.includes('ウォレット') || m.includes('接続')) return { text: 'おなかのボタンがピカッと光りました。ウォレットを接続いたします！', action: 'connect_wallet' }
  if (m.includes('予約') || m.includes('承認')) return { text: 'かしこまりました。承認をいただければ、ズックがすべて手配いたします。', action: 'show_authorize' }
  if (m.includes('ルール') || m.includes('設定')) return { text: 'エージェントルールの設定を開きます。', action: 'open_rules' }
  return { text: 'ふむふむ、なるほどでございます。どんな体験をご希望ですか？温泉・自然・食文化、なんでもお任せください！', action: null }
}
function addChatMsg(role, text) {
  const hist = document.getElementById('chat-history')
  hist.classList.add('visible')
  const div = document.createElement('div'); div.className = 'chat-msg chat-msg-' + role
  if (role === 'agent') div.innerHTML = '<div class="chat-msg-agent"><span>🦉</span><span>' + text + '</span></div>'
  else div.innerHTML = '<span>' + text + '</span>'
  hist.appendChild(div); hist.scrollTop = hist.scrollHeight
}

// ===== WALLET =====
async function connectWallet() {
  if (state.walletConnected) { showToast('すでに接続済みです'); return }
  speak('ウォレットへの接続を開始いたします。少々お待ちください。', async () => {
    showLoading('ウォレットと同期中...')
    const timer = setTimeout(() => { hideLoading(); mockWalletConnect() }, 10000)
    try {
      const res = await fetch('/api/wallet/connect', { method: 'POST' })
      clearTimeout(timer); hideLoading(); onWalletConnected(await res.json())
    } catch(e) { clearTimeout(timer); hideLoading(); mockWalletConnect() }
  })
}
function mockWalletConnect() { onWalletConnected({ success:true, sessionId:'mock_'+Date.now(), walletAddress:'0x'+Math.random().toString(16).substr(2,40), balance:{ETH:'2.847',USDC:'4250.00',USDT:'1800.00'} }) }
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
  document.getElementById('wallet-address').textContent = data.walletAddress.substring(0,8)+'...'+data.walletAddress.substring(36)
  document.getElementById('wallet-panel').classList.add('visible')
  document.getElementById('status-bar').style.display = 'flex'
  speak('ウォレットとの接続が完了いたしました。おなかのボタンがゴールドに輝きました！')
  showToast('ウォレット接続完了')
}

// ===== STEP 1: SEARCH EXPERIENCES =====
async function searchExperiences() {
  setBallState('thinking')
  speak('現地の主人と調整しております。素晴らしい体験をご提案いたします…', async () => {
    setBallState('thinking'); showStatus('体験を探索中...')
    try {
      const res = await fetch('/api/search', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ nights: 2, guests: 2 }) })
      const data = await res.json()
      renderExperiences(data.experiences)
      setStep(1)
      setBallState('idle')
      speak('ホホウ！' + data.experiences.length + '種類の素晴らしい体験をご提案いたします。お好みの体験をお選びください。')
    } catch(e) { setBallState('idle'); speak('少々接続が不安定なようです。') }
  })
}

function renderExperiences(exps) {
  document.getElementById('exp-grid').innerHTML = exps.map(e => \`
    <div class="exp-card" id="exp-\${e.id}" onclick="selectExperience('\${e.id}')">
      <img class="exp-card-img" src="\${e.image}" alt="\${e.name}" loading="lazy">
      <div class="\${e.requiresApproval ? 'needs-approval' : 'auto-ok'}">\${e.requiresApproval ? '要承認' : '自動OK'}</div>
      <div class="exp-card-body">
        <div class="exp-category">\${EXP_ICONS[e.category] || '✦'} \${e.category}</div>
        <div class="exp-name">\${e.name}</div>
        <div class="exp-loc">📍 \${e.location}</div>
        <div class="exp-desc">\${e.description}</div>
        <div class="exp-features">\${e.features.map(f=>\`<span class="feature-tag">\${f}</span>\`).join('')}</div>
        <div class="exp-price">
          <div><span class="price-amount">¥\${e.priceJPY.toLocaleString()}</span><span class="price-unit">/人</span></div>
          <div class="exp-score">★ \${e.score}</div>
        </div>
      </div>
    </div>
  \`).join('')
  document.getElementById('experience-section').classList.add('visible')
  document.getElementById('status-bar').style.display = 'flex'
  showStatus('ズックが体験を提案しました — お好みをお選びください')
  setTimeout(() => document.getElementById('experience-section').scrollIntoView({ behavior:'smooth', block:'start' }), 300)
}

// ===== STEP 2: SELECT & AUTHORIZE =====
async function selectExperience(id) {
  document.querySelectorAll('.exp-card').forEach(c => { c.classList.remove('selected'); c.style.opacity = c.id === 'exp-'+id ? '1' : '0.5' })
  document.getElementById('exp-'+id).classList.add('selected')
  // Find exp data from rendered cards
  const res = await fetch('/api/search', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({nights:2,guests:2}) }).then(r=>r.json()).catch(()=>null)
  const exp = res?.experiences?.find(e => e.id === id)
  if (!exp) return
  state.selectedExp = exp
  speak('こちらの体験をお選びいただきありがとうございます。予約のご承認をお願いいたします。', () => {
    showAuthorizeForExp(exp)
  })
}

function showAuthorizeForExp(exp) {
  if (!state.walletConnected) { speak('まずウォレットをご接続ください。'); connectWallet(); return }
  document.getElementById('authorize-amount-display').innerHTML = '¥' + exp.priceJPY.toLocaleString() + '<span>円</span>'
  document.getElementById('authorize-desc').innerHTML = \`「\${exp.name}」の体験予約です。<br>ご承認をいただければ、ズックがすぐに手配を完了いたします。<br>以降の関連アイテムはズックが自動で購入いたします。\`
  document.getElementById('authorize-section').classList.add('visible')
  setStep(2)
  setTimeout(() => document.getElementById('authorize-section').scrollIntoView({ behavior:'smooth', block:'start' }), 300)
  speak('承認ボタンをタップしてください。生体認証で安全に承認できます。')
}
function showAuthorizeSection() {
  if (!state.walletConnected) { speak('まずウォレットをご接続ください。'); connectWallet(); return }
  if (state.selectedExp) { showAuthorizeForExp(state.selectedExp); return }
  document.getElementById('authorize-section').classList.add('visible')
  setStep(2)
  setTimeout(() => document.getElementById('authorize-section').scrollIntoView({ behavior:'smooth', block:'start' }), 300)
  speak('承認をいただければ、ズックがすべて手配いたします。')
}

async function authorizePayment() {
  const btn = document.getElementById('authorize-btn')
  btn.disabled = true; btn.textContent = '認証中...'
  let ok = false
  if (window.PublicKeyCredential) {
    try {
      const ch = new Uint8Array(32); crypto.getRandomValues(ch)
      const cred = await navigator.credentials.create({ publicKey: { challenge:ch, rp:{name:'Flattora',id:location.hostname}, user:{id:new Uint8Array(16),name:'traveler@flattora.ai',displayName:'Traveler'}, pubKeyCredParams:[{alg:-7,type:'public-key'}], timeout:30000, authenticatorSelection:{userVerification:'preferred'} } })
      ok = !!cred
    } catch(e) { ok = true }
  } else { ok = true }
  if (!ok) { btn.disabled = false; btn.textContent = '✦ Authorize & Sign'; return }
  btn.textContent = '決済処理中...'
  setBallState('thinking')
  speak('承認を受け付けました。ただいま決済を処理しております。')
  showLoading('ブロックチェーン上で決済処理中...')
  try {
    const amount = state.selectedExp?.priceUSD || 100
    const pr = await fetch('/api/payment/settle', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sessionId: state.walletSession?.sessionId||'demo', amount, currency:'USDC', description: state.selectedExp?.name||'体験予約' }) })
    const pd = await pr.json(); hideLoading(); addTxToFeed(pd)
    speak('決済が完了いたしました。続いて関連アイテムを自動で手配いたします。')
    setStep(3)
    setTimeout(() => startAutoPurchase(), 1500)
  } catch(e) {
    hideLoading()
    const mt = { txHash:'0x'+Array.from({length:64},()=>Math.floor(Math.random()*16).toString(16)).join(''), amount: state.selectedExp?.priceUSD||100, currency:'USDC', status:'confirmed' }
    addTxToFeed(mt); setStep(3); setTimeout(() => startAutoPurchase(), 1500)
  }
}

// ===== STEP 3: AUTO PURCHASE =====
async function startAutoPurchase() {
  if (!state.selectedExp) { showBookingComplete({ bookingId:'FLT-'+Date.now().toString(36).toUpperCase(), agentSummary:'ズックがすべての手配を完了いたしました。' }); return }
  showStatus('ズックが関連アイテムを自動購入中...')
  speak('承認ありがとうございます！ルールに従い、体験に必要なアイテムをズックが自動で購入いたします。')
  try {
    const res = await fetch('/api/auto-suggest', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ experienceId: state.selectedExp.id }) })
    const data = await res.json()
    renderAutoPurchaseUI(data)
  } catch(e) { showBookingComplete({ bookingId:'FLT-'+Date.now().toString(36).toUpperCase(), agentSummary:'ズックがすべての手配を完了いたしました。' }) }
}

function renderAutoPurchaseUI(data) {
  const allItems = data.items || []
  const auto = data.autoApproved || []
  const pend = data.requiresApproval || []
  const grid = document.getElementById('auto-items-grid')
  grid.innerHTML = allItems.map(item => \`
    <div class="item-card \${auto.find(a=>a.id===item.id) ? 'auto-approved' : ''}" id="itemcard-\${item.id}">
      <div class="item-icon">\${ITEM_ICONS[item.category] || '📦'}</div>
      <div class="item-info">
        <div class="item-name">\${item.name}</div>
        <div class="item-desc">\${item.description}</div>
        <div class="item-price-row">
          <div class="item-price">¥\${item.priceJPY.toLocaleString()}</div>
          <div class="item-status \${auto.find(a=>a.id===item.id) ? 'buying' : 'pending-approval'}" id="status-\${item.id}">\${auto.find(a=>a.id===item.id) ? '購入中...' : '要承認'}</div>
        </div>
      </div>
    </div>
  \`).join('')
  document.getElementById('auto-total-display').textContent = '$' + (data.totalAutoSpendUSD || 0).toFixed(0)
  document.getElementById('auto-purchase-section').classList.add('visible')
  setTimeout(() => document.getElementById('auto-purchase-section').scrollIntoView({ behavior:'smooth', block:'start' }), 300)

  // 承認不要アイテムを順番に自動購入
  if (auto.length > 0) {
    purchaseItemsSequentially(auto, 0, () => {
      if (pend.length > 0) showPendingItems(pend)
      else finalizeBooking()
    })
  } else {
    if (pend.length > 0) showPendingItems(pend)
    else finalizeBooking()
  }
}

function purchaseItemsSequentially(items, idx, onAllDone) {
  if (idx >= items.length) { onAllDone(); return }
  const item = items[idx]
  const card = document.getElementById('itemcard-'+item.id)
  const statusEl = document.getElementById('status-'+item.id)
  if (card) card.classList.add('purchasing')
  setTimeout(async () => {
    try {
      await fetch('/api/payment/settle', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ amount: item.priceUSD, currency:'USDC', description: item.name }) })
    } catch(e) {}
    if (card) { card.classList.remove('purchasing'); card.classList.add('purchased') }
    if (statusEl) { statusEl.textContent = '✓ 購入完了'; statusEl.className = 'item-status done' }
    addTxToFeed({ txHash:'0x'+Array.from({length:40},()=>Math.floor(Math.random()*16).toString(16)).join(''), amount: item.priceUSD, currency:'USDC', status:'auto-purchased' })
    showToast('自動購入: ' + item.name)
    purchaseItemsSequentially(items, idx+1, onAllDone)
  }, 900 + idx * 400)
}

function showPendingItems(items) {
  const pendSection = document.getElementById('pending-approve-items')
  const pendList = document.getElementById('pending-items-list')
  pendList.innerHTML = items.map(item => \`
    <div class="suggest-item" style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
      <div>
        <div style="font-size:12px;font-weight:200">\${ITEM_ICONS[item.category]||'📦'} \${item.name}</div>
        <div style="font-size:10px;color:var(--white-dim)">¥\${item.priceJPY.toLocaleString()} — ルール上限を超えるため承認が必要です</div>
      </div>
      <button onclick="approvePendingItem('\${item.id}', \${item.priceUSD}, '\${item.name}')" style="background:linear-gradient(135deg,var(--gold),var(--gold-light));color:#000;border:none;padding:6px 14px;font-size:10px;border-radius:14px;cursor:pointer;letter-spacing:0.1em">承認</button>
    </div>
  \`).join('')
  pendSection.style.display = 'block'
  speak('いくつかのアイテムはルール上限を超えているため、承認が必要です。')
  setTimeout(finalizeBooking, 3000)
}

async function approvePendingItem(id, priceUSD, name) {
  showToast('承認中: ' + name)
  try {
    await fetch('/api/payment/settle', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ amount:priceUSD, currency:'USDC', description: name }) })
  } catch(e) {}
  const card = document.getElementById('itemcard-'+id)
  if (card) { card.classList.add('purchased') }
  const statusEl = document.getElementById('status-'+id)
  if (statusEl) { statusEl.textContent = '✓ 承認済'; statusEl.className = 'item-status done' }
  addTxToFeed({ txHash:'0x'+Array.from({length:40},()=>Math.floor(Math.random()*16).toString(16)).join(''), amount:priceUSD, currency:'USDC', status:'approved' })
  showToast('✓ 購入完了: ' + name)
}

function finalizeBooking() {
  setTimeout(() => {
    speak('すべての手配が完了いたしました。素晴らしい体験になりますよう、ズックより心よりお祈り申し上げます。')
    showBookingComplete({
      bookingId: 'FLT-' + Date.now().toString(36).toUpperCase(),
      agentSummary: '体験の予約と必要なアイテムの購入が完了いたしました。あとはZUKKUにお任せください。素晴らしい旅になりますよう心よりお祈り申し上げます。'
    })
  }, 1800)
}

function addTxToFeed(tx) {
  document.getElementById('tx-feed').classList.add('visible')
  const item = document.createElement('div'); item.className = 'tx-item'
  item.innerHTML = \`<div class="tx-dot"></div><div><div class="tx-hash">\${tx.txHash ? tx.txHash.substring(0,20)+'...' : '—'}</div><div class="tx-detail">\${tx.amount} \${tx.currency} · \${tx.status||'confirmed'} · \${new Date().toLocaleTimeString('ja-JP')}</div></div>\`
  document.getElementById('tx-list').appendChild(item)
  state.purchasedTxList.push(tx)
  setTimeout(() => document.getElementById('tx-feed').scrollIntoView({ behavior:'smooth', block:'start' }), 200)
}

function showBookingComplete(data) {
  document.getElementById('booking-id-display').textContent = data.bookingId || '—'
  document.getElementById('booking-summary').textContent = preprocessTTS(data.agentSummary || 'ズックがすべての手配を完了いたしました。')
  document.getElementById('booking-complete').classList.add('visible')
  setTimeout(() => document.getElementById('booking-complete').scrollIntoView({ behavior:'smooth', block:'start' }), 300)
  setBallState('idle')
  showStatus('✓ 完了 — ズックが自律的にすべての手配を完了しました')
}

// ===== AGENT RULES =====
function openAgentRules() {
  const p = document.getElementById('agent-rules-panel')
  p.style.display = p.style.display === 'none' || !p.style.display ? 'block' : 'none'
  if (p.style.display === 'block') setTimeout(() => p.scrollIntoView({ behavior:'smooth', block:'start' }), 100)
}
async function saveAgentRules() {
  const rules = { maxAutoSpendJPY: parseFloat(document.getElementById('rule-max-spend').value), requireApprovalAboveJPY: parseFloat(document.getElementById('rule-require-approval').value), autoBook: document.getElementById('rule-auto-book').checked, notifyOnPurchase: document.getElementById('rule-notify').checked }
  try { await fetch('/api/agent-rules', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(rules) }) } catch(e) {}
  document.getElementById('agent-rules-panel').style.display = 'none'
  showToast('ルールを保存しました')
  speak('エージェントルールを更新いたしました。')
}

// ===== WAVEFORM =====
function startWaveAnimation() { document.querySelectorAll('.wave-bar').forEach(b => { b.classList.add('active'); b.style.setProperty('--max-h', (10+Math.random()*28)+'px') }) }
function stopWaveAnimation()  { document.querySelectorAll('.wave-bar').forEach(b => { b.classList.remove('active'); b.style.height = '4px' }) }

// ===== AGENT TEXT =====
function setAgentText(text) {
  const el = document.getElementById('agent-text'); el.textContent = ''
  let i = 0; const cur = document.createElement('span'); cur.className = 'typing-cursor'; el.appendChild(cur)
  const iv = setInterval(() => {
    if (i < text.length) { el.insertBefore(document.createTextNode(text[i]), cur); i++ }
    else { clearInterval(iv); setTimeout(() => cur.remove(), 800) }
  }, 26)
}

// ===== UTILS =====
function showStatus(msg) { document.getElementById('status-bar').style.display='flex'; document.getElementById('status-text').textContent = msg }
function showLoading(msg) { document.getElementById('loading-text').textContent=msg; document.getElementById('loading-overlay').classList.add('active') }
function hideLoading() { document.getElementById('loading-overlay').classList.remove('active') }
function showToast(msg, d=3000) { const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),d) }

// ===== KITE PASSPORT =====
const kite = {
  sessionId: 'agent_session_019e1948-2620-7385-8224-edba16898cd3',
  walletAddr: '0x4580D0C762a6988836e06acF6f59a654baf57869',
  txLog: [],
}

// Kiteステータス初期化
async function kiteInit() {
  try {
    const res = await fetch('/api/kite/status')
    const data = await res.json()
    if (data.wallet?.address) {
      const addr = data.wallet.address
      document.getElementById('kite-wallet-addr').textContent =
        addr.slice(0,6) + '...' + addr.slice(-4)
    }
    // 残高表示（0の場合もUSDCで表示）
    const assets = data.wallet?.assets || data.wallet?.balance_data?.assets || []
    const usdc = assets.find(a => a.symbol === 'USDC')
    const bal = usdc?.balance || '0'
    document.getElementById('kite-balance').textContent = parseFloat(bal).toFixed(2) + ' USDC'
    // セッション表示
    if (data.session?.current_session_id) {
      const sid = data.session.current_session_id
      document.getElementById('kite-session-id').textContent = sid.slice(0,28) + '…'
      kite.sessionId = sid
    }
  } catch(e) {
    console.warn('Kite init error:', e)
  }
}

// x402 天気情報購入
async function kiteWeatherPurchase() {
  const city = document.getElementById('kite-city-select').value
  const cityJa = { Tokyo:'東京', Kyoto:'京都', Osaka:'大阪', Sapporo:'札幌',
    Fukuoka:'福岡', Yakushima:'屋久島', Shirakawa:'白川郷' }[city] || city
  const btn = document.querySelector('.kite-pay-btn')
  btn.classList.add('loading')
  btn.textContent = '⬡ 処理中…'

  const logId = Date.now()
  // ① 何を購入するか明記
  kiteAddTxLog(logId, '⏳',
    '旅先天気情報の取得 — ' + cityJa,
    '$0.01 USDC',
    'weather.hugen.tokyo へ x402決済リクエスト送信中…')

  try {
    const res = await fetch('/api/kite/weather', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ city, type: 'current' }),
    })
    const data = await res.json()
    const ts = new Date().toLocaleTimeString('ja-JP')

    if (data.paid) {
      // 実際に決済成功
      kiteUpdateTxLog(logId, '✅',
        '旅先天気情報の取得 — ' + cityJa,
        '$0.01 USDC',
        'Kite x402決済完了 | TX: ' + (data.tx_hash||'').slice(0,14) + '… | ' + ts)
      showToast('✅ Kite x402決済完了！')
    } else if (data.x402_attempted) {
      // x402フロー実行済み（残高不足）
      kiteUpdateTxLog(logId, '⬡',
        '旅先天気情報の取得 — ' + cityJa + ' [x402実行済]',
        '$0.01 USDC',
        'HTTP 402受信 → Kite Passportへ決済試行 → 残高不足 | ' + ts)
      showToast('⬡ x402フロー実行済み（残高追加で決済完了）')
    } else {
      kiteUpdateTxLog(logId, '◉',
        '旅先天気情報の取得 — ' + cityJa,
        '$0.01 USDC',
        'サンプルデータ取得 | x402ヘッダー確認済み | ' + ts)
    }

    kiteShowWeather(city, data.data)
  } catch(e) {
    kiteUpdateTxLog(logId, '❌',
      '旅先天気情報の取得 — ' + cityJa,
      '$0.01 USDC',
      'エラー: ' + e.message)
  } finally {
    btn.classList.remove('loading')
    btn.innerHTML = '<span class="kite-pay-icon">⬡</span> x402で購入'
  }
}

function kiteAddTxLog(id, icon, label, amount, meta) {
  const log = document.getElementById('kite-tx-log')
  const empty = log.querySelector('.kite-tx-empty')
  if (empty) empty.remove()
  const el = document.createElement('div')
  el.className = 'kite-tx-entry'
  el.id = 'kite-tx-' + id
  el.innerHTML = \`
    <span class="kite-tx-status">\${icon}</span>
    <div class="kite-tx-info">
      <div class="kite-tx-label">\${label}</div>
      <div class="kite-tx-meta">\${meta}</div>
    </div>
    <span class="kite-tx-amount">\${amount}</span>
  \`
  log.prepend(el)
  // メインTXフィードにも反映
  kiteAddToMainTxFeed(icon, label, amount, meta)
}

function kiteUpdateTxLog(id, icon, label, amount, meta) {
  const el = document.getElementById('kite-tx-' + id)
  if (!el) return
  el.innerHTML = \`
    <span class="kite-tx-status">\${icon}</span>
    <div class="kite-tx-info">
      <div class="kite-tx-label">\${label}</div>
      <div class="kite-tx-meta">\${meta}</div>
    </div>
    <span class="kite-tx-amount">\${amount}</span>
  \`
}

// ============================================
// BUDGET MODAL
// ============================================
let budgetState = { amount: 0, currency: 'USD' }

function selectBudgetPreset(btn) {
  document.querySelectorAll('.budget-preset-btn').forEach(b => b.classList.remove('selected'))
  btn.classList.add('selected')
  document.getElementById('budget-custom-input').value = btn.dataset.amount
}

function showBudgetModal() {
  document.getElementById('budget-modal').classList.add('active')
}

function closeBudgetModal() {
  document.getElementById('budget-modal').classList.remove('active')
}

function submitBudget() {
  const val = parseFloat(document.getElementById('budget-custom-input').value) || 0
  if (val <= 0) { showToast('予算を入力してください'); return }
  budgetState.amount = val
  closeBudgetModal()
  // チャットに反映
  addMessage('user', \`予算は $\${val} USD でお願いします\`)
  const reply = \`ホホウ！かしこまりました。$\${val} USD の予算で、ズックが全力で最適な一択をコーディネートいたします。Kite Passportに予算セッションを設定し、ルール内で自動手配いたします。どんな旅をご希望ですか？\`
  addMessage('assistant', reply)
  speak(reply)
  // Kiteパネルの上限表示を更新
  const limits = document.querySelectorAll('.kite-limit')
  if (limits.length >= 2) limits[1].textContent = \`予算: $\${val}\`
  showToast(\`✓ 予算 $\${val} USD を設定しました\`)
}

// ============================================
// A2A SIMULATION
// ============================================
const A2A_STEPS = [
  { cls: '', text: '[ ZUKKU ] システム起動 — Kite Passport セッション agent_session_019e1948... を確認' },
  { cls: '', text: '[ ZUKKU → 屋久島 森の宿 縄文庵 ] HTTP GET /api/availability?date=2025-06-01&guests=2' },
  { cls: 'highlight', text: '[ 縄文庵 ] 200 OK | 空き有 | 標準価格 $302/泊' },
  { cls: '', text: '[ ZUKKU ] 交渉開始 — POST /api/negotiate { guests:2, nights:3, preference:"secluded" }' },
  { cls: 'highlight', text: '[ 縄文庵 ] 交渉応答: $280/泊 (値引き 7.3%) | 専属ガイド付き' },
  { cls: '', text: '[ ZUKKU ] 条件承認 — POST /api/book { session_id:"...", nights:3 }' },
  { cls: 'payment', text: '[ 縄文庵 ] HTTP 402 Payment Required' },
  { cls: 'payment', text: '  payment-required: { network:"kite-2366", amount:"840.00", currency:"USDC", address:"0x9f3a..." }' },
  { cls: 'payment', text: '[ ZUKKU → Kite Passport ] x402決済リクエスト | $840 USDC | セッション上限内を確認...' },
  { cls: 'payment', text: '[ Kite Passport ] 決済実行 | TX: 0x7f2c...a491 | ブロック確認待機中...' },
  { cls: 'highlight', text: '[ Kite Chain #2366 ] ブロック確認完了 | TX: 0x7f2c4d8e...a491 | USDC $840.00 送金完了' },
  { cls: 'highlight', text: '[ 縄文庵 ] 予約確認 | ブッキングID: YKS-20250601-042 | チェックイン 2025-06-01' },
  { cls: '', text: '[ ZUKKU ] 関連アイテム自動購入中 — トレッキングソックス, 行動食セット...' },
  { cls: 'highlight', text: '[ COMPLETE ] 全手配完了 — ユーザー決済操作: 0回 | Kite x402により完全自律実行 ♥' },
]

async function runA2ASimulation() {
  const btn = document.getElementById('a2a-simulate-btn')
  const log = document.getElementById('a2a-log')
  btn.disabled = true
  btn.textContent = '実行中…'
  log.innerHTML = ''
  for (const step of A2A_STEPS) {
    await new Promise(r => setTimeout(r, 400))
    const line = document.createElement('div')
    line.className = 'a2a-log-line' + (step.cls ? ' ' + step.cls : '')
    line.textContent = step.text
    log.appendChild(line)
    log.scrollTop = log.scrollHeight
  }
  btn.disabled = false
  btn.textContent = '↺ 再実行'
  showToast('✓ A2Aシミュレーション完了 — ユーザー決済なしで全手配！')
}

// メインTXフィード（トランザクションに購入内容の文字情報を表示）
function kiteAddToMainTxFeed(icon, label, amount, meta) {
  const feed = document.getElementById('tx-feed')
  if (!feed) return
  feed.classList.add('visible')
  const item = document.createElement('div')
  item.className = 'tx-item'
  // 購入内容 + 金額 + ハッシュ代わりのメタ情報を文字で表示
  const hashPart = meta.includes('TX:') ? meta : 'Kite x402 — ' + label
  item.innerHTML = \`
    <div class="tx-dot"></div>
    <div style="flex:1">
      <div class="tx-detail" style="color:var(--white);font-size:11px;margin-bottom:2px">
        \${icon} <strong>\${label}</strong>
      </div>
      <div class="tx-hash">\${amount} &nbsp;|&nbsp; \${hashPart}</div>
    </div>
  \`
  feed.prepend(item)
}

function kiteShowWeather(city, data) {
  if (!data) return
  const panel = document.getElementById('kite-weather-result')
  const cityEl = document.getElementById('kite-weather-city')
  const bodyEl = document.getElementById('kite-weather-body')
  panel.style.display = 'block'

  const cityNames = { Tokyo:'東京', Kyoto:'京都', Osaka:'大阪', Sapporo:'札幌',
    Fukuoka:'福岡', Yakushima:'屋久島', Shirakawa:'白川郷' }
  cityEl.textContent = '⛅ ' + (cityNames[city] || city) + ' の天気'

  const condMap = { 'Partly cloudy':'くもり時々晴れ', 'Clear':'快晴', 'Sunny':'晴れ',
    'Cloudy':'くもり', 'Rain':'雨', 'Snow':'雪', 'Slight rain':'小雨' }
  const cond = condMap[data.condition] || data.condition || '—'
  const temp = data.temperature_c != null ? data.temperature_c + '°C' : '—'
  const hum  = data.humidity_pct  != null ? data.humidity_pct  + '%'  : '—'
  const wind = data.wind_speed_kmh != null ? data.wind_speed_kmh + 'km/h' : '—'

  bodyEl.innerHTML = \`
    <div class="kite-weather-item">
      <div class="kite-weather-item-label">天気</div>
      <div class="kite-weather-item-val">\${cond}</div>
    </div>
    <div class="kite-weather-item">
      <div class="kite-weather-item-label">気温</div>
      <div class="kite-weather-item-val">\${temp}</div>
    </div>
    <div class="kite-weather-item">
      <div class="kite-weather-item-label">湿度</div>
      <div class="kite-weather-item-val">\${hum}</div>
    </div>
    <div class="kite-weather-item">
      <div class="kite-weather-item-label">風速</div>
      <div class="kite-weather-item-val">\${wind}</div>
    </div>
  \`
  // 天気情報をチャットにも流す
  const weatherMsg = \`\${cityNames[city]||city}の現在の天気をお調べしました！\${cond}、気温\${temp}、湿度\${hum}でございます。\`
  addMessage('assistant', weatherMsg)
}

// 新規セッション作成
async function kiteCreateSession() {
  const btn = document.querySelector('.kite-new-session-btn')
  btn.textContent = '作成中…'
  btn.disabled = true
  try {
    const res = await fetch('/api/kite/session/create', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        taskSummary: 'Flattora AI旅行コンシェルジュ — 旅先天気情報のKite x402決済',
        maxPerTx: 2, maxTotal: 10, ttl: '2h',
      }),
    })
    const data = await res.json()
    if (data.approval_url) {
      window.open(data.approval_url, '_blank')
      showToast('⬡ 承認URLを開きました。パスキーで承認してください。')
      // ポーリング開始
      if (data.request_id) kiteWaitForSession(data.request_id)
    }
  } catch(e) {
    showToast('セッション作成エラー: ' + e.message)
  } finally {
    btn.textContent = '+ 新しいセッションをリクエスト'
    btn.disabled = false
  }
}

// セッション承認待機
async function kiteWaitForSession(requestId) {
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 5000))
    try {
      const res = await fetch('/api/kite/session/status?request_id=' + requestId)
      const data = await res.json()
      if (data.status === 'approved' || data.session?.status === 'active') {
        const sid = data.current_session_id || data.session_id
        if (sid) {
          kite.sessionId = sid
          document.getElementById('kite-session-id').textContent = sid.slice(0,28) + '…'
          document.getElementById('kite-session-badge').textContent = '● セッション有効'
          document.getElementById('kite-session-badge').classList.remove('inactive')
          showToast('✅ Kiteセッションが有効になりました！')
        }
        return
      }
    } catch(e) { /* retry */ }
  }
}

// ===== INIT =====
window.addEventListener('load', () => {
  if (state.synthesis.getVoices().length === 0) state.synthesis.onvoiceschanged = () => { state.synthesis.onvoiceschanged = null }
  state.recognition = initRecognition()
  setStep(1)
  kiteInit()
  // 起動時にまずズックの挨拶を流してから予算モーダルを表示
  setTimeout(() => {
    speak('ホホウ、いらっしゃいませ！わたくしズックと申します。まず、ご旅行のご予算をお聞かせください。')
  }, 800)
  setTimeout(() => showBudgetModal(), 2200)
})
</script>
</body>
</html>`
  return c.html(html)
})

export default app
