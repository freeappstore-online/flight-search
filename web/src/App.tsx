import { useState, useEffect, useCallback, useRef } from 'react'
import { initApp } from '@freeappstore/sdk'
import { useAuth } from '@freeappstore/sdk/hooks'
import { FasShell, Spinner } from '@freeappstore/sdk/ui'

const fas = initApp({ appId: 'flight-search' })

/* ── Types ── */
interface FlightResult {
  id: string
  airline: string
  flightNo: string
  origin: string
  destination: string
  departTime: string
  duration: string
  stops: number
  price: number
  currency: string
  bookUrl: string
}

interface HotelResult {
  id: string
  name: string
  location: string
  rating: number
  stars: number
  pricePerNight: number
  currency: string
  bookUrl: string
  source: string
}

interface SavedSearch {
  id: string
  type: 'flight' | 'hotel'
  label: string
  params: Record<string, string>
  savedAt: number
}

/* ── Helpers ── */
function randomId() { return Math.random().toString(36).slice(2, 10) }
function todayStr() { return new Date().toISOString().slice(0, 10) }
function tomorrowStr() { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }
function formatTime(iso: string) { return iso?.split('T')[1]?.slice(0, 5) || '' }

/* ── API calls via proxy ── */
async function searchFlightsAPI(
  proxy: typeof fas.proxy, origin: string, destination: string, departDate: string,
): Promise<FlightResult[]> {
  const month = departDate.slice(0, 7)
  const res = await proxy.fetch(
    `api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=${origin}&destination=${destination}&departure_at=${month}&sorting=price&limit=8&currency=usd`
  )
  if (!res.ok) throw new Error(`API: ${res.status}`)
  const json = await res.json() as {
    success: boolean
    data: Array<{
      origin: string; destination: string; origin_airport: string; destination_airport: string
      price: number; airline: string; flight_number: string; departure_at: string
      transfers: number; duration_to: number; link: string
    }>
  }
  if (!json.success || !json.data?.length) return []
  return json.data.map(d => ({
    id: randomId(),
    airline: d.airline,
    flightNo: `${d.airline}${d.flight_number}`,
    origin: d.origin_airport || d.origin,
    destination: d.destination_airport || d.destination,
    departTime: d.departure_at,
    duration: `${Math.floor(d.duration_to / 60)}h ${d.duration_to % 60}m`,
    stops: d.transfers,
    price: d.price,
    currency: 'USD',
    bookUrl: `https://www.aviasales.com${d.link}`,
  }))
}

async function searchHotelsAPI(
  proxy: typeof fas.proxy, city: string, checkIn: string, checkOut: string,
): Promise<HotelResult[]> {
  const res = await proxy.fetch(
    `api.travelpayouts.com/v2/cache.json?location=${encodeURIComponent(city)}&checkIn=${checkIn}&checkOut=${checkOut}&currency=usd&limit=8`
  )
  if (!res.ok) throw new Error(`API: ${res.status}`)
  const json = await res.json() as {
    [hotelId: string]: { hotelName?: string; stars?: number; priceFrom?: number; locationName?: string; hotel_id?: number }
  }
  return Object.entries(json).slice(0, 8).map(([id, h]) => ({
    id,
    name: h.hotelName || `Hotel ${id}`,
    location: h.locationName || city,
    rating: (h.stars || 3) * 2,
    stars: h.stars || 3,
    pricePerNight: h.priceFrom || 0,
    currency: 'USD',
    bookUrl: `https://search.hotellook.com/hotels?id=${h.hotel_id || id}`,
    source: 'Hotellook',
  })).filter(h => h.pricePerNight > 0)
}

/* ── Place autocomplete ── */
type Place = { code: string; name: string; country_name: string; type: string }

