import { useNavigate } from "react-router-dom";
import { ArrowLeft, Banknote, Smartphone, Wallet, CreditCard, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/Logo";
const METHODS=[
  {icon:Banknote,name:"Cash on Boarding",desc:"Pay directly to the bus conductor when you board. No digital setup required.",
   steps:["Book your ticket and select Cash as payment","Show your QR code when boarding","Pay the conductor the exact fare amount","Keep your ticket as proof of payment"],
   note:"Cash tickets are marked Pending until payment is collected on board.",color:"bg-emerald-500/10 text-emerald-600"},
  {icon:Smartphone,name:"GCash",desc:"Pay instantly using your GCash account. Ticket is confirmed immediately.",
   steps:["Select GCash at checkout","You will be redirected to GCash to authorize","Confirm payment in the GCash app","Return to BusPay - ticket is auto-confirmed"],
   note:"GCash payments are instant and non-reversible. Make sure your balance is sufficient.",color:"bg-blue-500/10 text-blue-600"},
  {icon:Wallet,name:"BusPay Wallet",desc:"Use your pre-loaded BusPay Wallet for the fastest checkout experience.",
   steps:["Top up your wallet from the Wallet tab","At checkout, select Wallet as payment","Balance is deducted instantly","Ticket is confirmed immediately"],
   note:"Minimum top-up is 1 peso. Maximum wallet balance is 50,000 pesos.",color:"bg-amber-500/10 text-amber-600"},
  {icon:CreditCard,name:"Credit / Debit Card",desc:"Top up your BusPay Wallet using Visa or Mastercard.",
   steps:["Go to Wallet then Top Up","Select Card as payment method","Enter your card details securely","Funds are added to your wallet instantly"],
   note:"Card payments are processed securely. BusPay does not store card details.",color:"bg-purple-500/10 text-purple-600"},
];
export default function PaymentMethods() {
  const navigate=useNavigate();
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <header className="mb-6 flex items-center gap-4">
          <button onClick={()=>navigate(-1)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-border hover:bg-secondary"><ArrowLeft className="h-4 w-4"/></button>
          <Logo/>
        </header>
        <h1 className="mb-2 text-3xl font-extrabold">Payment Methods</h1>
        <p className="mb-8 text-sm text-muted-foreground">All the ways you can pay for your BusPay tickets.</p>
        <div className="space-y-5">
          {METHODS.map(m=>(
            <div key={m.name} className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${m.color}`}><m.icon className="h-6 w-6"/></div>
                <div><h2 className="font-bold">{m.name}</h2><p className="text-sm text-muted-foreground">{m.desc}</p></div>
              </div>
              <div className="mb-3 space-y-2">
                {m.steps.map((s,i)=>(
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">{i+1}</span>
                    <span className="text-muted-foreground">{s}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-start gap-2 rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent"/>{m.note}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
