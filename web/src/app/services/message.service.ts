import { Inject, Injectable, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, of } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';

export interface Message {
  readonly id: string;
  readonly text: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
}

export interface MessageInput {
  readonly text: string;
  readonly expiresAt: string;
}

export interface MessageDeleteResult {
  readonly deletedCount: number;
}

@Injectable({ providedIn: 'root' })
export class MessageService implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly activeSubject = new BehaviorSubject<readonly Message[]>([]);
  private readonly changedSubject = new Subject<void>();
  private socket: WebSocket | null = null;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private expiryTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  readonly activeMessages$ = this.activeSubject.asObservable();
  readonly messagesChanged$ = this.changedSubject.asObservable();

  constructor(
    private readonly http: HttpClient,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    if (!isPlatformBrowser(platformId)) return;
    this.refreshActive();
    this.connectSocket();
  }

  activeMessages(): readonly Message[] {
    return this.activeSubject.value;
  }

  list(): Observable<Message[]> {
    return this.http.get<Message[]>('/api/messages');
  }

  create(input: MessageInput): Observable<Message> {
    return this.http.post<Message>('/api/messages', input);
  }

  update(id: string, input: MessageInput): Observable<Message> {
    return this.http.put<Message>(`/api/messages/${id}`, input);
  }

  expire(id: string): Observable<Message> {
    return this.http.delete<Message>(`/api/messages/${id}`);
  }

  purgeExpired(): Observable<MessageDeleteResult> {
    return this.http.delete<MessageDeleteResult>('/api/messages/expired');
  }

  clearAll(): Observable<MessageDeleteResult> {
    return this.http.delete<MessageDeleteResult>('/api/messages');
  }

  refreshActive(): void {
    this.http.get<Message[]>('/api/messages?active=true')
      .pipe(catchError(() => of([])), takeUntil(this.destroy$))
      .subscribe((messages) => this.applyActiveMessages(messages));
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.reconnectTimeoutId !== null) clearTimeout(this.reconnectTimeoutId);
    if (this.expiryTimeoutId !== null) clearTimeout(this.expiryTimeoutId);
    this.socket?.close();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private connectSocket(): void {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(`${protocol}//${location.host}/api/messages/live`);
    this.socket.onmessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      try {
        const payload = JSON.parse(event.data) as { type?: string; messages?: Message[] };
        if (payload.type === 'messages.changed' && Array.isArray(payload.messages)) {
          this.applyActiveMessages(payload.messages);
          this.changedSubject.next();
        }
      } catch {
        this.refreshActive();
      }
    };
    this.socket.onclose = () => {
      this.socket = null;
      if (!this.destroyed) this.reconnectTimeoutId = setTimeout(() => this.connectSocket(), 3000);
    };
  }

  private applyActiveMessages(messages: readonly Message[]): void {
    if (this.expiryTimeoutId !== null) clearTimeout(this.expiryTimeoutId);
    const now = Date.now();
    const active = messages.filter((message) => Date.parse(message.expiresAt) > now);
    this.activeSubject.next(active);

    const nextExpiry = active.reduce(
      (earliest, message) => Math.min(earliest, Date.parse(message.expiresAt)),
      Number.POSITIVE_INFINITY,
    );
    if (Number.isFinite(nextExpiry)) {
      this.expiryTimeoutId = setTimeout(
        () => this.applyActiveMessages(this.activeSubject.value),
        Math.max(0, nextExpiry - Date.now() + 50),
      );
    }
  }
}