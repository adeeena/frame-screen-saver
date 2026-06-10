import { Directive, ElementRef, Input, OnChanges, inject } from '@angular/core';
import feather, { FeatherIcon } from 'feather-icons';

const icons = feather.icons as Record<string, FeatherIcon | undefined>;

@Directive({
  selector: '[feather]',
  standalone: true,
})
export class FeatherIconDirective implements OnChanges {
  @Input() feather = '';

  private readonly el = inject(ElementRef<HTMLElement>);

  ngOnChanges(): void {
    const icon = icons[this.feather];
    if (icon) {
      this.el.nativeElement.innerHTML = icon.toSvg();
    }
  }
}
