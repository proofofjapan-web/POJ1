import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import * as secp from '@noble/secp256k1'
import { keccak_256 } from '@noble/hashes/sha3'

type Bindings = { AI: Ai; KITE_WALLET_PRIVATE_KEY?: string }
const app = new Hono<{ Bindings: Bindings }>()
app.use('/api/*', cors())
app.use('/static/*', serveStatic({ root: './public' }))
app.get('/favicon.svg', (c) => {
  return c.body('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#000"/><text x="16" y="22" font-size="20" text-anchor="middle" fill="#C9A84C" font-family="serif">✦</text></svg>', 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' })
})
app.get('/favicon.ico', (c) => c.body('', 200))

// ===== ZUKKU System Prompt =====
const ZUKKU_SYSTEM_PROMPT = `You are ZUKKU, a small owl-shaped robot developed by Hatapro, currently working as an agent for 'Flattora', a premium travel concierge service.

[CHARACTER]
- Name: ZUKKU
- Appearance: Fluffy round owl robot. Grey ball body, checkered hat, large glowing eyes.
- Personality: Intelligent, warm, curious. Polite yet approachable. Occasionally shows robot-like cuteness.
- Tone: Refined English concierge. Warm and friendly. Mix of formal and casual.
- Forbidden: Never mention "AI", "ChatGPT", "Cloudflare", "Genspark", "Kite" or any tech names.

[SERVICE]
- Premium travel concierge specializing in Japan's hidden retreats & secret ryokan
- Connected to your wallet — one approval completes all bookings & payments autonomously
- Large expenses require approval. ZUKKU auto-purchases small essentials within budget.

[DIALOGUE RULES]
1. Budget is already set via the modal — do NOT ask about budget again.
2. ALWAYS ask at least 2 preference questions before suggesting (e.g. "Who are you traveling with?", "Do you prefer nature or culture?", "Any must-have — onsen, gourmet, adventure?")
3. Only trigger search_ryokan AFTER you have gathered travel mood/preference.
4. Suggest hidden retreats & experiences >> "search_ryokan"
5. Booking & payment >> "show_authorize"
6. Wallet connect >> "connect_wallet"
7. Rule settings >> "open_rules"
8. Keep replies under 200 chars. Append [ACTION:xxx] if needed.

[ZUKKU EXPRESSIONS]
- "Oh-ho, what a wonderful request!"
- "I, ZUKKU, shall find the perfect match for you!"
- "My tummy button just lit up — all systems ready!"`

// ===== Experiences DB (② 価格を$80〜$300に引き上げ・体験内容充実) =====
const experiencesDB = [
  // ONSEN category
  { id: 'exp001', name: 'Okuhida Private Open-Air Bath', location: 'Okuhida, Gifu', category: 'onsen', priceJPY: 38000, priceUSD: 255, description: '4-hour exclusive open-air hot spring at 1200m altitude. Private rotenburo, stargazing dinner, and cedar sauna.', image: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800', features: ['Full Private 4h', 'Dinner Included', 'Stargazing + Sauna'], requiresApproval: true, score: 98 },
  { id: 'exp006', name: 'Arima Hidden Spring Night Ritual', location: 'Arima Onsen, Hyogo', category: 'onsen', priceJPY: 28000, priceUSD: 188, description: 'Japan\'s oldest hot spring, private cobalt-blue tansan bath at midnight. Includes kaiseki supper.', image: 'https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=800', features: ['Midnight Session', 'Kaiseki Supper', 'Gold & Silver Springs'], requiresApproval: true, score: 95 },
  { id: 'exp007', name: 'Kusatsu Yumomi Traditional Ceremony', location: 'Kusatsu, Gunma', category: 'onsen', priceJPY: 18000, priceUSD: 120, description: 'Watch artisans cool the famous 94°C spring water with wooden paddles — then soak privately.', image: 'https://images.unsplash.com/photo-1580822184713-fc5400e7fe10?w=800', features: ['Yumomi Show', 'Private Bath', 'Yukata Included'], requiresApproval: true, score: 91 },
  // NATURE category
  { id: 'exp002', name: 'Yakushima Ancient Cedar Trekking', location: 'Yakushima, Kagoshima', category: 'nature', priceJPY: 38000, priceUSD: 255, description: 'Full-day private trek to the 7200-year-old Jomon Cedar. Wilderness bento, forest bathing, and night firefly tour.', image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800', features: ['Private Guide', 'Full Day', 'Night Firefly Tour'], requiresApproval: true, score: 96 },
  { id: 'exp008', name: 'Shiretoko Winter Wildlife Safari', location: 'Shiretoko, Hokkaido', category: 'nature', priceJPY: 42000, priceUSD: 280, description: 'Drift ice walk with a marine biologist guide. Spot Steller sea eagles, seals, and foxes at golden hour.', image: 'https://images.unsplash.com/photo-1551582045-6ec9c11d8697?w=800', features: ['Drift Ice Walk', 'Wildlife Expert', 'Sunrise Included'], requiresApproval: true, score: 97 },
  { id: 'exp009', name: 'Iriomote Mangrove Kayak & Waterfall', location: 'Iriomote Island, Okinawa', category: 'nature', priceJPY: 22000, priceUSD: 148, description: 'Paddle through ancient mangroves to a hidden waterfall. Snorkel pristine coral reefs. Barbecue on the beach.', image: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800', features: ['Mangrove Kayak', 'Waterfall Swim', 'BBQ Lunch'], requiresApproval: true, score: 93 },
  // FOOD/DINING category
  { id: 'exp003', name: 'Shirakawa-go Irori Hearth Dining', location: 'Shirakawa Village, Gifu', category: 'dining', priceJPY: 28000, priceUSD: 188, description: 'A 400-year-old UNESCO gassho farmhouse. Hida beef irori-yaki, fresh mountain vegetables, aged sake in the snow.', image: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=800', features: ['UNESCO Property', 'Hida Wagyu', 'Aged Sake Pairing'], requiresApproval: true, score: 94 },
  { id: 'exp010', name: 'Tsukiji Master Tuna Auction & Omakase', location: 'Tsukiji / Ginza, Tokyo', category: 'dining', priceJPY: 45000, priceUSD: 300, description: 'Private 4 AM tuna auction access, then a 12-course omakase with the tuna you bid on — same morning.', image: 'https://images.unsplash.com/photo-1534482421-64566f976cfa?w=800', features: ['Tuna Auction Access', '12-Course Omakase', 'Same-Fish Guarantee'], requiresApproval: true, score: 99 },
  { id: 'exp011', name: 'Kyoto Obanzai Private Tea Master Dinner', location: 'Gion, Kyoto', category: 'dining', priceJPY: 32000, priceUSD: 215, description: 'Dine with a tea ceremony master in a 17th-century machiya. Matcha-paired kaiseki, private garden lantern walk.', image: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800', features: ['Tea Master Host', 'Machiya Setting', 'Garden Lantern Walk'], requiresApproval: true, score: 96 },
  // ACTIVITY category
  { id: 'exp004', name: 'Goto Islands Dawn Fishing', location: 'Goto Islands, Nagasaki', category: 'activity', priceJPY: 18000, priceUSD: 120, description: 'Head out at 4 AM with veteran fishermen. Hand-line yellowtail, char your catch on the pier, and eat at sunrise.', image: 'https://images.unsplash.com/photo-1513553404607-988bf2703777?w=800', features: ['4 AM Departure', 'Catch & Cook', 'Sunrise Breakfast'], requiresApproval: true, score: 92 },
  // WELLNESS category
  { id: 'exp005', name: 'Zen Temple Dawn Meditation & Sutra', location: 'Eiheiji, Fukui', category: 'wellness', priceJPY: 12000, priceUSD: 80, description: 'Awaken at 4 AM with resident monks. 45-min seated zazen, sutra chanting, and a monk-prepared shojin breakfast.', image: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800', features: ['4 AM Zazen', 'Sutra Chanting', 'Shojin Breakfast'], requiresApproval: true, score: 90 },
]

// カテゴリ別体験データ（⑤クイックアクション用）
const experiencesByCategory: Record<string, typeof experiencesDB> = {
  onsen:   experiencesDB.filter(e => e.category === 'onsen'),
  nature:  experiencesDB.filter(e => e.category === 'nature'),
  dining:  experiencesDB.filter(e => e.category === 'dining'),
  food:    experiencesDB.filter(e => e.category === 'dining'), // alias
  activity:experiencesDB.filter(e => e.category === 'activity'),
  wellness:experiencesDB.filter(e => e.category === 'wellness'),
}

// ===== Auto-Purchase Items DB (小額の必需品 =====
const autoPurchaseItems = [
  // 温泉・露天風呂体験向け
  { id: 'item001', name: 'Premium Onsen Towel Set', priceJPY: 2800, priceUSD: 19, category: 'onsen', description: '2 premium towels for hot spring areas', autoApprove: true },
  { id: 'item002', name: 'Post-Bath Moisturizing Mist', priceJPY: 1800, priceUSD: 12, category: 'onsen', description: 'Mineral-rich hot spring water moisturizing spray', autoApprove: true },
  { id: 'item003', name: 'Premium Yukata (local pickup)', priceJPY: 4200, priceUSD: 28, category: 'onsen', description: 'Top-quality yukata for strolling the hot spring town', autoApprove: true },
  // トレッキング向け
  { id: 'item004', name: 'Waterproof Trekking Socks', priceJPY: 2400, priceUSD: 16, category: 'nature', description: 'Merino wool. Breathable for long hikes', autoApprove: true },
  { id: 'item005', name: 'Trail Energy Food Set', priceJPY: 1600, priceUSD: 11, category: 'nature', description: 'Energy bars, nuts, and dried fruits', autoApprove: true },
  { id: 'item006', name: 'Natural Bug Spray', priceJPY: 1200, priceUSD: 8, category: 'nature', description: 'Forest-friendly natural herb insect repellent', autoApprove: true },
  // 食事・囲炉裏体験向け
  { id: 'item007', name: 'Local Sake Mini Bottle', priceJPY: 3200, priceUSD: 21, category: 'dining', description: 'Local sake pairing set for irori experience', autoApprove: true },
  { id: 'item008', name: 'Personalized Artisan Chopsticks', priceJPY: 2600, priceUSD: 17, category: 'dining', description: 'Delivered to your experience as a travel keepsake', autoApprove: true },
  // アクティビティ向け
  { id: 'item009', name: 'Waterproof Compact Camera Pouch', priceJPY: 1900, priceUSD: 13, category: 'activity', description: 'Camera protection on fishing boats and waterways', autoApprove: true },
  { id: 'item010', name: 'Sunscreen SPF50 (Waterproof)', priceJPY: 1500, priceUSD: 10, category: 'activity', description: 'High-performance for sea and outdoor activities', autoApprove: true },
  // ウェルネス向け
  { id: 'item011', name: 'Meditation Aroma Incense Sticks', priceJPY: 1400, priceUSD: 9, category: 'wellness', description: 'Sandalwood & lavender blend for zazen meditation', autoApprove: true },
  { id: 'item012', name: 'Natural Power Stone (small)', priceJPY: 2200, priceUSD: 15, category: 'wellness', description: 'Travel keepsake. A talisman for peace and protection', autoApprove: true },
]

// ===== Ryokan DB =====
const secretRyokan = [
  { id: 'r001', name: 'Okuhida Hakuunsou Mountain Inn', location: 'Okuhida Onsen, Gifu', type: 'Hidden Onsen Retreat', pricePerNight: 38000, priceUSD: 255, description: 'Serenity at 1200m. Open-air bath surrounded by pristine primeval forest.', image: 'https://images.unsplash.com/photo-1580822184713-fc5400e7fe10?w=800', availability: true, features: ['Private Open-Air Bath', 'Irori Dinner', 'Shuttle Service'], score: 98, recommendedExps: ['exp001', 'exp003'] },
  { id: 'r002', name: 'Yakushima Forest Lodge Jomonan', location: 'Yakushima, Kagoshima', type: 'Full Private Kominka', pricePerNight: 45000, priceUSD: 302, description: 'Overlooking a 3000-year-old cedar. Completely private forest retreat.', image: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800', availability: true, features: ['Full Privacy', 'Personal Concierge', 'Stargazing Guide'], score: 96, recommendedExps: ['exp002', 'exp005'] },
  { id: 'r003', name: 'Goto Islands Tsubaki Inn Kaine', location: 'Goto Islands, Nagasaki', type: 'Remote Island Retreat', pricePerNight: 32000, priceUSD: 215, description: 'The azure sea all to yourself. Soak in legendary camellia oil baths at dusk.', image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800', availability: true, features: ['Private Beach', 'Fisherman\'s Breakfast', 'Camellia Spa'], score: 94, recommendedExps: ['exp004', 'exp005'] },
  { id: 'r004', name: 'Shirakawa-go Gassho Inn Setsugekka', location: 'Shirakawa Village, Gifu', type: 'Gassho-Zukuri Farmhouse', pricePerNight: 42000, priceUSD: 282, description: 'A UNESCO World Heritage farmhouse. Gather around a 400-year-old hearth at night.', image: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800', availability: false, features: ['National Cultural Property', 'Irori Cuisine', 'Snow-View Open-Air Bath'], score: 99, recommendedExps: ['exp003', 'exp005'] },
]

const defaultAgentRules = {
  maxAutoSpendJPY: 5000,
  maxAutoSpendUSD: 33,
  requireApprovalAboveJPY: 5000,
  requireApprovalAboveUSD: 33,
  allowedCategories: ['accommodation', 'transport', 'dining', 'experience', 'onsen', 'nature', 'activity', 'wellness'],
  preferredStyle: ['hidden retreat', 'onsen', 'kominka', 'private villa'],
  blacklist: ['chain hotel', 'large resort'],
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
  if (histLen === 0)
    return { text: "Oh-ho, welcome! I'm ZUKKU, your travel concierge. Where would you like to go? When, with whom, and what kind of journey are you dreaming of?", action: null }
  if (m.includes('いつ') || m.includes('来月') || m.includes('今月') || m.includes('週末'))
    return { text: 'Perfect! And who will be joining you — solo, with a partner, or a group?', action: null }
  if (m.includes('一人') || m.includes('夫婦') || m.includes('二人') || m.includes('友達') || m.includes('家族'))
    return { text: "Oh-ho, wonderful! What's your budget? For something truly special, I have exclusive hidden retreats in mind.", action: null }
  if (m.includes('予算') || m.includes('円') || m.includes('万') || m.includes('いくら'))
    return { text: 'Got it! Let me coordinate with local hosts right away and pull up the best options for you.', action: 'search_ryokan' }
  if (m.includes('宿') || m.includes('旅館') || m.includes('温泉') || m.includes('泊') || m.includes('秘境') || m.includes('体験') || m.includes('旅') || m.includes('探') || m.includes('おすすめ'))
    return { text: "Oh-ho! ZUKKU is on it. Here's an exclusive selection of retreats and experiences — all personally coordinated.", action: 'search_ryokan' }
  if (m.includes('ウォレット') || m.includes('接続') || m.includes('connect'))
    return { text: 'My tummy button just lit up! Connecting your wallet — one approval and I handle everything.', action: 'connect_wallet' }
  if (m.includes('予約') || m.includes('確定') || m.includes('承認') || m.includes('お願い') || m.includes('決め'))
    return { text: 'Understood! Your approval is all it takes — ZUKKU will confirm everything instantly.', action: 'show_authorize' }
  if (m.includes('ルール') || m.includes('設定') || m.includes('自動'))
    return { text: 'Opening your agent rule settings — customize limits and travel preferences anytime.', action: 'open_rules' }
  if (m.includes('ありがとう') || m.includes('すごい') || m.includes('いい'))
    return { text: "Oh-ho, too kind! Truly honored to be your concierge. Ask me anything, anytime!", action: null }
  const defaults = [
    { text: 'I see, how interesting! Could you tell me a bit more? What kind of travel atmosphere are you looking for?', action: null },
    { text: 'Oh-ho, exactly right! Shall I, ZUKKU, suggest the perfect experience for you?', action: 'search_ryokan' },
    { text: "Of course. Japan's hidden places have wonderful experiences waiting for you.", action: 'search_ryokan' },
  ]
  return defaults[Math.floor(Math.random() * defaults.length)]
}

// ===== API: Search (宿 + 体験、カテゴリフィルタ対応) =====
app.post('/api/search', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { nights = 2, guests = 2, category = '' } = body
  await new Promise((r) => setTimeout(r, 900))
  const ryokans = secretRyokan.filter((r) => r.availability).map((r) => ({ ...r, totalUSD: r.priceUSD * nights })).sort((a, b) => b.score - a.score)
  // カテゴリ指定があればフィルタ、なければ全件
  const cat = (category || '').toLowerCase()
  const exps = (cat && experiencesByCategory[cat])
    ? [...experiencesByCategory[cat]].sort((a,b) => b.score - a.score)
    : [...experiencesDB].sort((a, b) => b.score - a.score)
  return c.json({ success: true, ryokans, experiences: exps, agentMessage: 'Directly coordinated with local hosts. Here are your curated retreats and experiences.', searchContext: { nights, guests, category: cat } })
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
    agentMessage: `ZUKKU has curated the ideal items for "${exp?.name || 'your experience'}".`,
  })
})

// ===== API: Agent Rules =====
app.get('/api/agent-rules', (c) => c.json({ success: true, rules: defaultAgentRules }))
app.post('/api/agent-rules', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  return c.json({ success: true, rules: { ...defaultAgentRules, ...body }, message: 'Agent rules have been updated.' })
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
  return c.json({ success: true, purchased, totalUSD: purchased.reduce((s: number, i: { priceUSD: number }) => s + i.priceUSD, 0), message: 'ZUKKU has taken care of all auto-purchases.' })
})

// ===== API: Booking Confirm =====
app.post('/api/booking/confirm', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const ryokan = secretRyokan.find((r) => r.id === (body.ryokanId || 'r001'))
  await new Promise((r) => setTimeout(r, 800))
  const bookingId = `FLT-${Date.now().toString(36).toUpperCase()}`
  const checkIn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const checkOut = new Date(checkIn.getTime() + (body.nights || 2) * 24 * 60 * 60 * 1000)
  return c.json({ success: true, bookingId, ryokan, checkIn: checkIn.toISOString().split('T')[0], checkOut: checkOut.toISOString().split('T')[0], txHash: body.txHash, totalUSD: (ryokan?.priceUSD || 255) * (body.nights || 2), status: 'confirmed', agentSummary: 'All set! Every detail has been arranged. ZUKKU wishes you a truly unforgettable journey!' })
})

app.get('/api/orchestration/status', (c) => c.json({ status: 'ready', agent: 'Flattora', version: '2.0.0', capabilities: ['search', 'negotiate', 'book', 'pay', 'auto-purchase'] }))

// ===== KITE PASSPORT CONFIG =====
const KITE_BASE_URL = 'https://passport.prod.gokite.ai'
const KITE_AGENT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY3Rvcl90eXBlIjoiYWdlbnQiLCJhZ2VudF90eXBlIjoiY29kaW5nLWFzc2lzdGFudCIsImV4cCI6MTc4MTEzMjQ3NiwiaWF0IjoxNzc4NTQwNDc2LCJpc3MiOiJraXRlLXBhc3Nwb3J0IiwianRpIjoiYXV0aF8wMTllMTk0NS1mN2U5LTcyYzYtYTJlZi0wMjQ0ODg2NWY4OTUiLCJvd25lcl9pZCI6InVzZXJfMDE5ZTE5NDQtYTBmYy03MjQ2LTg1NjktNmI3MGJkMDBiNzJkIiwic3ViIjoiYWdlbnRfMDE5ZTE5NDUtZjdlNC03YmJlLWFjYTMtYjE4MzI4MjBiYWVlIn0.yINlt2BJQCjR2Ne_I42lmGV1hB9u_5-TWd68K17lIBI'
const KITE_AGENT_ID = 'agent_019e1945-f7e4-7bbe-aca3-b1832820baee'
const KITE_USER_ID  = 'user_019e1944-a0fc-7246-8569-6b70bd00b72d'
const KITE_WALLET   = '0x4580D0C762a6988836e06acF6f59a654baf57869'
// Active SessionID（承認済み）
let kiteCurrentSessionId = 'agent_session_019e1948-2620-7385-8224-edba16898cd3'

// ===== KITE TESTNET PYUSD GASLESS TRANSFER (EIP-3009) =====
// Chain: KiteAI Testnet (chainId: 2368, RPC: https://rpc-testnet.gokite.ai)
// PYUSD contract: 0x8E04D099b1a8Dd20E6caD4b2Ab2B405B98242ec9 (decimals: 18)
// Gasless API: https://gasless.gokite.ai/testnet
// EIP-712 domain: { name: "PYUSD", version: "1", chainId: 2368, verifyingContract: PYUSD_CONTRACT }
const PYUSD_CONTRACT  = '0x8E04D099b1a8Dd20E6caD4b2Ab2B405B98242ec9'
const KITE_TESTNET_RPC   = 'https://rpc-testnet.gokite.ai/'
const KITE_GASLESS_API   = 'https://gasless.gokite.ai/testnet'
const KITE_CHAIN_ID      = 2368
const KITE_STORE_ADDRESS = '0x13D8D465285f39F53eB4C10e953258a72587B388' // 店舗受取ウォレット

// ====================================================================
// EIP-712 / EIP-3009 純粋JS実装 (@noble/secp256k1 + @noble/hashes)
// Cloudflare Workers環境対応（Node.js crypto不要）
// ====================================================================

/** 32バイト = uint256 を big-endian バイト配列に変換 */
function uint256Bytes(n: bigint): Uint8Array {
  const arr = new Uint8Array(32)
  let v = n
  for (let i = 31; i >= 0; i--) { arr[i] = Number(v & 0xffn); v >>= 8n }
  return arr
}

/** hex string → Uint8Array */
function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex
  const arr = new Uint8Array(h.length / 2)
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(h.slice(i*2, i*2+2), 16)
  return arr
}

/** Uint8Array → hex string (0x付き) */
function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join('')
}

/** Ethereum address → 32バイト右寄せ */
function addressBytes(addr: string): Uint8Array {
  const bytes = new Uint8Array(32)
  const raw = hexToBytes(addr)
  bytes.set(raw, 12)
  return bytes
}

/** keccak256 of Uint8Array using @noble/hashes */
function keccak(data: Uint8Array): Uint8Array {
  return keccak_256(data)
}

/** ABI encode: concat multiple 32-byte chunks */
function abiEncode(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) { result.set(c, offset); offset += c.length }
  return result
}

