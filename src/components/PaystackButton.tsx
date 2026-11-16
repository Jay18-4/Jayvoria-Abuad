import React from 'react';
import { Lock, Loader2, ShieldCheck } from 'lucide-react';
import { formatCurrency } from '../services/api';

interface PaystackButtonProps {
  totalCents: number;
  disabled?: boolean;
  loading?: boolean;
  configured: boolean;
  onClick: () => void;
}

export function PaystackButton({
  totalCents,
  disabled = false,
  loading = false,
  configured,
  onClick,
}: PaystackButtonProps) {
  const isDisabled = disabled || loading || !configured;

  return (
    <div className="space-y-2.5">
      <button
        type="button"
        onClick={onClick}
        disabled={isDisabled}
        aria-label={`Pay ${formatCurrency(totalCents)} securely with Paystack`}
        className="w-full py-3.5 px-6 rounded-full bg-[#0F172A] hover:bg-[#1E293B] disabled:opacity-55 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2.5 shadow-card-rest"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-[#00C3F7]" />
            <span>Processing Paystack Checkout...</span>
          </>
        ) : (
          <>
            <span
              aria-hidden="true"
              className="inline-flex items-center justify-center w-5 h-5 rounded-sm bg-[#00C3F7] text-[#0F172A] font-bold text-[11px] leading-none"
            >
              P
            </span>
            <span className="tabular-nums">
              {configured
                ? `Pay with Paystack · ${formatCurrency(totalCents)}`
                : 'Paystack Unavailable · Set Secret Key'}
            </span>
            <Lock className="w-3.5 h-3.5 text-[#94A3B8]" />
          </>
        )}
      </button>

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-[#64748B]">
        <ShieldCheck className="w-3.5 h-3.5 text-[#059669]" />
        <span>Server-verified Paystack transaction · Card, Bank & Transfer</span>
      </p>
    </div>
  );
}
