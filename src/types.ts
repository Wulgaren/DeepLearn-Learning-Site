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

export interface Thread {
  id: string;
  topic_id: string;
  main_post: string;
  replies: string[];
  created_at: string;
}

export interface FollowUp {
  id: string;
  user_question: string;
  ai_answer: string;
  created_at: string;
}

export interface ThreadWithFollowUps {
  thread: Thread;
  followUps: FollowUp[];
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
  followUp: FollowUp;
}
