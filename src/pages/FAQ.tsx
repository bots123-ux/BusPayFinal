import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
const FAQS=[
  {q:"How do I book a ticket?",a:"Go to the Home tab, select your route (Manila to Baguio or Baguio to Manila), choose a travel date, pick a departure time, select your seat, and complete your payment."},
  {q:"What payment methods are accepted?",a:"We accept Cash (pay on boarding), GCash (instant digital payment), and BusPay Wallet (top up with GCash or card)."},
  {q:"Can I cancel or refund my ticket?",a:"Tickets can be cancelled up to 2 hours before departure. Refunds are processed within 3-5 business days to your BusPay Wallet or original payment method."},
  {q:"How does real-time seat selection work?",a:"When choosing a seat, the map updates live as other passengers book. Green seats are available, blue is your selection, and red/grey seats are taken. Your seat is reserved once payment is confirmed."},
  {q:"What is the QR code on my ticket for?",a:"The QR code is your digital boarding pass. Show it to the bus staff when boarding - they will scan it to verify your ticket. No need to print anything."},
  {q:"How do I top up my BusPay Wallet?",a:"Go to the Wallet tab, tap Top Up, enter the amount (1 to 50000 pesos), select GCash or Card as your payment method, and confirm. Balance is added instantly."},
  {q:"What if I miss my bus?",a:"If you miss your scheduled departure, please contact the bus terminal directly. Missed trips are subject to the bus operator rebooking policy."},
  {q:"Is my payment information secure?",a:"Yes. BusPay uses bank-level encryption and never stores your full payment details. All transactions go through secure payment processors."},
  {q:"Can I book for multiple passengers?",a:"Yes! When selecting seats, you can increase the passenger count and select a seat for each person during the booking process."},
  {q:"How do I change my language?",a:"Go to Profile then Language, or change it on the Language selection screen before logging in. BusPay supports English, Filipino, Cebuano, Ilocano, and Kapampangan."},
];
export default function FAQ() {
  const navigate=useNavigate();
  const [open,setOpen]=useState<number|null>(null);
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <header className="mb-6 flex items-center gap-4">
          <button onClick={()=>navigate(-1)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border hover:bg-secondary"><ArrowLeft className="h-4 w-4"/></button>
          <Logo/>
        </header>
        <h1 className="mb-2 text-3xl font-extrabold">Frequently Asked Questions</h1>
        <p className="mb-8 text-sm text-muted-foreground">Everything you need to know about BusPay.</p>
        <div className="space-y-3">
          {FAQS.map((faq,i)=>(
            <div key={i} className={cn("rounded-2xl border bg-card transition-all",open===i?"border-accent/40":"border-border")}>
              <button className="flex w-full items-center justify-between gap-4 p-5 text-left" onClick={()=>setOpen(open===i?null:i)}>
                <span className="font-semibold">{faq.q}</span>
                <ChevronDown className={cn("h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform",open===i&&"rotate-180")}/>
              </button>
              {open===i&&(
                <div className="border-t border-border px-5 pb-5 pt-3 text-sm text-muted-foreground animate-slide-up">{faq.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
