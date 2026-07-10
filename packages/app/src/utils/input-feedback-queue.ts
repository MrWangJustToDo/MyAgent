export type FeedbackLevel = "success" | "info" | "error";

export type FeedbackItem = {
  message: string;
  level: FeedbackLevel;
};

export interface FeedbackQueueController {
  enqueue: (item: FeedbackItem) => void;
  clear: () => void;
}

export const INPUT_FEEDBACK_DISPLAY_MS = 3000;

export function createFeedbackQueue(options: {
  displayMs: number;
  onShow: (item: FeedbackItem) => void;
  onClear: () => void;
}): FeedbackQueueController {
  const queue: FeedbackItem[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let playing = false;

  const playNext = () => {
    const item = queue.shift();
    if (!item) {
      playing = false;
      options.onClear();
      return;
    }

    playing = true;
    options.onShow(item);
    timer = setTimeout(playNext, options.displayMs);
  };

  return {
    enqueue(item) {
      queue.push(item);
      if (!playing) {
        playNext();
      }
    },
    clear() {
      queue.length = 0;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      playing = false;
      options.onClear();
    },
  };
}
