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

/** Original thread reply (string) or inline Q&A (typed object) */
export type ThreadReplyItem = string | { type: 'user' | 'ai'; content: string };

export interface Thread {
  id: string;
  topic_id: string;
  main_post: string;
  replies: ThreadReplyItem[];
  created_at: string;
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
