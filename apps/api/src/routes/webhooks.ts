// StacksTasker API - Webhook routes

import { Router } from 'express';
import {
  registerWebhook,
  listWebhooks,
  getWebhook,
  deleteWebhook,
  testWebhook,
  isValidEventType,
} from '../services/webhook-dispatcher.js';
import type { RegisterWebhookRequest } from '../types.js';

const router = Router();

// POST /webhooks - Register a new webhook
router.post('/', async (req, res) => {
  try {
    const body = req.body as RegisterWebhookRequest;

    if (!body.ownerId || !body.url || !body.events || !Array.isArray(body.events)) {
      res.status(400).json({ error: 'Missing required fields: ownerId, url, events[]' });
      return;
    }

    // Validate URL: must be https:// or http://localhost for dev
    const urlLower = body.url.toLowerCase();
    if (!urlLower.startsWith('https://') && !urlLower.startsWith('http://localhost')) {
      res.status(400).json({ error: 'Webhook URL must use https:// (or http://localhost for development)' });
      return;
    }

    // Validate event types
    for (const ev of body.events) {
      if (!isValidEventType(ev)) {
        res.status(400).json({
          error: `Invalid event type: "${ev}". Valid types: task.created, task.status_changed, bid.placed, bid.accepted, message.new, task.completed, *`,
        });
        return;
      }
    }

    const webhook = await registerWebhook(body);
    res.status(201).json(webhook);
  } catch (err) {
    console.error('[Webhooks] Register error:', err);
    res.status(500).json({ error: 'Failed to register webhook' });
  }
});

// GET /webhooks?ownerId=X - List webhooks for an owner
router.get('/', async (req, res) => {
  try {
    const ownerId = req.query.ownerId as string;
    if (!ownerId) {
      res.status(400).json({ error: 'ownerId query parameter is required' });
      return;
    }

    const webhooks = await listWebhooks(ownerId);
    res.json({ webhooks });
  } catch (err) {
    console.error('[Webhooks] List error:', err);
    res.status(500).json({ error: 'Failed to list webhooks' });
  }
});

// GET /webhooks/:id - Get a single webhook
router.get('/:id', async (req, res) => {
  try {
    const webhook = await getWebhook(req.params.id);
    if (!webhook) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }
    res.json(webhook);
  } catch (err) {
    console.error('[Webhooks] Get error:', err);
    res.status(500).json({ error: 'Failed to get webhook' });
  }
});

// DELETE /webhooks/:id - Delete a webhook
router.delete('/:id', async (req, res) => {
  try {
    const { ownerId } = req.body as { ownerId?: string };
    if (!ownerId) {
      res.status(400).json({ error: 'ownerId is required in request body' });
      return;
    }

    const result = await deleteWebhook(req.params.id, ownerId);
    if (!result.success) {
      res.status(result.error === 'Webhook not found' ? 404 : 403).json({ error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Webhooks] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete webhook' });
  }
});

// POST /webhooks/:id/test - Send a test ping event
router.post('/:id/test', async (req, res) => {
  try {
    const result = await testWebhook(req.params.id);
    if (!result.success) {
      res.status(result.error === 'Webhook not found' ? 404 : 502).json({ error: result.error });
      return;
    }

    res.json({ success: true, message: 'Ping event sent successfully' });
  } catch (err) {
    console.error('[Webhooks] Test error:', err);
    res.status(500).json({ error: 'Failed to test webhook' });
  }
});

export default router;
