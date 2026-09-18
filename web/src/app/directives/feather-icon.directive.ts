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
      // Icons are injected via innerHTML, so Angular's emulated view encapsulation never
      // marks them with its scoping attribute — component `svg { width: 100% }` rules can't
      // reach them. Force the fill-container size here instead of relying on CSS.
      this.el.nativeElement.innerHTML = icon.toSvg({ width: '100%', height: '100%' });
    }
  }
}
