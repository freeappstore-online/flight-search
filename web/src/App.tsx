import { useState, useEffect, useCallback, useRef } from 'react'
import { initApp } from '@freeappstore/sdk'
import { useAuth } from '@freeappstore/sdk/hooks'
import { FasShell, Tabs, Card, Spinner, BuildInfo } from '@freeappstore/sdk/ui'

const fas = initApp({ appId: 'flight-search' })

/* ── Types ── */
interface FlightResult {
  id: string
  airline: string
  flightNo: string
  origin: string
  destination: string
  departTime: string
  arriveTime: string
  duration: string
  stops: number
  price: number
  currency: string
  bookUrl: string
  source: string
}

interface HotelResult {
  id: string
  name: string
  location: string
  rating: number
  stars: number
  pricePerNight: number
  currency: string
  imageUrl: string
  bookUrl: string
  source: string
  amenities: string[]
}

interface SavedSearch {
  id: string
  type: 'flight' | 'hotel'
  label: string
  params: Record<string, string>
  savedAt: number
}

/* ── Constants ── */

function randomId() {
  return Math.random().toString(36).slice(2, 10)
}


/* ── Search functions using Travelpayouts API via proxy ── */

async function searchFlights(
  proxy: typeof fas.proxy,
  origin: string,
  destination: string,
  departDate: string,
  _returnDate: string,
  _travelers: number,
): Promise<FlightResult[]> {
  // Travelpayouts cheapest tickets API (token injected by proxy)
  const month = departDate.slice(0, 7) // YYYY-MM
  const res = await proxy.fetch(
    `api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=${origin}&destination=${destination}&departure_at=${month}&sorting=price&limit=8&currency=usd`
  )
  if (!res.ok) throw new Error(`Travelpayouts flights: ${res.status}`)
  const json = await res.json() as {
    success: boolean
    data: Array<{
      origin: string
      destination: string
      origin_airport: string
      destination_airport: string
      price: number
      airline: string
      flight_number: string
      departure_at: string
      return_at: string
      transfers: number
      duration_to: number
      link: string
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
    arriveTime: d.departure_at, // API doesn't give arrival time
    duration: `${Math.floor(d.duration_to / 60)}h ${d.duration_to % 60}m`,
    stops: d.transfers,
    price: d.price,
    currency: 'USD',
    bookUrl: `https://www.aviasales.com${d.link}`,
    source: 'Aviasales',
  }))
}

async function searchHotels(
  proxy: typeof fas.proxy,
  city: string,
  checkIn: string,
  checkOut: string,
  _guests: number,
): Promise<HotelResult[]> {
  // Travelpayouts hotel prices API (token injected by proxy)
  const res = await proxy.fetch(
    `api.travelpayouts.com/v2/cache.json?location=${encodeURIComponent(city)}&checkIn=${checkIn}&checkOut=${checkOut}&currency=usd&limit=8`
  )
  if (!res.ok) throw new Error(`Travelpayouts hotels: ${res.status}`)
  const json = await res.json() as {
    [hotelId: string]: {
      hotelName?: string
      stars?: number
      priceFrom?: number
      locationName?: string
      hotel_id?: number
    }
  }

  return Object.entries(json).slice(0, 8).map(([id, h]) => ({
    id,
    name: h.hotelName || `Hotel ${id}`,
    location: h.locationName || city,
    rating: (h.stars || 3) * 2,
    stars: h.stars || 3,
    pricePerNight: h.priceFrom || 0,
    currency: 'USD',
    imageUrl: '',
    bookUrl: `https://search.hotellook.com/hotels?id=${h.hotel_id || id}`,
    source: 'Hotellook',
    amenities: [],
  })).filter(h => h.pricePerNight > 0)
}

/* ── Helper ── */
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function tomorrowStr() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function formatTime(iso: string) {
  const t = iso.split('T')[1]
  if (!t) return ''
  return t.slice(0, 5)
}

