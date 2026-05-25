import { useState, useEffect, useCallback, useRef } from 'react'
import { initApp } from '@freeappstore/sdk'
import { useAuth } from '@freeappstore/sdk/hooks'
import { FasShell, Spinner } from '@freeappstore/sdk/ui'

const fas = initApp({ appId: 'flight-search' })

// ── Types ──

interface FlightResult {
  id: string; airline: string; flightNo: string; origin: string; destination: string
  departTime: string; duration: string; stops: number; price: number; currency: string; bookUrl: string
}

interface HotelResult {
  id: string; name: string; location: string; rating: number; stars: number
  pricePerNight: number; currency: string; bookUrl: string; source: string
}

interface SavedItem {
  id: string; type: 'flight' | 'hotel' | 'search'
  label: string; price?: number; params: Record<string, string>; savedAt: number
}

// ── Helpers ──

const rid = () => Math.random().toString(36).slice(2, 10)
const today = () => new Date().toISOString().slice(0, 10)
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }
const fmtTime = (iso: string) => iso?.split('T')[1]?.slice(0, 5) || ''

// ── Shared styles ──

const S = {
  card: { border: '1px solid var(--color-line)', borderRadius: 12, background: 'var(--color-panel)', padding: '1.25rem' } as React.CSSProperties,
  label: { fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-muted)', marginBottom: 4 } as React.CSSProperties,
  input: { width: '100%', padding: '0.625rem 0.75rem', border: '1px solid var(--color-line)', borderRadius: 8, background: 'var(--color-paper)', color: 'var(--color-ink)', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const } as React.CSSProperties,
  btn: (active: boolean) => ({ width: '100%', padding: '0.8rem', borderRadius: 12, background: active ? 'var(--color-accent)' : 'var(--color-muted)', color: '#fff', fontSize: '0.875rem', fontWeight: 600, border: 'none', cursor: active ? 'pointer' : 'default' }) as React.CSSProperties,
  link: { background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 500, padding: 0 } as React.CSSProperties,
  muted: { background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: '0.75rem', padding: 0 } as React.CSSProperties,
  pill: { display: 'inline-block', padding: '0.35rem 0.75rem', borderRadius: 8, background: 'var(--color-accent)', fontSize: '0.75rem', fontWeight: 600, color: '#fff', textDecoration: 'none' } as React.CSSProperties,
  pillOutline: { display: 'inline-block', padding: '0.3rem 0.65rem', borderRadius: 8, border: '1px solid var(--color-line)', background: 'var(--color-paper)', fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-muted)', cursor: 'pointer', textDecoration: 'none' } as React.CSSProperties,
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' } as React.CSSProperties,
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' } as React.CSSProperties,
  stack: { display: 'flex', flexDirection: 'column' as const, gap: '1rem' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as React.CSSProperties,
  dropdown: { position: 'absolute' as const, top: '100%', left: 0, right: 0, zIndex: 100, marginTop: 4, background: 'var(--color-paper)', border: '1px solid var(--color-line)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden' } as React.CSSProperties,
}

// ── API calls ──

async function fetchFlights(proxy: typeof fas.proxy, origin: string, dest: string, date: string): Promise<FlightResult[]> {
  const res = await proxy.fetch(`api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=${origin}&destination=${dest}&departure_at=${date.slice(0, 7)}&sorting=price&limit=10&currency=usd`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  const json = await res.json() as { success: boolean; data: Array<{ origin: string; destination: string; origin_airport: string; destination_airport: string; price: number; airline: string; flight_number: string; departure_at: string; transfers: number; duration_to: number; link: string }> }
  if (!json.success || !json.data?.length) return []
  return json.data.map(d => ({
    id: rid(), airline: d.airline, flightNo: `${d.airline}${d.flight_number}`,
    origin: d.origin_airport || d.origin, destination: d.destination_airport || d.destination,
    departTime: d.departure_at, duration: `${Math.floor(d.duration_to / 60)}h ${d.duration_to % 60}m`,
    stops: d.transfers, price: d.price, currency: 'USD',
    bookUrl: `https://www.aviasales.com${d.link}`,
  }))
}

async function fetchHotels(proxy: typeof fas.proxy, city: string, checkIn: string, checkOut: string): Promise<HotelResult[]> {
  const res = await proxy.fetch(`api.travelpayouts.com/v2/cache.json?location=${encodeURIComponent(city)}&checkIn=${checkIn}&checkOut=${checkOut}&currency=usd&limit=10`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  const json = await res.json() as Record<string, { hotelName?: string; stars?: number; priceFrom?: number; locationName?: string; hotel_id?: number }>
  return Object.entries(json).slice(0, 10).map(([id, h]) => ({
    id, name: h.hotelName || `Hotel ${id}`, location: h.locationName || city,
    rating: (h.stars || 3) * 2, stars: h.stars || 3, pricePerNight: h.priceFrom || 0,
    currency: 'USD', bookUrl: `https://search.hotellook.com/hotels?id=${h.hotel_id || id}`, source: 'Hotellook',
  })).filter(h => h.pricePerNight > 0)
}

// ── PlaceInput with autocomplete dropdown ──

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'relative' }}>
      <label style={S.label}>{label}</label>
      <input
        type="text" placeholder={placeholder} value={display}
        onChange={e => { setDisplay(e.target.value); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => search(e.target.value), 250) }}
        onFocus={() => { if (suggestions.length) setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        style={S.input}
      />
      {open && suggestions.length > 0 && (
        <div style={S.dropdown}>
          {suggestions.map(p => (
            <button key={p.code + p.type}
              onMouseDown={() => { setDisplay(`${p.name} (${p.code})`); setSuggestions([]); setOpen(false); onChange(p.code) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.6rem 0.75rem', border: 'none', background: 'var(--color-paper)', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--color-ink)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-line)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-paper)')}
            >
              <strong>{p.name}</strong>
              <span style={{ color: 'var(--color-muted)', marginLeft: 8, fontSize: '0.75rem' }}>{p.code} · {p.country_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Field helpers ──

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><label style={S.label}>{label}</label>{children}</div>
}

// ── Main App ──

export default function App() {
  const { user } = useAuth(fas)
  const [tab, setTab] = useState('flights')
  const [error, setError] = useState('')

  // Flight form
  const [fOrigin, setFOrigin] = useState('')
  const [fDest, setFDest] = useState('')
  const [fDepart, setFDepart] = useState(today())
  const [fReturn, setFReturn] = useState(tomorrow())
  const [fTravelers, setFTravelers] = useState(1)
  const [fSort, setFSort] = useState<'price' | 'duration' | 'stops'>('price')

  // Hotel form
  const [hCity, setHCity] = useState('')
  const [hIn, setHIn] = useState(today())
  const [hOut, setHOut] = useState(tomorrow())
  const [hGuests, setHGuests] = useState(1)

  // Results
  const [flights, setFlights] = useState<FlightResult[]>([])
  const [hotels, setHotels] = useState<HotelResult[]>([])
  const [searching, setSearching] = useState(false)

  // Compare
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set())

  // Saved
  const [saved, setSaved] = useState<SavedItem[]>([])
  const [savedLoading, setSavedLoading] = useState(false)

  const loadSaved = useCallback(async () => {
    if (!user) return
    setSavedLoading(true)
    try { setSaved((await fas.kv.get<SavedItem[]>('saved')) ?? []) } catch {} finally { setSavedLoading(false) }
  }, [user])

  useEffect(() => { void loadSaved() }, [loadSaved])

  async function persist(items: SavedItem[]) { setSaved(items); await fas.kv.set('saved', items) }

  async function saveFlight(f: FlightResult) {
    if (!user) return
    const item: SavedItem = { id: rid(), type: 'flight', label: `${f.airline} ${f.flightNo}: ${f.origin} → ${f.destination}`, price: f.price, params: { origin: f.origin, destination: f.destination, date: f.departTime.slice(0, 10), bookUrl: f.bookUrl, duration: f.duration, stops: String(f.stops) }, savedAt: Date.now() }
    await persist([item, ...saved].slice(0, 30))
  }

  async function saveSearch(type: 'flight' | 'hotel') {
    if (!user) return
    const item: SavedItem = type === 'flight'
      ? { id: rid(), type: 'search', label: `${fOrigin} → ${fDest} (${fDepart})`, params: { origin: fOrigin, destination: fDest, depart: fDepart, ret: fReturn, travelers: String(fTravelers) }, savedAt: Date.now() }
      : { id: rid(), type: 'search', label: `Hotels in ${hCity} (${hIn})`, params: { city: hCity, checkIn: hIn, checkOut: hOut, guests: String(hGuests), searchType: 'hotel' }, savedAt: Date.now() }
    await persist([item, ...saved].slice(0, 30))
  }

  function restoreSearch(s: SavedItem) {
    if (s.params.searchType === 'hotel' || s.params.city) {
      setHCity(s.params.city ?? ''); setHIn(s.params.checkIn ?? today()); setHOut(s.params.checkOut ?? tomorrow())
      setHGuests(Number(s.params.guests) || 1); setTab('hotels')
    } else {
      setFOrigin(s.params.origin ?? ''); setFDest(s.params.destination ?? '')
      setFDepart(s.params.depart ?? s.params.date ?? today()); setFReturn(s.params.ret ?? tomorrow())
      setFTravelers(Number(s.params.travelers) || 1); setTab('flights')
    }
  }

  function toggleCompare(id: string) {
    setCompareIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  const sortedFlights = [...flights].sort((a, b) => {
    if (fSort === 'price') return a.price - b.price
    if (fSort === 'stops') return a.stops - b.stops
    return a.duration.localeCompare(b.duration)
  })

  const compareFlights = flights.filter(f => compareIds.has(f.id))

  async function searchFlights() {
    if (!fOrigin || !fDest) return
    setSearching(true); setFlights([]); setError(''); setCompareIds(new Set())
    try {
      const r = await fetchFlights(fas.proxy, fOrigin, fDest, fDepart)
      setFlights(r); if (!r.length) setError('No flights found. Try a different month or route.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Search failed. Sign in and try again.') }
    finally { setSearching(false) }
  }

  async function searchHotels() {
    if (!hCity) return
    setSearching(true); setHotels([]); setError('')
    try {
      const r = await fetchHotels(fas.proxy, hCity, hIn, hOut)
      setHotels(r); if (!r.length) setError('No hotels found. Try a different city.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Search failed. Sign in and try again.') }
    finally { setSearching(false) }
  }

  const tabs = [
    { key: 'flights', label: 'Flights' },
    { key: 'hotels', label: 'Hotels' },
    ...(compareFlights.length > 0 ? [{ key: 'compare', label: `Compare (${compareFlights.length})` }] : []),
    { key: 'saved', label: `Saved${saved.length ? ` (${saved.length})` : ''}` },
    ...(user ? [{ key: 'profile', label: 'Profile' }] : []),
  ]

  return (
    <FasShell app={fas} appName="Flight Search">
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 1rem 2rem' }}>

        {/* Hero */}
        <div style={{ textAlign: 'center', padding: '1.5rem 0 0.5rem' }}>
          <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-ink)', letterSpacing: '-0.03em' }}>
            Find Cheap Flights & Hotels
          </h1>
          <p style={{ marginTop: 6, fontSize: '0.875rem', color: 'var(--color-muted)' }}>
            Real prices from 400+ airlines. Compare side-by-side, save deals, book direct.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--color-line)', margin: '1rem 0 1.25rem', overflowX: 'auto' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: '0.6rem 0.85rem', fontSize: '0.8rem', fontWeight: tab === t.key ? 600 : 400, color: tab === t.key ? 'var(--color-ink)' : 'var(--color-muted)', borderBottom: `2px solid ${tab === t.key ? 'var(--color-accent)' : 'transparent'}`, background: 'none', border: 'none', borderBottomWidth: 2, borderBottomStyle: 'solid', borderBottomColor: tab === t.key ? 'var(--color-accent)' : 'transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >{t.label}</button>
          ))}
        </div>

        {/* Error */}
        {error && <div style={{ marginBottom: '1rem', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', padding: '0.75rem', fontSize: '0.85rem', color: '#b91c1c' }}>{error}</div>}

        {/* ── FLIGHTS ── */}
        {tab === 'flights' && (
          <div style={S.stack}>
            <div style={S.card}>
              <div style={{ ...S.stack, gap: '0.75rem' }}>
                <div style={S.grid2}>
                  <PlaceInput label="From" placeholder="City or airport..." value={fOrigin} onChange={setFOrigin} />
                  <PlaceInput label="To" placeholder="City or airport..." value={fDest} onChange={setFDest} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: '0.75rem' }}>
                  <Field label="Depart"><input type="date" value={fDepart} onChange={e => setFDepart(e.target.value)} style={S.input} /></Field>
                  <Field label="Return"><input type="date" value={fReturn} onChange={e => setFReturn(e.target.value)} style={S.input} /></Field>
                  <Field label="Pax"><input type="number" min={1} max={9} value={fTravelers} onChange={e => setFTravelers(Math.max(1, +e.target.value))} style={S.input} /></Field>
                </div>
                <button onClick={searchFlights} disabled={searching || !fOrigin || !fDest} style={S.btn(!searching && !!fOrigin && !!fDest)}>
                  {searching ? 'Searching...' : 'Search Flights'}
                </button>
              </div>
            </div>

            {searching && <div style={{ textAlign: 'center', padding: '2rem 0' }}><Spinner /><p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', marginTop: 8 }}>Comparing prices...</p></div>}

            {sortedFlights.length > 0 && !searching && (
              <div style={S.stack}>
                <div style={S.row}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>{flights.length} flights</p>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>Sort:</span>
                    {(['price', 'duration', 'stops'] as const).map(s => (
                      <button key={s} onClick={() => setFSort(s)}
                        style={{ ...S.muted, fontWeight: fSort === s ? 600 : 400, color: fSort === s ? 'var(--color-accent)' : 'var(--color-muted)', textDecoration: fSort === s ? 'underline' : 'none' }}
                      >{s}</button>
                    ))}
                  </div>
                </div>
                {user && <button onClick={() => saveSearch('flight')} style={S.link}>Save this search</button>}

                {sortedFlights.map(f => {
                  const selected = compareIds.has(f.id)
                  return (
                    <div key={f.id} style={{ ...S.card, borderColor: selected ? 'var(--color-accent)' : 'var(--color-line)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: 'var(--color-line)', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-ink)' }}>{f.airline}</span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-ink)' }}>{f.flightNo}</span>
                          </div>
                          <p style={{ fontSize: '0.875rem', color: 'var(--color-ink)', marginTop: 6 }}>{fmtTime(f.departTime)} · {f.origin} → {f.destination}</p>
                          <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: 2 }}>{f.duration} · {f.stops === 0 ? 'Nonstop' : `${f.stops} stop${f.stops > 1 ? 's' : ''}`} · {f.departTime.slice(0, 10)}</p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-ink)' }}>${f.price}</p>
                          <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button onClick={() => toggleCompare(f.id)} style={S.pillOutline}>{selected ? 'Added' : 'Compare'}</button>
                            {user && <button onClick={() => saveFlight(f)} style={S.pillOutline}>Save</button>}
                            <a href={f.bookUrl} target="_blank" rel="noopener noreferrer" style={S.pill}>Book</a>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── HOTELS ── */}
        {tab === 'hotels' && (
          <div style={S.stack}>
            <div style={S.card}>
              <div style={{ ...S.stack, gap: '0.75rem' }}>
                <PlaceInput label="Destination" placeholder="City..." value={hCity} onChange={setHCity} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: '0.75rem' }}>
                  <Field label="Check-in"><input type="date" value={hIn} onChange={e => setHIn(e.target.value)} style={S.input} /></Field>
                  <Field label="Check-out"><input type="date" value={hOut} onChange={e => setHOut(e.target.value)} style={S.input} /></Field>
                  <Field label="Guests"><input type="number" min={1} max={9} value={hGuests} onChange={e => setHGuests(Math.max(1, +e.target.value))} style={S.input} /></Field>
                </div>
                <button onClick={searchHotels} disabled={searching || !hCity} style={S.btn(!searching && !!hCity)}>
                  {searching ? 'Searching...' : 'Search Hotels'}
                </button>
              </div>
            </div>

            {searching && <div style={{ textAlign: 'center', padding: '2rem 0' }}><Spinner /><p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', marginTop: 8 }}>Comparing hotel prices...</p></div>}

            {hotels.length > 0 && !searching && (
              <div style={S.stack}>
                <div style={S.row}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>{hotels.length} hotels</p>
                  {user && <button onClick={() => saveSearch('hotel')} style={S.link}>Save search</button>}
                </div>
                {hotels.map(h => (
                  <div key={h.id} style={S.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                      <div>
                        <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-ink)' }}>{h.name}</p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: 2 }}>{h.location}</p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{'★'.repeat(h.stars)} · {h.rating}/10</p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-ink)' }}>${h.pricePerNight}</p>
                        <p style={{ fontSize: '0.6rem', color: 'var(--color-muted)' }}>per night</p>
                        <a href={h.bookUrl} target="_blank" rel="noopener noreferrer" style={{ ...S.pill, marginTop: 6, display: 'inline-block' }}>Book</a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── COMPARE ── */}
        {tab === 'compare' && (
          <div style={S.stack}>
            {compareFlights.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '3rem 0', fontSize: '0.875rem', color: 'var(--color-muted)' }}>Select flights to compare from the results.</p>
            ) : (
              <>
                <div style={S.row}>
                  <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-ink)' }}>Comparing {compareFlights.length} flights</p>
                  <button onClick={() => setCompareIds(new Set())} style={S.muted}>Clear all</button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--color-line)' }}>
                        {['Flight', 'Route', 'Time', 'Duration', 'Stops', 'Price', ''].map(h => (
                          <th key={h} style={{ padding: '0.5rem', textAlign: 'left', color: 'var(--color-muted)', fontWeight: 500 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {compareFlights.sort((a, b) => a.price - b.price).map((f, i) => (
                        <tr key={f.id} style={{ borderBottom: '1px solid var(--color-line)', background: i === 0 ? 'rgba(var(--color-accent-rgb, 216,111,77), 0.05)' : 'transparent' }}>
                          <td style={{ padding: '0.6rem 0.5rem', fontWeight: 600, color: 'var(--color-ink)' }}>{f.flightNo}</td>
                          <td style={{ padding: '0.6rem 0.5rem', color: 'var(--color-ink)' }}>{f.origin}→{f.destination}</td>
                          <td style={{ padding: '0.6rem 0.5rem', color: 'var(--color-muted)' }}>{fmtTime(f.departTime)}</td>
                          <td style={{ padding: '0.6rem 0.5rem', color: 'var(--color-muted)' }}>{f.duration}</td>
                          <td style={{ padding: '0.6rem 0.5rem', color: 'var(--color-muted)' }}>{f.stops === 0 ? 'Direct' : f.stops}</td>
                          <td style={{ padding: '0.6rem 0.5rem', fontWeight: 700, color: i === 0 ? 'var(--color-accent)' : 'var(--color-ink)' }}>${f.price}{i === 0 ? ' best' : ''}</td>
                          <td style={{ padding: '0.6rem 0.5rem' }}><a href={f.bookUrl} target="_blank" rel="noopener noreferrer" style={S.pill}>Book</a></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── SAVED ── */}
        {tab === 'saved' && (
          <div style={S.stack}>
            {!user && <p style={{ textAlign: 'center', padding: '3rem 0', fontSize: '0.875rem', color: 'var(--color-muted)' }}>Sign in to save flights and searches.</p>}
            {user && savedLoading && <div style={{ textAlign: 'center', padding: '2rem 0' }}><Spinner /></div>}
            {user && !savedLoading && !saved.length && <p style={{ textAlign: 'center', padding: '3rem 0', fontSize: '0.875rem', color: 'var(--color-muted)' }}>No saved items yet.</p>}
            {user && !savedLoading && saved.map(s => (
              <div key={s.id} style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: s.type === 'flight' ? 'var(--color-accent)' : 'var(--color-ink)' }}>{s.type}</span>
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-ink)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</p>
                  <p style={{ fontSize: '0.65rem', color: 'var(--color-muted)' }}>
                    {s.price ? `$${s.price} · ` : ''}{new Date(s.savedAt).toLocaleDateString()}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: '1rem' }}>
                  {s.params.bookUrl && <a href={s.params.bookUrl} target="_blank" rel="noopener noreferrer" style={S.pill}>Book</a>}
                  {s.type === 'search' && <button onClick={() => restoreSearch(s)} style={S.link}>Search</button>}
                  <button onClick={() => persist(saved.filter(x => x.id !== s.id))} style={S.muted}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── PROFILE ── */}
        {tab === 'profile' && user && (
          <div style={S.stack}>
            <div style={{ ...S.card, textAlign: 'center' }}>
              {user.avatarUrl && <img src={user.avatarUrl} alt="" style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 12px' }} />}
              <p style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-ink)' }}>{user.login}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: 4 }}>Signed in via GitHub</p>
            </div>
            <div style={S.card}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-ink)', marginBottom: 12 }}>Stats</h3>
              <div style={S.grid2}>
                <div style={{ borderRadius: 8, background: 'var(--color-line)', padding: 12, textAlign: 'center' }}>
                  <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-ink)' }}>{saved.length}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Saved</p>
                </div>
                <div style={{ borderRadius: 8, background: 'var(--color-line)', padding: 12, textAlign: 'center' }}>
                  <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-ink)' }}>{flights.length + hotels.length}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Results</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--color-line)' }}>
          Completely free. No tracking, no ads. Links go directly to airlines and hotels.
        </p>
      </div>
    </FasShell>
  )
}