function PlaceInput({ label, placeholder, value, onChange }: {
  label: string; placeholder?: string; value: string
  onChange: (code: string) => void
}) {
  const [suggestions, setSuggestions] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const [display, setDisplay] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchSuggestions = useCallback(async (term: string) => {
    if (term.length < 2) { setSuggestions([]); return }
    try {
      const res = await fetch(
        `https://autocomplete.travelpayouts.com/places2?term=${encodeURIComponent(term)}&locale=en&types[]=city&types[]=airport`
      )
      const data = await res.json() as Place[]
      setSuggestions(data.slice(0, 6))
      setOpen(true)
    } catch { setSuggestions([]) }
  }, [])

  const handleInput = useCallback((val: string) => {
    setDisplay(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => fetchSuggestions(val), 250)
  }, [fetchSuggestions])

  const selectPlace = useCallback((place: Place) => {
    setDisplay(`${place.name} (${place.code})`)
    setSuggestions([])
    setOpen(false)
    onChange(place.code)
  }, [onChange])

  return (
    <div className="flex flex-col gap-1 relative">
      <label className="text-xs font-medium text-[var(--color-muted)]">{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        value={display}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        className="w-full px-3 py-2.5 border border-[var(--color-line)] rounded-lg bg-[var(--color-paper)] text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)]"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-[var(--color-paper)] border border-[var(--color-line)] rounded-lg shadow-lg overflow-hidden">
          {suggestions.map(place => (
            <button
              key={place.code + place.type}
              onMouseDown={() => selectPlace(place)}
              className="block w-full text-left px-3 py-2.5 text-sm text-[var(--color-ink)] hover:bg-[var(--color-line)] transition-colors"
            >
              <span className="font-semibold">{place.name}</span>
              <span className="text-[var(--color-muted)] ml-2 text-xs">
                {place.code} · {place.country_name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Simple input helpers ── */
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--color-line)',
  borderRadius: '0.5rem', background: 'var(--color-paper)', color: 'var(--color-ink)',
  fontSize: '0.875rem', outline: 'none',
}
const labelStyle: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-muted)' }

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <label style={labelStyle}>{label}</label>
      <input type="date" value={value} onChange={e => onChange(e.target.value)} style={inputStyle} />
    </div>
  )
}

function NumInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <label style={labelStyle}>{label}</label>
      <input type="number" min={1} max={9} value={value} onChange={e => onChange(Number(e.target.value))} style={inputStyle} />
    </div>
  )
}

