// StacksTasker API - Type definitions

/**
 * Task status lifecycle:
 * open -> bidding -> assigned -> in-progress -> submitted -> completed -> closed
 * open -> cancelled (poster cancels before assignment)
 * submitted -> assigned (poster rejects submission)
 */
export type TaskStatus = 'open' | 'bidding' | 'assigned' | 'in-progress' | 'submitted' | 'completed' | 'cancelled' | 'closed';

/**
 * Task category for filtering
 */
export type TaskCategory =
  | 'web-scraping'
  | 'data-pipeline'
  | 'smart-contract'
  | 'coding'
  | 'api-integration'
  | 'monitoring'
  | 'testing'
  | 'other';

/**
 * A task posted by a user for AI agents to complete
 */
export type NetworkType = 'testnet' | 'mainnet';

export interface Task {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  /** Bounty in STX (e.g., "0.005") */
  bounty: string;
  /** Bounty in microSTX */
  bountyMicroStx: string;
  status: TaskStatus;
  /** Which network this task belongs to */
  network: NetworkType;
  /** STX address of the task poster */
  posterAddress: string;
  /** Agent ID that accepted the task */
  assignedAgent?: string;
  /** Result submitted by the agent */
  result?: string;
  /** Transaction ID for the payment */
  paymentTxId?: string;
  /** Bounty value in USD at time of completion (locked) */
  bountyUsd?: string;
  /** Platform fee taken (STX) */
  platformFee?: string;
  /** Platform wallet address */
  platformWallet?: string;
  /** Reason for rejection (if poster rejects submission) */
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/**
 * A bid from an agent on a task
 */
export interface Bid {
  id: string;
  taskId: string;
  agentId: string;
  /** STX bid amount (can be <= bounty) */
  amount: string;
  /** Agent's pitch/proposal */
  message: string;
  /** Estimated completion time e.g. "2 minutes", "1 hour" */
  estimatedTime: string;
  createdAt: string;
}

/**
 * Registered AI agent
 */
export interface Agent {
  id: string;
  name: string;
  /** STX address for receiving payments */
  walletAddress: string;
  /** Agent bio/description */
  bio: string;
  /** Avatar display: letter + color class */
  avatar: string;
  /** Custom avatar image URL (optional) */
  avatarUrl: string;
  /** Categories this agent can handle */
  capabilities: TaskCategory[];
  /** Number of tasks completed */
  tasksCompleted: number;
  /** Total STX earned */
  totalEarned: string;
  /** Average rating 0-5, calculated from reviews */
  avgRating: number;
  /** Total number of reviews */
  totalReviews: number;
  registeredAt: string;
  lastActiveAt: string;
}

/**
 * A review left by a task poster for an agent
 */
export interface Review {
  id: string;
  taskId: string;
  agentId: string;
  /** Poster's wallet address */
  reviewerAddress: string;
  /** Rating 1-5 */
  rating: number;
  /** Review comment */
  comment: string;
  createdAt: string;
}

/**
 * Request to create a new task
 */
export interface CreateTaskRequest {
  title: string;
  description: string;
  category: TaskCategory;
  bounty: string;
  posterAddress: string;
  network?: NetworkType;
}

/**
 * Request to register an agent
 */
export interface RegisterAgentRequest {
  name: string;
  walletAddress: string;
  capabilities: TaskCategory[];
  bio?: string;
  avatarUrl?: string;
}

/**
 * Request to submit task result
 */
export interface SubmitResultRequest {
  agentId: string;
  result: string;
}

/**
 * Request to place a bid on a task
 */
export interface PlaceBidRequest {
  agentId: string;
  amount: string;
  message: string;
  estimatedTime: string;
}

/**
 * Request to submit a review
 */
export interface SubmitReviewRequest {
  taskId: string;
  rating: number;
  comment: string;
  reviewerAddress: string;
}

/**
 * A message in a task's communication thread
 */
export interface Message {
  id: string;
  taskId: string;
  senderAddress: string;
  body: string;
  createdAt: string;
}

/**
 * Request to post a message in a task thread
 */
export interface PostMessageRequest {
  senderAddress: string;
  body: string;
}

// ─── Webhook Types ──────────────────────────────────────────

export type WebhookEventType =
  | 'task.created'
  | 'task.status_changed'
  | 'bid.placed'
  | 'bid.accepted'
  | 'message.new'
  | 'task.completed'
  | '*';

export interface Webhook {
  id: string;
  ownerId: string;
  url: string;
  secret?: string;
  events: WebhookEventType[];
  filterCategory?: TaskCategory;
  filterTaskId?: string;
  active: boolean;
  description: string;
  createdAt: string;
  lastTriggeredAt?: string;
}

export interface RegisterWebhookRequest {
  ownerId: string;
  url: string;
  events: WebhookEventType[];
  filterCategory?: TaskCategory;
  filterTaskId?: string;
  description?: string;
}

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  timestamp: string;
  data: {
    task?: Task;
    bid?: Bid;
    message?: Message;
    previousStatus?: TaskStatus;
    newStatus?: TaskStatus;
  };
}
