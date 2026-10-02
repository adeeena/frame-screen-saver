import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-pagination-dots',
  template: `
    <div class="pagination-dots" aria-hidden="true">
      <span class="pagination-dots__dot" *ngFor="let dot of dots; let index = index"
        [class.pagination-dots__dot--active]="index === activeIndex"></span>
    </div>
  `,
  styleUrls: ['./pagination-dots.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaginationDotsComponent {
  @Input() count = 0;
  @Input() activeIndex = 0;

  get dots(): readonly number[] {
    return Array.from({ length: Math.max(0, this.count) }, (_, index) => index);
  }
}
