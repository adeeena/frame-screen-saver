import { Directive, ElementRef, Input, OnChanges } from '@angular/core';
import feather, { FeatherIcon } from 'feather-icons';

const icons = feather.icons as Record<string, FeatherIcon | undefined>;

@Directive({
  selector: '[feather]',
})
export class FeatherIconDirective implements OnChanges {
  @Input() feather = '';

  constructor(private readonly el: ElementRef<HTMLElement>) {}

  ngOnChanges(): void {
    const icon = icons[this.feather];
    if (icon) {
      this.el.nativeElement.innerHTML = icon.toSvg();
    }
  }
}
