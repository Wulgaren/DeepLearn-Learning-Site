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

export interface ThreadWithFollowUps {
  thread: {
    id: string;
    topic_id: string;
    main_post: string;
    replies: string[];
    created_at: string;
  };
  followUps: Array<{
    id: string;
    user_question: string;
    ai_answer: string;
    created_at: string;
  }>;
}