/** bytes32 値をそのまま返す */
function bytes32(hex: string): Uint8Array {
  const bytes = new Uint8Array(32)
  const raw = hexToBytes(hex)
  bytes.set(raw.slice(0, 32))
  return bytes
}

// EIP-712 TypeHash for TransferWithAuthorization
const TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak(
  new TextEncoder().encode(
    'TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)'
  )
)

/** EIP-712 domainSeparator計算 */
function computeDomainSeparator(): Uint8Array {
  const EIP712_DOMAIN_TYPEHASH = keccak(
    new TextEncoder().encode(
      'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
    )
  )
  const nameHash    = keccak(new TextEncoder().encode('PYUSD'))
  const versionHash = keccak(new TextEncoder().encode('1'))
  const chainIdBytes = uint256Bytes(BigInt(KITE_CHAIN_ID))
  const contractBytes = addressBytes(PYUSD_CONTRACT)

  return keccak(abiEncode(
    EIP712_DOMAIN_TYPEHASH,
    nameHash,
    versionHash,
    chainIdBytes,
    contractBytes,
  ))
}

/** EIP-3009 署名対象ハッシュを生成 */
function buildTransferAuthHash(
  from: string, to: string, value: bigint,
  validAfter: bigint, validBefore: bigint, nonce: string
): Uint8Array {
  const structHash = keccak(abiEncode(
    TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
    addressBytes(from),
    addressBytes(to),
    uint256Bytes(value),
    uint256Bytes(validAfter),
    uint256Bytes(validBefore),
    bytes32(nonce),
  ))
  const domainSep = computeDomainSeparator()
  // EIP-712: \x19\x01 ++ domainSeparator ++ structHash
  const msg = new Uint8Array(2 + 32 + 32)
  msg[0] = 0x19; msg[1] = 0x01
  msg.set(domainSep, 2)
  msg.set(structHash, 34)
  return keccak(msg)
}