/* ── Main App ── */
export default function App() {
  const { user } = useAuth(fas)
  const [tab, setTab] = useState('flights')

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

  // Saved searches
  const [saved, setSaved] = useState<SavedSearch[]>([])
  const [savedLoading, setSavedLoading] = useState(false)

  // Load saved searches from KV
  const loadSaved = useCallback(async () => {
    if (!user) return
    setSavedLoading(true)
    try {
      const data = await fas.kv.get<SavedSearch[]>('saved-searches')
      setSaved(data ?? [])
    } catch {
      // silently fail
    } finally {
      setSavedLoading(false)
    }
  }, [user])

  useEffect(() => {
    void loadSaved()
  }, [loadSaved])

  async function saveCurrent(type: 'flight' | 'hotel') {
    if (!user) return
    const entry: SavedSearch = type === 'flight'
      ? {
          id: randomId(),
          type: 'flight',
          label: `${flightOrigin} -> ${flightDest} (${departDate})`,
          params: { origin: flightOrigin, destination: flightDest, departDate, returnDate, travelers: String(travelers) },
          savedAt: Date.now(),
        }
      : {
          id: randomId(),
          type: 'hotel',
          label: `${hotelCity} (${checkIn} to ${checkOut})`,
          params: { city: hotelCity, checkIn, checkOut, guests: String(guests) },
          savedAt: Date.now(),
        }
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
      setFlightOrigin(s.params.origin ?? '')
      setFlightDest(s.params.destination ?? '')
      setDepartDate(s.params.departDate ?? todayStr())
      setReturnDate(s.params.returnDate ?? tomorrowStr())
      setTravelers(Number(s.params.travelers) || 1)
      setTab('flights')
    } else {
      setHotelCity(s.params.city ?? '')
      setCheckIn(s.params.checkIn ?? todayStr())
      setCheckOut(s.params.checkOut ?? tomorrowStr())
      setGuests(Number(s.params.guests) || 1)
      setTab('hotels')
    }
  }

  async function handleFlightSearch() {
    if (!flightOrigin.trim() || !flightDest.trim()) return
    setSearching(true)
    setFlightResults([])
    try {
      const results = await searchFlights(fas.proxy, flightOrigin, flightDest, departDate, returnDate, travelers)
      setFlightResults(results)
    } finally {
      setSearching(false)
    }
  }

  async function handleHotelSearch() {
    if (!hotelCity.trim()) return
    setSearching(true)
    setHotelResults([])
    try {
      const results = await searchHotels(fas.proxy, hotelCity, checkIn, checkOut, guests)
      setHotelResults(results)
    } finally {
      setSearching(false)
    }
  }

  return (
    <FasShell app={fas} appName="Flight Search">
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 1rem' }}>
        <Tabs
          tabs={[
            { key: 'flights', label: 'Flights' },
            { key: 'hotels', label: 'Hotels' },
            { key: 'saved', label: 'Saved' },
          ]}
          active={tab}
          onChange={setTab}
        />

        <div style={{ marginTop: '1.5rem' }}>
          {/* ── Flights Tab ── */}
          {tab === 'flights' && (
            <div>
              <Card>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <PlaceInput label="From" placeholder="Type a city or airport..." value={flightOrigin} onChange={(code) => setFlightOrigin(code)} />
                    <PlaceInput label="To" placeholder="Type a city or airport..." value={flightDest} onChange={(code) => setFlightDest(code)} />
                  </div>
                  <Input label="Depart" type="date" value={departDate} onChange={setDepartDate} />
                  <Input label="Return" type="date" value={returnDate} onChange={setReturnDate} />
                  <Input label="Travelers" type="number" value={String(travelers)} onChange={v => setTravelers(Math.max(1, Number(v)))} />
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button onClick={handleFlightSearch} disabled={searching} style={btnStyle}>
                      {searching ? 'Searching...' : 'Search Flights'}
                    </button>
                  </div>
                </div>
              </Card>

              {searching && (
                <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                  <Spinner />
                  <p style={{ color: 'var(--color-muted)', marginTop: '0.5rem' }}>Comparing prices across airlines...</p>
                </div>
              )}

              {flightResults.length > 0 && !searching && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>
                      {flightResults.length} results found
                    </p>
                    {user && (
                      <button onClick={() => saveCurrent('flight')} style={linkBtnStyle}>
                        Save this search
                      </button>
                    )}
                  </div>
                  {flightResults.map(f => (
                    <FlightCard key={f.id} flight={f} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Hotels Tab ── */}
          {tab === 'hotels' && (
            <div>
              <Card>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <PlaceInput label="City or destination" placeholder="Type a city..." value={hotelCity} onChange={(code) => setHotelCity(code)} />
                  </div>
                  <Input label="Check-in" type="date" value={checkIn} onChange={setCheckIn} />
                  <Input label="Check-out" type="date" value={checkOut} onChange={setCheckOut} />
                  <Input label="Guests" type="number" value={String(guests)} onChange={v => setGuests(Math.max(1, Number(v)))} />
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button onClick={handleHotelSearch} disabled={searching} style={btnStyle}>
                      {searching ? 'Searching...' : 'Search Hotels'}
                    </button>
                  </div>
                </div>
              </Card>

              {searching && (
                <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                  <Spinner />
                  <p style={{ color: 'var(--color-muted)', marginTop: '0.5rem' }}>Comparing hotel prices...</p>
                </div>
              )}

              {hotelResults.length > 0 && !searching && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>
                      {hotelResults.length} results found
                    </p>
                    {user && (
                      <button onClick={() => saveCurrent('hotel')} style={linkBtnStyle}>
                        Save this search
                      </button>
                    )}
                  </div>
                  {hotelResults.map(h => (
                    <HotelCard key={h.id} hotel={h} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Saved Tab ── */}
          {tab === 'saved' && (
            <div>
              {!user && (
                <Card>
                  <p style={{ color: 'var(--color-muted)', textAlign: 'center', padding: '2rem 0' }}>
                    Sign in to save your searches.
                  </p>
                </Card>
              )}
              {user && savedLoading && (
                <div style={{ textAlign: 'center', padding: '3rem 0' }}><Spinner /></div>
              )}
              {user && !savedLoading && saved.length === 0 && (
                <Card>
                  <p style={{ color: 'var(--color-muted)', textAlign: 'center', padding: '2rem 0' }}>
                    No saved searches yet. Search for flights or hotels and save your searches here.
                  </p>
                </Card>
              )}
              {user && !savedLoading && saved.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {saved.map(s => (
                    <Card key={s.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            color: s.type === 'flight' ? 'var(--color-accent)' : 'var(--color-ink)',
                            marginRight: '0.5rem',
                          }}>
                            {s.type}
                          </span>
                          <span style={{ color: 'var(--color-ink)', fontSize: '0.875rem' }}>{s.label}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button onClick={() => restoreSearch(s)} style={linkBtnStyle}>Search again</button>
                          <button onClick={() => deleteSaved(s.id)} style={{ ...linkBtnStyle, color: 'var(--color-muted)' }}>Remove</button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Free disclaimer ── */}
        <p style={{
          textAlign: 'center',
          fontSize: '0.75rem',
          color: 'var(--color-muted)',
          marginTop: '2rem',
          padding: '0.5rem 0',
          borderTop: '1px solid var(--color-line)',
        }}>
          100% free. No commissions, no hidden fees. Links go directly to airlines and hotels.
        </p>

        {/* ── Footer ── */}
        <div style={{ textAlign: 'center', padding: '1rem 0 2rem' }}>
          <a
            href="https://freeappstore.online"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-muted)', fontSize: '0.75rem', textDecoration: 'none' }}
          >
            Part of FreeAppStore
          </a>
        </div>

        <BuildInfo />
      </div>
    </FasShell>
  )
}

/* ── Sub-components ── */

function FlightCard({ flight }: { flight: FlightResult }) {
  return (
    <div style={{
      border: '1px solid var(--color-line)',
      borderRadius: 'var(--radius-card, 0.75rem)',
      background: 'var(--color-panel)',
      padding: '1rem 1.25rem',
      marginBottom: '0.75rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 600, color: 'var(--color-ink)', fontSize: '0.9rem' }}>
            {flight.airline}
          </div>
          <div style={{ color: 'var(--color-muted)', fontSize: '0.8rem', marginTop: '0.125rem' }}>
            {flight.flightNo}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--color-ink)' }}>
            ${flight.price}
          </div>
          <div style={{ color: 'var(--color-muted)', fontSize: '0.75rem' }}>per person</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', marginTop: '0.75rem', gap: '0.75rem' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 600, color: 'var(--color-ink)', fontSize: '1rem' }}>
            {formatTime(flight.departTime)}
          </div>
          <div style={{ color: 'var(--color-muted)', fontSize: '0.75rem' }}>{flight.origin}</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ color: 'var(--color-muted)', fontSize: '0.7rem' }}>{flight.duration}</div>
          <div style={{ height: 1, background: 'var(--color-line)', margin: '0.25rem 0' }} />
          <div style={{ color: 'var(--color-muted)', fontSize: '0.7rem' }}>
            {flight.stops === 0 ? 'Nonstop' : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 600, color: 'var(--color-ink)', fontSize: '1rem' }}>
            {formatTime(flight.arriveTime)}
          </div>
          <div style={{ color: 'var(--color-muted)', fontSize: '0.75rem' }}>{flight.destination}</div>
        </div>
      </div>

      <div style={{ marginTop: '0.75rem' }}>
        <a
          href={flight.bookUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={bookBtnStyle}
        >
          Book on {flight.source}
        </a>
      </div>
    </div>
  )
}

function HotelCard({ hotel }: { hotel: HotelResult }) {
  return (
    <div style={{
      border: '1px solid var(--color-line)',
      borderRadius: 'var(--radius-card, 0.75rem)',
      background: 'var(--color-panel)',
      padding: '1rem 1.25rem',
      marginBottom: '0.75rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 600, color: 'var(--color-ink)', fontSize: '0.9rem' }}>
            {hotel.name}
          </div>
          <div style={{ color: 'var(--color-muted)', fontSize: '0.8rem', marginTop: '0.125rem' }}>
            {'*'.repeat(hotel.stars)} &middot; {hotel.rating}/10
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--color-ink)' }}>
            ${hotel.pricePerNight}
          </div>
          <div style={{ color: 'var(--color-muted)', fontSize: '0.75rem' }}>per night</div>
        </div>
      </div>

      <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
        {hotel.amenities.map(a => (
          <span key={a} style={{
            fontSize: '0.7rem',
            padding: '0.15rem 0.5rem',
            borderRadius: '999px',
            background: 'var(--color-line)',
            color: 'var(--color-muted)',
          }}>
            {a}
          </span>
        ))}
      </div>

      <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--color-muted)', fontSize: '0.75rem' }}>via {hotel.source}</span>
        <a
          href={hotel.bookUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={bookBtnStyle}
        >
          Book on {hotel.source}
        </a>
      </div>
    </div>
  )
}

/* ── Input component ── */
function Input({ label, placeholder, value, onChange, type = 'text' }: {
  label: string
  placeholder?: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <label style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-muted)' }}>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        min={type === 'number' ? '1' : undefined}
        style={{
          padding: '0.5rem 0.75rem',
          border: '1px solid var(--color-line)',
          borderRadius: 'var(--radius-btn, 0.5rem)',
          background: 'var(--color-paper)',
          color: 'var(--color-ink)',
          fontSize: '0.875rem',
          outline: 'none',
          width: '100%',
        }}
      />
    </div>
  )
}

/* ── Airport/City autocomplete input ── */
type Place = { code: string; name: string; country_name: string; type: string }

function PlaceInput({ label, placeholder, value, onChange }: {
  label: string
  placeholder?: string
  value: string
  onChange: (code: string, display: string) => void
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
    } catch {
      setSuggestions([])
    }
  }, [])

  const handleInput = useCallback((val: string) => {
    setDisplay(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => fetchSuggestions(val), 250)
  }, [fetchSuggestions])

  const selectPlace = useCallback((place: Place) => {
    const code = place.code
    const label = `${place.name} (${code})`
    setDisplay(label)
    setSuggestions([])
    setOpen(false)
    onChange(code, label)
  }, [onChange])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', position: 'relative' }}>
      <label style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-muted)' }}>{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        value={display}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        style={{
          padding: '0.5rem 0.75rem',
          border: '1px solid var(--color-line)',
          borderRadius: 'var(--radius-btn, 0.5rem)',
          background: 'var(--color-paper)',
          color: 'var(--color-ink)',
          fontSize: '0.875rem',
          outline: 'none',
          width: '100%',
        }}
      />
      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 100,
          background: 'var(--color-paper)',
          border: '1px solid var(--color-line)',
          borderRadius: 'var(--radius-btn, 0.5rem)',
          marginTop: '0.25rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          overflow: 'hidden',
        }}>
          {suggestions.map(place => (
            <button
              key={place.code + place.type}
              onMouseDown={() => selectPlace(place)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '0.5rem 0.75rem',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: '0.85rem',
                color: 'var(--color-ink)',
              }}
            >
              <span style={{ fontWeight: 600 }}>{place.name}</span>
              <span style={{ color: 'var(--color-muted)', marginLeft: '0.5rem' }}>
                {place.code} · {place.country_name} · {place.type}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Shared styles ── */
const btnStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.625rem 1rem',
  background: 'var(--color-accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-btn, 0.5rem)',
  fontWeight: 600,
  fontSize: '0.875rem',
  cursor: 'pointer',
}

const linkBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--color-accent)',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: 500,
  padding: 0,
}

const bookBtnStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.4rem 0.85rem',
  background: 'var(--color-accent)',
  color: '#fff',
  borderRadius: 'var(--radius-btn, 0.5rem)',
  fontSize: '0.8rem',
  fontWeight: 600,
  textDecoration: 'none',
}
