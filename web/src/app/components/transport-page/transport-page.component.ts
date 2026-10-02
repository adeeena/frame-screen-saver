import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import moment from 'moment';
import { TrainService, Departure } from '../../services/train.service';
import { Message, MessageService } from '../../services/message.service';
import { ScreensaverConfigService, TransitRouteSettings } from '../../services/screensaver-config.service';

const defaultMessagePageDurationMs = 5000;
const defaultTransportPageDurationMs = 10000;

const positiveDuration = (value: number | undefined, fallback: number): number =>
  Number.isFinite(value) && value! > 0 ? value! : fallback;

export function formatExpiryCountdown(expiresAt: string, nowMs = Date.now()): string {
  const totalMinutes = Math.max(0, Math.ceil((Date.parse(expiresAt) - nowMs) / 60000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}min`);
  return `expires in ${parts.join(' ')}`;
}

const MESSAGE_PAGE_TEXT_LENGTH = 240;

function splitMessage(message: Message): readonly Message[] {
  if (message.text.length <= MESSAGE_PAGE_TEXT_LENGTH) return [message];

  const chunks: Message[] = [];
  let remaining = message.text.trim();
  let chunkIndex = 0;
  while (remaining.length > 0) {
    let cut = Math.min(MESSAGE_PAGE_TEXT_LENGTH, remaining.length);
    if (cut < remaining.length) {
      const lastSpace = remaining.lastIndexOf(' ', cut);
      if (lastSpace > MESSAGE_PAGE_TEXT_LENGTH * 0.6) cut = lastSpace;
    }
    const text = remaining.slice(0, cut).trim();
    chunks.push({ ...message, id: `${message.id}-${chunkIndex}`, text });
    remaining = remaining.slice(cut).trim();
    chunkIndex++;
  }
  return chunks;
}

export interface TransitOpening {
  readonly lineLabel: string;
  readonly stopLabel: string;
  readonly days: number;
}

export function nextTransitOpening(
  entries: readonly TransitRouteSettings[],
  nowMs = Date.now(),
): TransitOpening | null {
  const today = moment(nowMs).startOf('day');
  const next = entries
    .map((entry) => ({ entry, opening: moment(entry.availableFrom, 'YYYY-MM-DD', true) }))
    .filter(({ entry, opening }) => entry.availableFrom !== null && opening.isValid() && opening.isAfter(today))
    .sort((left, right) => left.opening.valueOf() - right.opening.valueOf())[0];

  if (!next) return null;
  return {
    lineLabel: next.entry.lineLabel,
    stopLabel: next.entry.stopLabel,
    days: next.opening.diff(today, 'days'),
  };
}

@Component({
  selector: 'app-transport-page',
  templateUrl: './transport-page.html',
  styleUrls: ['./transport-page.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class TransportPageComponent implements OnInit, OnChanges, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private pageTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private transitEntriesSource: readonly TransitRouteSettings[] | null = null;
  private transitEntriesDay = '';
  private transitEntriesEnabled = false;
  private transitEntriesCache: readonly TransitRouteSettings[] = [];
  private openingSource: readonly TransitRouteSettings[] | null = null;
  private openingDay = '';
  private openingCache: TransitOpening | null = null;
  private departuresSource: ReturnType<TrainService['routes']> | null = null;
  private departuresMinute = -1;
  private readonly departuresCache = new Map<string, readonly Departure[]>();

  @Input() active = false;
  @Output() messageCycleComplete = new EventEmitter<void>();

  messagePages: readonly (readonly Message[])[] = [[]];
  currentMessagePage = 0;
  currentTransportPage = 0;

  constructor(
    readonly trainService: TrainService,
    readonly configService: ScreensaverConfigService,
    private readonly messageService: MessageService,
  ) {}

  transitEntries(): readonly TransitRouteSettings[] {
    const transit = this.configService.config()?.appSettings.transit;
    if (!transit?.isEnabled) return [];
    const today = moment().startOf('day');
    const day = today.format('YYYY-MM-DD');
    if (
      transit.entries === this.transitEntriesSource
      && day === this.transitEntriesDay
      && transit.isEnabled === this.transitEntriesEnabled
    ) {
      return this.transitEntriesCache;
    }

    this.transitEntriesSource = transit.entries;
    this.transitEntriesDay = day;
    this.transitEntriesEnabled = transit.isEnabled;
    this.transitEntriesCache = transit.entries.filter((entry) =>
      (!entry.availableFrom || !today.isBefore(moment(entry.availableFrom)))
      && (!entry.availableUntil || today.isBefore(moment(entry.availableUntil))),
    );
    return this.transitEntriesCache;
  }

  upcomingTransitOpening(): TransitOpening | null {
    const transit = this.configService.config()?.appSettings.transit;
    if (!transit?.isEnabled) return null;
    const day = moment().format('YYYY-MM-DD');
    if (transit.entries === this.openingSource && day === this.openingDay) return this.openingCache;

    this.openingSource = transit.entries;
    this.openingDay = day;
    this.openingCache = nextTransitOpening(transit.entries);
    return this.openingCache;
  }

  ngOnInit(): void {
    this.messageService.activeMessages$
      .pipe(takeUntil(this.destroy$))
      .subscribe((messages) => {
        this.messagePages = this.paginate(messages);
        this.currentMessagePage = 0;
        this.currentTransportPage = 0;
        if (this.active) this.startMessageCycle();
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes.active) return;
    if (this.active) {
      this.currentMessagePage = 0;
      this.currentTransportPage = 0;
      this.startMessageCycle();
    } else {
      this.clearPageTimeout();
    }
  }

  departures(entry: TransitRouteSettings): readonly Departure[] {
    const nowMs = Date.now();
    const minute = Math.floor(nowMs / 60000);
    const source = this.trainService.routes();
    if (source !== this.departuresSource || minute !== this.departuresMinute) {
      this.departuresSource = source;
      this.departuresMinute = minute;
      this.departuresCache.clear();
    }

    const cached = this.departuresCache.get(entry.id);
    if (cached) return cached;

    const departures = this.trainService.departures(entry.id).filter((departure) =>
      moment(departure.expectedDeparture).valueOf() >= nowMs,
    );
    this.departuresCache.set(entry.id, departures);
    return departures;
  }

  transportEntriesPage(): readonly TransitRouteSettings[] {
    const entries = this.transitEntries();
    if (this.messagePages[0].length === 0) return entries;
    const start = this.currentTransportPage * 2;
    return entries.slice(start, start + 2);
  }

  transportPageCount(): number {
    if (this.messagePages[0].length === 0) return 1;
    return Math.max(1, Math.ceil(this.transitEntries().length / 2));
  }

  pageCount(): number {
    return Math.max(this.messagePages.length, this.transportPageCount());
  }

  currentMessagePageIndex(): number {
    return this.currentMessagePage % this.messagePages.length;
  }

  minutesUntil(dep: Departure): number {
    const now = Math.floor(Date.now() / 60000) * 60000;
    const depMin = Math.floor(moment(dep.expectedDeparture).valueOf() / 60000) * 60000;
    return Math.max(0, Math.round((depMin - now) / 60000));
  }

  expiryCountdown(message: Message): string {
    return formatExpiryCountdown(message.expiresAt);
  }

  ngOnDestroy(): void {
    this.clearPageTimeout();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private paginate(messages: readonly Message[]): readonly (readonly Message[])[] {
    if (messages.length === 0) return [[]];
    const messagesPerPage = this.configService.messages().itemsPerPage;
    const fullMessages = messages.reduce<Message[]>(
      (all, message) => all.concat(splitMessage(message)),
      [],
    );
    const pages: Message[][] = [];
    for (let index = 0; index < fullMessages.length; index += messagesPerPage) {
      pages.push(fullMessages.slice(index, index + messagesPerPage));
    }
    return pages;
  }

  private startMessageCycle(): void {
    this.clearPageTimeout();
    const animation = this.configService.config()?.animationSettings;
    const messageDurationMs = positiveDuration(animation?.messagePageTimeoutMs, defaultMessagePageDurationMs);
    const minimumPageDurationMs = positiveDuration(animation?.transportPageTimeoutMs, defaultTransportPageDurationMs);
    const isLastPage = this.currentMessagePage >= this.pageCount() - 1;
    const elapsedBeforeCurrentPageMs = this.currentMessagePage * messageDurationMs;
    const delayMs = isLastPage
      ? Math.max(messageDurationMs, minimumPageDurationMs - elapsedBeforeCurrentPageMs)
      : messageDurationMs;

    this.pageTimeoutId = setTimeout(() => {
      if (this.currentMessagePage < this.pageCount() - 1) {
        this.currentMessagePage += 1;
        this.currentTransportPage = this.currentMessagePage % this.transportPageCount();
        this.startMessageCycle();
      } else {
        this.messageCycleComplete.emit();
      }
    }, delayMs);
  }

  private clearPageTimeout(): void {
    if (this.pageTimeoutId !== null) clearTimeout(this.pageTimeoutId);
    this.pageTimeoutId = null;
  }
}