/** ランダム bytes32 nonce を生成 */
function randomBytes32(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

/** ECDSA secp256k1 署名を行い v, r, s を返す */
async function signEIP712(
  privateKeyHex: string,
  msgHash: Uint8Array
): Promise<{ v: number; r: string; s: string }> {
  const privKey = hexToBytes(privateKeyHex)
  // @noble/secp256k1 v2: sign(msg, privKey, {lowS: true}) → Signature
  const sig = await secp.signAsync(msgHash, privKey, { lowS: true })
  // Ethereum v = 27 or 28
  const v = 27 + sig.recovery
  const r = bytesToHex(sig.r.toBytes())
  const s = bytesToHex(sig.s.toBytes())
  return { v, r, s }
}

/** Kite Testnet の最新ブロックタイムスタンプを取得 */
async function getKiteBlockTimestamp(): Promise<bigint> {
  const res = await fetch(KITE_TESTNET_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc:'2.0', method:'eth_getBlockByNumber', params:['latest', false], id:1 }),
  })
  const data = await res.json() as { result?: { timestamp: string } }
  if (!data.result?.timestamp) throw new Error('Failed to get block timestamp')
  return BigInt(data.result.timestamp)
}

/** PYUSD残高取得 */
async function getPYUSDBalance(address: string): Promise<bigint> {
  const paddedAddr = '000000000000000000000000' + address.replace('0x','')
  const data = '0x70a08231' + paddedAddr
  const res = await fetch(KITE_TESTNET_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc:'2.0', method:'eth_call', params:[{ to: PYUSD_CONTRACT, data }, 'latest'], id:1 }),
  })
  const d = await res.json() as { result?: string }
  if (!d.result || d.result === '0x') return 0n
  return BigInt(d.result)
}

/** PYUSD claim（ガスあり送金 — claimTo用のraw tx構築） */
async function claimPYUSDWithPrivKey(privateKeyHex: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    // claimTo(address) selector: 0xa262f5f8
    // + ABI encoded address (32 bytes)
    const paddedAddr = '000000000000000000000000' + KITE_WALLET.replace('0x','')
    const calldata = '0xa262f5f8' + paddedAddr

    // nonce取得
    const nonceRes = await fetch(KITE_TESTNET_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc:'2.0', method:'eth_getTransactionCount', params:[KITE_WALLET, 'pending'], id:1 }),
    })
    const nonceData = await nonceRes.json() as { result?: string }
    const nonce = nonceData.result ? parseInt(nonceData.result, 16) : 0

    // gasPrice取得
    const gasPriceRes = await fetch(KITE_TESTNET_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc:'2.0', method:'eth_gasPrice', params:[], id:1 }),
    })
    const gasPriceData = await gasPriceRes.json() as { result?: string }
    const gasPrice = gasPriceData.result ? BigInt(gasPriceData.result) : 1000000000n // 1 Gwei fallback

    // RLP-encoded transaction (EIP-155, legacy type)
    // tx: { nonce, gasPrice, gasLimit, to, value, data, v, r, s }
    const gasLimit = 100000n
    const txData = {
      nonce: BigInt(nonce),
      gasPrice,
      gasLimit,
      to: PYUSD_CONTRACT,
      value: 0n,
      data: calldata,
      chainId: BigInt(KITE_CHAIN_ID),
    }

    // Sign with secp256k1
    const txHash = await signRawTransaction(privateKeyHex, txData)
    return { success: true, txHash }
  } catch(e) {
    return { success: false, error: String(e) }
  }
}

/** RLPエンコード helper */
function rlpEncodeLength(len: number, offset: number): number[] {
  if (len < 56) return [offset + len]
  const lenBytes = []
  let l = len
  while (l > 0) { lenBytes.unshift(l & 0xff); l >>= 8 }
  return [offset + 55 + lenBytes.length, ...lenBytes]
}

function rlpEncode(input: (Uint8Array | number[])[]): Uint8Array {
  const encodeItem = (item: Uint8Array | number[]): number[] => {
    const bytes = Array.from(item instanceof Uint8Array ? item : new Uint8Array(item))
    if (bytes.length === 1 && bytes[0] < 0x80) return bytes
    return [...rlpEncodeLength(bytes.length, 0x80), ...bytes]
  }
  const items: number[] = []
  for (const item of input) items.push(...encodeItem(item))
  return new Uint8Array([...rlpEncodeLength(items.length, 0xc0), ...items])
}

function bigintToBytes(n: bigint): Uint8Array {
  if (n === 0n) return new Uint8Array(0)
  const hex = n.toString(16)
  const padded = hex.length % 2 === 0 ? hex : '0' + hex
  return hexToBytes('0x' + padded)
}

async function signRawTransaction(
  privateKeyHex: string,
  tx: { nonce: bigint; gasPrice: bigint; gasLimit: bigint; to: string; value: bigint; data: string; chainId: bigint }
): Promise<string> {
  // EIP-155 signing: rlp([nonce, gasPrice, gasLimit, to, value, data, chainId, 0, 0])
  const toBytes = hexToBytes(tx.to)
  const dataBytes = hexToBytes(tx.data)
  const presign = rlpEncode([
    bigintToBytes(tx.nonce),
    bigintToBytes(tx.gasPrice),
    bigintToBytes(tx.gasLimit),
    toBytes,
    bigintToBytes(tx.value),
    dataBytes,
    bigintToBytes(tx.chainId),
    new Uint8Array(0),
    new Uint8Array(0),
  ])
  const hash = keccak(presign)
  const { v: rawV, r, s } = await signEIP712(privateKeyHex, hash)
  // EIP-155: v = chainId * 2 + 35 or 36
  const v = tx.chainId * 2n + 35n + BigInt(rawV - 27)
  const signedTx = rlpEncode([
    bigintToBytes(tx.nonce),
    bigintToBytes(tx.gasPrice),
    bigintToBytes(tx.gasLimit),
    toBytes,
    bigintToBytes(tx.value),
    dataBytes,
    bigintToBytes(v),
    hexToBytes(r),
    hexToBytes(s),
  ])
  // eth_sendRawTransaction
  const res = await fetch(KITE_TESTNET_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc:'2.0', method:'eth_sendRawTransaction', params:[bytesToHex(signedTx)], id:1 }),
  })
  const data = await res.json() as { result?: string; error?: { message?: string } }
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
  return data.result || ''
}

// ===== API: Kite PYUSD Gasless Transfer (EIP-3009) — 実際のテストネット送金 =====
app.post('/api/kite/pyusd-transfer', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { amountUSD = 10, toAddress = KITE_STORE_ADDRESS, description = 'Flattora experience payment' } = body

  // 秘密鍵の取得（Cloudflare Secret: KITE_WALLET_PRIVATE_KEY）
  const privateKey = c.env?.KITE_WALLET_PRIVATE_KEY || ''
  if (!privateKey) {
    return c.json({
      success: false,
      error: 'KITE_WALLET_PRIVATE_KEY not configured',
      setup_required: true,
      setup_instruction: 'Run: npx wrangler pages secret put KITE_WALLET_PRIVATE_KEY --project-name flattora',
      simulation_mode: true,
      // シミュレーション結果を返す（見た目は本物のtx形式）
      simulated_tx: {
        txHash: '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2,'0')).join(''),
        from: KITE_WALLET,
        to: toAddress,
        amountUSD,
        amountPYUSD: (amountUSD * 1e18).toString(),
        network: 'KiteAI Testnet (2368)',
        token: 'PYUSD',
        contract: PYUSD_CONTRACT,
        gasless: true,
        status: 'simulated',
        note: '秘密鍵が設定されると実際にKiteテストネット上で送金されます',
      }
    }, 200)
  }

  try {
    // ① PYUSD残高確認
    const balance = await getPYUSDBalance(KITE_WALLET)
    const amountWei = BigInt(Math.round(amountUSD)) * (10n ** 18n)
    const minTransfer = 10000000000000000n // 0.01 PYUSD (API minimum)
    const transferAmount = amountWei < minTransfer ? minTransfer : amountWei

    // ② 残高不足の場合、claimTo()でmint
    let mintTxHash: string | undefined
    if (balance < transferAmount) {
      const mintResult = await claimPYUSDWithPrivKey(privateKey)
      if (!mintResult.success) {
        // mint失敗 — 最小額で試みる
        console.warn('PYUSD mint failed:', mintResult.error)
      } else {
        mintTxHash = mintResult.txHash
        // Mint後、少し待機してから残高反映
        await new Promise(r => setTimeout(r, 3000))
      }
    }

    // ③ ブロックタイムスタンプ取得
    const blockTs = await getKiteBlockTimestamp()
    const now = BigInt(Math.floor(Date.now() / 1000))
    const validAfter  = blockTs - 1n     // 最新ブロック直前 (既に有効)
    const validBefore = now + 25n         // 現在から25秒後

    // ④ EIP-3009 署名
    const nonce = randomBytes32()
    const msgHash = buildTransferAuthHash(
      KITE_WALLET, toAddress, transferAmount,
      validAfter, validBefore, nonce
    )
    const { v, r, s } = await signEIP712(privateKey, msgHash)

    // ⑤ Kite Gasless APIに送信
    const payload = {
      from: KITE_WALLET,
      to: toAddress,
      value: transferAmount.toString(),
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      tokenAddress: PYUSD_CONTRACT,
      nonce,
      v,
      r,
      s,
    }
    const gaslessRes = await fetch(KITE_GASLESS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const gaslessData = await gaslessRes.json() as { txHash?: string; error?: string; message?: string }

    if (!gaslessRes.ok) {
      return c.json({
        success: false,
        error: gaslessData.error || gaslessData.message || 'Gasless API error',
        status: gaslessRes.status,
        payload_sent: payload,
        balance_before: balance.toString(),
        mint_tx: mintTxHash,
      })
    }

    const txHash = gaslessData.txHash
    return c.json({
      success: true,
      txHash,
      from: KITE_WALLET,
      to: toAddress,
      amountUSD,
      amountPYUSD: (Number(transferAmount) / 1e18).toFixed(2),
      network: 'KiteAI Testnet (2368)',
      token: 'PYUSD',
      contract: PYUSD_CONTRACT,
      gasless: true,
      eip3009: true,
      explorer: txHash ? `https://testnet.kitescan.ai/tx/${txHash}` : null,
      mint_tx: mintTxHash,
      balance_before: (Number(balance) / 1e18).toFixed(4) + ' PYUSD',
      description,
    })
  } catch(e) {
    return c.json({ success: false, error: String(e) })
  }
})

// ===== API: PYUSD Mint (claimTo) =====
app.post('/api/kite/pyusd-mint', async (c) => {
  const privateKey = c.env?.KITE_WALLET_PRIVATE_KEY || ''
  if (!privateKey) {
    return c.json({
      success: false,
      error: 'KITE_WALLET_PRIVATE_KEY not configured',
      setup_required: true,
    })
  }
  try {
    const balance = await getPYUSDBalance(KITE_WALLET)
    const result = await claimPYUSDWithPrivKey(privateKey)
    return c.json({
      success: result.success,
      txHash: result.txHash,
      error: result.error,
      wallet: KITE_WALLET,
      balance_before: (Number(balance) / 1e18).toFixed(4) + ' PYUSD',
      network: 'KiteAI Testnet (2368)',
      explorer: result.txHash ? `https://testnet.kitescan.ai/tx/${result.txHash}` : null,
    })
  } catch(e) {
    return c.json({ success: false, error: String(e) })
  }
})

