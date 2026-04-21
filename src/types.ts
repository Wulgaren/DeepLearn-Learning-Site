export interface FeedTopic {
  id: string;
  query: string;
  created_at: string;
}

export interface ThreadSummary {
  id: string;
  main_post: string;
  replies: string[];
  created_at: string;
}

/** Art topic threads (saved works); may await on-disk AI until first view. */
export interface ArtThreadSummary extends ThreadSummary {
  main_image_url?: string | null;
  catalog_url?: string | null;
  art_source?: string | null;
  art_external_id?: string | null;
  expand_pending?: boolean;
}

/** Original thread reply (string) or inline Q&A (typed object) */
export type ThreadReplyItem = string | { type: 'user' | 'ai'; content: string };

export function isTypedReply(item: ThreadReplyItem): item is { type: 'user' | 'ai'; content: string } {
  return typeof item === 'object' && item !== null && 'type' in item && 'content' in item;
}

export interface Thread {
  id: string;
  topic_id: string;
  main_post: string;
  replies: ThreadReplyItem[];
  created_at: string;
  /** Optional image shown above main post (e.g. artwork). */
  main_image_url?: string | null;
  /** Museum / portal page; shown as “Open in catalog”, not duplicated in main_post. */
  catalog_url?: string | null;
  art_source?: string | null;
  art_external_id?: string | null;
  /** When true, AI replies are generated on first open (saved art before first visit). */
  expand_pending?: boolean;
}

export interface FollowUp {
  id: string;
  user_question: string;
  ai_answer: string;
  created_at: string;
}

/** Response from getThread; replies include inline Q&A as subtweets */
export interface GetThreadResponse {
  thread: Thread;
}

export interface GenerateFeedResponse {
  topicId: string;
  threadIds: string[];
  threads: ThreadSummary[];
}

export interface GetFeedResponse {
  topics: FeedTopic[];
  threadsByTopic: Record<string, ThreadSummary[]>;
}

export interface AskThreadResponse {
  answer: string;
}