/* ── Main App ── */
export default function App() {
  const { user } = useAuth(fas)
  const [tab, setTab] = useState('flights')
  const [error, setError] = useState('')

  // Flight form
  const [flightOrigin, setFlightOrigin] = useState('')
  const [flightDest, setFlightDest] = useState('')
  const [departDate, setDepartDate] = useState(todayStr())
  const [returnDate, setReturnDate] = useState(tomorrowStr())
  const [travelers, setTravelers] = useState(1)

  // Hotel form
  const [hotelCity, setHotelCity] = useState('')
  const [checkIn, setCheckIn] = useState(todayStr())
  const [checkOut, setCheckOut] = useState(tomorrowStr())
  const [guests, setGuests] = useState(1)

  // Results
  const [flightResults, setFlightResults] = useState<FlightResult[]>([])
  const [hotelResults, setHotelResults] = useState<HotelResult[]>([])
  const [searching, setSearching] = useState(false)

  // Saved
  const [saved, setSaved] = useState<SavedSearch[]>([])
  const [savedLoading, setSavedLoading] = useState(false)

  const loadSaved = useCallback(async () => {
    if (!user) return
    setSavedLoading(true)
    try {
      const data = await fas.kv.get<SavedSearch[]>('saved-searches')
      setSaved(data ?? [])
    } catch {} finally { setSavedLoading(false) }
  }, [user])

  useEffect(() => { void loadSaved() }, [loadSaved])

  async function saveCurrent(type: 'flight' | 'hotel') {
    if (!user) return
    const entry: SavedSearch = type === 'flight'
      ? { id: randomId(), type: 'flight', label: `${flightOrigin} → ${flightDest} (${departDate})`, params: { origin: flightOrigin, destination: flightDest, departDate, returnDate, travelers: String(travelers) }, savedAt: Date.now() }
      : { id: randomId(), type: 'hotel', label: `${hotelCity} (${checkIn} → ${checkOut})`, params: { city: hotelCity, checkIn, checkOut, guests: String(guests) }, savedAt: Date.now() }
    const updated = [entry, ...saved].slice(0, 20)
    setSaved(updated)
    await fas.kv.set('saved-searches', updated)
  }

  async function deleteSaved(id: string) {
    const updated = saved.filter(s => s.id !== id)
    setSaved(updated)
    await fas.kv.set('saved-searches', updated)
  }

  function restoreSearch(s: SavedSearch) {
    if (s.type === 'flight') {
      setFlightOrigin(s.params.origin ?? ''); setFlightDest(s.params.destination ?? '')
      setDepartDate(s.params.departDate ?? todayStr()); setReturnDate(s.params.returnDate ?? tomorrowStr())
      setTravelers(Number(s.params.travelers) || 1); setTab('flights')
    } else {
      setHotelCity(s.params.city ?? ''); setCheckIn(s.params.checkIn ?? todayStr())
      setCheckOut(s.params.checkOut ?? tomorrowStr()); setGuests(Number(s.params.guests) || 1); setTab('hotels')
    }
  }

  async function handleFlightSearch() {
    if (!flightOrigin.trim() || !flightDest.trim()) return
    setSearching(true); setFlightResults([]); setError('')
    try {
      const results = await searchFlightsAPI(fas.proxy, flightOrigin, flightDest, departDate)
      setFlightResults(results)
      if (results.length === 0) setError('No flights found for this route and date. Try a different month.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed. Sign in and try again.')
    } finally { setSearching(false) }
  }

  async function handleHotelSearch() {
    if (!hotelCity.trim()) return
    setSearching(true); setHotelResults([]); setError('')
    try {
      const results = await searchHotelsAPI(fas.proxy, hotelCity, checkIn, checkOut)
      setHotelResults(results)
      if (results.length === 0) setError('No hotels found for this destination. Try a different city.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed. Sign in and try again.')
    } finally { setSearching(false) }
  }

  const tabs = [
    { key: 'flights', label: 'Flights' },
    { key: 'hotels', label: 'Hotels' },
    { key: 'saved', label: 'Saved' },
    ...(user ? [{ key: 'profile', label: 'Profile' }] : []),
  ]

  return (
    <FasShell app={fas} appName="Flight Search">
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 1rem 2rem' }}>

        {/* Hero */}
        <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
          <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-ink)', letterSpacing: '-0.03em' }}>
            Find Cheap Flights & Hotels
          </h1>
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-muted)' }}>
            Compare real prices. Book directly with airlines and hotels.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--color-line)', marginBottom: '1.5rem' }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '0.625rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: tab === t.key ? 'var(--color-ink)' : 'var(--color-muted)',
                borderBottom: tab === t.key ? '2px solid var(--color-accent)' : '2px solid transparent',
                background: 'none',
                border: 'none',
                borderBottomWidth: 2,
                borderBottomStyle: 'solid',
                borderBottomColor: tab === t.key ? 'var(--color-accent)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Error banner */}
        {error && (
          <div style={{ marginBottom: '1rem', borderRadius: '0.5rem', background: '#fef2f2', border: '1px solid #fecaca', padding: '0.75rem', fontSize: '0.875rem', color: '#b91c1c' }}>
            {error}
          </div>
        )}

        {/* ── Flights Tab ── */}
        {tab === 'flights' && (
          <div>
            <div style={{ border: '1px solid var(--color-line)', borderRadius: '0.75rem', background: 'var(--color-panel)', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                <PlaceInput label="From" placeholder="Type a city or airport..." value={flightOrigin} onChange={setFlightOrigin} />
                <PlaceInput label="To" placeholder="Type a city or airport..." value={flightDest} onChange={setFlightDest} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                <DateInput label="Depart" value={departDate} onChange={setDepartDate} />
                <DateInput label="Return" value={returnDate} onChange={setReturnDate} />
                <NumInput label="Travelers" value={travelers} onChange={v => setTravelers(Math.max(1, v))} />
              </div>
              <button
                onClick={handleFlightSearch}
                disabled={searching || !flightOrigin || !flightDest}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.75rem', background: 'var(--color-accent)', color: '#fff', fontSize: '0.875rem', fontWeight: 600, border: 'none', cursor: 'pointer', opacity: (searching || !flightOrigin || !flightDest) ? 0.4 : 1 }}
              >
                {searching ? 'Searching...' : 'Search Flights'}
              </button>
            </div>

            {searching && (
              <div className="text-center py-8">
                <Spinner />
                <p className="text-sm text-[var(--color-muted)] mt-2">Comparing prices across airlines...</p>
              </div>
            )}

            {flightResults.length > 0 && !searching && (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-[var(--color-muted)]">{flightResults.length} flights found</p>
                  {user && (
                    <button onClick={() => saveCurrent('flight')} className="text-xs text-[var(--color-accent)] font-medium hover:underline">
                      Save search
                    </button>
                  )}
                </div>
                {flightResults.map(f => (
                  <div key={f.id} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--color-line)] text-xs font-bold text-[var(--color-ink)]">{f.airline}</span>
                          <span className="text-sm font-semibold text-[var(--color-ink)]">{f.flightNo}</span>
                        </div>
                        <p className="text-sm text-[var(--color-ink)]">{formatTime(f.departTime)} · {f.origin} → {f.destination}</p>
                        <p className="text-xs text-[var(--color-muted)]">
                          {f.duration} · {f.stops === 0 ? 'Nonstop' : `${f.stops} stop${f.stops > 1 ? 's' : ''}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-4 space-y-1">
                        <p className="text-xl font-bold text-[var(--color-ink)]">${f.price}</p>
                        <a
                          href={f.bookUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block rounded-lg bg-[var(--color-accent)] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                        >
                          Book
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Hotels Tab ── */}
        {tab === 'hotels' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4 space-y-4">
              <PlaceInput label="Destination" placeholder="Type a city..." value={hotelCity} onChange={setHotelCity} />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-[var(--color-muted)]">Check-in</label>
                  <input type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)}
                    className="w-full px-3 py-2.5 border border-[var(--color-line)] rounded-lg bg-[var(--color-paper)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-accent)]" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-[var(--color-muted)]">Check-out</label>
                  <input type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)}
                    className="w-full px-3 py-2.5 border border-[var(--color-line)] rounded-lg bg-[var(--color-paper)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-accent)]" />
                </div>
                <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
                  <label className="text-xs font-medium text-[var(--color-muted)]">Guests</label>
                  <input type="number" min={1} max={9} value={guests} onChange={e => setGuests(Math.max(1, Number(e.target.value)))}
                    className="w-full px-3 py-2.5 border border-[var(--color-line)] rounded-lg bg-[var(--color-paper)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-accent)]" />
                </div>
              </div>
              <button
                onClick={handleHotelSearch}
                disabled={searching || !hotelCity}
                className="w-full rounded-xl bg-[var(--color-accent)] py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {searching ? 'Searching...' : 'Search Hotels'}
              </button>
            </div>

            {searching && (
              <div className="text-center py-8">
                <Spinner />
                <p className="text-sm text-[var(--color-muted)] mt-2">Comparing hotel prices...</p>
              </div>
            )}

            {hotelResults.length > 0 && !searching && (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-[var(--color-muted)]">{hotelResults.length} hotels found</p>
                  {user && (
                    <button onClick={() => saveCurrent('hotel')} className="text-xs text-[var(--color-accent)] font-medium hover:underline">
                      Save search
                    </button>
                  )}
                </div>
                {hotelResults.map(h => (
                  <div key={h.id} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-[var(--color-ink)]">{h.name}</p>
                        <p className="text-xs text-[var(--color-muted)]">{h.location}</p>
                        <p className="text-xs text-[var(--color-muted)]">{'★'.repeat(h.stars)} · {h.rating}/10</p>
                      </div>
                      <div className="text-right shrink-0 ml-4 space-y-1">
                        <p className="text-xl font-bold text-[var(--color-ink)]">${h.pricePerNight}</p>
                        <p className="text-[0.6rem] text-[var(--color-muted)]">per night</p>
                        <a
                          href={h.bookUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block rounded-lg bg-[var(--color-accent)] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                        >
                          Book
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Saved Tab ── */}
        {tab === 'saved' && (
          <div className="space-y-3">
            {!user && (
              <div className="text-center py-12 text-sm text-[var(--color-muted)]">
                Sign in to save your searches.
              </div>
            )}
            {user && savedLoading && (
              <div className="text-center py-8"><Spinner /></div>
            )}
            {user && !savedLoading && saved.length === 0 && (
              <div className="text-center py-12 text-sm text-[var(--color-muted)]">
                No saved searches yet. Search for flights or hotels and save them here.
              </div>
            )}
            {user && !savedLoading && saved.map(s => (
              <div key={s.id} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4 flex justify-between items-center">
                <div>
                  <span className={`text-[0.65rem] font-bold uppercase tracking-wider ${s.type === 'flight' ? 'text-[var(--color-accent)]' : 'text-[var(--color-ink)]'}`}>
                    {s.type}
                  </span>
                  <p className="text-sm text-[var(--color-ink)] mt-0.5">{s.label}</p>
                  <p className="text-[0.65rem] text-[var(--color-muted)]">{new Date(s.savedAt).toLocaleDateString()}</p>
                </div>
                <div className="flex gap-2 shrink-0 ml-4">
                  <button onClick={() => restoreSearch(s)} className="text-xs text-[var(--color-accent)] font-medium hover:underline">Search</button>
                  <button onClick={() => deleteSaved(s.id)} className="text-xs text-[var(--color-muted)] hover:text-red-500">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Profile Tab ── */}
        {tab === 'profile' && user && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-6 text-center">
              {user.avatarUrl && (
                <img src={user.avatarUrl} alt="" className="w-16 h-16 rounded-full mx-auto mb-3" />
              )}
              <p className="text-lg font-semibold text-[var(--color-ink)]">{user.login}</p>
              <p className="text-xs text-[var(--color-muted)] mt-1">Signed in via GitHub</p>
            </div>
            <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4 space-y-3">
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">Your Stats</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-[var(--color-line)] p-3 text-center">
                  <p className="text-2xl font-bold text-[var(--color-ink)]">{saved.length}</p>
                  <p className="text-xs text-[var(--color-muted)]">Saved searches</p>
                </div>
                <div className="rounded-lg bg-[var(--color-line)] p-3 text-center">
                  <p className="text-2xl font-bold text-[var(--color-ink)]">{flightResults.length + hotelResults.length}</p>
                  <p className="text-xs text-[var(--color-muted)]">Results found</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-[var(--color-muted)] mt-8 pt-4 border-t border-[var(--color-line)]">
          100% free. No commissions, no hidden fees. Links go directly to airlines and hotels.
        </p>
      </div>
    </FasShell>
  )
}
