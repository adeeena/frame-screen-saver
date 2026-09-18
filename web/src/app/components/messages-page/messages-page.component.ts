import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { Message, MessageInput, MessageService } from '../../services/message.service';

@Component({
  selector: 'app-messages-page',
  templateUrl: './messages-page.html',
  styleUrls: ['./messages-page.scss'],
  changeDetection: ChangeDetectionStrategy.Default,
})
export class MessagesPageComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  messages: readonly Message[] = [];
  editingId: string | null = null;
  text = '';
  expiresAt = '';
  maxExpiresAt = '';
  loading = true;
  saving = false;
  historyActionPending = false;
  clearConfirmationVisible = false;
  historyNotice = '';
  error = '';

  constructor(
    private readonly router: Router,
    private readonly messageService: MessageService,
  ) {}

  ngOnInit(): void {
    this.resetForm();
    this.loadMessages();
    this.messageService.messagesChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadMessages());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  close(): void {
    this.router.navigate(['/']);
  }

  save(): void {
    if (!this.isValid() || this.saving) return;
    this.saving = true;
    this.error = '';
    const input: MessageInput = { text: this.text, expiresAt: new Date(this.expiresAt).toISOString() };
    const request = this.editingId
      ? this.messageService.update(this.editingId, input)
      : this.messageService.create(input);

    request
      .pipe(finalize(() => { this.saving = false; }), takeUntil(this.destroy$))
      .subscribe(
        () => { this.resetForm(); this.loadMessages(); },
        () => { this.error = 'The message could not be saved.'; },
      );
  }

  edit(message: Message): void {
    this.editingId = message.id;
    this.text = message.text;
    this.expiresAt = this.toLocalInput(new Date(message.expiresAt));
    this.refreshMaximum();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  expire(message: Message): void {
    if (!this.isActive(message)) return;
    this.messageService.expire(message.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        () => { if (this.editingId === message.id) this.resetForm(); this.loadMessages(); },
        () => { this.error = 'The message could not be expired.'; },
      );
  }

  purgeExpired(): void {
    if (this.historyActionPending) return;
    const editingExpired = this.messages.some(
      (message) => message.id === this.editingId && !this.isActive(message),
    );
    this.historyActionPending = true;
    this.clearConfirmationVisible = false;
    this.historyNotice = '';
    this.error = '';
    this.messageService.purgeExpired()
      .pipe(finalize(() => { this.historyActionPending = false; }), takeUntil(this.destroy$))
      .subscribe(
        (result) => {
          if (editingExpired) this.resetForm();
          this.historyNotice = result.deletedCount === 0
            ? 'No expired messages to purge.'
            : `${result.deletedCount} expired ${result.deletedCount === 1 ? 'message' : 'messages'} purged.`;
          this.loadMessages();
        },
        () => { this.error = 'Expired messages could not be purged.'; },
      );
  }

  requestClearAll(): void {
    if (this.historyActionPending || this.messages.length === 0) return;
    this.clearConfirmationVisible = true;
    this.historyNotice = '';
  }

  cancelClearAll(): void {
    this.clearConfirmationVisible = false;
  }

  clearAll(): void {
    if (this.historyActionPending || this.messages.length === 0) return;
    this.historyActionPending = true;
    this.clearConfirmationVisible = false;
    this.historyNotice = '';
    this.error = '';
    this.messageService.clearAll()
      .pipe(finalize(() => { this.historyActionPending = false; }), takeUntil(this.destroy$))
      .subscribe(
        (result) => {
          this.resetForm();
          this.historyNotice = `${result.deletedCount} ${result.deletedCount === 1 ? 'message' : 'messages'} cleared.`;
          this.loadMessages();
        },
        () => { this.error = 'Messages could not be cleared.'; },
      );
  }

  resetForm(): void {
    this.editingId = null;
    this.text = '';
    this.expiresAt = this.toLocalInput(new Date(Date.now() + 24 * 60 * 60 * 1000));
    this.refreshMaximum();
    this.error = '';
  }

  isActive(message: Message): boolean {
    return Date.parse(message.expiresAt) > Date.now();
  }

  isValid(): boolean {
    const expiresAtMs = new Date(this.expiresAt).valueOf();
    return this.text.trim().length > 0
      && this.text.trim().length <= 2048
      && Number.isFinite(expiresAtMs)
      && expiresAtMs <= new Date(this.maxExpiresAt).valueOf();
  }

  private loadMessages(): void {
    this.loading = true;
    this.messageService.list()
      .pipe(finalize(() => { this.loading = false; }), takeUntil(this.destroy$))
      .subscribe(
        (messages) => { this.messages = messages; },
        () => { this.error = 'Messages could not be loaded.'; },
      );
  }

  private refreshMaximum(): void {
    this.maxExpiresAt = this.toLocalInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  }

  private toLocalInput(date: Date): string {
    const local = new Date(date.valueOf() - date.getTimezoneOffset() * 60 * 1000);
    return local.toISOString().slice(0, 16);
  }
}