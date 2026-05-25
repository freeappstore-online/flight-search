import { useState, useEffect, useCallback, useRef } from 'react'
import { initApp } from '@freeappstore/sdk'
import { useAuth } from '@freeappstore/sdk/hooks'
import { FasShell, Spinner } from '@freeappstore/sdk/ui'

const fas = initApp({ appId: 'flight-search' })

// ── Types ──

interface Flight {
  id: string; airline: string; flightNo: string; origin: string; destination: string
  departTime: string; duration: string; stops: number; price: number; bookUrl: string
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

// ── Styles ──

const css = {
  input: { width: '100%', padding: '10px 12px', border: '1px solid var(--color-line)', borderRadius: 10, background: 'var(--color-paper)', color: 'var(--color-ink)', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const },
  label: { fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  card: { border: '1px solid var(--color-line)', borderRadius: 14, background: 'var(--color-panel)', padding: 16 } as React.CSSProperties,
  accent: { background: 'var(--color-accent)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 14 } as React.CSSProperties,
  ghost: { background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', fontSize: 12, fontWeight: 500, padding: 0 } as React.CSSProperties,
  dim: { background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: 12, padding: 0 } as React.CSSProperties,
  drop: { position: 'absolute' as const, top: '100%', left: 0, right: 0, zIndex: 100, marginTop: 4, background: 'var(--color-paper)', border: '1px solid var(--color-line)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.14)', overflow: 'hidden' } as React.CSSProperties,
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
    departTime: d.departure_at, duration: `${Math.floor(d.duration_to / 60)}h ${d.duration_to % 60}m`,
    stops: d.transfers, price: d.price, bookUrl: `https://www.aviasales.com${d.link}`,
  }))
}

// ── PlaceInput ──

type Place = { code: string; name: string; country_name: string; type: string }

function PlaceInput({ label, placeholder, value, onChange }: { label: string; placeholder?: string; value: string; onChange: (code: string) => void }) {
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

  return (
    <div style={{ position: 'relative' }}>
      <label style={{ ...css.label, display: 'block', marginBottom: 4 }}>{label}</label>
      <input
        type="text" placeholder={placeholder} value={display}
        onChange={e => { setDisplay(e.target.value); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => search(e.target.value), 250) }}
        onFocus={() => { if (suggestions.length) setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        style={css.input}
      />
      {open && suggestions.length > 0 && (
        <div style={css.drop}>
          {suggestions.map(p => (
            <button key={p.code + p.type}
              onMouseDown={() => { setDisplay(`${p.name} (${p.code})`); setSuggestions([]); setOpen(false); onChange(p.code) }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 12px', border: 'none', background: 'var(--color-paper)', cursor: 'pointer', fontSize: 14, color: 'var(--color-ink)', textAlign: 'left' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-line)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-paper)')}
            >
              <span><strong>{p.name}</strong> <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>{p.country_name}</span></span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent)' }}>{p.code}</span>
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
  const [dest, setDest] = useState('')
  const [depart, setDepart] = useState(today())
  const [ret, setRet] = useState(nextWeek())
  const [pax, setPax] = useState(1)

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

  // Actions
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
    sort === 'price' ? a.price - b.price : sort === 'stops' ? a.stops - b.stops : a.duration.localeCompare(b.duration)
  )
  const compared = flights.filter(f => compareIds.has(f.id)).sort((a, b) => a.price - b.price)
  const cheapest = compared[0]

  return (
    <FasShell app={fas} appName="Flight Search">
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px 40px' }}>

        {/* ── Search form (always visible) ── */}
        <div style={{ ...css.card, marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <PlaceInput label="From" placeholder="City or airport..." value={origin} onChange={setOrigin} />
            <PlaceInput label="To" placeholder="City or airport..." value={dest} onChange={setDest} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 64px', gap: 12, marginTop: 12 }}>
            <div>
              <label style={{ ...css.label, display: 'block', marginBottom: 4 }}>Depart</label>
              <input type="date" value={depart} onChange={e => setDepart(e.target.value)} style={css.input} />
            </div>
            <div>
              <label style={{ ...css.label, display: 'block', marginBottom: 4 }}>Return</label>
              <input type="date" value={ret} onChange={e => setRet(e.target.value)} style={css.input} />
            </div>
            <div>
              <label style={{ ...css.label, display: 'block', marginBottom: 4 }}>Pax</label>
              <input type="number" min={1} max={9} value={pax} onChange={e => setPax(Math.max(1, +e.target.value))} style={css.input} />
            </div>
          </div>
          <button onClick={doSearch} disabled={searching || !origin || !dest}
            style={{ ...css.accent, width: '100%', padding: 12, marginTop: 14, opacity: (!origin || !dest) ? 0.4 : 1 }}>
            {searching ? 'Searching...' : 'Search Flights'}
          </button>
        </div>

        {/* ── Toolbar (saved + compare toggles) ── */}
        {(user || flights.length > 0) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {user && saved.length > 0 && (
              <button onClick={() => { setShowSaved(!showSaved); setShowCompare(false) }}
                style={{ ...css.card, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: showSaved ? 'var(--color-accent)' : 'var(--color-muted)', borderColor: showSaved ? 'var(--color-accent)' : 'var(--color-line)' }}>
                Saved ({saved.length})
              </button>
            )}
            {compared.length >= 2 && (
              <button onClick={() => { setShowCompare(!showCompare); setShowSaved(false) }}
                style={{ ...css.card, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: showCompare ? 'var(--color-accent)' : 'var(--color-muted)', borderColor: showCompare ? 'var(--color-accent)' : 'var(--color-line)' }}>
                Compare ({compared.length})
              </button>
            )}
            {user && flights.length > 0 && (
              <button onClick={async () => {
                const item: SavedItem = { id: rid(), type: 'search', label: `${origin} → ${dest} (${fmtDate(depart)})`, params: { origin, destination: dest, depart, ret, travelers: String(pax) }, savedAt: Date.now() }
                await persist([item, ...saved].slice(0, 30))
              }} style={{ ...css.ghost, padding: '8px 0' }}>Save search</button>
            )}
          </div>
        )}

        {/* ── Saved panel ── */}
        {showSaved && saved.length > 0 && (
          <div style={{ ...css.card, marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>Saved</span>
              <button onClick={() => setShowSaved(false)} style={css.dim}>Close</button>
            </div>
            {saved.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-line)' }}>
                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontSize: 13, color: 'var(--color-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</p>
                  <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{s.price ? `$${s.price} · ` : ''}{new Date(s.savedAt).toLocaleDateString()}</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 12 }}>
                  {s.params.bookUrl && <a href={s.params.bookUrl} target="_blank" rel="noopener noreferrer" style={{ ...css.accent, padding: '4px 10px', fontSize: 11, borderRadius: 6, textDecoration: 'none' }}>Book</a>}
                  {s.type === 'search' && <button onClick={() => { setOrigin(s.params.origin ?? ''); setDest(s.params.destination ?? ''); setDepart(s.params.depart ?? today()); setShowSaved(false) }} style={css.ghost}>Search</button>}
                  <button onClick={() => persist(saved.filter(x => x.id !== s.id))} style={css.dim}>x</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Compare panel ── */}
        {showCompare && compared.length >= 2 && (
          <div style={{ ...css.card, marginTop: 12, overflowX: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)' }}>Comparison</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setCompareIds(new Set())} style={css.dim}>Clear</button>
                <button onClick={() => setShowCompare(false)} style={css.dim}>Close</button>
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>{['Flight', 'Route', 'Date', 'Duration', 'Stops', 'Price', ''].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--color-muted)', fontWeight: 500, fontSize: 11, borderBottom: '2px solid var(--color-line)' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {compared.map(f => (
                  <tr key={f.id} style={{ borderBottom: '1px solid var(--color-line)', background: f === cheapest ? 'rgba(76,151,181,0.06)' : 'transparent' }}>
                    <td style={{ padding: '8px', fontWeight: 600 }}>{f.flightNo}</td>
                    <td style={{ padding: '8px' }}>{f.origin}→{f.destination}</td>
                    <td style={{ padding: '8px', color: 'var(--color-muted)' }}>{fmtDate(f.departTime)}</td>
                    <td style={{ padding: '8px', color: 'var(--color-muted)' }}>{f.duration}</td>
                    <td style={{ padding: '8px', color: 'var(--color-muted)' }}>{f.stops === 0 ? 'Direct' : f.stops}</td>
                    <td style={{ padding: '8px', fontWeight: 700, color: f === cheapest ? 'var(--color-accent)' : 'var(--color-ink)' }}>${f.price}</td>
                    <td style={{ padding: '8px' }}><a href={f.bookUrl} target="_blank" rel="noopener noreferrer" style={{ ...css.accent, padding: '3px 8px', fontSize: 11, borderRadius: 6, textDecoration: 'none' }}>Book</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Error ── */}
        {error && <div style={{ marginTop: 12, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', padding: 12, fontSize: 13, color: '#b91c1c' }}>{error}</div>}

        {/* ── Loading ── */}
        {searching && <div style={{ textAlign: 'center', padding: '32px 0' }}><Spinner /><p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 8 }}>Comparing prices across airlines...</p></div>}

        {/* ── Results ── */}
        {sorted.length > 0 && !searching && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>{flights.length} flights · {origin} → {dest}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['price', 'duration', 'stops'] as const).map(s => (
                  <button key={s} onClick={() => setSort(s)}
                    style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: sort === s ? 600 : 400, border: sort === s ? '1px solid var(--color-accent)' : '1px solid var(--color-line)', background: sort === s ? 'var(--color-accent)' : 'var(--color-paper)', color: sort === s ? '#fff' : 'var(--color-muted)', cursor: 'pointer' }}
                  >{s}</button>
                ))}
              </div>
            </div>

            {sorted.map(f => {
              const inCompare = compareIds.has(f.id)
              return (
                <div key={f.id} style={{ ...css.card, marginBottom: 10, borderColor: inCompare ? 'var(--color-accent)' : 'var(--color-line)', transition: 'border-color 0.15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, background: 'var(--color-line)', fontSize: 12, fontWeight: 700, color: 'var(--color-ink)' }}>{f.airline}</span>
                        <div>
                          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>{f.flightNo}</p>
                          <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>{fmtDate(f.departTime)}</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-ink)' }}>{fmtTime(f.departTime)}</span>
                        <div style={{ flex: 1, textAlign: 'center' }}>
                          <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{f.duration}</p>
                          <div style={{ height: 1, background: 'var(--color-line)', margin: '3px 0' }} />
                          <p style={{ fontSize: 11, color: f.stops === 0 ? 'var(--color-accent)' : 'var(--color-muted)' }}>{f.stops === 0 ? 'Nonstop' : `${f.stops} stop${f.stops > 1 ? 's' : ''}`}</p>
                        </div>
                        <span style={{ fontSize: 14, color: 'var(--color-ink)' }}>{f.origin} → {f.destination}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                      <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-ink)' }}>${f.price}</p>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => toggleCompare(f.id)}
                          style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${inCompare ? 'var(--color-accent)' : 'var(--color-line)'}`, background: inCompare ? 'var(--color-accent)' : 'var(--color-paper)', color: inCompare ? '#fff' : 'var(--color-muted)', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>
                          {inCompare ? 'Added' : 'Compare'}
                        </button>
                        {user && <button onClick={async () => {
                          const item: SavedItem = { id: rid(), type: 'flight', label: `${f.flightNo}: ${f.origin}→${f.destination} $${f.price}`, price: f.price, params: { origin: f.origin, destination: f.destination, date: f.departTime.slice(0, 10), bookUrl: f.bookUrl }, savedAt: Date.now() }
                          await persist([item, ...saved].slice(0, 30))
                        }} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--color-line)', background: 'var(--color-paper)', color: 'var(--color-muted)', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>Save</button>}
                        <a href={f.bookUrl} target="_blank" rel="noopener noreferrer"
                          style={{ ...css.accent, padding: '5px 14px', fontSize: 12, textDecoration: 'none', display: 'inline-block', borderRadius: 6 }}>Book</a>
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
          <div style={{ textAlign: 'center', padding: '48px 0 24px', color: 'var(--color-muted)' }}>
            <p style={{ fontSize: 32, marginBottom: 8 }}>&#9992;</p>
            <p style={{ fontSize: 14 }}>Search for flights above to see real prices</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>Data from 400+ airlines via Aviasales</p>
          </div>
        )}

        {/* ── Footer ── */}
        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--color-muted)', marginTop: 32, paddingTop: 12, borderTop: '1px solid var(--color-line)' }}>
          Free forever. No tracking, no ads. Links go directly to airlines.
        </p>
      </div>
    </FasShell>
  )
}