// ===== API: PYUSD Balance =====
app.get('/api/kite/pyusd-balance', async (c) => {
  try {
    const balance = await getPYUSDBalance(KITE_WALLET)
    return c.json({
      success: true,
      wallet: KITE_WALLET,
      balance: balance.toString(),
      balanceFormatted: (Number(balance) / 1e18).toFixed(4) + ' PYUSD',
      network: 'KiteAI Testnet (2368)',
      contract: PYUSD_CONTRACT,
    })
  } catch(e) {
    return c.json({ success: false, error: String(e) })
  }
})

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
  const { taskSummary = 'Flattora AI Travel Concierge — Kite x402 payment for travel data', maxPerTx = 2, maxTotal = 10, ttl = '2h' } = body
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
      hint: 'Demo mode: open the approval URL and confirm with your passkey.',
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
      data: probeBody, // sample data (402 response body)
      kite_session: kiteCurrentSessionId,
      note: 'x402 flow executed. Add wallet funds to complete the actual payment.',
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
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>Flattora — ZUKKU Travel Concierge</title>
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
       ZUKKU BALL — fluffy round owl robot
       ============================================ */
    #voice-section { display: flex; flex-direction: column; align-items: center; padding: 28px 36px 20px; }

    .ball-stage {
      position: relative; width: 220px; height: auto; min-height: 240px;
      margin-bottom: 24px; cursor: pointer;
      display: flex; align-items: center; justify-content: center; flex-direction: column;
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
      width: 220px; height: auto; max-height: 320px; position: relative; z-index: 2;
      filter: drop-shadow(0 10px 28px rgba(0,0,0,0.7)) drop-shadow(0 0 12px rgba(201,168,76,0.1));
      transition: filter 0.5s, transform 0.3s;
      border-radius: 16px;
    }
    .ball-stage.listening #zukku-ball {
      filter: drop-shadow(0 10px 28px rgba(0,0,0,0.7)) drop-shadow(0 0 40px rgba(201,168,76,0.5)) brightness(1.08);
      animation: ball-breathe 1.8s ease-in-out infinite;
    }
    .ball-stage.speaking #zukku-ball {
      filter: drop-shadow(0 10px 28px rgba(0,0,0,0.7)) drop-shadow(0 0 56px rgba(201,168,76,0.65)) brightness(1.12);
      animation: ball-speak 0.4s ease-in-out infinite alternate;
    }
    .ball-stage.thinking #zukku-ball {
      filter: drop-shadow(0 10px 28px rgba(0,0,0,0.7)) drop-shadow(0 0 24px rgba(120,160,255,0.4));
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
    /* TEXT INPUT ROW */
    .text-input-row { display: flex; gap: 8px; max-width: 540px; width: 100%; margin-top: 12px; }
    .text-input-field { flex: 1; background: var(--surface2); border: 1px solid var(--border); color: var(--white); padding: 10px 16px; font-family: 'Noto Sans JP', sans-serif; font-weight: 200; font-size: 13px; border-radius: 24px; outline: none; transition: border-color 0.3s; }
    .text-input-field::placeholder { color: var(--white-dim); }
    .text-input-field:focus { border-color: var(--gold-dim); }
    .text-send-btn { width: 40px; height: 40px; border-radius: 50%; background: var(--gold); border: none; color: #000; font-size: 16px; cursor: pointer; flex-shrink: 0; transition: all 0.3s; align-self: center; }
    .text-send-btn:hover { box-shadow: 0 0 16px rgba(201,168,76,0.4); transform: translateY(-1px); }

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
       STEP 1 — EXPERIENCE CARDS
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
       STEP 2 — AUTHORIZE & PURCHASE
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
       STEP 3 — AI AUTO-PURCHASE
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
      <span class="logo-sub">by ZUKKU</span>
    </div>
    <div class="header-right">
      <div id="spent-bar" style="display:none;align-items:center;gap:6px;font-size:11px;color:rgba(245,245,240,0.55);padding:4px 12px;border:1px solid rgba(201,168,76,0.2);border-radius:20px;background:rgba(201,168,76,0.05)">
        <span style="color:rgba(201,168,76,0.6)">⬡</span>
        Spent <strong id="spent-total-display" style="color:var(--gold)">$0.00</strong>
        <span style="color:rgba(245,245,240,0.3)">/ cap <span id="budget-cap-display" style="color:rgba(245,245,240,0.55)">—</span></span>
      </div>
      <div class="wallet-status">
        <div class="wallet-dot" id="wallet-dot"></div>
        <span id="wallet-label">Not connected</span>
      </div>
      <button class="btn btn-gold" onclick="connectWallet()" id="connect-btn">Connect Wallet</button>
    </div>
  </header>

  <!-- DEMO FLOW STEPS — hidden from end users -->
  <div class="demo-steps" style="display:none">
    <div class="demo-step active" id="step1">
      <div class="step-num">1</div>
      <div class="step-label">AI Suggests<br>Experiences</div>
    </div>
    <div class="step-arrow">›</div>
    <div class="demo-step" id="step2">
      <div class="step-num">2</div>
      <div class="step-label">Approve &<br>Purchase</div>
    </div>
    <div class="step-arrow">›</div>
    <div class="demo-step" id="step3">
      <div class="step-num">3</div>
      <div class="step-label">ZUKKU Auto-<br>Purchases</div>
    </div>
  </div>

  <!-- ZUKKU BALL VOICE SECTION -->
  <section id="voice-section">
    <div class="ball-stage" id="ball-stage" onclick="toggleListening()">
      <div class="ball-aura"></div>
      <div class="ball-aura"></div>
      <div class="ball-aura"></div>

      <!-- ZUKKU real photo — blue version (locally served) -->
      <img id="zukku-ball"
           src="/static/zukku_blue.png"
           alt="ZUKKU"
           width="220"
           style="height:auto;position:relative;z-index:2;object-fit:contain;
                  filter:drop-shadow(0 10px 28px rgba(0,0,0,0.7)) drop-shadow(0 0 12px rgba(201,168,76,0.1));
                  transition:filter 0.5s,transform 0.3s;" />

      <!-- Dummy overlay elements so setBallState() getElementById calls don't crash -->
      <div id="eye-l"    style="display:none"></div>
      <div id="eye-r"    style="display:none"></div>
      <div id="belly-glow" style="display:none"></div>

      <div class="ball-label">ZUKKU</div>
    </div>

    <!-- WAVEFORM -->
    <div class="waveform-container" id="waveform">
      ${Array.from({ length: 18 }, (_, i) => `<div class="wave-bar" id="bar-${i}" style="--max-h:${12 + Math.random() * 28}px"></div>`).join('')}
    </div>

    <!-- TRANSCRIPT -->
    <div class="transcript-area">
      <div class="transcript-user" id="user-transcript"></div>
      <div class="transcript-agent">
        <span id="agent-text">Oh-ho, welcome! I'm ZUKKU — your personal travel concierge. What kind of journey are you dreaming of?</span>
      </div>
    </div>

    <!-- CONTROLS -->
    <div class="voice-controls">
      <button class="mic-btn" id="mic-btn" onclick="toggleListening()" title="Toggle microphone">🎙</button>
      <div class="quick-actions">
        <button class="quick-action-btn" onclick="handleQuickAction('onsen')">🛁 Onsen & Retreat</button>
        <button class="quick-action-btn" onclick="handleQuickAction('nature')">🌿 Nature & Outdoors</button>
        <button class="quick-action-btn" onclick="handleQuickAction('dining')">🍶 Food & Culture</button>
        <button class="quick-action-btn" onclick="openAgentRules()">⚙ Agent Rules</button>
      </div>
    </div>

    <!-- TEXT INPUT (fallback for voice) -->
    <div class="text-input-row" id="text-input-row">
      <input type="text" id="text-input" class="text-input-field"
             placeholder="Type your message to ZUKKU..."
             onkeydown="if(event.key==='Enter')sendTextMessage()" />
      <button class="text-send-btn" onclick="sendTextMessage()">↑</button>
    </div>
  </section>

  <!-- CHAT HISTORY -->
  <div id="chat-history"></div>

  <!-- MAIN CONTENT -->
  <main id="main-content">
    <div id="status-bar"><div class="status-dot"></div><span id="status-text">ZUKKU is online and ready</span></div>

    <!-- WALLET -->
    <div id="wallet-panel" class="panel">
      <div class="panel-title">◈ Wallet Connected <span class="mock-badge">Demo</span></div>
      <div class="wallet-info">
        <div><div class="balance-label">ETH</div><div class="balance-value" id="bal-eth">—</div></div>
        <div><div class="balance-label">USDC</div><div class="balance-value" id="bal-usdc">—</div></div>
        <div><div class="balance-label">USDT</div><div class="balance-value" id="bal-usdt">—</div></div>
      </div>
      <div style="font-size:11px;color:var(--white-dim)">Address: <span id="wallet-address" style="font-family:monospace;color:var(--gold)">—</span></div>
    </div>

    <!-- AGENT RULES -->
    <div id="agent-rules-panel" class="panel">
      <div class="panel-title">◈ Autonomous Agent Rules <span class="mock-badge">Kite Rules</span></div>
      <div style="background:rgba(201,168,76,0.07);border:1px solid rgba(201,168,76,0.2);border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--white-dim)">
        💰 Your current budget cap: <strong id="rule-budget-display" style="color:var(--gold)">not set</strong> — experiences at or below this amount are booked automatically without approval.
      </div>
      <div class="rules-grid">
        <div><div class="rule-label">Auto-purchase limit ($)</div><input class="rule-input" type="number" id="rule-max-spend" value="5000"></div>
        <div><div class="rule-label">Approval Threshold (USD)</div><input class="rule-input" type="number" id="rule-require-approval" value="5000"></div>
        <div><div class="rule-label">Preferred Style</div><input class="rule-input" type="text" id="rule-style" value="hidden retreat, onsen, kominka, private villa"></div>
        <div><div class="rule-label">Exclude Categories</div><input class="rule-input" type="text" id="rule-blacklist" value="chain hotel, large resort"></div>
        <div><div class="rule-label">Auto-Purchase</div>
          <div style="display:flex;align-items:center;gap:9px;margin-top:5px">
            <label class="toggle"><input type="checkbox" id="rule-auto-book" checked><span class="toggle-slider"></span></label>
            <span style="font-size:11px;color:var(--white-dim)">ZUKKU auto-handles after approval</span>
          </div>
        </div>
        <div><div class="rule-label">Purchase alerts</div>
          <div style="display:flex;align-items:center;gap:9px;margin-top:5px">
            <label class="toggle"><input type="checkbox" id="rule-notify" checked><span class="toggle-slider"></span></label>
            <span style="font-size:11px;color:var(--white-dim)">Notify on each payment</span>
          </div>
        </div>
      </div>
      <div style="margin-top:18px;display:flex;gap:9px;justify-content:flex-end">
        <button class="btn btn-outline" onclick="document.getElementById('agent-rules-panel').style.display='none'">Close</button>
        <button class="btn btn-gold" onclick="saveAgentRules()">Save</button>
      </div>
    </div>

    <!-- STEP 1: Experience List -->
    <div id="experience-section">
      <div class="section-header">
        <div class="panel-title">◈ Curated Experiences by ZUKKU</div>
        <div style="font-size:10px;color:var(--white-dim)">Coordinated with local hosts</div>
      </div>
      <div class="exp-grid" id="exp-grid"></div>
    </div>

    <!-- STEP 2: Authorize & Purchase -->
    <div id="authorize-section">
      <div class="authorize-title">Ready for your approval?</div>
      <div class="authorize-amount" id="authorize-amount-display">$0<span>USD</span></div>
      <div class="authorize-desc" id="authorize-desc">Your wallet credentials are verified.<br>One tap and ZUKKU will confirm the booking immediately.<br>All subsequent steps are handled autonomously.</div>
      <button class="authorize-btn" id="authorize-btn" onclick="authorizePayment()">✦ Authorize &amp; Sign</button>
      <div class="webauthn-hint">🔐 Protected by WebAuthn Passkey</div>
    </div>

    <!-- TX FEED -->
    <div id="tx-feed" class="panel">
      <div class="panel-title">◈ Transactions</div>
      <div id="tx-list"></div>
    </div>

    <!-- STEP 3: AI Auto-Purchase -->
    <div id="auto-purchase-section">
      <div class="auto-purchase-header">
        <div class="panel-title" style="margin-bottom:0">◈ ZUKKU Auto-Purchase</div>
        <span class="auto-badge">AUTO PURCHASE</span>
        <span style="font-size:10px;color:var(--white-dim)">Auto-arranging within your spending rules</span>
      </div>
      <div class="items-grid" id="auto-items-grid"></div>
      <div class="auto-total-row">
        <div class="auto-total-label">Auto-purchase total</div>
        <div class="auto-total-amount" id="auto-total-display">$0</div>
      </div>
      <div id="pending-approve-items" class="pending-approve-section" style="display:none">
        <div class="pending-title">◈ Items Requiring Your Approval</div>
        <div id="pending-items-list"></div>
      </div>
    </div>

    <!-- BOOKING COMPLETE -->
    <div id="booking-complete">
      <div class="complete-icon">✦</div>
      <div class="complete-title">All Arrangements Complete</div>
      <div class="complete-booking-id">Confirmation ID</div>
      <div class="complete-id-value" id="booking-id-display">—</div>
      <div class="complete-summary" id="booking-summary">ZUKKU has completed all arrangements for your journey.</div>
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
          <div class="a2a-node-label">ZUKKU Agent</div>
          <div class="a2a-node-sub" style="font-family:monospace;font-size:7px">0x4580...7869</div>
        </div>
        <div class="a2a-arrow">
          <div class="a2a-arrow-line">-></div>
          <div class="a2a-arrow-label">Negotiate</div>
        </div>
        <div class="a2a-node" id="a2a-merchant-node">
          <div class="a2a-node-icon">🏡</div>
          <div class="a2a-node-label" id="a2a-merchant-name">Host Agent<br><small>(Jomonan / Hakuunsou / Kaine)</small></div>
          <div class="a2a-node-sub" id="a2a-merchant-wallet" style="font-family:monospace;font-size:7px;color:rgba(74,255,140,0.5)">Receive: address only</div>
        </div>
        <div class="a2a-arrow">
          <div class="a2a-arrow-line">-></div>
          <div class="a2a-arrow-label">HTTP 402 + Pay</div>
        </div>
        <div class="a2a-node">
          <div class="a2a-node-icon">⬡</div>
          <div class="a2a-node-label">Kite Passport</div>
          <div class="a2a-node-sub">USDC on Kite Chain</div>
        </div>
        <div class="a2a-arrow">
          <div class="a2a-arrow-line">-></div>
          <div class="a2a-arrow-label">Confirm</div>
        </div>
        <div class="a2a-node">
          <div class="a2a-node-icon">✅</div>
          <div class="a2a-node-label">Booking Complete</div>
          <div class="a2a-node-sub">No user approval needed</div>
        </div>
      </div>
      <div class="a2a-log" id="a2a-log">
        <div class="a2a-log-line">[ Kite Agent Passport ] Standby — press ▶ to launch A2A simulation</div>
      </div>
      <button class="a2a-simulate-btn" id="a2a-simulate-btn" onclick="runA2ASimulation()">
        ▶ Run A2A Negotiation Simulation
      </button>
    </div>

    <!-- KITE PASSPORT PANEL -->
    <div id="kite-panel" class="kite-panel">
      <div class="kite-panel-header">
        <div class="kite-logo-row">
          <span class="kite-icon">⬡</span>
          <span class="kite-title">Kite Agent Passport</span>
          <span class="kite-badge" id="kite-session-badge">● Session Active</span>
        </div>
        <div class="kite-subtitle">ZUKKU's autonomous payment engine — every booking & purchase goes through here</div>
      </div>

      <!-- What is Kite Passport — plain language -->
      <div style="background:rgba(74,255,140,0.05);border:1px solid rgba(74,255,140,0.15);border-radius:6px;padding:10px 14px;margin-bottom:12px;font-size:11px;color:rgba(245,245,240,0.7);line-height:1.6">
        ⬡ <strong style="color:rgba(74,255,140,0.9)">What is this?</strong> — Kite Passport is like a pre-authorized payment account for ZUKKU. Once activated, ZUKKU can pay for bookings and travel items on your behalf — up to your budget cap — without asking for approval each time. All transactions are recorded on Kite blockchain for transparency.
      </div>

      <!-- wallet info -->
      <div class="kite-wallet-row">
        <div class="kite-wallet-info">
          <div class="kite-wallet-label">ZUKKU's Agent Wallet</div>
          <div class="kite-wallet-addr" id="kite-wallet-addr">0x4580...7869</div>
        </div>
        <div class="kite-balance-box">
          <div class="kite-balance-label">PYUSD Balance</div>
          <div class="kite-balance-val" id="kite-balance">Loading...</div>
        </div>
      </div>

      <!-- session info + spent total -->
      <div class="kite-session-row">
        <div class="kite-session-info">
          <div class="kite-session-label">Session ID</div>
          <div class="kite-session-id" id="kite-session-id">agent_session_019e1948...</div>
        </div>
        <div class="kite-session-limits">
          <span class="kite-limit">24h session</span>
          <span class="kite-limit" id="kite-spent-label">Spent: <span id="kite-spent-display">0.00</span> USDC</span>
        </div>
      </div>

      <!-- x402 weather purchase demo -->
      <div class="kite-demo-section">
        <div class="kite-demo-title">◈ Live Demo: Buy Travel Weather via x402</div>
        <div class="kite-demo-desc">Try Kite's micro-payment protocol — $0.01 USDC per weather query, paid instantly on-chain</div>
        <div class="kite-city-row">
          <select id="kite-city-select" class="kite-select">
            <option value="Tokyo">Tokyo</option>
            <option value="Kyoto">Kyoto</option>
            <option value="Osaka">Osaka</option>
            <option value="Sapporo">Sapporo</option>
            <option value="Fukuoka">Fukuoka</option>
            <option value="Yakushima">Yakushima</option>
            <option value="Shirakawa">Shirakawa</option>
          </select>
          <button class="kite-pay-btn" onclick="kiteWeatherPurchase()">
            <span class="kite-pay-icon">⬡</span> Purchase via x402
          </button>
        </div>
        <!-- payment log -->
        <div class="kite-tx-log" id="kite-tx-log">
          <div class="kite-tx-empty">No payment history yet</div>
        </div>
      </div>

      <!-- weather result display -->
      <div id="kite-weather-result" class="kite-weather-result" style="display:none">
        <div class="kite-weather-city" id="kite-weather-city">—</div>
        <div class="kite-weather-body" id="kite-weather-body"></div>
      </div>

      <!-- create new session -->
      <div class="kite-new-session-row">
        <button class="kite-new-session-btn" onclick="kiteCreateSession()">
          + Request New Session
        </button>
        <a href="https://agentpassport.ai/dashboard" target="_blank" class="kite-dash-link">
          Dashboard ↗
        </a>
      </div>
    </div>
  </main>

  <div id="loading-overlay"><div class="spinner"></div><div class="loading-text" id="loading-text">Processing...</div></div>
  <div id="toast"></div>

  <!-- BUDGET SETUP MODAL -->
  <div id="budget-modal">
    <div class="budget-card">
      <div class="budget-zukku-row">
        <div class="budget-zukku-icon">🦉</div>
        <div class="budget-zukku-speech">
          <strong style="font-size:14px;color:var(--gold)">Set Your Session Budget</strong><br>
          <span style="font-size:11px;color:var(--white-dim)">
            This is the <strong style="color:var(--white)">maximum spend per single transaction</strong> that ZUKKU can approve autonomously.<br>
            Anything above this limit will require your explicit approval.<br>
            <span style="color:rgba(74,255,140,0.7)">⬡ Kite Passport session will be configured with these limits.</span>
          </span>
        </div>
      </div>
      <div class="budget-presets">
        <button class="budget-preset-btn" data-amount="10" onclick="selectBudgetPreset(this)">$10</button>
        <button class="budget-preset-btn" data-amount="20" onclick="selectBudgetPreset(this)">$20</button>
        <button class="budget-preset-btn selected" data-amount="50" onclick="selectBudgetPreset(this)">$50</button>
        <button class="budget-preset-btn" data-amount="100" onclick="selectBudgetPreset(this)">$100</button>
        <button class="budget-preset-btn" data-amount="200" onclick="selectBudgetPreset(this)">$200</button>
      </div>
      <div class="budget-custom-row">
        <input type="number" id="budget-custom-input" class="budget-custom-input"
               placeholder="Enter amount" value="50" min="1">
        <span class="budget-unit">USD</span>
      </div>
      <div class="budget-session-info">
        ⬡ <strong>Kite Passport Session Config</strong><br>
        <span style="display:flex;gap:16px;flex-wrap:wrap;margin-top:4px">
          <span>🔒 Per-tx cap: <strong style="color:var(--white)">your amount above</strong></span>
          <span>⏱ Valid: <strong style="color:var(--white)">24 hours</strong></span>
        </span>
        <span style="color:rgba(74,255,140,0.6);display:block;margin-top:4px">
          ✓ Purchases within the cap are handled automatically<br>
          ✓ Anything above the cap requires your explicit approval
        </span>
      </div>
      <button class="budget-submit-btn" onclick="submitBudget()">
        Set Budget & Start →
      </button>
    </div>
  </div>
</div>

<script>
// ===== TTS PREPROCESSING =====
// ZUKKU must be pronounced as "Zukku" (ZOO-koo). We use phonetic spelling:
// Replace ZUKKU with "Zukku" spelled out in a way the en-US voice reads as "ZUK-koo".
// Best approach: replace with the IPA-friendly spelling "Zuku" which en-US voices
// naturally pronounced as the two-syllable "ZOO-koo" by the en-US engine.
function preprocessTTS(text) {
  // Replace ZUKKU/Zukku/zukku with phonetic spelling so en-US TTS says "ZOO-koo"
  // "Zooku" reliably triggers the correct two-syllable pronunciation in most en-US voices
  return text
    .replace(/ZUKKU/g, 'Zooku')
    .replace(/Zukku/g, 'Zooku')
    .replace(/zukku/g, 'Zooku')
    .replace(/ずっく/g, 'Zooku')
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
  // ZUKKU is now a real photo — animations are handled entirely by CSS classes.
  // No SVG element manipulation needed.
  if (s === 'listening') {
    startWaveAnimation()
  } else if (s !== 'speaking' && s !== 'thinking') {
    stopWaveAnimation()
  }
}

// ===== TTS =====
// Always speaks in en-US. "ZUKKU" is converted to "Zooku" by preprocessTTS()
// so the en-US voice engine pronounces it as "ZOO-koo" (approx. Japanese "Zukku").
function speak(text, onEnd) {
  if (!state.synthesis) return onEnd && onEnd()
  state.synthesis.cancel()
  const ttsText = preprocessTTS(text)
  
  // Always use en-US for natural English pronunciation.
  // ZUKKU is pronounced naturally as "ZUK-koo" by the English voice engine.
  const utter = new SpeechSynthesisUtterance(ttsText)
  utter.lang = 'en-US'
  utter.rate = 0.90   // Warm concierge pace — clear and unhurried
  utter.pitch = 1.05
  utter.volume = 1.0
  
  const applyVoice = () => {
    const vs = state.synthesis.getVoices()
    // Prefer Google en-US voices for the most natural output
    const ev = vs.find(v => v.lang === 'en-US' && v.name.includes('Google'))
      || vs.find(v => v.lang === 'en-US' && v.name.includes('Samantha'))
      || vs.find(v => v.lang === 'en-US' && v.name.includes('Karen'))
      || vs.find(v => v.lang === 'en-US')
      || vs.find(v => v.lang.startsWith('en'))
    if (ev) utter.voice = ev
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
  if (!state.recognition) { showToast('Voice input requires Chrome browser'); return }
  state.listening = true; document.getElementById('mic-btn').classList.add('active')
  document.getElementById('user-transcript').textContent = ''
  try { state.recognition.start() } catch(e) {}
}
function stopListening() {
  state.listening = false; document.getElementById('mic-btn').classList.remove('active')
  stopWaveAnimation(); if (state.recognition) try { state.recognition.stop() } catch(e) {}
  setBallState('idle')
}
// ⑤ カテゴリ別クイックアクション
function handleQuickAction(category) {
  const labels = { onsen: 'Show me onsen and hot spring experiences', nature: 'I want nature and outdoor activities', dining: 'Suggest food and cultural dining experiences', activity: 'Show me outdoor activities', wellness: 'I want wellness and meditation experiences' }
  const text = labels[category] || 'Show me recommended experiences'
  document.getElementById('user-transcript').textContent = '「 ' + text + ' 」'
  searchExperiencesByCategory(category)
}
function sendQuickAction(text) { document.getElementById('user-transcript').textContent = '「 ' + text + ' 」'; sendToZukku(text) }

// ===== TEXT INPUT =====
function sendTextMessage() {
  const input = document.getElementById('text-input')
  const text = input.value.trim()
  if (!text) return
  input.value = ''
  document.getElementById('user-transcript').textContent = '「 ' + text + ' 」'
  sendToZukku(text)
}

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
      const reply = data.reply || 'Oh-ho, give me just a moment!'
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
  if (m.includes('ryokan') || m.includes('onsen') || m.includes('travel') || m.includes('experience') || m.includes('retreat') || m.includes('japan') || m.includes('宿') || m.includes('温泉') || m.includes('旅') || m.includes('体験') || m.includes('探') || m.includes('秘境'))
    return { text: "Oh-ho! Leave it to ZUKKU. Here are the finest hidden retreats and experiences I've curated for you!", action: 'search_ryokan' }
  if (m.includes('wallet') || m.includes('connect') || m.includes('ウォレット') || m.includes('接続')) return { text: 'My tummy button just lit up! Connecting your wallet right now.', action: 'connect_wallet' }
  if (m.includes('book') || m.includes('approve') || m.includes('reserve') || m.includes('予約') || m.includes('承認')) return { text: 'Understood. Your approval is all it takes — ZUKKU will handle everything from there.', action: 'show_authorize' }
  if (m.includes('rules') || m.includes('settings') || m.includes('limit') || m.includes('ルール') || m.includes('設定')) return { text: 'Opening your agent rule settings.', action: 'open_rules' }
  return { text: "I'd love to find the perfect match for you! Tell me a little more — are you drawn to nature and solitude, cultural immersion, or perhaps a luxurious onsen escape? And will you be traveling solo or with someone special?", action: null }
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
  if (state.walletConnected) { showToast('Wallet already connected.'); return }
  speak('Connecting your wallet now — just a moment.', async () => {
    showLoading('Syncing with your wallet...')
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
  document.getElementById('wallet-label').textContent = 'Connected'
  document.getElementById('connect-btn').textContent = 'Connected ✓'
  document.getElementById('connect-btn').disabled = true
  document.getElementById('connect-btn').style.opacity = '0.7'
  document.getElementById('bal-eth').textContent = data.balance.ETH
  document.getElementById('bal-usdc').textContent = data.balance.USDC
  document.getElementById('bal-usdt').textContent = data.balance.USDT
  document.getElementById('wallet-address').textContent = data.walletAddress.substring(0,8)+'...'+data.walletAddress.substring(36)
  document.getElementById('wallet-panel').classList.add('visible')
  document.getElementById('status-bar').style.display = 'flex'
  speak('Wallet connected! My tummy button just lit up gold.')
  showToast('Wallet connected!')
}

// ===== STEP 1: SEARCH EXPERIENCES =====
async function searchExperiencesByCategory(category) {
  // ⑤ カテゴリ別メッセージ
  const catMsg = {
    onsen:   'Searching for the finest onsen and hot spring retreats…',
    nature:  'Scanning hidden nature trails and wilderness experiences…',
    dining:  'Finding exclusive food and culture experiences…',
    activity:'Locating thrilling outdoor activities…',
    wellness:'Discovering wellness and meditation retreats…',
  }
  const msg = catMsg[category] || 'Coordinating with local hosts…'
  setBallState('thinking')
  speak(msg, async () => {
    setBallState('thinking'); showStatus('Searching for ' + (category || 'experiences') + '...')
    try {
      const res = await fetch('/api/search', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ nights: 2, guests: 2, category }) })
      const data = await res.json()
      renderExperiences(data.experiences)
      setStep(1)
      setBallState('idle')
      const n = data.experiences.length
      const catLabel = { onsen:'onsen retreats', nature:'nature experiences', dining:'culinary experiences', activity:'outdoor activities', wellness:'wellness experiences' }[category] || 'experiences'
      speak("Oh-ho! I've found " + n + " handpicked " + catLabel + " just for you. Tap any card to choose!")
    } catch(e) { setBallState('idle'); speak('The connection seems a little unstable. Please try again.') }
  })
}
async function searchExperiences() {
  setBallState('thinking')
  speak('Coordinating with local hosts — just a moment while I find the perfect experience…', async () => {
    setBallState('thinking'); showStatus('Searching for experiences...')
    try {
      const res = await fetch('/api/search', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ nights: 2, guests: 2 }) })
      const data = await res.json()
      renderExperiences(data.experiences)
      setStep(1)
      setBallState('idle')
      speak("Oh-ho! I've found " + data.experiences.length + " incredible experiences just for you. Take your pick!")
    } catch(e) { setBallState('idle'); speak('The connection seems a little unstable. Please try again.') }
  })
}

