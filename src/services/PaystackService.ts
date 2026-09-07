import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';

// ──────────────────── Types ─────────────────────────────────────────────

export interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    id: number;
    domain: string;
    status: string;
    reference: string;
    amount: number;
    message: string | null;
    gateway_response: string;
    paid_at: string;
    created_at: string;
    channel: string;
    currency: string;
    ip_address: string;
    metadata: Record<string, unknown>;
    fees: number;
    authorization: {
      authorization_code: string;
      bin: string;
      last4: string;
      exp_month: string;
      exp_year: string;
      channel: string;
      card_type: string;
      bank: string;
      country_code: string;
      brand: string;
      reusable: boolean;
      signature: string;
    };
    customer: {
      id: number;
      first_name: string;
      last_name: string;
      email: string;
      customer_code: string;
      phone: string | null;
      metadata: Record<string, unknown>;
    };
  };
}

export interface PaystackCustomerResponse {
  status: boolean;
  message: string;
  data: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    customer_code: string;
    phone: string | null;
    metadata: Record<string, unknown>;
  };
}

export interface PaystackWebhookEvent {
  event: string;
  data: Record<string, unknown>;
}

// ──────────────────── PaystackService ──────────────────────────────────

class PaystackService {
  private get secretKey(): string {
    return config.paystack.secretKey;
  }

  private get baseUrl(): string {
    return config.paystack.baseUrl;
  }

  // ──────────────────── HTTP helpers ──────────────────────────────────

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    };

    const init: RequestInit = { method, headers };
    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);
    const json = (await response.json()) as T;

    if (!response.ok) {
      logger.error('[Paystack] API error', { status: response.status, path });
    }

    return json;
  }

  // ──────────────────── Transaction initialization ────────────────────

  /**
   * Initialize a Paystack transaction.
   * Returns the authorization URL the user should be redirected to.
   *
   * @param params.email - Customer email
   * @param params.amount - Amount in smallest currency unit (kobo/cents)
   * @param params.reference - Unique reference for idempotency
   * @param params.metadata - Custom metadata to store with the transaction
   * @param params.callbackUrl - URL to redirect after payment
   */
  async initializeTransaction(params: {
    email: string;
    amount: number;
    reference: string;
    currency?: string;
    metadata?: Record<string, unknown>;
    callbackUrl?: string;
  }): Promise<PaystackInitializeResponse> {
    const body = {
      email: params.email,
      amount: params.amount,
      reference: params.reference,
      currency: params.currency || config.paystack.defaultCurrency,
      metadata: params.metadata || {},
      callback_url: params.callbackUrl || config.paystack.callbackUrl,
    };

    logger.info('[Paystack] Initializing transaction', {
      reference: params.reference,
      amount: params.amount,
      currency: body.currency,
    });

    const response = await this.request<PaystackInitializeResponse>(
      'POST',
      '/transaction/initialize',
      body,
    );

    if (!response.status) {
      logger.error('[Paystack] Initialization failed', { message: response.message });
    }

    return response;
  }

  // ──────────────────── Transaction verification ──────────────────────

  /**
   * Verify a Paystack transaction by reference.
   * This is the authoritative source — only server-side verification
   * should be used to confirm payment.
   */
  async verifyTransaction(reference: string): Promise<PaystackVerifyResponse> {
    logger.info('[Paystack] Verifying transaction', { reference });

    const response = await this.request<PaystackVerifyResponse>(
      'GET',
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );

    return response;
  }

  // ──────────────────── Customer management ───────────────────────────

  /**
   * Create or get a Paystack customer.
   * Returns the customer code for future recurring payments.
   */
  async createCustomer(params: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    metadata?: Record<string, unknown>;
  }): Promise<PaystackCustomerResponse> {
    const response = await this.request<PaystackCustomerResponse>('POST', '/customer', {
      email: params.email,
      first_name: params.firstName,
      last_name: params.lastName,
      phone: params.phone || undefined,
      metadata: params.metadata || {},
    });

    if (!response.status) {
      logger.error('[Paystack] Customer creation failed', { message: response.message });
    }

    return response;
  }

  /**
   * Fetch a Paystack customer by customer code or ID.
   */
  async fetchCustomer(identifier: string | number): Promise<PaystackCustomerResponse> {
    return this.request<PaystackCustomerResponse>('GET', `/customer/${identifier}`);
  }

  // ──────────────────── Webhook verification ──────────────────────────

  /**
   * Verify a Paystack webhook signature.
   * Always verify webhooks server-side — never trust the browser.
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!config.paystack.webhookSecret) {
      logger.error('[Paystack] No webhook secret configured — REJECTING webhook (fail-closed)');
      return false;
    }

    if (!signature) {
      logger.warn('[Paystack] Missing webhook signature header');
      return false;
    }

    try {
      const hash = crypto
        .createHmac('sha512', config.paystack.webhookSecret)
        .update(payload)
        .digest('hex');

      // Use timing-safe comparison to prevent timing attacks
      return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(signature, 'hex'));
    } catch (error) {
      logger.error('[Paystack] Webhook signature verification failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Parse a raw webhook body into a typed event.
   */
  parseWebhookEvent(body: string): PaystackWebhookEvent | null {
    try {
      return JSON.parse(body) as PaystackWebhookEvent;
    } catch (error) {
      logger.error('[Paystack] Failed to parse webhook body', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  // ──────────────────── Utility ───────────────────────────────────────

  /**
   * Generate a unique reference for a transaction.
   * Format: al_{userId}_{timestamp}_{random}
   */
  generateReference(userId: number): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(6).toString('hex');
    return `al_${userId}_${timestamp}_${random}`;
  }

  /**
   * Convert amount from standard to smallest unit (e.g. 100 → 10000 kobo).
   */
  toSmallestUnit(amount: number): number {
    return Math.round(amount * 100);
  }

  /**
   * Convert amount from smallest unit to standard (e.g. 10000 kobo → 100).
   */
  fromSmallestUnit(amount: number): number {
    return amount / 100;
  }
}

export const paystackService = new PaystackService();
export { PaystackService };
