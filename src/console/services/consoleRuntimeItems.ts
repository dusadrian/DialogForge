export class RuntimeItem {
  protected _isHidden = false;
  constructor(readonly id: string) {}
  get isHidden() {
    return this._isHidden;
  }
}
export class RuntimeItemPendingInput extends RuntimeItem {
  constructor(
    id: string,
    readonly inputPrompt: string,
    readonly executionId: string | undefined,
    readonly code: string
  ) {
    super(id);
  }
}

export class ActivityItem {
  constructor(
    readonly id: string,
    readonly parentId: string,
    readonly when: Date
  ) {}
}

export enum ActivityItemInputState {
  Provisional = 'provisional',
  Executing = 'executing',
  Completed = 'completed',
  Cancelled = 'cancelled'
}

export class ActivityItemInput extends ActivityItem {
  constructor(
    id: string,
    parentId: string,
    when: Date,
    public state: ActivityItemInputState,
    readonly inputPrompt: string,
    readonly continuationPrompt: string,
    readonly code: string
  ) {
    super(id, parentId, when);
  }
}

export enum ActivityItemPromptState {
  Unanswered = 'Unanswered',
  Answered = 'Answered',
  Interrupted = 'Interrupted'
}

export class ActivityItemPrompt extends ActivityItem {
  state = ActivityItemPromptState.Unanswered;
  answer = '';
  constructor(
    id: string,
    parentId: string,
    when: Date,
    readonly prompt: string,
    readonly password: boolean
  ) {
    super(id, parentId, when);
  }
}

export enum ActivityItemStreamType {
  OUTPUT = 'output',
  ERROR = 'error',
  WARNING = 'warning'
}

const processStreamText = (text: string): string[] => {
  const src = String(text || '');
  const lines: string[] = [''];
  let lineIndex = 0;
  let column = 0;
  let pendingNewline = false;

  const ensureLine = (index: number) => {
    while (lines.length <= index) lines.push('');
  };

  const writeChar = (ch: string) => {
    ensureLine(lineIndex);
    const current = lines[lineIndex];
    if (column >= current.length) {
      lines[lineIndex] = current + ' '.repeat(column - current.length) + ch;
    } else {
      lines[lineIndex] = `${current.slice(0, column)}${ch}${current.slice(column + 1)}`;
    }
    column += 1;
  };

  for (let i = 0; i < src.length; i += 1) {
    if (pendingNewline) {
      lineIndex += 1;
      ensureLine(lineIndex);
      column = 0;
      pendingNewline = false;
    }
    const ch = src[i];
    if (ch === '\r') {
      column = 0;
      continue;
    }
    if (ch === '\n') {
      pendingNewline = true;
      continue;
    }
    writeChar(ch);
  }

  return lines;
};

export class ActivityItemStream extends ActivityItem {
  private _chunks: string[] = [];

  constructor(
    id: string,
    parentId: string,
    when: Date,
    readonly type: ActivityItemStreamType,
    public text: string
  ) {
    super(id, parentId, when);
    this._chunks.push(String(text || ''));
  }

  get outputLines(): readonly string[] {
    return processStreamText(this._chunks.join(''));
  }

  addActivityItemStream(activityItemStream: ActivityItemStream): ActivityItemStream | undefined {
    this._chunks.push(String(activityItemStream.text || ''));
    this.text += String(activityItemStream.text || '');
    return undefined;
  }
}

export type ConsoleActivityItem = ActivityItemInput | ActivityItemPrompt | ActivityItemStream;

export class RuntimeItemActivity extends RuntimeItem {
  private _activityItems: ConsoleActivityItem[] = [];

  constructor(id: string, activityItem: ConsoleActivityItem) {
    super(id);
    this.addActivityItem(activityItem);
  }

  get activityItems() {
    return this._activityItems;
  }

  addActivityItem(activityItem: ConsoleActivityItem) {
    if (this._activityItems.length) {
      const last = this._activityItems[this._activityItems.length - 1];
      if (activityItem instanceof ActivityItemStream && last instanceof ActivityItemStream) {
        if (last.type === activityItem.type && last.parentId === activityItem.parentId) {
          last.addActivityItemStream(activityItem);
          return;
        }
      } else if (activityItem instanceof ActivityItemInput && activityItem.state !== ActivityItemInputState.Provisional) {
        for (let i = this._activityItems.length - 1; i >= 0; i -= 1) {
          const candidate = this._activityItems[i];
          if (candidate instanceof ActivityItemInput) {
            if (candidate.state === ActivityItemInputState.Provisional && candidate.parentId === activityItem.parentId) {
              this._activityItems[i] = activityItem;
              return;
            }
            break;
          }
        }
      }
    }
    this._activityItems.push(activityItem);
  }
}
