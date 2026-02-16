// StacksTasker - Webhook dispatch engine + CRUD

import { randomUUID, randomBytes, createHmac } from 'crypto';
import { query } from '../db.js';
import type {
  Webhook,
  WebhookEventType,
  WebhookEvent,
  RegisterWebhookRequest,
  TaskCategory,
} from '../types.js';

const VALID_EVENT_TYPES: WebhookEventType[] = [
  'task.created',
  'task.status_changed',
  'bid.placed',
  'bid.accepted',
  'message.new',
  'task.completed',
  '*',
];

// ─── Row mapping ──────────────────────────────────────────

function rowToWebhook(row: Record<string, unknown>, includeSecret = false): Webhook {
  const wh: Webhook = {
    id: row.id as string,
    ownerId: row.owner_id as string,
    url: row.url as string,
    events: (row.events as WebhookEventType[]) || [],
    filterCategory: (row.filter_category as TaskCategory) || undefined,
    filterTaskId: (row.filter_task_id as string) || undefined,
    active: row.active as boolean,
    description: (row.description as string) || '',
    createdAt: (row.created_at as Date).toISOString(),
    lastTriggeredAt: row.last_triggered_at
      ? (row.last_triggered_at as Date).toISOString()
      : undefined,
  };
  if (includeSecret) {
    wh.secret = row.secret as string;
  }
  return wh;
}

// ─── Signing ──────────────────────────────────────────

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

// ─── Dispatch ──────────────────────────────────────────

interface DispatchContext {
  taskId?: string;
  category?: string;
}

export async function dispatchEvent(
  eventType: WebhookEventType,
  eventData: WebhookEvent['data'],
  context?: DispatchContext
): Promise<void> {
  try {
    // Query active webhooks that match this event type
    const { rows } = await query(
      `SELECT * FROM webhooks WHERE active = true AND ($1 = ANY(events) OR '*' = ANY(events))`,
      [eventType]
    );

    if (rows.length === 0) return;

    const matchingWebhooks = rows.filter((row) => {
      // Filter by category if the webhook has one set
      if (row.filter_category && context?.category && row.filter_category !== context.category) {
        return false;
      }
      // Filter by task ID if the webhook has one set
      if (row.filter_task_id && context?.taskId && row.filter_task_id !== context.taskId) {
        return false;
      }
      return true;
    });

    if (matchingWebhooks.length === 0) return;

    const event: WebhookEvent = {
      id: randomUUID(),
      type: eventType,
      timestamp: new Date().toISOString(),
      data: eventData,
    };

    const payload = JSON.stringify(event);

    const deliveries = matchingWebhooks.map(async (row) => {
      const secret = row.secret as string;
      const url = row.url as string;
      const webhookId = row.id as string;
      const signature = signPayload(payload, secret);
      const deliveryId = randomUUID();

      try {
        await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-StacksTasker-Signature': `sha256=${signature}`,
            'X-StacksTasker-Event': eventType,
            'X-StacksTasker-Delivery': deliveryId,
            'X-StacksTasker-Timestamp': event.timestamp,
          },
          body: payload,
          signal: AbortSignal.timeout(3000),
        });

        // Update last_triggered_at
        await query('UPDATE webhooks SET last_triggered_at = NOW() WHERE id = $1', [webhookId]);
      } catch (err) {
        console.error(
          `[Webhook] Failed to deliver ${eventType} to ${url}: ${err instanceof Error ? err.message : err}`
        );
      }
    });

    await Promise.allSettled(deliveries);
  } catch (err) {
    // Never let webhook failures propagate to the caller
    console.error(`[Webhook] Dispatch error: ${err instanceof Error ? err.message : err}`);
  }
}

// ─── CRUD ──────────────────────────────────────────

export function isValidEventType(type: string): type is WebhookEventType {
  return VALID_EVENT_TYPES.includes(type as WebhookEventType);
}

export async function registerWebhook(
  req: RegisterWebhookRequest
): Promise<Webhook & { secret: string }> {
  const id = randomUUID().slice(0, 12);
  const secret = randomBytes(32).toString('hex');
  const now = new Date();

  const { rows } = await query(
    `INSERT INTO webhooks (id, owner_id, url, secret, events, filter_category, filter_task_id, active, description, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9) RETURNING *`,
    [
      id,
      req.ownerId,
      req.url,
      secret,
      req.events,
      req.filterCategory || null,
      req.filterTaskId || null,
      req.description || '',
      now,
    ]
  );

  console.log(`[Webhook] Registered webhook ${id} for ${req.ownerId} → ${req.url}`);
  return rowToWebhook(rows[0], true) as Webhook & { secret: string };
}

export async function listWebhooks(ownerId: string): Promise<Webhook[]> {
  const { rows } = await query(
    'SELECT * FROM webhooks WHERE owner_id = $1 ORDER BY created_at DESC',
    [ownerId]
  );
  return rows.map((r) => rowToWebhook(r, false));
}

export async function getWebhook(id: string): Promise<Webhook | undefined> {
  const { rows } = await query('SELECT * FROM webhooks WHERE id = $1', [id]);
  return rows.length ? rowToWebhook(rows[0], false) : undefined;
}

export async function deleteWebhook(
  id: string,
  ownerId: string
): Promise<{ success: boolean; error?: string }> {
  const { rows } = await query('SELECT * FROM webhooks WHERE id = $1', [id]);
  if (rows.length === 0) return { success: false, error: 'Webhook not found' };
  if ((rows[0].owner_id as string) !== ownerId) {
    return { success: false, error: 'Not authorized to delete this webhook' };
  }

  await query('DELETE FROM webhooks WHERE id = $1', [id]);
  console.log(`[Webhook] Deleted webhook ${id}`);
  return { success: true };
}

export async function testWebhook(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const { rows } = await query('SELECT * FROM webhooks WHERE id = $1', [id]);
  if (rows.length === 0) return { success: false, error: 'Webhook not found' };

  const row = rows[0];
  const secret = row.secret as string;
  const url = row.url as string;

  const event: WebhookEvent = {
    id: randomUUID(),
    type: '*',
    timestamp: new Date().toISOString(),
    data: {},
  };

  const payload = JSON.stringify({ ...event, ping: true });
  const signature = signPayload(payload, secret);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-StacksTasker-Signature': `sha256=${signature}`,
        'X-StacksTasker-Event': 'ping',
        'X-StacksTasker-Delivery': randomUUID(),
        'X-StacksTasker-Timestamp': event.timestamp,
      },
      body: payload,
      signal: AbortSignal.timeout(3000),
    });

    await query('UPDATE webhooks SET last_triggered_at = NOW() WHERE id = $1', [id]);
    return { success: res.ok };
  } catch (err) {
    return {
      success: false,
      error: `Delivery failed: ${err instanceof Error ? err.message : err}`,
    };
  }
}
