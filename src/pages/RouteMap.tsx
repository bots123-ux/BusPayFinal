import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Clock, Bus, ChevronDown } from "lucide-react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

interface RouteInfo {
  id: string;
  label: string;
  distance: string;
  duration: string;
  fare: string;
  mapSrc: string;
  stops: { name: string; time: string; note: string }[];
}

const ROUTES: RouteInfo[] = [
  {
    id: "manila-baguio",
    label: "Manila → Baguio",
    distance: "245 km",
    duration: "3 hrs 51 mins",
    fare: "₱580",
    mapSrc:
      "https://www.google.com/maps/embed?pb=!1m28!1m12!1m3!1d982695.3971823!2d120.19!3d15.98!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!4m13!3e0!4m5!1s0x3397ca03571ec38b%3A0x69d1d8bb2f5c0f6e!2sCubao%20Bus%20Terminal%2C%20Quezon%20City!3m2!1d14.6198!2d121.0535!4m5!1s0x3391949de54d8b4b%3A0xce0a6e33a0d50c27!2sBaguio%20City!3m2!1d16.4023!2d120.5960!5e0!3m2!1sen!2sph!4v1",
    stops: [
      { name: "Manila – Cubao Terminal", time: "Departure: 6:00 AM / 9:00 AM / 1:00 PM / 6:00 PM", note: "Main departure — EDSA Cubao, Quezon City" },
      { name: "Dau / Mabalacat", time: "+1h 30m", note: "Optional stop — MacArthur Highway, Pampanga" },
      { name: "Tarlac City", time: "+2h 00m", note: "Rest stop — Tarlac City center" },
      { name: "Rosario / La Union", time: "+3h 15m", note: "Approaching Cordillera region" },
      { name: "Baguio City Terminal", time: "+3h 51m", note: "Final destination — Gov. Pack Road, Baguio City" },
    ],
  },
  {
    id: "manila-launion",
    label: "Manila → La Union",
    distance: "266 km",
    duration: "4 hrs 4 mins",
    fare: "₱620",
    mapSrc:
      "https://www.google.com/maps/embed?pb=!1m28!1m12!1m3!1d1547261.5!2d120.4!3d15.9!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!4m13!3e0!4m5!1s0x3397ca03571ec38b%3A0x69d1d8bb2f5c0f6e!2sCubao%20Bus%20Terminal%2C%20Quezon%20City!3m2!1d14.6198!2d121.0535!4m5!1s0x33913ba2b0f08f65%3A0x5a3b4b7b9e9b7e7e!2sSan%20Fernando%2C%20La%20Union!3m2!1d16.6157!2d120.3166!5e0!3m2!1sen!2sph!4v1",
    stops: [
      { name: "Manila – Cubao Terminal", time: "Departure: 6:00 AM / 10:00 AM / 2:00 PM / 8:00 PM", note: "Main departure — EDSA Cubao, Quezon City" },
      { name: "Balintawak / North EDSA", time: "+0h 30m", note: "Pick-up point — NLEX entry" },
      { name: "Dau / Mabalacat", time: "+1h 30m", note: "Rest stop — MacArthur Highway, Pampanga" },
      { name: "Tarlac City", time: "+2h 00m", note: "Optional stop — Tarlac City center" },
      { name: "Urdaneta, Pangasinan", time: "+3h 00m", note: "Rest stop — Urdaneta City" },
      { name: "San Fernando, La Union", time: "+4h 04m", note: "Final destination — Quezon Ave, San Fernando" },
    ],
  },
  {
    id: "manila-vigan",
    label: "Manila → Vigan",
    distance: "403 km",
    duration: "6 hrs 26 mins",
    fare: "₱850",
    mapSrc:
      "https://www.google.com/maps/embed?pb=!1m28!1m12!1m3!1d1960000!2d120.2!3d16.5!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!4m13!3e0!4m5!1s0x3397ca03571ec38b%3A0x69d1d8bb2f5c0f6e!2sCubao%20Bus%20Terminal%2C%20Quezon%20City!3m2!1d14.6198!2d121.0535!4m5!1s0x33911c24c91b7c0d%3A0x3b1b1b1b1b1b1b1b!2sVigan%20City%2C%20Ilocos%20Sur!3m2!1d17.5747!2d120.3872!5e0!3m2!1sen!2sph!4v1",
    stops: [
      { name: "Manila – Cubao Terminal", time: "Departure: 6:00 AM / 2:00 PM / 10:00 PM", note: "Main departure — EDSA Cubao, Quezon City" },
      { name: "Dau / Mabalacat", time: "+1h 30m", note: "Rest stop — MacArthur Highway, Pampanga" },
      { name: "Tarlac City", time: "+2h 00m", note: "Optional stop" },
      { name: "Urdaneta, Pangasinan", time: "+3h 00m", note: "Rest stop" },
      { name: "San Fernando, La Union", time: "+4h 04m", note: "Midpoint rest stop" },
      { name: "Narvacan, Ilocos Sur", time: "+5h 30m", note: "Approaching Ilocos region" },
      { name: "Vigan City Terminal", time: "+6h 26m", note: "Final destination — Mestizo District, Vigan" },
    ],
  },
  {
    id: "manila-pagudpud",
    label: "Manila → Pagudpud",
    distance: "554 km",
    duration: "9 hrs 2 mins",
    fare: "₱980",
    mapSrc:
      "https://www.google.com/maps/embed?pb=!1m28!1m12!1m3!1d2300000!2d120.5!3d17.0!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!4m13!3e0!4m5!1s0x3397ca03571ec38b%3A0x69d1d8bb2f5c0f6e!2sCubao%20Bus%20Terminal%2C%20Quezon%20City!3m2!1d14.6198!2d121.0535!4m5!1s0x33906a4c4c4c4c4c%3A0x4c4c4c4c4c4c4c4c!2sPagudpud%2C%20Ilocos%20Norte!3m2!1d18.5424!2d120.7941!5e0!3m2!1sen!2sph!4v1",
    stops: [
      { name: "Manila – Cubao Terminal", time: "Departure: 6:00 AM / 10:00 PM", note: "Main departure — EDSA Cubao, Quezon City" },
      { name: "Dau / Mabalacat", time: "+1h 30m", note: "Rest stop — Pampanga" },
      { name: "Tarlac City", time: "+2h 00m", note: "Optional stop" },
      { name: "Urdaneta, Pangasinan", time: "+3h 00m", note: "Rest stop" },
      { name: "San Fernando, La Union", time: "+4h 04m", note: "Midpoint rest stop" },
      { name: "Vigan City", time: "+6h 26m", note: "Ilocos Sur stop" },
      { name: "Laoag City", time: "+8h 00m", note: "Ilocos Norte capital" },
      { name: "Pagudpud, Ilocos Norte", time: "+9h 02m", note: "Final destination — Saud Beach area" },
    ],
  },
];

