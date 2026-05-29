import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import L from 'leaflet';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icons broken by bundlers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface FuelPrice {
  price: number;
  reported_at: string;
}

interface Station {
  id: number;
  name: string;
  lat: number;
  lng: number;
  address: string;
  fuels: Partial<Record<'petrol' | 'diesel' | 'e85', FuelPrice>>;
}

function makePriceIcon(price: number) {
  const color = price < 1.8 ? '#16a34a' : price < 1.95 ? '#d97706' : '#dc2626';
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};color:#1a1a1a;padding:3px 8px;border-radius:12px;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.3)">€${price.toFixed(3)}</div>`,
    iconAnchor: [24, 10],
  });
}

function PriceMarker({ station, fuelType }: { station: Station; fuelType: 'petrol' | 'diesel' }) {
  const fuel = station.fuels[fuelType];
  if (!fuel) return null;

  const icon = makePriceIcon(fuel.price);
  const updatedAt = new Date(fuel.reported_at);
  const minsAgo = Math.round((Date.now() - updatedAt.getTime()) / 60000);
  const timeLabel = minsAgo < 60 ? `${minsAgo}m ago` : `${Math.round(minsAgo / 60)}h ago`;

  return (
    <Marker position={[station.lat, station.lng] as LatLngExpression} icon={icon}>
      <Popup>
        <div className="text-sm min-w-40">
          <div className="font-semibold text-gray-900 mb-1">{station.name}</div>
          {station.address && <div className="text-gray-500 text-xs mb-2">{station.address}</div>}
          <div className="flex flex-col gap-1">
            {(Object.entries(station.fuels) as [string, FuelPrice][]).map(([type, f]) => (
              <div key={type} className="flex justify-between gap-4">
                <span className="capitalize text-gray-600">{type}</span>
                <span className="font-semibold">€{f.price.toFixed(3)}/L</span>
              </div>
            ))}
          </div>
          <div className="text-gray-400 text-xs mt-2">Updated {timeLabel}</div>
        </div>
      </Popup>
    </Marker>
  );
}

function RecenterButton({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  return (
    <button
      onClick={() => map.setView([lat, lng], 13)}
      className="absolute bottom-8 right-4 z-[1000] bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium shadow hover:bg-gray-50"
    >
      📍 My location
    </button>
  );
}

export default function MapPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [fuelType, setFuelType] = useState<'petrol' | 'diesel'>('petrol');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);

  const defaultCenter: LatLngExpression = [53.35, -8.0];

  useEffect(() => {
    axios
      .get<Station[]>('/api/prices')
      .then((r) => setStations(r.data))
      .catch(() => setError('Could not load price data.'))
      .finally(() => setLoading(false));

    navigator.geolocation?.getCurrentPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    );
  }, []);

  const filtered = stations.filter((s) => s.fuels[fuelType]);

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>
      {/* Controls bar */}
      <div className="flex items-center gap-4 px-4 py-3 bg-white border-b border-gray-200 z-10">
        <span className="text-sm font-medium text-gray-700">Fuel type:</span>
        {(['petrol', 'diesel'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFuelType(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              fuelType === t
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">
          {filtered.length} station{filtered.length !== 1 ? 's' : ''} with recent prices
        </span>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-20">
            <div className="text-gray-500 text-sm">Loading prices...</div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-20">
            <div className="text-red-500 text-sm">{error}</div>
          </div>
        )}

        {stations.length === 0 && !loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="bg-white rounded-xl shadow-lg p-6 text-center max-w-sm mx-4">
              <div className="text-4xl mb-3">📍</div>
              <h3 className="font-semibold text-gray-900 mb-1">No prices yet</h3>
              <p className="text-sm text-gray-500">
                Be the first to report a fuel price! Send a photo to our WhatsApp number and it'll appear here.
              </p>
            </div>
          </div>
        )}

        <MapContainer
          center={defaultCenter}
          zoom={7}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {filtered.map((station) => (
            <PriceMarker key={station.id} station={station} fuelType={fuelType} />
          ))}
          {userPos && <RecenterButton lat={userPos.lat} lng={userPos.lng} />}
        </MapContainer>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 z-[1000] bg-white rounded-lg shadow border border-gray-200 p-3 text-xs">
          <div className="font-semibold text-gray-700 mb-2">Price guide</div>
          <div className="flex flex-col gap-1">
            <LegendItem color="#16a34a" label="Under €1.80/L" />
            <LegendItem color="#d97706" label="€1.80 – €1.95/L" />
            <LegendItem color="#dc2626" label="Over €1.95/L" />
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 rounded-full" style={{ background: color }} />
      <span className="text-gray-600">{label}</span>
    </div>
  );
}
