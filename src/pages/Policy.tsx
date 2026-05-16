import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
const SECTIONS=[
  {title:"1. Information We Collect",body:"We collect information you provide when creating an account (name, email, phone number), booking tickets (travel dates, seat preferences, payment method), and using our wallet feature. We also collect device and usage data to improve our services."},
  {title:"2. How We Use Your Information",body:"Your information is used to process ticket bookings and payments, send booking confirmations and reminders, provide customer support, improve our platform, and comply with legal obligations. We do not sell your personal data to third parties."},
  {title:"3. Data Security",body:"BusPay uses industry-standard security including encrypted connections (HTTPS), secure authentication via Supabase, and Row Level Security (RLS) to ensure your data is only accessible by you. Passwords are never stored in plain text."},
  {title:"4. Cookies & Local Storage",body:"We use local storage to save your language preference and authentication session. No third-party tracking cookies are used on our platform."},
  {title:"5. Third-Party Services",body:"We use Supabase for database and authentication, and GCash for payment processing. These services have their own privacy policies and security standards."},
  {title:"6. Your Rights",body:"You may request access to, correction of, or deletion of your personal data at any time by contacting us. You may also delete your account from the Profile section of the app."},
  {title:"7. Contact Us",body:"For privacy-related concerns, contact us at privacy@buspay.ph or through the app."},
];
export default function Policy() {
  const navigate=useNavigate();
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <header className="mb-6 flex items-center gap-4">
          <button onClick={()=>navigate(-1)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border hover:bg-secondary"><ArrowLeft className="h-4 w-4"/></button>
          <Logo/>
        </header>
        <h1 className="mb-2 text-3xl font-extrabold">Privacy Policy</h1>
        <p className="mb-8 text-sm text-muted-foreground">Last updated: April 2026</p>
        <div className="space-y-8 text-sm leading-relaxed text-foreground/80">
          {SECTIONS.map(s=>(
            <section key={s.title}>
              <h2 className="mb-2 text-base font-bold text-foreground">{s.title}</h2>
              <p>{s.body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
