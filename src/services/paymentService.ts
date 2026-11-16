import { apiRequest } from './api';
import type {
  FulfillmentType,
  Order,
  PaymentGatewayConfig,
  PaystackInitResponse,
} from '../types';

export interface PaystackOrderDraft {
  items: Array<{ menuItemId: number; quantity: number }>;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  fulfillmentType: FulfillmentType;
  deliveryAddress: string;
  orderNotes: string;
}

interface PaystackPopInstance {
  resumeTransaction: (
    accessCode: string,
    callbacks?: {
      onSuccess?: (transaction: { reference?: string; status?: string }) => void;
      onLoad?: () => void;
      onCancel?: () => void;
      onError?: (error: { message?: string }) => void;
    }
  ) => void;
}

declare global {
  interface Window {
    PaystackPop?: new () => PaystackPopInstance;
  }
}

let paystackScriptPromise: Promise<void> | null = null;

function loadPaystackInlineScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Paystack checkout requires a browser environment.'));
  }
  if (window.PaystackPop) {
    return Promise.resolve();
  }
  if (paystackScriptPromise) {
    return paystackScriptPromise;
  }

  paystackScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://js.paystack.co/v2/inline.js"]'
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load Paystack Inline SDK.')),
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v2/inline.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      paystackScriptPromise = null;
      reject(new Error('Unable to load Paystack checkout script.'));
    };
    document.head.appendChild(script);
  });

  return paystackScriptPromise;
}

const PENDING_PAYSTACK_STORAGE_KEY = 'savoria_pending_paystack_checkout';

export const paymentService = {
  getConfig(): Promise<PaymentGatewayConfig> {
    return apiRequest<PaymentGatewayConfig>('/api/payments/config');
  },

  initializePaystack(draft: PaystackOrderDraft): Promise<PaystackInitResponse> {
    return apiRequest<PaystackInitResponse>('/api/payments/paystack/initialize', {
      method: 'POST',
      body: JSON.stringify(draft),
    });
  },

  verifyAndCreateOrder(
    draft: PaystackOrderDraft,
    paymentReference: string,
    paymentVerificationToken: string
  ): Promise<{ order: Order }> {
    return apiRequest<{ order: Order }>('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        ...draft,
        paymentMethod: 'PAYSTACK',
        paymentReference,
        paymentVerificationToken,
      }),
    });
  },

  savePendingRedirectCheckout(
    draft: PaystackOrderDraft,
    reference: string,
    verificationToken: string
  ): void {
    try {
      sessionStorage.setItem(
        PENDING_PAYSTACK_STORAGE_KEY,
        JSON.stringify({ draft, reference, verificationToken })
      );
    } catch {
      // Ignore storage quota issues
    }
  },

  readPendingRedirectCheckout(): {
    draft: PaystackOrderDraft;
    reference: string;
    verificationToken: string;
  } | null {
    try {
      const raw = sessionStorage.getItem(PENDING_PAYSTACK_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  clearPendingRedirectCheckout(): void {
    try {
      sessionStorage.removeItem(PENDING_PAYSTACK_STORAGE_KEY);
    } catch {
      // Ignore storage error
    }
  },

  async openPaystackCheckout(options: {
    accessCode: string;
    authorizationUrl: string;
    onSuccess: (reference?: string) => void;
    onCancel: () => void;
    onError: (message: string) => void;
  }): Promise<void> {
    try {
      await loadPaystackInlineScript();
      if (!window.PaystackPop) {
        window.location.assign(options.authorizationUrl);
        return;
      }

      const popup = new window.PaystackPop();
      popup.resumeTransaction(options.accessCode, {
        onSuccess: (tx) => {
          options.onSuccess(tx?.reference);
        },
        onCancel: () => {
          options.onCancel();
        },
        onError: (err) => {
          options.onError(err?.message || 'Paystack checkout encountered an error.');
        },
      });
    } catch {
      // Fall back to hosted Paystack checkout URL if inline script fails to load
      window.location.assign(options.authorizationUrl);
    }
  },
};