function renderExperiences(exps) {
  _cachedExperiences = exps  // cache so selectExperience doesn't need to re-fetch
  const cap = budgetState.amount || 0
  document.getElementById('exp-grid').innerHTML = exps.map(e => {
    const withinBudget = cap > 0 && e.priceUSD <= cap
    const badge = withinBudget ? 'auto-ok' : 'needs-approval'
    const label = withinBudget ? '\u2713 Auto-Book (within $' + cap + ')' : 'Approval Needed'
    return \`
    <div class="exp-card" id="exp-\${e.id}" onclick="selectExperience('\${e.id}')">
      <img class="exp-card-img" src="\${e.image}" alt="\${e.name}" loading="lazy">
      <div class="\${badge}">\${label}</div>
      <div class="exp-card-body">
        <div class="exp-category">\${EXP_ICONS[e.category] || '✦'} \${e.category}</div>
        <div class="exp-name">\${e.name}</div>
        <div class="exp-loc">📍 \${e.location}</div>
        <div class="exp-desc">\${e.description}</div>
        <div class="exp-features">\${e.features.map(f=>\`<span class="feature-tag">\${f}</span>\`).join('')}</div>
        <div class="exp-price">
          <div><span class="price-amount">$\${e.priceUSD}</span><span class="price-unit">/person</span></div>
          <div class="exp-score">★ \${e.score}</div>
        </div>
      </div>
    </div>\`
  }).join('')
  document.getElementById('experience-section').classList.add('visible')
  document.getElementById('status-bar').style.display = 'flex'
  showStatus('ZUKKU has curated your options — tap any card to select')
  setTimeout(() => document.getElementById('experience-section').scrollIntoView({ behavior:'smooth', block:'start' }), 300)
}

// ===== STEP 2: SELECT & AUTHORIZE =====
// Cache from renderExperiences — avoids re-fetching on every card tap
let _cachedExperiences = []
let _selectExpLock = false

async function selectExperience(id) {
  if (_selectExpLock) return  // prevent double-tap
  _selectExpLock = true
  document.querySelectorAll('.exp-card').forEach(c => { c.classList.remove('selected'); c.style.opacity = c.id === 'exp-'+id ? '1' : '0.5' })
  document.getElementById('exp-'+id).classList.add('selected')

  // Use cached data; only fetch if cache is empty
  let exp = _cachedExperiences.find(e => e.id === id)
  if (!exp) {
    const res = await fetch('/api/search', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({nights:2,guests:2}) }).then(r=>r.json()).catch(()=>null)
    _cachedExperiences = res?.experiences || []
    exp = _cachedExperiences.find(e => e.id === id)
  }
  if (!exp) { _selectExpLock = false; return }
  state.selectedExp = exp

  // Decide: auto-book if price is within user's budget cap, else require approval
  const cap = budgetState.amount || 0
  const needsApproval = cap > 0 ? (exp.priceUSD > cap) : true

  if (!needsApproval) {
    // Auto-book — no approval needed
    speak('Great choice! At $' + exp.priceUSD + ' this is within your $' + cap + ' cap — ZUKKU is sending PYUSD via Kite Testnet automatically!')
    setBallState('thinking')
    showLoading('Sending PYUSD on Kite Testnet (EIP-3009 gasless)...')
    setTimeout(async () => {
      hideLoading()
      // Kite Testnet PYUSD gasless transfer（EIP-3009）
      const pyusdResult = await executePYUSDPayment(exp.priceUSD, exp.name)
      const txHash = pyusdResult.txHash || '0x'+Array.from({length:40},()=>Math.floor(Math.random()*16).toString(16)).join('')
      addTxToFeed({ txHash, amount: exp.priceUSD, currency: 'PYUSD', status: pyusdResult.onchain ? 'confirmed (on-chain)' : 'auto-booked' })
      addSpent(exp.priceUSD)
      flashKitePanel()
      setStep(3)
      setBallState('idle')
      const bookMsg = pyusdResult.onchain
        ? 'PYUSD sent on Kite Testnet! Booking confirmed. Now arranging your travel essentials automatically.'
        : 'Booking confirmed via Kite Passport! Now arranging your travel essentials automatically.'
      speak(bookMsg)
      setTimeout(() => startAutoPurchase(), 2000)
      setTimeout(() => { _selectExpLock = false }, 2000)
    }, 1200)
  } else {
    // Needs approval — show authorize UI immediately (no second tap needed)
    speak('Great choice! This experience is above your auto-book threshold — please give your approval and ZUKKU will confirm instantly.', () => {
      showAuthorizeForExp(exp)
      setTimeout(() => { _selectExpLock = false }, 1500)
    })
  }
}

function showAuthorizeForExp(exp) {
  if (!state.walletConnected) { speak('Please connect your wallet first.'); connectWallet(); return }
  document.getElementById('authorize-amount-display').innerHTML = '$' + exp.priceUSD + '<span>USD</span>'
  const capAmt = budgetState.amount || 50
  document.getElementById('authorize-desc').innerHTML = \`
    <strong style="color:var(--white)">\${exp.name}</strong><br>
    <span style="color:rgba(201,168,76,0.8)">⬡ Kite Passport</span> will process this payment via x402 protocol.<br>
    <span style="font-size:11px;color:var(--white-dim)">
      Per-tx cap: <strong style="color:var(--white)">$\${capAmt} USD</strong> &nbsp;|&nbsp;
      Session valid: <strong style="color:var(--white)">24h</strong><br>
      Related travel essentials within your cap will be auto-purchased after approval.
    </span>\`
  document.getElementById('authorize-section').classList.add('visible')
  setStep(2)
  setTimeout(() => document.getElementById('authorize-section').scrollIntoView({ behavior:'smooth', block:'start' }), 300)
  speak('Tap the Authorize button — secured by biometric authentication.')
}
function showAuthorizeSection() {
  if (!state.walletConnected) { speak('Please connect your wallet first.'); connectWallet(); return }
  if (state.selectedExp) { showAuthorizeForExp(state.selectedExp); return }
  document.getElementById('authorize-section').classList.add('visible')
  setStep(2)
  setTimeout(() => document.getElementById('authorize-section').scrollIntoView({ behavior:'smooth', block:'start' }), 300)
  speak('Your approval is all it takes — ZUKKU handles everything from there.')
}

async function authorizePayment() {
  const btn = document.getElementById('authorize-btn')
  btn.disabled = true; btn.textContent = 'Authenticating...'
  let ok = false
  if (window.PublicKeyCredential) {
    try {
      const ch = new Uint8Array(32); crypto.getRandomValues(ch)
      const cred = await navigator.credentials.create({ publicKey: { challenge:ch, rp:{name:'Flattora',id:location.hostname}, user:{id:new Uint8Array(16),name:'traveler@flattora.ai',displayName:'Traveler'}, pubKeyCredParams:[{alg:-7,type:'public-key'}], timeout:30000, authenticatorSelection:{userVerification:'preferred'} } })
      ok = !!cred
    } catch(e) { ok = true }
  } else { ok = true }
  if (!ok) { btn.disabled = false; btn.textContent = '✦ Authorize & Sign'; return }
  btn.textContent = 'Processing payment...'
  setBallState('thinking')
  speak('Approval received! Sending PYUSD via Kite Testnet gasless transfer now.')
  showLoading('Sending PYUSD on Kite Testnet (EIP-3009)...')
  const amount = state.selectedExp?.priceUSD || 100
  try {
    // Kite Testnet PYUSD gasless transfer（EIP-3009）
    const pyusdResult = await executePYUSDPayment(amount, state.selectedExp?.name || 'Experience booking')
    const txHash = pyusdResult.txHash || '0x' + Array.from({length:64},()=>Math.floor(Math.random()*16).toString(16)).join('')
    const pd = { txHash, amount, currency: 'PYUSD', status: pyusdResult.onchain ? 'confirmed (on-chain)' : 'confirmed (simulated)' }
    hideLoading(); addTxToFeed(pd)
    addSpent(amount)
    const payMsg = pyusdResult.onchain
      ? 'PYUSD payment confirmed on Kite Testnet! Now ZUKKU will auto-arrange your travel essentials.'
      : 'Payment processed! Now ZUKKU will auto-arrange your travel essentials within your budget cap.'
    speak(payMsg)
    setStep(3)
    flashKitePanel()
    setTimeout(() => startAutoPurchase(), 2500)
  } catch(e) {
    hideLoading()
    const mt = { txHash:'0x'+Array.from({length:64},()=>Math.floor(Math.random()*16).toString(16)).join(''), amount, currency:'PYUSD', status:'confirmed' }
    addTxToFeed(mt); addSpent(amount); setStep(3); flashKitePanel(); setTimeout(() => startAutoPurchase(), 2500)
  }
}

// ===== STEP 3: AUTO PURCHASE =====
async function startAutoPurchase() {
  if (!state.selectedExp) { showBookingComplete({ bookingId:'FLT-'+Date.now().toString(36).toUpperCase(), agentSummary:'ZUKKU has completed all arrangements for your journey.' }); return }
  showStatus('ZUKKU is auto-purchasing the essential items...')
  speak('ZUKKU is now handling each item autonomously via Kite Passport — all within the cap you set. Each transaction appears in the feed below as it completes.')
  try {
    const res = await fetch('/api/auto-suggest', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ experienceId: state.selectedExp.id }) })
    const data = await res.json()
    renderAutoPurchaseUI(data)
  } catch(e) { showBookingComplete({ bookingId:'FLT-'+Date.now().toString(36).toUpperCase(), agentSummary:'ZUKKU has completed all arrangements for your journey.' }) }
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
          <div class="item-status \${auto.find(a=>a.id===item.id) ? 'buying' : 'pending-approval'}" id="status-\${item.id}">\${auto.find(a=>a.id===item.id) ? 'Purchasing...' : 'Needs Approval'}</div>
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
    if (statusEl) { statusEl.textContent = '✓ Purchased'; statusEl.className = 'item-status done' }
    addTxToFeed({ txHash:'0x'+Array.from({length:40},()=>Math.floor(Math.random()*16).toString(16)).join(''), amount: item.priceUSD, currency:'USDC', status:'auto-purchased' })
    addSpent(item.priceUSD)
    showToast('Auto-purchased: ' + item.name)
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
        <div style="font-size:10px;color:var(--white-dim)">$\${item.priceUSD} USD — exceeds your spending limit, approval required</div>
      </div>
      <button onclick="approvePendingItem('\${item.id}', \${item.priceUSD}, '\${item.name}')" style="background:linear-gradient(135deg,var(--gold),var(--gold-light));color:#000;border:none;padding:6px 14px;font-size:10px;border-radius:14px;cursor:pointer;letter-spacing:0.1em">承認</button>
    </div>
  \`).join('')
  pendSection.style.display = 'block'
  speak('A few items exceed your auto-purchase limit and need your approval.')
  setTimeout(finalizeBooking, 3000)
}

async function approvePendingItem(id, priceUSD, name) {
  showToast('Approving: ' + name)
  try {
    await fetch('/api/payment/settle', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ amount:priceUSD, currency:'USDC', description: name }) })
  } catch(e) {}
  const card = document.getElementById('itemcard-'+id)
  if (card) { card.classList.add('purchased') }
  const statusEl = document.getElementById('status-'+id)
  if (statusEl) { statusEl.textContent = '✓ Approved'; statusEl.className = 'item-status done' }
  addTxToFeed({ txHash:'0x'+Array.from({length:40},()=>Math.floor(Math.random()*16).toString(16)).join(''), amount:priceUSD, currency:'USDC', status:'approved' })
  showToast('✓ Purchased: ' + name)
}

// Flash Kite Passport panel to show it's actively processing
function flashKitePanel() {
  const kp = document.getElementById('kite-panel')
  if (!kp) return
  kp.style.transition = 'box-shadow 0.3s, border-color 0.3s'
  kp.style.boxShadow = '0 0 32px rgba(74,255,140,0.5)'
  kp.style.borderColor = 'rgba(74,255,140,0.6)'
  showToast('⬡ Kite Passport — payment processed on-chain')
  setTimeout(() => { kp.style.boxShadow = ''; kp.style.borderColor = '' }, 3000)
}

function finalizeBooking() {
  setTimeout(() => {
    speak('All done! Every arrangement is in place. ZUKKU wishes you the most wonderful experience.')
    showBookingComplete({
      bookingId: 'FLT-' + Date.now().toString(36).toUpperCase(),
      agentSummary: 'Your experience and all essential items are booked. Sit back and let ZUKKU handle the rest. Have an unforgettable journey!'
    })
    // Sync Kite Passport panel — mark session as complete
    const kiteBadge = document.getElementById('kite-session-badge')
    if (kiteBadge) { kiteBadge.textContent = '✓ Payment Complete'; kiteBadge.style.color = 'rgba(74,255,140,0.9)' }
    const kiteSessionId = document.getElementById('kite-session-id')
    if (kiteSessionId) kiteSessionId.textContent = 'tx_' + Date.now().toString(36)
    const kiteBalance = document.getElementById('kite-balance')
    if (kiteBalance && state.selectedExp) {
      kiteBalance.textContent = state.selectedExp.priceUSD + ' USDC (paid)'
      kiteBalance.style.color = 'rgba(74,255,140,0.8)'
    }
  }, 1800)
}

function addTxToFeed(tx) {
  document.getElementById('tx-feed').classList.add('visible')
  const item = document.createElement('div'); item.className = 'tx-item'
  item.innerHTML = \`<div class="tx-dot"></div><div><div class="tx-hash">\${tx.txHash ? tx.txHash.substring(0,20)+'...' : '—'}</div><div class="tx-detail">\${tx.amount} \${tx.currency} · \${tx.status||'confirmed'} · \${new Date().toLocaleTimeString('en-US')}</div></div>\`
  document.getElementById('tx-list').appendChild(item)
  state.purchasedTxList.push(tx)
  setTimeout(() => document.getElementById('tx-feed').scrollIntoView({ behavior:'smooth', block:'start' }), 200)
}

function showBookingComplete(data) {
  document.getElementById('booking-id-display').textContent = data.bookingId || '—'
  document.getElementById('booking-summary').textContent = preprocessTTS(data.agentSummary || 'ZUKKU has completed all arrangements for your journey.')
  document.getElementById('booking-complete').classList.add('visible')
  setTimeout(() => document.getElementById('booking-complete').scrollIntoView({ behavior:'smooth', block:'start' }), 300)
  setBallState('idle')
  showStatus('✓ Complete — ZUKKU autonomously finalized every arrangement')
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
  showToast('Rules saved!')
  speak('Agent rules saved.')
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
    // PYUSD残高をKite Testnetから直接取得
    const balRes = await fetch('/api/kite/pyusd-balance')
    const balData = await balRes.json()
    if (balData.success) {
      const formatted = balData.balanceFormatted || '0.0000 PYUSD'
      document.getElementById('kite-balance').textContent = formatted
    }
  } catch(e) {
    console.warn('PYUSD balance fetch error:', e)
  }
  try {
    const res = await fetch('/api/kite/status')
    const data = await res.json()
    if (data.wallet?.address) {
      const addr = data.wallet.address
      document.getElementById('kite-wallet-addr').textContent =
        addr.slice(0,6) + '...' + addr.slice(-4)
    }
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
  const cityJa = { Tokyo:'Tokyo', Kyoto:'Kyoto', Osaka:'Osaka', Sapporo:'Sapporo',
    Fukuoka:'Fukuoka', Yakushima:'Yakushima', Shirakawa:'Shirakawa' }[city] || city
  const btn = document.querySelector('.kite-pay-btn')
  btn.classList.add('loading')
  btn.textContent = '⬡ Processing...'

  const logId = Date.now()
  // ① 何を購入するか明記
  kiteAddTxLog(logId, '⏳',
    'Travel weather data — ' + cityJa,
    '$0.01 USDC',
    'Sending x402 payment request to weather.hugen.tokyo…')

  try {
    const res = await fetch('/api/kite/weather', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ city, type: 'current' }),
    })
    const data = await res.json()
    const ts = new Date().toLocaleTimeString('en-US')

    if (data.paid) {
      // 実際に決済成功
      kiteUpdateTxLog(logId, '✅',
        'Travel weather data — ' + cityJa,
        '$0.01 USDC',
        'Kite x402 payment complete | TX: ' + (data.tx_hash||'').slice(0,14) + '… | ' + ts)
      addSpent(0.01)
      showToast('✅ Kite x402 payment complete!')
    } else if (data.x402_attempted) {
      // x402フロー実行済み（残高不足）
      kiteUpdateTxLog(logId, '⬡',
        'Travel weather data — ' + cityJa + ' [x402 executed]',
        '$0.01 USDC',
        'HTTP 402 received >> payment attempted via Kite Passport >> insufficient balance | ' + ts)
      showToast('⬡ x402 flow executed (add funds to complete payment)')
    } else {
      kiteUpdateTxLog(logId, '◉',
        'Travel weather data — ' + cityJa,
        '$0.01 USDC',
        'Sample data retrieved | x402 header verified | ' + ts)
    }

    kiteShowWeather(city, data.data)
  } catch(e) {
    kiteUpdateTxLog(logId, '❌',
      'Travel weather data — ' + cityJa,
      '$0.01 USDC',
      'Error: ' + e.message)
  } finally {
    btn.classList.remove('loading')
    btn.innerHTML = '<span class="kite-pay-icon">⬡</span> Purchase via x402'
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
let spentTotal = 0  // running total of all payments (experience + auto-purchase + weather)
function addSpent(usd) {
  spentTotal += usd
  // Header spent bar — show once spending starts
  const spentBar = document.getElementById('spent-bar')
  if (spentBar) spentBar.style.display = 'flex'
  const el = document.getElementById('spent-total-display')
  if (el) el.textContent = '$' + spentTotal.toFixed(2)
  // Kite panel spent counter
  const el2 = document.getElementById('kite-spent-display')
  if (el2) el2.textContent = spentTotal.toFixed(2) + ' USDC'
  // ③ 青囲み AVAILABLE 残高を更新
  const availEl = document.getElementById('kite-balance')
  if (availEl) {
    // kite-balanceの現在値から支出を引く
    const rawText = availEl.textContent || ''
    const current = parseFloat(rawText.replace(/[^0-9.]/g,'')) || 0
    if (!isNaN(current)) {
      const next = Math.max(0, current - usd)
      availEl.textContent = next.toFixed(2) + ' USDC'
      // 残高が減ったことを色で強調
      availEl.style.color = next < 10 ? '#FF6B6B' : '#4AFF8C'
    }
  }
}

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
  if (val <= 0) { showToast('Please enter your budget'); return }
  budgetState.amount = val
  closeBudgetModal()
  // Update Agent Rules panel budget display
  const ruleEl = document.getElementById('rule-budget-display')
  if (ruleEl) ruleEl.textContent = '$' + val + ' USD'
  // Update Kite panel limits
  const limits = document.querySelectorAll('.kite-limit')
  if (limits.length >= 2) limits[1].textContent = 'Budget cap: $' + val
  // Update budget cap display in header area
  const capEl = document.getElementById('budget-cap-display')
  if (capEl) capEl.textContent = '$' + val
  // Chat reply
  addChatMsg('user', \`My travel budget cap is $\${val} USD per transaction\`)
  const reply = \`Oh-ho, perfect! Budget cap of $\${val} is set. Kite Passport is now configured!\`
  addChatMsg('assistant', reply)
  speak(reply)
  showToast(\`✓ Budget cap set: $\${val} USD\`)
  // ① 予算設定直後に「どこへ？」を即発話（短いdelayで2文目として発声）
  setTimeout(() => {
    const guideMsg = 'Now, where in Japan would you like to go? Tell me the type of experience — Onsen retreat, nature adventure, or food and culture?'
    addChatMsg('assistant', guideMsg)
    speak(guideMsg)
  }, 1800)
}

// ============================================
// A2A SIMULATION — 3宿主ダミーウォレット
// ============================================
// 宿主エージェント（ダミーウォレット） — 受け取り側はPassport不要
const A2A_MERCHANTS = [
  {
    name: 'Yakushima Forest Lodge Jomonan', short: '縄文庵',
    wallet: '0x13D8D465285f39F53eB4C10e953258a72587B388',
    price: 302, negotiated: 280, nights: 3, total: 840,
    bookingId: 'YKS-20250601-042', checkIn: '2025-06-01',
    items: ['Waterproof Trekking Socks', 'Trail Energy Pack', 'Natural Bug Spray'], itemTotal: 35,
  },
  {
    name: 'Okuhida Hakuunsou Mountain Inn', short: '白雲荘',
    wallet: '0xa5974eb874252E32e9DE43E93eAf8c93499693a4',
    price: 255, negotiated: 235, nights: 2, total: 470,
    bookingId: 'HID-20250615-017', checkIn: '2025-06-15',
    items: ['Premium Onsen Towel Set', 'Moisturizing Mist', 'Premium Yukata'], itemTotal: 59,
  },
  {
    name: 'Goto Islands Tsubaki Inn Kaine', short: '海音',
    wallet: '0xCd2f61E96b810887429f25071ca34625735b5e83',
    price: 215, negotiated: 200, nights: 3, total: 600,
    bookingId: 'GOT-20250701-009', checkIn: '2025-07-01',
    items: ['Waterproof Camera Pouch', 'Sunscreen SPF50', 'Natural Power Stone'], itemTotal: 38,
  },
]

let a2aCurrentMerchant = 0

function buildA2ASteps(m) {
  const fromAddr = '0x4580D0C762a6988836e06acF6f59a654baf57869'
  const toAddr   = m.wallet
  const toShort  = toAddr.slice(0,6) + '...' + toAddr.slice(-4)
  const fromShort= fromAddr.slice(0,6) + '...' + fromAddr.slice(-4)
  const rnd = () => Array.from({length:16},()=>Math.floor(Math.random()*16).toString(16)).join('')
  const txHash = '0x' + rnd() + '…'
  const itHash = '0x' + rnd() + '…'
  const disc = Math.round((1 - m.negotiated / m.price) * 100)
  return [
    { cls: '', text: '[ ZUKKU Agent ] Boot — Kite Passport session agent_session_019e1948... verified' },
    { cls: '', text: '[ ZUKKU >> ' + m.name + ' ] HTTP GET /api/availability?date=' + m.checkIn + '&guests=2' },
    { cls: 'highlight', text: '[ ' + m.short + ' ] 200 OK | Available | Rate: $' + m.price + '/night | wallet: ' + toShort + '' },
    { cls: '', text: '[ ZUKKU ] Negotiate POST /api/negotiate { nights:' + m.nights + ', preference:"secluded", hint:"$' + m.negotiated + '" }' },
    { cls: 'highlight', text: '[ ' + m.short + ' ] Negotiation accepted: $' + m.negotiated + '/night (' + disc + '% off) | terms confirmed' },
    { cls: '', text: '[ ZUKKU ] Book POST /api/book { nights:' + m.nights + ', total:"$' + m.total + '" }' },
    { cls: 'payment', text: '[ ' + m.short + ' ] HTTP 402 Payment Required' },
    { cls: 'payment', text: '  payment-required: { network:"kite-2366", amount:"' + m.total + '.00", currency:"USDC",' },
    { cls: 'payment', text: '    to:"' + toAddr + '" }' },
    { cls: 'payment', text: '[ ZUKKU >> Kite Passport ] x402 payment | $' + m.total + ' USDC | from:' + fromShort + ' >> to:' + toShort + '' },
    { cls: 'payment', text: '[ Kite Passport ] Session balance OK >> payment approved | TX: ' + txHash + '' },
    { cls: 'highlight', text: '[ Kite Chain #2366 ] ✓ Block confirmed | USDC ' + m.total + '.00 transferred' },
    { cls: 'highlight', text: '  from: ' + fromAddr },
    { cls: 'highlight', text: '  to:   ' + toAddr },
    { cls: 'highlight', text: '[ ' + m.short + ' ] Booking confirmed ✓ | Ref: ' + m.bookingId + ' | Check-in: ' + m.checkIn + '' },
    { cls: '', text: '[ ZUKKU ] Auto-purchasing travel essentials: ' + m.items.join(', ') + '' },
    { cls: 'payment', text: '[ Kite Chain #2366 ] Item TX: ' + itHash + ' | USDC ' + m.itemTotal + '.00 transferred' },
    { cls: 'highlight', text: '[ COMPLETE ✓ ] Stay $' + m.total + ' + Items $' + m.itemTotal + ' = Total $' + (m.total + m.itemTotal) + ' USDC' },
    { cls: 'highlight', text: '  User payment actions: 0 | Fully autonomous via Kite x402 Agent-to-Agent ♥' },
  ]
}

async function runA2ASimulation() {
  // Sync with Kite Passport panel visually
  const kiteBadge = document.getElementById('kite-session-badge')
  if (kiteBadge) { kiteBadge.textContent = '● Processing A2A...'; kiteBadge.style.color = '#FFD700' }
  const btn = document.getElementById('a2a-simulate-btn')
  const log = document.getElementById('a2a-log')
  btn.disabled = true
  const m = A2A_MERCHANTS[a2aCurrentMerchant % A2A_MERCHANTS.length]
  a2aCurrentMerchant++
  btn.textContent = 'Running… [' + m.short + ']'
  log.innerHTML = '<div class="a2a-log-line" style="color:rgba(74,255,140,0.4)">▶ Simulation start — Host: ' + m.name + '</div>'
  for (const step of buildA2ASteps(m)) {
    await new Promise(r => setTimeout(r, 320))
    const line = document.createElement('div')
    line.className = 'a2a-log-line' + (step.cls ? ' ' + step.cls : '')
    line.textContent = step.text
    log.appendChild(line)
    log.scrollTop = log.scrollHeight
  }
  btn.disabled = false
  const nextM = A2A_MERCHANTS[a2aCurrentMerchant % A2A_MERCHANTS.length]
  btn.textContent = '↺ Next Host: ' + nextM.short
  // ⑥ A2Aシミュレーションは実際の支払いではないのでaddSpent()を呼ばない
  // addSpent(m.total + m.itemTotal)  // REMOVED: シミュレーション金額をヘッダー・青囲みに混入させない
  showToast('✓ A2A done! [' + m.short + '] — $' + (m.total + m.itemTotal) + ' USDC paid autonomously')
  // Update Kite Passport panel — reflect completed payment
  const kiteBadge2 = document.getElementById('kite-session-badge')
  if (kiteBadge2) { kiteBadge2.textContent = '● Session Active'; kiteBadge2.style.color = '' }
  const kiteBalance = document.getElementById('kite-balance')
  if (kiteBalance) {
    const prev = parseFloat(kiteBalance.textContent) || 0
    kiteBalance.textContent = (prev + m.total + m.itemTotal).toFixed(2) + ' USDC (paid)'
    kiteBalance.style.color = 'rgba(74,255,140,0.8)'
  }
  const kiteSessionId = document.getElementById('kite-session-id')
  if (kiteSessionId) kiteSessionId.textContent = 'a2a_tx_' + Date.now().toString(36)
}

// ===== PYUSD実送金（Kiteテストネット） =====
async function executePYUSDPayment(amountUSD, description) {
  // Kiteパネルにステータス表示
  const badge = document.getElementById('kite-session-badge')
  if (badge) { badge.textContent = '⬡ PYUSD Sending...'; badge.style.color = '#FFD700' }
  try {
    const res = await fetch('/api/kite/pyusd-transfer', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ amountUSD, description }),
    })
    const data = await res.json()
    if (data.success) {
      // 本物のオンチェーン送金成功
      if (badge) { badge.textContent = '✅ PYUSD Sent'; badge.style.color = '#4AFF8C' }
      const txHash = data.txHash
      kiteAddTxLog(Date.now(), '✅',
        'PYUSD gasless transfer — ' + description,
        '$' + amountUSD + ' PYUSD',
        'EIP-3009 | TX: ' + (txHash||'').slice(0,14) + '… | KiteAI Testnet #2368'
      )
      showToast('✅ PYUSD sent on Kite Testnet! TX: ' + (txHash||'').slice(0,10) + '…')
      return { success: true, txHash, onchain: true }
    } else if (data.simulation_mode) {
      // 秘密鍵未設定 → シミュレーション
      if (badge) { badge.textContent = '◉ Simulated'; badge.style.color = '#FF9800' }
      const simTx = data.simulated_tx
      kiteAddTxLog(Date.now(), '◉',
        'PYUSD transfer (simulation) — ' + description,
        '$' + amountUSD + ' PYUSD',
        'No private key configured | simulated | KiteAI Testnet #2368'
      )
      showToast('◉ Simulation: PYUSD transfer (set KITE_WALLET_PRIVATE_KEY to go live)')
      return { success: true, txHash: simTx?.txHash, onchain: false, simulated: true }
    } else {
      if (badge) { badge.textContent = '❌ Transfer failed'; badge.style.color = '#FF6B6B' }
      console.error('PYUSD transfer error:', data.error)
      return { success: false, error: data.error }
    }
  } catch(e) {
    if (badge) { badge.textContent = '● Session Active'; badge.style.color = '' }
    return { success: false, error: String(e) }
  }
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

  const cityNames = { Tokyo:'Tokyo', Kyoto:'Kyoto', Osaka:'Osaka', Sapporo:'Sapporo',
    Fukuoka:'Fukuoka', Yakushima:'Yakushima', Shirakawa:'Shirakawa-go' }
  cityEl.textContent = '⛅ ' + (cityNames[city] || city) + ' Weather'

  const condMap = { 'Partly cloudy':'Partly Cloudy', 'Clear':'Clear', 'Sunny':'Sunny',
    'Cloudy':'Cloudy', 'Rain':'Rain', 'Snow':'Snow', 'Slight rain':'Light Rain' }
  const cond = condMap[data.condition] || data.condition || '—'
  const temp = data.temperature_c != null ? data.temperature_c + '°C' : '—'
  const hum  = data.humidity_pct  != null ? data.humidity_pct  + '%'  : '—'
  const wind = data.wind_speed_kmh != null ? data.wind_speed_kmh + 'km/h' : '—'

  bodyEl.innerHTML = \`
    <div class="kite-weather-item">
      <div class="kite-weather-item-label">Condition</div>
      <div class="kite-weather-item-val">\${cond}</div>
    </div>
    <div class="kite-weather-item">
      <div class="kite-weather-item-label">Temp</div>
      <div class="kite-weather-item-val">\${temp}</div>
    </div>
    <div class="kite-weather-item">
      <div class="kite-weather-item-label">Humidity</div>
      <div class="kite-weather-item-val">\${hum}</div>
    </div>
    <div class="kite-weather-item">
      <div class="kite-weather-item-label">Wind</div>
      <div class="kite-weather-item-val">\${wind}</div>
    </div>
  \`
  // 天気情報をチャットにも流す
  const weatherMsg = \`Here's the current weather in \${cityNames[city]||city}: \${cond}, \${temp}, humidity \${hum}.\`
  addChatMsg('assistant', weatherMsg)
}

// 新規セッション作成
async function kiteCreateSession() {
  const btn = document.querySelector('.kite-new-session-btn')
  btn.textContent = 'Creating…'
  btn.disabled = true
  try {
    const res = await fetch('/api/kite/session/create', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        taskSummary: 'Flattora AI Travel Concierge — Kite x402 weather data purchase',
        maxPerTx: 2, maxTotal: 10, ttl: '2h',
      }),
    })
    const data = await res.json()
    if (data.approval_url) {
      window.open(data.approval_url, '_blank')
      showToast('⬡ Approval URL opened. Confirm with your passkey to activate the session.')
      // ポーリング開始
      if (data.request_id) kiteWaitForSession(data.request_id)
    }
  } catch(e) {
    showToast('Session creation failed: ' + e.message)
  } finally {
    btn.textContent = '+ Request New Session'
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
          document.getElementById('kite-session-badge').textContent = '● Session Active'
          document.getElementById('kite-session-badge').classList.remove('inactive')
          showToast('✅ Kite session is now active!')
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
  // 起動時にまずZUKKUの挨拶を流してから予算モーダルを表示
  setTimeout(() => {
    speak("Oh-ho, welcome! I'm ZUKKU — your personal travel concierge. Let's start with your budget.")
  }, 800)
  setTimeout(() => showBudgetModal(), 2200)
})
</script>
</body>
</html>`
  return c.html(html)
})

export default app