export default function RouteMap() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string>("manila-baguio");
  const [open, setOpen] = useState(false);

  const route = ROUTES.find((r) => r.id === selectedId)!;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <header className="mb-6 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Logo />
        </header>

        <h1 className="mb-2 text-3xl font-extrabold">Route Map</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          Select a route to view the map, stops, and fare details.
        </p>

        {/* Route selector dropdown */}
        <div className="relative mb-6">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-2xl border-2 border-accent bg-card px-5 py-4 text-left font-bold shadow-soft transition-all hover:border-accent/70"
          >
            <span>{route.label}</span>
            <ChevronDown className={cn("h-5 w-5 text-accent transition-transform", open && "rotate-180")} />
          </button>
          {open && (
            <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
              {ROUTES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setSelectedId(r.id); setOpen(false); }}
                  className={cn(
                    "flex w-full items-center justify-between px-5 py-4 text-left text-sm transition-colors hover:bg-secondary",
                    r.id === selectedId && "bg-accent/10 font-bold text-accent"
                  )}
                >
                  <span>{r.label}</span>
                  <span className="font-semibold text-primary">{r.fare}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Map embed */}
        <div className="mb-6 overflow-hidden rounded-2xl border border-border shadow-soft">
          <iframe
            key={route.id}
            title={`${route.label} Route Map`}
            width="100%"
            height="300"
            loading="lazy"
            style={{ border: 0 }}
            referrerPolicy="no-referrer-when-downgrade"
            src={route.mapSrc}
          />
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          {[
            { icon: MapPin, label: "Distance", value: route.distance },
            { icon: Clock, label: "Travel Time", value: route.duration },
            { icon: Bus, label: "Fare", value: route.fare },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-2xl border border-border bg-card p-4 text-center">
              <Icon className="mx-auto mb-2 h-5 w-5 text-accent" />
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="font-bold">{value}</div>
            </div>
          ))}
        </div>

        {/* Stops */}
        <h2 className="mb-4 font-bold">{route.label} Stops</h2>
        <div className="space-y-0">
          {route.stops.map((stop, i) => (
            <div key={i} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2",
                    i === 0 || i === route.stops.length - 1
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border bg-card"
                  )}
                >
                  {i === 0 || i === route.stops.length - 1 ? (
                    <MapPin className="h-4 w-4" />
                  ) : (
                    <span className="text-xs font-bold text-muted-foreground">{i}</span>
                  )}
                </div>
                {i < route.stops.length - 1 && (
                  <div className="my-1 w-0.5 flex-1 bg-border" style={{ minHeight: 32 }} />
                )}
              </div>
              <div className="pb-6">
                <div className="font-semibold">{stop.name}</div>
                <div className="text-xs font-medium text-accent">{stop.time}</div>
                <div className="text-xs text-muted-foreground">{stop.note}</div>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 rounded-2xl bg-secondary p-4 text-xs text-muted-foreground">
          Actual stops and travel times may vary depending on traffic and weather.
          The route shown is for reference only.
        </p>
      </div>
    </main>
  );
}