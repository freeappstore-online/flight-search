import { useState, useEffect, useCallback } from 'react'
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

/* ── Mock data generators ── */
const AIRLINES = [
  { name: 'Delta Air Lines', code: 'DL', url: 'https://www.delta.com' },
  { name: 'United Airlines', code: 'UA', url: 'https://www.united.com' },
  { name: 'American Airlines', code: 'AA', url: 'https://www.aa.com' },
  { name: 'Southwest Airlines', code: 'WN', url: 'https://www.southwest.com' },
  { name: 'JetBlue', code: 'B6', url: 'https://www.jetblue.com' },
  { name: 'Alaska Airlines', code: 'AS', url: 'https://www.alaskaair.com' },
]

const HOTEL_SOURCES = [
  { name: 'Booking.com', url: 'https://www.booking.com' },
  { name: 'Hotels.com', url: 'https://www.hotels.com' },
  { name: 'Expedia', url: 'https://www.expedia.com' },
  { name: 'Agoda', url: 'https://www.agoda.com' },
]

const HOTEL_NAMES = [
  'Grand Plaza Hotel', 'The Marriott Downtown', 'Hilton Garden Inn',
  'Holiday Inn Express', 'Hyatt Regency', 'Best Western Plus',
  'Radisson Blu', 'Four Points by Sheraton', 'Courtyard by Marriott',
  'Hampton Inn & Suites',
]

const AMENITIES = ['WiFi', 'Pool', 'Gym', 'Spa', 'Restaurant', 'Parking', 'Bar', 'Room Service']

function randomId() {
  return Math.random().toString(36).slice(2, 10)
}

function generateMockFlights(origin: string, destination: string, date: string): FlightResult[] {
  const count = 4 + Math.floor(Math.random() * 4)
  const results: FlightResult[] = []
  for (let i = 0; i < count; i++) {
    const airline = AIRLINES[Math.floor(Math.random() * AIRLINES.length)]
    const departHour = 6 + Math.floor(Math.random() * 14)
    const durationHours = 2 + Math.floor(Math.random() * 6)
    const durationMins = Math.floor(Math.random() * 50)
    const arriveHour = (departHour + durationHours) % 24
    const stops = Math.random() > 0.6 ? 1 : Math.random() > 0.8 ? 2 : 0
    const basePrice = 150 + Math.floor(Math.random() * 500)
    results.push({
      id: randomId(),
      airline: airline.name,
      flightNo: `${airline.code}${100 + Math.floor(Math.random() * 900)}`,
      origin: origin.toUpperCase().slice(0, 3),
      destination: destination.toUpperCase().slice(0, 3),
      departTime: `${date}T${String(departHour).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,
      arriveTime: `${date}T${String(arriveHour).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,
      duration: `${durationHours}h ${durationMins}m`,
      stops,
      price: basePrice,
      currency: 'USD',
      bookUrl: `${airline.url}/booking?from=${origin}&to=${destination}&date=${date}`,
      source: airline.name,
    })
  }
  return results.sort((a, b) => a.price - b.price)
}

function generateMockHotels(city: string, checkIn: string, checkOut: string): HotelResult[] {
  const count = 5 + Math.floor(Math.random() * 4)
  const results: HotelResult[] = []
  for (let i = 0; i < count; i++) {
    const source = HOTEL_SOURCES[Math.floor(Math.random() * HOTEL_SOURCES.length)]
    const stars = 2 + Math.floor(Math.random() * 4)
    const rating = 6.5 + Math.random() * 3.4
    const pricePerNight = 60 + Math.floor(Math.random() * 300) + stars * 30
    const amenityCount = 2 + Math.floor(Math.random() * 4)
    const shuffled = [...AMENITIES].sort(() => Math.random() - 0.5)
    results.push({
      id: randomId(),
      name: HOTEL_NAMES[Math.floor(Math.random() * HOTEL_NAMES.length)],
      location: city,
      rating: Math.round(rating * 10) / 10,
      stars,
      pricePerNight,
      currency: 'USD',
      imageUrl: '',
      bookUrl: `${source.url}/hotel?city=${encodeURIComponent(city)}&checkin=${checkIn}&checkout=${checkOut}`,
      source: source.name,
      amenities: shuffled.slice(0, amenityCount),
    })
  }
  return results.sort((a, b) => a.pricePerNight - b.pricePerNight)
}

/* ── Search functions (structured for real API integration) ── */

async function searchFlights(
  _proxy: typeof fas.proxy,
  origin: string,
  destination: string,
  departDate: string,
  _returnDate: string,
  _travelers: number,
): Promise<FlightResult[]> {
  // When proxy is configured with real API keys (e.g. Amadeus, Skyscanner),
  // replace mock with:
  //
  // const res = await proxy.fetch(
  //   `partners.api.skyscanner.net/apiservices/v3/flights/live/search/create`,
  //   { method: 'POST', body: JSON.stringify({ query: { ... } }) }
  // )
  // const data = await res.json()
  // return transformSkyscannerResults(data)

  // Simulate network delay
  await new Promise(r => setTimeout(r, 800 + Math.random() * 400))
  return generateMockFlights(origin, destination, departDate)
}

async function searchHotels(
  _proxy: typeof fas.proxy,
  city: string,
  checkIn: string,
  checkOut: string,
  _guests: number,
): Promise<HotelResult[]> {
  // When proxy is configured with real API keys (e.g. Booking.com Affiliate):
  //
  // const res = await proxy.fetch(
  //   `distribution-xml.booking.com/2.5/json/hotels?city=${encodeURIComponent(city)}&checkin=${checkIn}&checkout=${checkOut}`,
  // )
  // const data = await res.json()
  // return transformBookingResults(data)

  await new Promise(r => setTimeout(r, 800 + Math.random() * 400))
  return generateMockHotels(city, checkIn, checkOut)
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
                    <Input label="From" placeholder="City or airport code" value={flightOrigin} onChange={setFlightOrigin} />
                    <Input label="To" placeholder="City or airport code" value={flightDest} onChange={setFlightDest} />
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
                    <Input label="City or destination" placeholder="e.g. New York, Paris" value={hotelCity} onChange={setHotelCity} />
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

        {/* ── Affiliate disclaimer ── */}
        <p style={{
          textAlign: 'center',
          fontSize: '0.75rem',
          color: 'var(--color-muted)',
          marginTop: '2rem',
          padding: '0.5rem 0',
          borderTop: '1px solid var(--color-line)',
        }}>
          We earn a small commission when you book through our links
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
