import { useState, useEffect, useCallback, useRef } from 'react'
import { initApp } from '@freeappstore/sdk'
import { useAuth } from '@freeappstore/sdk/hooks'
import { FasShell, Spinner } from '@freeappstore/sdk/ui'

const fas = initApp({ appId: 'flight-search' })

// ── Types ──

interface Flight {
  id: string; airline: string; flightNo: string; origin: string; destination: string
  departTime: string; arriveTime: string; duration: string; durationMin: number
  stops: number; price: number; bookUrl: string
}

interface SavedItem {
  id: string; type: 'flight' | 'search'; label: string; price?: number
  params: Record<string, string>; savedAt: number
}

// ── Helpers ──

const rid = () => Math.random().toString(36).slice(2, 10)
const today = () => new Date().toISOString().slice(0, 10)
const nextWeek = () => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10) }
const fmtTime = (iso: string) => iso?.split('T')[1]?.slice(0, 5) || ''
const fmtDate = (iso: string) => { const d = new Date(iso); return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }

function addMinutes(iso: string, mins: number): string {
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() + mins)
  return d.toISOString()
}

// ── API ──

async function fetchFlights(proxy: typeof fas.proxy, origin: string, dest: string, date: string): Promise<Flight[]> {
  const res = await proxy.fetch(`api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=${origin}&destination=${dest}&departure_at=${date.slice(0, 7)}&sorting=price&limit=10&currency=usd`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  const json = await res.json() as { success: boolean; data: Array<{ origin: string; destination: string; origin_airport: string; destination_airport: string; price: number; airline: string; flight_number: string; departure_at: string; transfers: number; duration_to: number; link: string }> }
  if (!json.success || !json.data?.length) return []
  return json.data.map(d => ({
    id: rid(), airline: d.airline, flightNo: `${d.airline}${d.flight_number}`,
    origin: d.origin_airport || d.origin, destination: d.destination_airport || d.destination,
    departTime: d.departure_at,
    arriveTime: addMinutes(d.departure_at, d.duration_to),
    duration: `${Math.floor(d.duration_to / 60)}h ${d.duration_to % 60}m`,
    durationMin: d.duration_to,
    stops: d.transfers, price: d.price, bookUrl: `https://www.aviasales.com${d.link}`,
  }))
}

// ── PlaceInput ──

type Place = { code: string; name: string; country_name: string; type: string }

function PlaceInput({ label, placeholder, value, onChange, onSwap, showSwap }: {
  label: string; placeholder?: string; value: string; onChange: (code: string) => void
  onSwap?: () => void; showSwap?: boolean
}) {
  const [suggestions, setSuggestions] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const [display, setDisplay] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (term: string) => {
    if (term.length < 2) { setSuggestions([]); return }
    try {
      const res = await fetch(`https://autocomplete.travelpayouts.com/places2?term=${encodeURIComponent(term)}&locale=en&types[]=city&types[]=airport`)
      setSuggestions(((await res.json()) as Place[]).slice(0, 6))
      setOpen(true)
    } catch { setSuggestions([]) }
  }, [])

  // Sync display when parent swaps values
  useEffect(() => { if (value && !display) setDisplay(value) }, [value])

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>{label}</label>
          <input
            type="text" placeholder={placeholder} value={display}
            onChange={e => { setDisplay(e.target.value); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => search(e.target.value), 250) }}
            onFocus={() => { if (suggestions.length) setOpen(true) }}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--paper)', color: 'var(--ink)', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        {showSwap && onSwap && (
          <button onClick={onSwap} title="Swap cities"
            style={{ flexShrink: 0, width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--line)', background: 'var(--paper)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 16, marginTop: 18 }}>
            &#8645;
          </button>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, marginTop: 4, background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.14)', overflow: 'hidden' }}>
          {suggestions.map(p => (
            <button key={p.code + p.type}
              onMouseDown={() => { setDisplay(`${p.name} (${p.code})`); setSuggestions([]); setOpen(false); onChange(p.code) }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 12px', border: 'none', background: 'var(--paper)', cursor: 'pointer', fontSize: 14, color: 'var(--ink)', textAlign: 'left' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--line)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--paper)')}
            >
              <span><strong>{p.name}</strong> <span style={{ color: 'var(--muted)', fontSize: 12 }}>{p.country_name}</span></span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{p.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── App ──

export default function App() {
  const { user } = useAuth(fas)

  // Search
  const [origin, setOrigin] = useState('')
  const [originDisplay, setOriginDisplay] = useState('')
  const [dest, setDest] = useState('')
  const [destDisplay, setDestDisplay] = useState('')
  const [depart, setDepart] = useState(today())
  const [ret, setRet] = useState(nextWeek())
  const [pax, setPax] = useState(1)
  const [tripType, setTripType] = useState<'round' | 'oneway'>('round')

  // Results
  const [flights, setFlights] = useState<Flight[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [sort, setSort] = useState<'price' | 'duration' | 'stops'>('price')
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set())
  const [showCompare, setShowCompare] = useState(false)

  // Saved
  const [saved, setSaved] = useState<SavedItem[]>([])
  const [showSaved, setShowSaved] = useState(false)

  useEffect(() => {
    if (!user) return
    fas.kv.get<SavedItem[]>('saved').then(d => setSaved(d ?? [])).catch(() => {})
  }, [user])

  async function persist(items: SavedItem[]) { setSaved(items); await fas.kv.set('saved', items) }

  function swapCities() {
    const tmpCode = origin
    const tmpDisplay = originDisplay
    setOrigin(dest); setOriginDisplay(destDisplay)
    setDest(tmpCode); setDestDisplay(tmpDisplay)
  }

  async function doSearch() {
    if (!origin || !dest) return
    setSearching(true); setFlights([]); setError(''); setCompareIds(new Set()); setShowCompare(false)
    try {
      const r = await fetchFlights(fas.proxy, origin, dest, depart)
      setFlights(r); if (!r.length) setError('No flights found for this route. Try a different month.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Search failed. Sign in first.') }
    finally { setSearching(false) }
  }

  function toggleCompare(id: string) {
    setCompareIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const sorted = [...flights].sort((a, b) =>
    sort === 'price' ? a.price - b.price : sort === 'stops' ? a.stops - b.stops : a.durationMin - b.durationMin
  )
  const compared = flights.filter(f => compareIds.has(f.id)).sort((a, b) => a.price - b.price)

  const inputBase: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--paper)', color: 'var(--ink)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }
  const labelBase: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4 }
  const cardBase: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 14, background: 'var(--panel)', padding: 16 }

  return (
    <FasShell app={fas} appName="Flight Search">
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 16px 40px' }}>

        {/* ── Search form ── */}
        <div style={{ ...cardBase, marginTop: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          {/* Trip type toggle */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 14, background: 'var(--line)', borderRadius: 8, padding: 2, width: 'fit-content' }}>
            {(['round', 'oneway'] as const).map(t => (
              <button key={t} onClick={() => setTripType(t)}
                style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', background: tripType === t ? 'var(--paper)' : 'transparent', color: tripType === t ? 'var(--ink)' : 'var(--muted)', boxShadow: tripType === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
                {t === 'round' ? 'Round trip' : 'One way'}
              </button>
            ))}
          </div>

          {/* From / To — stacked with swap button */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <PlaceInput label="From" placeholder="City or airport..." value={origin}
              onChange={c => { setOrigin(c); setOriginDisplay(c) }} showSwap onSwap={swapCities} />
            <PlaceInput label="To" placeholder="City or airport..." value={dest}
              onChange={c => { setDest(c); setDestDisplay(c) }} />
          </div>

          {/* Date / Return / Travelers */}
          <div style={{ display: 'grid', gridTemplateColumns: tripType === 'round' ? '1fr 1fr 80px' : '1fr 80px', gap: 12, marginTop: 12 }}>
            <div>
              <label style={labelBase}>Depart</label>
              <input type="date" value={depart} onChange={e => setDepart(e.target.value)} style={inputBase} />
            </div>
            {tripType === 'round' && (
              <div>
                <label style={labelBase}>Return</label>
                <input type="date" value={ret} onChange={e => setRet(e.target.value)} style={inputBase} />
              </div>
            )}
            <div>
              <label style={labelBase}>Travelers</label>
              <input type="number" min={1} max={9} value={pax} onChange={e => setPax(Math.max(1, +e.target.value))} style={inputBase} />
            </div>
          </div>

          <button onClick={doSearch} disabled={searching || !origin || !dest}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 15, width: '100%', padding: '12px 0', marginTop: 14, opacity: (!origin || !dest) ? 0.4 : 1 }}>
            {searching ? 'Searching...' : 'Search flights'}
          </button>
        </div>

        {/* ── Toolbar ── */}
        {(user || flights.length > 0) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {user && saved.length > 0 && (
              <button onClick={() => { setShowSaved(!showSaved); setShowCompare(false) }}
                style={{ ...cardBase, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: showSaved ? 'var(--accent)' : 'var(--muted)', borderColor: showSaved ? 'var(--accent)' : 'var(--line)' }}>
                Saved ({saved.length})
              </button>
            )}
            {compared.length >= 2 && (
              <button onClick={() => { setShowCompare(!showCompare); setShowSaved(false) }}
                style={{ ...cardBase, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: showCompare ? 'var(--accent)' : 'var(--muted)', borderColor: showCompare ? 'var(--accent)' : 'var(--line)' }}>
                Compare ({compared.length})
              </button>
            )}
            {user && flights.length > 0 && (
              <button onClick={async () => {
                const item: SavedItem = { id: rid(), type: 'search', label: `${origin} → ${dest} (${fmtDate(depart)})`, params: { origin, destination: dest, depart, ret, travelers: String(pax) }, savedAt: Date.now() }
                await persist([item, ...saved].slice(0, 30))
              }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 500, padding: '8px 0' }}>Save search</button>
            )}
          </div>
        )}

        {/* ── Saved panel ── */}
        {showSaved && saved.length > 0 && (
          <div style={{ ...cardBase, marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Saved</span>
              <button onClick={() => setShowSaved(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>Close</button>
            </div>
            {saved.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</p>
                  <p style={{ fontSize: 11, color: 'var(--muted)' }}>{s.price ? `$${s.price} · ` : ''}{new Date(s.savedAt).toLocaleDateString()}</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 12, alignItems: 'center' }}>
                  {s.params.bookUrl && <a href={s.params.bookUrl} target="_blank" rel="noopener noreferrer" style={{ background: 'var(--accent)', color: '#fff', padding: '4px 10px', fontSize: 11, borderRadius: 6, textDecoration: 'none', fontWeight: 600 }}>Book</a>}
                  {s.type === 'search' && <button onClick={() => { setOrigin(s.params.origin ?? ''); setDest(s.params.destination ?? ''); setDepart(s.params.depart ?? today()); setShowSaved(false) }} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>Search</button>}
                  <button onClick={() => persist(saved.filter(x => x.id !== s.id))} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>x</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Compare panel ── */}
        {showCompare && compared.length >= 2 && (
          <div style={{ ...cardBase, marginTop: 12, overflowX: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Comparison</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setCompareIds(new Set())} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>Clear</button>
                <button onClick={() => setShowCompare(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>Close</button>
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>{['Flight', 'Route', 'Date', 'Duration', 'Stops', 'Price', ''].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11, borderBottom: '2px solid var(--line)' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {compared.map((f, i) => (
                  <tr key={f.id} style={{ borderBottom: '1px solid var(--line)', background: i === 0 ? 'rgba(76,151,181,0.06)' : 'transparent' }}>
                    <td style={{ padding: '8px', fontWeight: 600 }}>{f.flightNo}</td>
                    <td style={{ padding: '8px' }}>{f.origin} → {f.destination}</td>
                    <td style={{ padding: '8px', color: 'var(--muted)' }}>{fmtDate(f.departTime)}</td>
                    <td style={{ padding: '8px', color: 'var(--muted)' }}>{f.duration}</td>
                    <td style={{ padding: '8px', color: 'var(--muted)' }}>{f.stops === 0 ? 'Direct' : f.stops}</td>
                    <td style={{ padding: '8px', fontWeight: 700, color: i === 0 ? 'var(--accent)' : 'var(--ink)' }}>${f.price}</td>
                    <td style={{ padding: '8px' }}><a href={f.bookUrl} target="_blank" rel="noopener noreferrer" style={{ background: 'var(--accent)', color: '#fff', padding: '3px 8px', fontSize: 11, borderRadius: 6, textDecoration: 'none', fontWeight: 600 }}>Book</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Error ── */}
        {error && <div style={{ marginTop: 12, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', padding: 12, fontSize: 13, color: '#b91c1c' }}>{error}</div>}

        {/* ── Loading ── */}
        {searching && <div style={{ textAlign: 'center', padding: '32px 0' }}><Spinner /><p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>Comparing prices across airlines...</p></div>}

        {/* ── Results ── */}
        {sorted.length > 0 && !searching && (
          <div style={{ marginTop: 16 }}>
            {/* Sort bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{flights.length} flight{flights.length !== 1 ? 's' : ''}</span>
              <div style={{ display: 'flex', gap: 2, background: 'var(--line)', borderRadius: 8, padding: 2 }}>
                {(['price', 'duration', 'stops'] as const).map(s => (
                  <button key={s} onClick={() => setSort(s)}
                    style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', background: sort === s ? 'var(--paper)' : 'transparent', color: sort === s ? 'var(--ink)' : 'var(--muted)', boxShadow: sort === s ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', textTransform: 'capitalize' }}
                  >{s}</button>
                ))}
              </div>
            </div>

            {sorted.map((f, idx) => {
              const inCompare = compareIds.has(f.id)
              const isCheapest = idx === 0 && sort === 'price'
              return (
                <div key={f.id} style={{ ...cardBase, marginBottom: 10, borderColor: inCompare ? 'var(--accent)' : 'var(--line)', transition: 'border-color 0.15s', position: 'relative', overflow: 'hidden' }}>
                  {/* Cheapest badge */}
                  {isCheapest && (
                    <div style={{ position: 'absolute', top: 0, left: 0, background: 'var(--accent)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 10px 2px 8px', borderRadius: '0 0 8px 0', letterSpacing: '0.03em' }}>BEST PRICE</div>
                  )}

                  {/* Main content: timeline left, price+actions right */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingTop: isCheapest ? 6 : 0 }}>
                    {/* Left: flight info + timeline */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Airline + date */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, background: 'var(--line)', fontSize: 10, fontWeight: 700, color: 'var(--ink)' }}>{f.airline}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{f.flightNo}</span>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(f.departTime)}</span>
                      </div>

                      {/* Timeline */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ textAlign: 'right', minWidth: 40 }}>
                          <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.1 }}>{fmtTime(f.departTime)}</p>
                          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{f.origin}</p>
                        </div>
                        <div style={{ flex: 1, minWidth: 40 }}>
                          <p style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', marginBottom: 3 }}>{f.duration}</p>
                          <div style={{ position: 'relative', height: 2 }}>
                            <div style={{ position: 'absolute', inset: 0, background: 'var(--line)', borderRadius: 1 }} />
                            <div style={{ position: 'absolute', left: 0, top: '50%', width: 6, height: 6, borderRadius: '50%', background: 'var(--muted)', transform: 'translate(-50%, -50%)' }} />
                            <div style={{ position: 'absolute', right: 0, top: '50%', width: 6, height: 6, borderRadius: '50%', background: 'var(--muted)', transform: 'translate(50%, -50%)' }} />
                            {f.stops > 0 && Array.from({ length: Math.min(f.stops, 3) }).map((_, i) => (
                              <div key={i} style={{ position: 'absolute', left: `${((i + 1) / (f.stops + 1)) * 100}%`, top: '50%', width: 8, height: 8, borderRadius: '50%', background: 'var(--panel)', border: '2px solid var(--muted)', transform: 'translate(-50%, -50%)' }} />
                            ))}
                          </div>
                          <p style={{ fontSize: 10, textAlign: 'center', marginTop: 3, color: f.stops === 0 ? 'var(--accent)' : 'var(--muted)', fontWeight: f.stops === 0 ? 600 : 400 }}>
                            {f.stops === 0 ? 'Nonstop' : `${f.stops} stop${f.stops > 1 ? 's' : ''}`}
                          </p>
                        </div>
                        <div style={{ textAlign: 'left', minWidth: 40 }}>
                          <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.1 }}>{fmtTime(f.arriveTime)}</p>
                          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{f.destination}</p>
                        </div>
                      </div>
                    </div>

                    {/* Right: price + actions */}
                    <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                      <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>${f.price}</span>
                      <a href={f.bookUrl} target="_blank" rel="noopener noreferrer"
                        style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, padding: '7px 18px', textDecoration: 'none', display: 'inline-block' }}>Book</a>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => toggleCompare(f.id)}
                          style={{ background: 'none', border: 'none', color: inCompare ? 'var(--accent)' : 'var(--muted)', fontSize: 11, fontWeight: 500, cursor: 'pointer', padding: 0 }}>
                          {inCompare ? '- Remove' : '+ Compare'}
                        </button>
                        {user && <button onClick={async () => {
                          const item: SavedItem = { id: rid(), type: 'flight', label: `${f.flightNo}: ${f.origin}→${f.destination} $${f.price}`, price: f.price, params: { origin: f.origin, destination: f.destination, date: f.departTime.slice(0, 10), bookUrl: f.bookUrl }, savedAt: Date.now() }
                          await persist([item, ...saved].slice(0, 30))
                        }} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 11, fontWeight: 500, cursor: 'pointer', padding: 0 }}>Save</button>}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Empty state ── */}
        {!searching && !flights.length && !error && (
          <div style={{ textAlign: 'center', padding: '56px 20px 32px' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28 }}>&#9992;</div>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>Find the best flight deals</p>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>Search 400+ airlines via Aviasales.<br />Real prices, direct booking links.</p>
          </div>
        )}

        {/* ── Footer ── */}
        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', marginTop: 32, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          Free forever. No tracking, no ads. Links go directly to airlines.
        </p>
      </div>
    </FasShell>
  )
}
